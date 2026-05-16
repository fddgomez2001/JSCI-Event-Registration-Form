import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type WalkInRequest = {
  fullName?: string;
  church?: string;
  committeeName?: string;
  conference?: "leyte" | "cebu";
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) return null;

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function normalizeConference(value: string | undefined): "leyte" | "cebu" {
  if (!value) return "cebu";
  return value.toLowerCase().includes("cebu") ? "cebu" : "leyte";
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ success: false, message: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  let body: WalkInRequest;
  try {
    body = (await request.json()) as WalkInRequest;
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON" }, { status: 400 });
  }

  const fullName = String(body.fullName ?? "").trim();
  const church = String(body.church ?? "").trim();
  const conference = normalizeConference(body.conference);

  if (!fullName) {
    return NextResponse.json({ success: false, message: "fullName is required" }, { status: 400 });
  }

  if (!church) {
    return NextResponse.json({ success: false, message: "church is required" }, { status: 400 });
  }

  try {
    const sourceId = crypto.randomUUID();
    const attendeeKey = `walk-${sourceId.slice(0, 8)}`;

    const { data, error } = await supabase
      .from("attendee_call_queue")
      .insert({
        attendee_key: attendeeKey,
        source_type: "individual",
        source_id: sourceId,
        source_index: 0,
        conference,
        full_name: fullName,
        phone_number: null,
        church,
        ministry: null,
        address: "",
        local_church_pastor: "",
        call_status: "available",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("id,attendee_key,full_name,church,conference")
      .single();

    if (error) {
      throw error;
    }

    const committeeName = String(body.committeeName ?? "").trim();
    if (committeeName) {
      try {
        await supabase.from("qr_scan_logs").insert({
          attendee_id: data.id,
          attendee_name: data.full_name,
          committee_name: committeeName,
          action_type: "walk_in_registration",
          conference: data.conference,
        });
      } catch {
        // Ignore logging failures so the walk-in attendee still gets created.
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        attendeeId: data.id,
        attendeeKey: data.attendee_key,
        fullName: data.full_name,
        church: data.church,
        conference: data.conference === "cebu" ? "CEBU Conference" : "LEYTE Conference",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create walk-in registration.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
