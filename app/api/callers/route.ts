import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Conference = "cebu" | "leyte";
type CallStatus = "available" | "calling" | "confirmed" | "not_attending" | "follow_up_needed";

type CallQueueRow = {
  id: string;
  attendee_key: string;
  source_type: "individual" | "bulk";
  source_id: string;
  source_index: number;
  conference: Conference;
  full_name: string;
  phone_number: string;
  church: string;
  ministry: string;
  address: string;
  local_church_pastor: string;
  call_status: "available" | "calling" | "confirmed" | "not_attending" | "follow_up_needed";
  claimed_by: string | null;
  claimed_at: string | null;
  call_lock_expires_at: string | null;
  status_set_by: string | null;
  status_set_at: string | null;
  created_at: string;
  updated_at: string;
};

const validStatuses = new Set(["confirmed", "not_attending", "follow_up_needed"]);

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function toClientRow(row: CallQueueRow) {
  return {
    attendeeKey: row.attendee_key,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceIndex: row.source_index,
    conference: row.conference,
    fullName: row.full_name,
    phoneNumber: row.phone_number,
    church: row.church,
    ministry: row.ministry,
    address: row.address,
    localChurchPastor: row.local_church_pastor,
    callStatus: row.call_status,
    claimedBy: row.claimed_by,
    claimedAt: row.claimed_at,
    callLockExpiresAt: row.call_lock_expires_at,
    statusSetBy: row.status_set_by,
    statusSetAt: row.status_set_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is required for caller data access." },
      { status: 500 },
    );
  }

  const { data, error } = await supabase
    .from("attendee_call_queue")
    .select(
      "id,attendee_key,source_type,source_id,source_index,conference,full_name,phone_number,church,ministry,address,local_church_pastor,call_status,claimed_by,claimed_at,call_lock_expires_at,status_set_by,status_set_at,created_at,updated_at",
    )
    .order("updated_at", { ascending: false })
    .order("full_name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ attendees: (data ?? []).map((row) => ({ ...toClientRow(row as CallQueueRow), attendeeId: (row as any).id })) });
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is required for caller actions." },
      { status: 500 },
    );
  }

  let body: { action?: string; attendeeKey?: string; callerName?: string; status?: string };
  try {
    body = (await request.json()) as { action?: string; attendeeKey?: string; callerName?: string; status?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const attendeeKey = String(body.attendeeKey ?? "").trim();
  const callerName = String(body.callerName ?? "").trim();

  if (!attendeeKey || !callerName) {
    return NextResponse.json({ error: "attendeeKey and callerName are required." }, { status: 400 });
  }

  if (body.action === "claim") {
    const { data, error } = await supabase.rpc("claim_attendee_call", {
      _attendee_key: attendeeKey,
      _caller_name: callerName,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json({ attendee: toClientRow(data as CallQueueRow) });
  }

  if (body.action === "status") {
    const status = String(body.status ?? "").trim();

    if (!validStatuses.has(status as CallStatus)) {
      return NextResponse.json(
        { error: "Use the three final status buttons: Confirmed, Not Attending, or Follow-Up Needed." },
        { status: 400 },
      );
    }

    const { data, error } = await supabase.rpc("set_attendee_call_status", {
      _attendee_key: attendeeKey,
      _caller_name: callerName,
      _status: status,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json({ attendee: toClientRow(data as CallQueueRow) });
  }

  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}