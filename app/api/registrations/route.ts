import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RegistrationRequest = {
  type: "individual" | "bulk" | "bulkImport";
  payload: Record<string, string> | { rows: ImportedRow[] };
};

type FormPayload = Record<string, string>;

type ImportedRow = {
  fullName: string;
  church: string;
  ministry: string;
  address: string;
  localChurchPastor: string;
  phoneNumber: string;
};

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode");
  const totalSlots = Number(process.env.NEXT_PUBLIC_TOTAL_SLOTS ?? 100);

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

    const username = request.headers.get("x-admin-username") ?? "";
    const password = request.headers.get("x-admin-password") ?? "";

    if (username !== adminCredentials.username || password !== adminCredentials.password) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const [individualResult, bulkResult] = await Promise.all([
      supabaseAdmin
        .from("individual_registrations")
        .select("id,full_name,church,ministry,address,local_church_pastor,phone_number,created_at")
        .order("created_at", { ascending: false })
        .limit(5000),
      supabaseAdmin
        .from("bulk_registrations")
        .select("id,contact_name,church,ministry,address,local_church_pastor,phone_number,attendee_count,attendee_names,created_at")
        .order("created_at", { ascending: false })
        .limit(5000),
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

    return NextResponse.json({
      individual: individualResult.data ?? [],
      bulk: bulkResult.data ?? [],
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
      supabaseSlots.from("individual_registrations").select("id", { count: "exact", head: true }),
      supabaseSlots.from("bulk_registrations").select("attendee_count").limit(5000),
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
    const { data, error } = await supabase.from(tableName).select("church").limit(1000);

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

  if (body.type === "bulkImport") {
    const rows = Array.isArray((body.payload as { rows?: ImportedRow[] })?.rows)
      ? ((body.payload as { rows: ImportedRow[] }).rows ?? [])
      : [];

    if (rows.length === 0) {
      return NextResponse.json({ error: "No rows found in import payload." }, { status: 400 });
    }

    const normalizedRows = rows.map((row) => ({
      full_name: String(row.fullName ?? "").trim(),
      church: String(row.church ?? "").trim(),
      ministry: String(row.ministry ?? "").trim(),
      address: String(row.address ?? "").trim(),
      local_church_pastor: String(row.localChurchPastor ?? "").trim(),
      phone_number: String(row.phoneNumber ?? "").trim(),
    }));

    const invalidRow = normalizedRows.find(
      (row) =>
        !row.full_name ||
        !row.church ||
        !row.ministry ||
        !row.address ||
        !row.local_church_pastor ||
        !row.phone_number,
    );

    if (invalidRow) {
      return NextResponse.json(
        { error: "All imported rows must include all required fields." },
        { status: 400 },
      );
    }

    const seen = new Set<string>();
    const dedupedRows = normalizedRows.filter((row) => {
      const key = `${row.full_name.toLowerCase()}|${row.phone_number.replace(/\D/g, "")}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const phones = [...new Set(dedupedRows.map((row) => row.phone_number))];
    const { data: existingRows, error: existingError } = await supabase
      .from("individual_registrations")
      .select("phone_number")
      .in("phone_number", phones);

    if (existingError) {
      if ((existingError as { code?: string }).code === "PGRST205") {
        return NextResponse.json(
          {
            error:
              "Database table is missing. Run migrations/001_create_registration_tables.sql in Supabase SQL Editor.",
          },
          { status: 500 },
        );
      }
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    const existingPhoneSet = new Set((existingRows ?? []).map((row) => row.phone_number));
    const insertRows = dedupedRows.filter((row) => !existingPhoneSet.has(row.phone_number));
    const skippedCount = dedupedRows.length - insertRows.length;
    const duplicateInFileCount = normalizedRows.length - dedupedRows.length;

    if (insertRows.length === 0) {
      return NextResponse.json(
        {
          error: "No new records to insert. Imported rows are duplicates.",
          duplicateInFileCount,
          duplicateInDatabaseCount: skippedCount,
        },
        { status: 409 },
      );
    }

    const { error: insertError } = await supabase.from("individual_registrations").insert(insertRows);

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        message: "Bulk import registration submitted.",
        insertedCount: insertRows.length,
        duplicateInFileCount,
        duplicateInDatabaseCount: skippedCount,
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

    const { error } = await supabase.from("individual_registrations").insert({
      full_name: payload.name,
      church: payload.church,
      ministry: payload.ministry,
      address: payload.address,
      local_church_pastor: payload.localChurchPastor,
      phone_number: payload.phoneNumber,
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

  const { error } = await supabase.from("bulk_registrations").insert({
    contact_name: payload.contactName,
    church: payload.church,
    ministry: payload.ministry,
    address: payload.address,
    local_church_pastor: payload.localChurchPastor,
    phone_number: payload.phoneNumber,
    attendee_count: Number(payload.attendeeCount),
    attendee_names: payload.attendeeNames,
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

  return NextResponse.json({ message: "Bulk registration submitted." }, { status: 201 });
}
