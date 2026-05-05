import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) return null;

  return createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });

  let body: { attendeeId?: string; attendeeKey?: string; committeeName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawValue = String(body.attendeeKey ?? body.attendeeId ?? "").trim();
  if (!rawValue) return NextResponse.json({ error: "attendeeId required" }, { status: 400 });
  const committeeName = String(body.committeeName ?? "").trim();

  const lookupBySource = async (sourceType: string, sourceId: string, attendeeName: string) => {
    const query = supabase
      .from("attendee_call_queue")
      .select("id,attendee_key,full_name,church,ministry,conference")
      .eq("source_type", sourceType)
      .eq("source_id", sourceId);

    if (sourceType === "bulk" && attendeeName) {
      return query.eq("full_name", attendeeName).maybeSingle();
    }

    return query.maybeSingle();
  };

  let attendeeQuery = supabase
    .from("attendee_call_queue")
    .select("id,attendee_key,full_name,church,ministry,conference")
    .eq("attendee_key", rawValue);

  let { data: attendee, error: attendeeErr } = await attendeeQuery.maybeSingle();

  if (!attendee) {
    attendeeQuery = supabase
      .from("attendee_call_queue")
      .select("id,attendee_key,full_name,church,ministry,conference")
      .eq("id", rawValue);
    ({ data: attendee, error: attendeeErr } = await attendeeQuery.maybeSingle());
  }

  if (!attendee) {
    try {
      const url = new URL(rawValue);
      const sourceType = url.searchParams.get("sourceType") ?? "";
      const sourceId = url.searchParams.get("sourceId") ?? "";
      const attendeeName = url.searchParams.get("name") ?? "";
      if (sourceType && sourceId) {
        ({ data: attendee, error: attendeeErr } = await lookupBySource(sourceType, sourceId, attendeeName));
      }
    } catch {
      // Not a URL payload.
    }
  }

  if (attendeeErr || !attendee) return NextResponse.json({ error: "Attendee not found" }, { status: 404 });

  const attendeeId = attendee.id;

  const { data: checkin, error: checkinErr } = await supabase
    .from("attendee_checkins")
    .select("checked_in,lunch")
    .eq("attendee_id", attendeeId)
    .single();

  if (checkinErr && checkinErr.code === "42P01") {
    return NextResponse.json(
      { error: "Database table attendee_checkins is missing. Run migration 010_create_attendee_checkins.sql in Supabase." },
      { status: 500 },
    );
  }

  if (committeeName) {
    await supabase.from("qr_scan_logs").insert({
      attendee_id: attendeeId,
      attendee_name: attendee.full_name,
      committee_name: committeeName,
      action_type: "lookup",
      conference: attendee.conference,
    });
  }

  return NextResponse.json({
    fullName: attendee.full_name,
    church: attendee.church,
    ministry: attendee.ministry,
    conference: attendee.conference === "cebu" ? "CEBU Conference" : "LEYTE Conference",
    checkedIn: !!checkin?.checked_in,
    lunch: !!checkin?.lunch,
  });
}
