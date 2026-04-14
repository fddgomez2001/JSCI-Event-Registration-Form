import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getAdminGateCookieName, getCookieValue, verifyAdminGateToken } from "../../../utils/admin/security";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RegistrationRequest = {
  type: "individual" | "bulk" | "bulkImport";
  payload:
    | Record<string, string>
    | {
        rows: ImportedRow[];
        leadDetails?: {
          contactName?: string;
          church?: string;
          ministry?: string;
          address?: string;
          localChurchPastor?: string;
          phoneNumber?: string;
        };
        conference?: string;
      };
};

type FormPayload = Record<string, string>;

type BulkFormPayload = FormPayload & {
  attendeeRows?: ImportedRow[];
};

type ImportedRow = {
  fullName: string;
  church: string;
  ministry: string;
  address: string;
  localChurchPastor: string;
  phoneNumber: string;
};

type BulkAttendeeInsert = {
  bulk_registration_id: string;
  attendee_name: string;
  attendee_phone?: string;
  attendee_ministry?: string;
  attendee_church?: string;
  attendee_address?: string;
  attendee_local_church_pastor?: string;
};

const conferenceTotals: Record<"leyte" | "cebu", number> = {
  leyte: 100,
  cebu: 100,
};

function normalizeConference(input: string | null | undefined): "leyte" | "cebu" {
  return String(input ?? "").trim().toLowerCase() === "cebu" ? "cebu" : "leyte";
}

const requiredIndividualFields = [
  "name",
  "church",
  "ministry",
  "address",
  "localChurchPastor",
  "phoneNumber",
];

const requiredBulkFields = [
  "contactName",
  "church",
  "ministry",
  "address",
  "localChurchPastor",
  "phoneNumber",
  "attendeeCount",
  "attendeeNames",
];

const adminCredentials = {
  username: "admin",
  password: "Admin@123!",
};

async function getConferenceAttendeeCount(supabase: any, conference: "leyte" | "cebu") {
  const [{ count: individualCount, error: individualError }, { data: bulkRows, error: bulkError }] = await Promise.all([
    (supabase as any)
      .from("individual_registrations")
      .select("id", { count: "exact", head: true })
      .eq("conference", conference),
    (supabase as any)
      .from("bulk_registrations")
      .select("attendee_count")
      .eq("conference", conference)
      .limit(5000),
  ]);

  if (individualError && (individualError as { code?: string }).code !== "PGRST205") {
    return { error: individualError.message };
  }

  if (bulkError && (bulkError as { code?: string }).code !== "PGRST205") {
    return { error: bulkError.message };
  }

  const individualAttendees = Number(individualCount ?? 0);
  const bulkAttendees = (bulkRows ?? []).reduce(
    (sum: number, row: { attendee_count?: number }) => sum + Number(row.attendee_count ?? 0),
    0,
  );

  return { attendeesCount: individualAttendees + bulkAttendees };
}

async function ensureConferenceCapacity(
  supabase: any,
  conference: "leyte" | "cebu",
  requestedSlots: number,
) {
  const totalSlots = conferenceTotals[conference];
  const result = await getConferenceAttendeeCount(supabase, conference);

  if ("error" in result) {
    return { ok: false as const, status: 500, error: result.error };
  }

  const attendeesCount = result.attendeesCount;
  const availableSlots = Math.max(totalSlots - attendeesCount, 0);

  if (availableSlots <= 0) {
    return {
      ok: false as const,
      status: 409,
      error: `Registration is now closed for ${conference === "cebu" ? "Cebu" : "Leyte"}. Thank you for your overwhelming response.`,
    };
  }

  if (requestedSlots > availableSlots) {
    return {
      ok: false as const,
      status: 409,
      error: `Only ${availableSlots} slot${availableSlots === 1 ? "" : "s"} left for ${conference === "cebu" ? "Cebu" : "Leyte"}. Please reduce attendees and try again.`,
    };
  }

  return { ok: true as const };
}

function normalizePersonName(value: string) {
  const cleaned = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!cleaned) return "";

  const toTitlePart = (part: string) =>
    part
      .toLowerCase()
      .split(/(['-])/)
      .map((token) => {
        if (token === "'" || token === "-") return token;
        if (!token) return token;
        return token.charAt(0).toUpperCase() + token.slice(1);
      })
      .join("");

  return cleaned.split(" ").map(toTitlePart).join(" ");
}

function parseAttendeeNames(attendeeNames: string) {
  return attendeeNames
    .split(/\r?\n|,/)
    .map((name) => normalizePersonName(name))
    .filter(Boolean);
}

function includeContactInAttendeeNames(contactName: string, attendeeNames: string[]) {
  const orderedNames = [normalizePersonName(contactName), ...attendeeNames.map((name) => normalizePersonName(name))];
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const name of orderedNames) {
    const normalized = normalizePersonName(name);
    if (!normalized) continue;

    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    merged.push(normalized);
  }

  return merged;
}

function normalizeImportedRows(rows: ImportedRow[]) {
  return rows.map((row) => ({
    fullName: normalizePersonName(String(row.fullName ?? "")),
    church: String(row.church ?? "").trim(),
    ministry: String(row.ministry ?? "").trim(),
    address: String(row.address ?? "").trim(),
    localChurchPastor: normalizePersonName(String(row.localChurchPastor ?? "")),
    phoneNumber: String(row.phoneNumber ?? "").trim(),
  }));
}

async function replaceBulkAttendees(
  supabase: any,
  bulkRegistrationId: string,
  attendees: BulkAttendeeInsert[],
  replaceExisting: boolean,
) {
  if (replaceExisting) {
    const { error: deleteError } = await (supabase as any)
      .from("bulk_registration_attendees")
      .delete()
      .eq("bulk_registration_id", bulkRegistrationId);

    if (deleteError) {
      if ((deleteError as { code?: string }).code === "PGRST205") {
        return "Database table is missing. Run migrations/006_create_bulk_registration_attendees.sql in Supabase SQL Editor.";
      }
      return deleteError.message;
    }
  }

  if (attendees.length === 0) {
    return null;
  }

  const { error: insertError } = await (supabase as any)
    .from("bulk_registration_attendees")
    .insert(attendees);

  if (insertError) {
    if ((insertError as { code?: string }).code === "PGRST205") {
      return "Database table is missing. Run migrations/006_create_bulk_registration_attendees.sql in Supabase SQL Editor.";
    }
    return insertError.message;
  }

  return null;
}

function isAdminAuthorized(request: Request) {
  const username = request.headers.get("x-admin-username") ?? "";
  const password = request.headers.get("x-admin-password") ?? "";
  const gateToken = getCookieValue(request.headers.get("cookie"), getAdminGateCookieName());
  const hasGateAccess = verifyAdminGateToken(gateToken);
  return username === adminCredentials.username && password === adminCredentials.password && hasGateAccess;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode");
  const conferenceParam = searchParams.get("conference");
  const conference = normalizeConference(conferenceParam);
  const totalSlots = conferenceTotals[conference];

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

  if (!supabaseUrl) {
    return NextResponse.json(
      { error: "Supabase environment variables are not configured." },
      { status: 500 },
    );
  }

  if (mode === "admin") {
    if (!serviceRoleKey) {
      return NextResponse.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY is required for admin data access." },
        { status: 500 },
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    if (!isAdminAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const individualQuery = supabaseAdmin
      .from("individual_registrations")
      .select("id,full_name,church,ministry,address,local_church_pastor,phone_number,conference,created_at")
      .order("created_at", { ascending: false })
      .limit(5000);

    const bulkQuery = supabaseAdmin
      .from("bulk_registrations")
      .select("id,contact_name,church,ministry,address,local_church_pastor,phone_number,attendee_count,attendee_names,conference,created_at")
      .order("created_at", { ascending: false })
      .limit(5000);

    const [individualResult, bulkResult] = await Promise.all([
      conferenceParam ? individualQuery.eq("conference", conference) : individualQuery,
      conferenceParam ? bulkQuery.eq("conference", conference) : bulkQuery,
    ]);

    if (individualResult.error) {
      if ((individualResult.error as { code?: string }).code === "PGRST205") {
        return NextResponse.json({ individual: [], bulk: [] });
      }
      return NextResponse.json({ error: individualResult.error.message }, { status: 500 });
    }

    if (bulkResult.error) {
      if ((bulkResult.error as { code?: string }).code === "PGRST205") {
        return NextResponse.json({ individual: individualResult.data ?? [], bulk: [] });
      }
      return NextResponse.json({ error: bulkResult.error.message }, { status: 500 });
    }

    const bulkRows = (bulkResult.data ?? []) as Array<{
      id: string;
      contact_name: string;
      church: string;
      ministry: string;
      address: string;
      local_church_pastor: string;
      phone_number: string;
      attendee_count: number;
      attendee_names: string;
      conference: "leyte" | "cebu";
      created_at: string;
    }>;

    if (!bulkRows.length) {
      return NextResponse.json({
        individual: individualResult.data ?? [],
        bulk: bulkRows,
      });
    }

    const bulkIds = bulkRows.map((row) => row.id);
    const { data: linkedAttendees, error: linkedAttendeesError } = await (supabaseAdmin as any)
      .from("bulk_registration_attendees")
      .select(
        "bulk_registration_id,attendee_name,attendee_phone,attendee_ministry,attendee_church,attendee_address,attendee_local_church_pastor",
      )
      .in("bulk_registration_id", bulkIds)
      .order("created_at", { ascending: true });

    if (linkedAttendeesError && (linkedAttendeesError as { code?: string }).code !== "PGRST205") {
      return NextResponse.json({ error: linkedAttendeesError.message }, { status: 500 });
    }

    type LinkedAttendeeRow = {
      bulk_registration_id: string;
      attendee_name: string;
      attendee_phone?: string;
      attendee_ministry?: string;
      attendee_church?: string;
      attendee_address?: string;
      attendee_local_church_pastor?: string;
    };

    const attendeesByBulkId = new Map<string, LinkedAttendeeRow[]>();
    for (const row of linkedAttendees ?? []) {
      const bulkId = String((row as { bulk_registration_id?: string }).bulk_registration_id ?? "");
      const attendeeName = String((row as { attendee_name?: string }).attendee_name ?? "").trim();
      if (!bulkId || !attendeeName) continue;

      const detailedRow: LinkedAttendeeRow = {
        bulk_registration_id: bulkId,
        attendee_name: attendeeName,
        attendee_phone: String((row as { attendee_phone?: string }).attendee_phone ?? "").trim() || undefined,
        attendee_ministry: String((row as { attendee_ministry?: string }).attendee_ministry ?? "").trim() || undefined,
        attendee_church: String((row as { attendee_church?: string }).attendee_church ?? "").trim() || undefined,
        attendee_address: String((row as { attendee_address?: string }).attendee_address ?? "").trim() || undefined,
        attendee_local_church_pastor:
          String((row as { attendee_local_church_pastor?: string }).attendee_local_church_pastor ?? "").trim() || undefined,
      };

      const detailedList = attendeesByBulkId.get(bulkId) ?? [];
      detailedList.push(detailedRow);
      attendeesByBulkId.set(bulkId, detailedList);
    }

    const mergedBulkRows = bulkRows.map((row) => {
      const contactName = normalizePersonName(row.contact_name);
      const linkedRowsForBulk = attendeesByBulkId.get(row.id) ?? [];

      if (linkedRowsForBulk.length) {
        const mergedLinkedAttendees: LinkedAttendeeRow[] = [];
        const seen = new Set<string>();
        const candidates: LinkedAttendeeRow[] = [
          {
            bulk_registration_id: row.id,
            attendee_name: contactName,
            attendee_phone: row.phone_number,
            attendee_ministry: row.ministry,
            attendee_church: row.church,
            attendee_address: row.address,
            attendee_local_church_pastor: row.local_church_pastor,
          },
          ...linkedRowsForBulk,
        ];

        for (const attendee of candidates) {
          const normalizedName = normalizePersonName(attendee.attendee_name);
          if (!normalizedName) continue;

          const key = normalizedName.toLowerCase();
          if (seen.has(key)) continue;

          seen.add(key);
          mergedLinkedAttendees.push({
            ...attendee,
            attendee_name: normalizedName,
          });
        }

        const attendeeNames = mergedLinkedAttendees.map((attendee) => attendee.attendee_name);
        return {
          ...row,
          attendee_count: attendeeNames.length,
          attendee_names: attendeeNames.join("\n"),
          linked_attendees: mergedLinkedAttendees,
        };
      }

      const attendeeNames = includeContactInAttendeeNames(contactName, parseAttendeeNames(row.attendee_names));
      return {
        ...row,
        attendee_count: attendeeNames.length,
        attendee_names: attendeeNames.join("\n"),
      };
    });

    return NextResponse.json({
      individual: individualResult.data ?? [],
      bulk: mergedBulkRows,
    });
  }

  if (mode === "slots") {
    const slotsKey = serviceRoleKey ?? supabaseKey;

    if (!slotsKey) {
      return NextResponse.json(
        { error: "Supabase environment variables are not configured." },
        { status: 500 },
      );
    }

    const supabaseSlots = createClient(supabaseUrl, slotsKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const [{ count: individualCount, error: individualError }, { data: bulkRows, error: bulkError }] = await Promise.all([
      supabaseSlots.from("individual_registrations").select("id", { count: "exact", head: true }).eq("conference", conference),
      supabaseSlots.from("bulk_registrations").select("attendee_count").eq("conference", conference).limit(5000),
    ]);

    if (individualError) {
      if ((individualError as { code?: string }).code !== "PGRST205") {
        return NextResponse.json({ error: individualError.message }, { status: 500 });
      }
    }

    if (bulkError) {
      if ((bulkError as { code?: string }).code !== "PGRST205") {
        return NextResponse.json({ error: bulkError.message }, { status: 500 });
      }
    }

    const individualAttendees = Number(individualCount ?? 0);
    const bulkAttendees = (bulkRows ?? []).reduce(
      (sum, row) => sum + Number((row as { attendee_count?: number }).attendee_count ?? 0),
      0,
    );
    const attendeesCount = individualAttendees + bulkAttendees;

    return NextResponse.json(
      {
        totalSlots,
        attendeesCount,
        availableSlots: Math.max(totalSlots - attendeesCount, 0),
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      },
    );
  }

  if (!supabaseKey) {
    return NextResponse.json(
      { error: "Supabase environment variables are not configured." },
      { status: 500 },
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const tableNames = ["individual_registrations", "bulk_registrations"];
  const churches = new Set<string>();

  for (const tableName of tableNames) {
    const { data, error } = await supabase
      .from(tableName)
      .select("church")
      .eq("conference", conference)
      .limit(1000);

    if (error) {
      if ((error as { code?: string }).code === "PGRST205") {
        continue;
      }

      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    for (const row of data ?? []) {
      const church = String((row as { church?: string }).church ?? "").trim();
      if (church) churches.add(church);
    }
  }

  return NextResponse.json({ churches: Array.from(churches).sort((a, b) => a.localeCompare(b)) });
}

export async function POST(request: Request) {
  let body: RegistrationRequest;
  try {
    body = (await request.json()) as RegistrationRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body?.type || !body?.payload) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: "Supabase environment variables are not configured." },
      { status: 500 },
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const conference = normalizeConference(
    String(((body.payload as Record<string, string>)?.conference ?? "") || ""),
  );

  if (body.type === "bulkImport") {
    const rows = Array.isArray((body.payload as { rows?: ImportedRow[] })?.rows)
      ? ((body.payload as { rows: ImportedRow[] }).rows ?? [])
      : [];
    const leadDetails = (body.payload as {
      leadDetails?: {
        contactName?: string;
        church?: string;
        ministry?: string;
        address?: string;
        localChurchPastor?: string;
        phoneNumber?: string;
      };
    }).leadDetails;

    if (rows.length === 0) {
      return NextResponse.json({ error: "No rows found in import payload." }, { status: 400 });
    }

    const contactName = normalizePersonName(String(leadDetails?.contactName ?? ""));
    const church = String(leadDetails?.church ?? "").trim();
    const ministry = String(leadDetails?.ministry ?? "").trim();
    const address = String(leadDetails?.address ?? "").trim();
    const localChurchPastor = normalizePersonName(String(leadDetails?.localChurchPastor ?? ""));
    const phoneNumber = String(leadDetails?.phoneNumber ?? "").trim();

    if (!contactName || !church || !ministry || !address || !localChurchPastor || !phoneNumber) {
      return NextResponse.json(
        { error: "Complete all contact person details before importing bulk attendees." },
        { status: 400 },
      );
    }

    const normalizedRows = normalizeImportedRows(rows);

    const invalidRow = normalizedRows.find(
      (row) =>
        !row.fullName ||
        !row.church ||
        !row.ministry ||
        !row.address ||
        !row.localChurchPastor ||
        !row.phoneNumber,
    );

    if (invalidRow) {
      return NextResponse.json(
        { error: "All imported rows must include all required fields." },
        { status: 400 },
      );
    }

    const seen = new Set<string>();
    const dedupedRows = normalizedRows.filter((row) => {
      const key = `${row.fullName.toLowerCase()}|${row.phoneNumber.replace(/\D/g, "")}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const duplicateInFileCount = normalizedRows.length - dedupedRows.length;

    const attendeeNames = includeContactInAttendeeNames(
      contactName,
      dedupedRows.map((row) => row.fullName),
    );
    const capacityCheck = await ensureConferenceCapacity(supabase, conference, attendeeNames.length);
    if (!capacityCheck.ok) {
      return NextResponse.json({ error: capacityCheck.error }, { status: capacityCheck.status });
    }

    const { data: insertedBulkRow, error: insertBulkError } = await supabase
      .from("bulk_registrations")
      .insert({
        contact_name: contactName,
        church,
        ministry,
        address,
        local_church_pastor: localChurchPastor,
        phone_number: phoneNumber,
        attendee_count: attendeeNames.length,
        attendee_names: attendeeNames.join("\n"),
        conference,
      })
      .select("id")
      .single();

    if (insertBulkError) {
      if ((insertBulkError as { code?: string }).code === "PGRST205") {
        return NextResponse.json(
          {
            error:
              "Database table is missing. Run migrations/001_create_registration_tables.sql in Supabase SQL Editor.",
          },
          { status: 500 },
        );
      }
      return NextResponse.json({ error: insertBulkError.message }, { status: 500 });
    }

    const contactKey = contactName.toLowerCase();
    const attendeeRowsWithoutContact = dedupedRows.filter(
      (row) => normalizePersonName(row.fullName).toLowerCase() !== contactKey,
    );

    const linkedRows: BulkAttendeeInsert[] = [
      {
        bulk_registration_id: insertedBulkRow.id,
        attendee_name: contactName,
        attendee_phone: phoneNumber,
        attendee_ministry: ministry,
        attendee_church: church,
        attendee_address: address,
        attendee_local_church_pastor: localChurchPastor,
      },
      ...attendeeRowsWithoutContact.map((row) => ({
        bulk_registration_id: insertedBulkRow.id,
        attendee_name: row.fullName,
        attendee_phone: row.phoneNumber,
        attendee_ministry: row.ministry,
        attendee_church: row.church,
        attendee_address: row.address,
        attendee_local_church_pastor: row.localChurchPastor,
      })),
    ];

    const replaceLinkedError = await replaceBulkAttendees(supabase, insertedBulkRow.id, linkedRows, false);
    if (replaceLinkedError) {
      return NextResponse.json({ error: replaceLinkedError }, { status: 500 });
    }

    return NextResponse.json(
      {
        message: "Bulk import registration submitted.",
        insertedCount: attendeeNames.length,
        duplicateInFileCount,
      },
      { status: 201 },
    );
  }

  const payload = body.payload as FormPayload;

  if (body.type === "individual") {
    const missing = requiredIndividualFields.find((field) => !payload[field]?.trim());
    if (missing) {
      return NextResponse.json({ error: `${missing} is required.` }, { status: 400 });
    }

    const capacityCheck = await ensureConferenceCapacity(supabase, conference, 1);
    if (!capacityCheck.ok) {
      return NextResponse.json({ error: capacityCheck.error }, { status: capacityCheck.status });
    }

    const { error } = await supabase.from("individual_registrations").insert({
      full_name: normalizePersonName(payload.name),
      church: payload.church,
      ministry: payload.ministry,
      address: payload.address,
      local_church_pastor: normalizePersonName(payload.localChurchPastor),
      phone_number: payload.phoneNumber,
      conference,
    });

    if (error) {
      if ((error as { code?: string }).code === "PGRST205") {
        return NextResponse.json(
          {
            error:
              "Database table is missing. Run migrations/001_create_registration_tables.sql in Supabase SQL Editor.",
          },
          { status: 500 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: "Individual registration submitted." }, { status: 201 });
  }

  const missing = requiredBulkFields.find((field) => !payload[field]?.trim());
  if (missing) {
    return NextResponse.json({ error: `${missing} is required.` }, { status: 400 });
  }

  const bulkPayload = body.payload as BulkFormPayload;
  const contactName = normalizePersonName(payload.contactName);
  const church = String(payload.church ?? "").trim();
  const ministry = String(payload.ministry ?? "").trim();
  const address = String(payload.address ?? "").trim();
  const localChurchPastor = normalizePersonName(String(payload.localChurchPastor ?? ""));
  const phoneNumber = String(payload.phoneNumber ?? "").trim();
  const attendeeNames = includeContactInAttendeeNames(
    contactName,
    parseAttendeeNames(payload.attendeeNames),
  );
  const providedAttendeeRows = Array.isArray(bulkPayload.attendeeRows)
    ? normalizeImportedRows(bulkPayload.attendeeRows)
    : [];

  const hasInvalidProvidedAttendee = providedAttendeeRows.some(
    (row) =>
      !row.fullName ||
      !row.church ||
      !row.ministry ||
      !row.address ||
      !row.localChurchPastor ||
      !row.phoneNumber,
  );

  if (hasInvalidProvidedAttendee) {
    return NextResponse.json(
      { error: "Each attendee row must include full name, church, ministry, address, pastor, and phone number." },
      { status: 400 },
    );
  }

  const capacityCheck = await ensureConferenceCapacity(supabase, conference, attendeeNames.length);
  if (!capacityCheck.ok) {
    return NextResponse.json({ error: capacityCheck.error }, { status: capacityCheck.status });
  }

  const { data: insertedBulkRow, error } = await supabase
    .from("bulk_registrations")
    .insert({
      contact_name: contactName,
      church,
      ministry,
      address,
      local_church_pastor: localChurchPastor,
      phone_number: phoneNumber,
      attendee_count: attendeeNames.length,
      attendee_names: attendeeNames.join("\n"),
      conference,
    })
    .select("id")
    .single();

  if (error) {
    if ((error as { code?: string }).code === "PGRST205") {
      return NextResponse.json(
        {
          error:
            "Database table is missing. Run migrations/001_create_registration_tables.sql in Supabase SQL Editor.",
        },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const contactKey = contactName.toLowerCase();
  const linkedRows: BulkAttendeeInsert[] = providedAttendeeRows.length
    ? [
        {
          bulk_registration_id: insertedBulkRow.id,
          attendee_name: contactName,
          attendee_phone: phoneNumber,
          attendee_ministry: ministry,
          attendee_church: church,
          attendee_address: address,
          attendee_local_church_pastor: localChurchPastor,
        },
        ...providedAttendeeRows
          .filter((row) => normalizePersonName(row.fullName).toLowerCase() !== contactKey)
          .map((row) => ({
            bulk_registration_id: insertedBulkRow.id,
            attendee_name: row.fullName,
            attendee_phone: row.phoneNumber,
            attendee_ministry: row.ministry,
            attendee_church: row.church,
            attendee_address: row.address,
            attendee_local_church_pastor: row.localChurchPastor,
          })),
      ]
    : attendeeNames.map((attendeeName) => {
        const isContact = attendeeName.toLowerCase() === contactKey;
        return {
          bulk_registration_id: insertedBulkRow.id,
          attendee_name: attendeeName,
          attendee_phone: isContact ? phoneNumber : undefined,
          attendee_ministry: isContact ? ministry : undefined,
          attendee_church: isContact ? church : undefined,
          attendee_address: isContact ? address : undefined,
          attendee_local_church_pastor: isContact ? localChurchPastor : undefined,
        };
      });

  const replaceLinkedError = await replaceBulkAttendees(supabase, insertedBulkRow.id, linkedRows, false);
  if (replaceLinkedError) {
    return NextResponse.json({ error: replaceLinkedError }, { status: 500 });
  }

  return NextResponse.json({ message: "Bulk registration submitted." }, { status: 201 });
}

export async function PATCH(request: Request) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is required for admin updates." },
      { status: 500 },
    );
  }

  let body: {
    type?: "individual" | "bulk";
    id?: string;
    payload?: BulkFormPayload;
  };

  try {
    body = (await request.json()) as {
      type?: "individual" | "bulk";
      id?: string;
      payload?: BulkFormPayload;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const type = body.type;
  const id = String(body.id ?? "").trim();
  const payload = body.payload ?? {};

  if (!type || !id) {
    return NextResponse.json({ error: "type and id are required." }, { status: 400 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (type === "individual") {
    const required = ["name", "church", "ministry", "address", "localChurchPastor", "phoneNumber"];
    const missing = required.find((field) => !String(payload[field] ?? "").trim());
    if (missing) {
      return NextResponse.json({ error: `${missing} is required.` }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("individual_registrations")
      .update({
        full_name: normalizePersonName(String(payload.name ?? "")),
        church: String(payload.church ?? "").trim(),
        ministry: String(payload.ministry ?? "").trim(),
        address: String(payload.address ?? "").trim(),
        local_church_pastor: normalizePersonName(String(payload.localChurchPastor ?? "")),
        phone_number: String(payload.phoneNumber ?? "").trim(),
      })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: "Individual record updated." });
  }

  const required = [
    "contactName",
    "church",
    "ministry",
    "address",
    "localChurchPastor",
    "phoneNumber",
    "attendeeCount",
    "attendeeNames",
  ];
  const missing = required.find((field) => !String(payload[field] ?? "").trim());
  if (missing) {
    return NextResponse.json({ error: `${missing} is required.` }, { status: 400 });
  }

  const attendeeCount = Number(payload.attendeeCount);
  if (!Number.isFinite(attendeeCount) || attendeeCount <= 0) {
    return NextResponse.json({ error: "attendeeCount must be a positive number." }, { status: 400 });
  }

  const contactName = normalizePersonName(String(payload.contactName ?? ""));
  const church = String(payload.church ?? "").trim();
  const ministry = String(payload.ministry ?? "").trim();
  const address = String(payload.address ?? "").trim();
  const localChurchPastor = normalizePersonName(String(payload.localChurchPastor ?? ""));
  const phoneNumber = String(payload.phoneNumber ?? "").trim();
  const attendeeNames = includeContactInAttendeeNames(
    contactName,
    parseAttendeeNames(String(payload.attendeeNames ?? "").trim()),
  );
  const providedAttendeeRows = Array.isArray((payload as BulkFormPayload).attendeeRows)
    ? normalizeImportedRows((payload as BulkFormPayload).attendeeRows ?? [])
    : [];

  const hasInvalidProvidedAttendee = providedAttendeeRows.some(
    (row) =>
      !row.fullName ||
      !row.church ||
      !row.ministry ||
      !row.address ||
      !row.localChurchPastor ||
      !row.phoneNumber,
  );
  if (hasInvalidProvidedAttendee) {
    return NextResponse.json(
      { error: "Each attendee row must include full name, church, ministry, address, pastor, and phone number." },
      { status: 400 },
    );
  }

  const { error } = await supabaseAdmin
    .from("bulk_registrations")
    .update({
      contact_name: contactName,
      church,
      ministry,
      address,
      local_church_pastor: localChurchPastor,
      phone_number: phoneNumber,
      attendee_count: attendeeNames.length,
      attendee_names: attendeeNames.join("\n"),
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let linkedRows: BulkAttendeeInsert[];

  if (providedAttendeeRows.length) {
    const contactKey = contactName.toLowerCase();
    linkedRows = [
      {
        bulk_registration_id: id,
        attendee_name: contactName,
        attendee_phone: phoneNumber,
        attendee_ministry: ministry,
        attendee_church: church,
        attendee_address: address,
        attendee_local_church_pastor: localChurchPastor,
      },
      ...providedAttendeeRows
        .filter((row) => normalizePersonName(row.fullName).toLowerCase() !== contactKey)
        .map((row) => ({
          bulk_registration_id: id,
          attendee_name: row.fullName,
          attendee_phone: row.phoneNumber,
          attendee_ministry: row.ministry,
          attendee_church: row.church,
          attendee_address: row.address,
          attendee_local_church_pastor: row.localChurchPastor,
        })),
    ];
  } else {
    const { data: existingLinkedRows } = await (supabaseAdmin as any)
      .from("bulk_registration_attendees")
      .select(
        "attendee_name,attendee_phone,attendee_ministry,attendee_church,attendee_address,attendee_local_church_pastor",
      )
      .eq("bulk_registration_id", id)
      .order("created_at", { ascending: true });

    const existingRows = Array.isArray(existingLinkedRows)
      ? (existingLinkedRows as Array<{
          attendee_name?: string;
          attendee_phone?: string;
          attendee_ministry?: string;
          attendee_church?: string;
          attendee_address?: string;
          attendee_local_church_pastor?: string;
        }>)
      : [];

    linkedRows = attendeeNames.map((attendeeName, index) => {
      const isContact = attendeeName.toLowerCase() === contactName.toLowerCase();
      const existing =
        existingRows[index] ??
        existingRows.find(
          (row) => normalizePersonName(String(row.attendee_name ?? "")) === normalizePersonName(attendeeName),
        );
      return {
        bulk_registration_id: id,
        attendee_name: attendeeName,
        attendee_phone: isContact ? phoneNumber : String(existing?.attendee_phone ?? "").trim() || undefined,
        attendee_ministry: isContact ? ministry : String(existing?.attendee_ministry ?? "").trim() || undefined,
        attendee_church: isContact ? church : String(existing?.attendee_church ?? "").trim() || undefined,
        attendee_address: isContact ? address : String(existing?.attendee_address ?? "").trim() || undefined,
        attendee_local_church_pastor:
          isContact ? localChurchPastor : String(existing?.attendee_local_church_pastor ?? "").trim() || undefined,
      };
    });
  }

  const replaceLinkedError = await replaceBulkAttendees(supabaseAdmin, id, linkedRows, true);
  if (replaceLinkedError) {
    return NextResponse.json({ error: replaceLinkedError }, { status: 500 });
  }

  return NextResponse.json({ message: "Bulk record updated." });
}

export async function DELETE(request: Request) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is required for admin deletes." },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const id = String(searchParams.get("id") ?? "").trim();

  if (!id || (type !== "individual" && type !== "bulk")) {
    return NextResponse.json({ error: "Valid type and id are required." }, { status: 400 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const tableName = type === "individual" ? "individual_registrations" : "bulk_registrations";
  const { error } = await supabaseAdmin.from(tableName).delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: "Record deleted." });
}
