import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type QueueRow = {
  id: string;
  attendee_key: string;
  full_name: string;
  church: string | null;
  ministry: string | null;
  conference: string | null;
  phone_number?: string | null;
  call_status?: string | null;
  source_type?: string | null;
  source_id?: string | null;
};

type DirectoryRow = {
  record_id: string;
  registration_source: string;
  attendee_name: string;
  contact_person: string | null;
  conference: string | null;
  church: string | null;
  ministry: string | null;
  phone_number: string | null;
};

type QRReaderData = {
  id: string;
  name: string;
  email: string | null;
  status: string;
  type: string;
  church: string | null;
  ministry: string | null;
  conference: string | null;
  phoneNumber: string | null;
  source: string | null;
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) return null;

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function normalizeQrValue(raw: string) {
  const value = String(raw ?? "").replace(/\r/g, "").trim();
  if (!value) return "";

  try {
    const url = new URL(value);
    const sourceType = url.searchParams.get("sourceType");
    const sourceId = url.searchParams.get("sourceId");
    if (sourceType && sourceId) return url.toString();

    const codeFromQuery = url.searchParams.get("code");
    if (codeFromQuery) return codeFromQuery.trim();

    const maybeUuidPath = url.pathname.split("/").filter(Boolean).pop() ?? "";
    if (maybeUuidPath) return maybeUuidPath.trim();

    return url.toString();
  } catch {
    return value;
  }
}

function conferenceLabel(conference: string | null | undefined) {
  if (!conference) return null;
  return conference === "cebu" ? "CEBU Conference" : "LEYTE Conference";
}

function toRecord(input: {
  id: string;
  name: string;
  email?: string | null;
  status: string;
  type: string;
  church?: string | null;
  ministry?: string | null;
  conference?: string | null;
  phoneNumber?: string | null;
  source?: string | null;
}): QRReaderData {
  return {
    id: input.id,
    name: input.name,
    email: input.email ?? null,
    status: input.status,
    type: input.type,
    church: input.church ?? null,
    ministry: input.ministry ?? null,
    conference: input.conference ?? null,
    phoneNumber: input.phoneNumber ?? null,
    source: input.source ?? null,
  };
}

async function lookupCallQueueRecord(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>, qrValue: string) {
  const [byAttendeeKey, byId] = await Promise.all([
    supabase.from("attendee_call_queue").select("id,attendee_key,full_name,church,ministry,conference,phone_number,call_status,source_type,source_id").eq("attendee_key", qrValue).maybeSingle(),
    supabase.from("attendee_call_queue").select("id,attendee_key,full_name,church,ministry,conference,phone_number,call_status,source_type,source_id").eq("id", qrValue).maybeSingle(),
  ]);

  const directResults = [byAttendeeKey, byId];
  for (const result of directResults) {
    if (result.error) {
      if (result.error.code === "PGRST205") return { missing: true as const };
      throw result.error;
    }
  }

  if (byAttendeeKey.data) return { data: byAttendeeKey.data as QueueRow };
  if (byId.data) return { data: byId.data as QueueRow };

  try {
    const url = new URL(qrValue);
    const sourceType = String(url.searchParams.get("sourceType") ?? "").trim();
    const sourceId = String(url.searchParams.get("sourceId") ?? "").trim();
    const attendeeName = String(url.searchParams.get("name") ?? "").trim();

    if (sourceType && sourceId) {
      const query = supabase
        .from("attendee_call_queue")
        .select("id,attendee_key,full_name,church,ministry,conference,phone_number,call_status,source_type,source_id")
        .eq("source_type", sourceType)
        .eq("source_id", sourceId);

      const { data, error } = attendeeName ? await query.eq("full_name", attendeeName).maybeSingle() : await query.maybeSingle();
      if (error) {
        if (error.code === "PGRST205") return { missing: true as const };
        throw error;
      }
      if (data) return { data: data as QueueRow };
    }
  } catch {
    // Not a URL payload.
  }

  return { data: null };
}

async function lookupDirectoryRecord(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>, qrValue: string) {
  const [byRecordId, byAttendeeName] = await Promise.all([
    supabase.from("attendee_directory").select("record_id,registration_source,attendee_name,contact_person,conference,church,ministry,phone_number").eq("record_id", qrValue).maybeSingle(),
    supabase.from("attendee_directory").select("record_id,registration_source,attendee_name,contact_person,conference,church,ministry,phone_number").eq("attendee_name", qrValue).maybeSingle(),
  ]);

  const directResults = [byRecordId, byAttendeeName];
  for (const result of directResults) {
    if (result.error) {
      if (result.error.code === "PGRST205") return { missing: true as const };
      throw result.error;
    }
  }

  if (byRecordId.data) return { data: byRecordId.data as DirectoryRow };
  if (byAttendeeName.data) return { data: byAttendeeName.data as DirectoryRow };

  return { data: null };
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ success: false, message: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  const adminSupabase = supabase;

  let body: { qrValue?: string };
  try {
    body = (await request.json()) as { qrValue?: string };
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON" }, { status: 400 });
  }

  const qrValue = normalizeQrValue(body.qrValue ?? "");
  if (!qrValue) {
    return NextResponse.json({ success: false, message: "qrValue is required" }, { status: 400 });
  }

  try {
    const queueResult = await lookupCallQueueRecord(adminSupabase, qrValue);
    if ("missing" in queueResult && queueResult.missing) {
      return NextResponse.json(
        {
          success: false,
          qrValue,
          message: "Database table attendee_call_queue is missing. Use this endpoint as a template and point it to your QR data table or view.",
        },
        { status: 500 },
      );
    }

    if (queueResult.data) {
      const attendee = queueResult.data;
      return NextResponse.json({
        success: true,
        qrValue,
        data: toRecord({
          id: attendee.id,
          name: attendee.full_name,
          email: null,
          status: attendee.call_status ?? "Registered",
          type: attendee.source_type ?? "attendee_call_queue",
          church: attendee.church,
          ministry: attendee.ministry,
          conference: conferenceLabel(attendee.conference),
          phoneNumber: attendee.phone_number ?? null,
          source: attendee.source_type && attendee.source_id ? `${attendee.source_type}:${attendee.source_id}` : "attendee_call_queue",
        }),
      });
    }

    const directoryResult = await lookupDirectoryRecord(adminSupabase, qrValue);
    if ("missing" in directoryResult && directoryResult.missing) {
      return NextResponse.json(
        {
          success: false,
          qrValue,
          message: "Database view attendee_directory is missing. Use this endpoint as a template and adjust the query to your data model.",
        },
        { status: 500 },
      );
    }

    if (directoryResult.data) {
      const attendee = directoryResult.data;
      return NextResponse.json({
        success: true,
        qrValue,
        data: toRecord({
          id: attendee.record_id,
          name: attendee.attendee_name,
          email: null,
          status: "Registered",
          type: attendee.registration_source,
          church: attendee.church,
          ministry: attendee.ministry,
          conference: conferenceLabel(attendee.conference),
          phoneNumber: attendee.phone_number,
          source: attendee.contact_person ? `${attendee.registration_source} under ${attendee.contact_person}` : attendee.registration_source,
        }),
      });
    }

    return NextResponse.json({ success: false, qrValue, message: "No record found for this QR code" }, { status: 404 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to search the QR code.";
    return NextResponse.json({ success: false, qrValue, message }, { status: 500 });
  }
}
