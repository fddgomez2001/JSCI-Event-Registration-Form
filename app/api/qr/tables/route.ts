import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) return null;

  return createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

function conferenceLabel(conference: string) {
  return conference === "cebu" ? "CEBU Conference" : "LEYTE Conference";
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });

  const url = new URL(request.url);
  const view = String(url.searchParams.get("view") ?? "").trim();

  if (view === "checkin" || view === "lunch") {
    const statusColumn = view === "checkin" ? "checked_in" : "lunch";
    const timeColumn = view === "checkin" ? "checked_in_at" : "lunch_at";

    const { data: statuses, error: statusError } = await supabase
      .from("attendee_checkins")
      .select(`attendee_id,${statusColumn},${timeColumn}`)
      .eq(statusColumn, true)
      .order(timeColumn, { ascending: false });

    if (statusError) {
      return NextResponse.json({ error: statusError.message }, { status: 500 });
    }

    const attendeeIds = (statuses ?? []).map((row) => row.attendee_id).filter(Boolean);
    if (!attendeeIds.length) {
      return NextResponse.json({ rows: [] });
    }

    const { data: attendees, error: attendeeError } = await supabase
      .from("attendee_call_queue")
      .select("id,full_name,church,ministry,conference")
      .in("id", attendeeIds);

    if (attendeeError) {
      return NextResponse.json({ error: attendeeError.message }, { status: 500 });
    }

    const attendeeMap = new Map((attendees ?? []).map((row) => [row.id, row]));
    const rows = (statuses ?? [])
      .map((row: any) => {
        const attendee = attendeeMap.get(row.attendee_id);
        if (!attendee) return null;

        return {
          id: attendee.id,
          fullName: attendee.full_name,
          church: attendee.church ?? "",
          ministry: attendee.ministry ?? "",
          checkedInAt: view === "checkin" ? row.checked_in_at ?? null : null,
          lunchAt: view === "lunch" ? row.lunch_at ?? null : null,
          conference: conferenceLabel(attendee.conference),
        };
      })
      .filter(Boolean);

    return NextResponse.json({ rows });
  }

  if (view === "log") {
    const { data, error } = await supabase
      .from("qr_scan_logs")
      .select("id,attendee_name,committee_name,action_type,conference,created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      if (error.code === "42P01") {
        return NextResponse.json({ rows: [] });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      rows: (data ?? []).map((row) => ({
        id: row.id,
        fullName: row.attendee_name,
        church: "",
        ministry: "",
        committeeName: row.committee_name,
        actionType: row.action_type,
        scannedAt: row.created_at,
        conference: conferenceLabel(row.conference),
      })),
    });
  }

  return NextResponse.json({ error: "Unsupported view" }, { status: 400 });
}