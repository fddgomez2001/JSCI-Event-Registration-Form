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

  let body: { attendeeId?: string; attendeeKey?: string; committeeName?: string; includeDetails?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawValue = String(body.attendeeKey ?? body.attendeeId ?? "").trim();
  if (!rawValue) return NextResponse.json({ error: "attendeeId required" }, { status: 400 });
  const committeeName = String(body.committeeName ?? "").trim();
  const includeDetails = body.includeDetails === true;

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

  const checkinPromise = supabase
    .from("attendee_checkins")
    .select("checked_in,lunch")
    .eq("attendee_id", attendeeId)
    .maybeSingle();

  let paymentDetails: { paymentStatus: "pending" | "paid"; paidAt: string | null; paidByCommittee: string | null } | null = null;
  let kitDetails: {
    toteBag: boolean;
    mug: boolean;
    notebook: boolean;
    pencil: boolean;
    claimedAt: string | null;
    claimedByCommittee: string | null;
  } | null = null;

  if (includeDetails) {
    const [checkinResult, paymentResult, kitResult] = await Promise.all([
      checkinPromise,
      supabase
        .from("payments")
        .select("payment_status,paid_at,paid_by_committee")
        .eq("attendee_id", attendeeId)
        .maybeSingle(),
      supabase
        .from("attendee_kit_claims")
        .select("tote_bag,mug,notebook,pencil,claimed_at,claimed_by_committee")
        .eq("attendee_id", attendeeId)
        .maybeSingle(),
    ]);

    if (checkinResult.error && checkinResult.error.code === "42P01") {
      return NextResponse.json(
        { error: "Database table attendee_checkins is missing. Run migration 010_create_attendee_checkins.sql in Supabase." },
        { status: 500 },
      );
    }

    if (!paymentResult.error || paymentResult.error.code === "PGRST116" || paymentResult.error.code === "PGRST205") {
      paymentDetails = {
        paymentStatus: paymentResult.data?.payment_status === "paid" ? "paid" : "pending",
        paidAt: paymentResult.data?.paid_at ?? null,
        paidByCommittee: paymentResult.data?.paid_by_committee ?? null,
      };
    }

    if (!kitResult.error || kitResult.error.code === "PGRST116" || kitResult.error.code === "PGRST205") {
      kitDetails = {
        toteBag: !!kitResult.data?.tote_bag,
        mug: !!kitResult.data?.mug,
        notebook: !!kitResult.data?.notebook,
        pencil: !!kitResult.data?.pencil,
        claimedAt: kitResult.data?.claimed_at ?? null,
        claimedByCommittee: kitResult.data?.claimed_by_committee ?? null,
      };
    }

    const checkin = checkinResult.data;

    return NextResponse.json({
      attendeeId,
      fullName: attendee.full_name,
      church: attendee.church,
      ministry: attendee.ministry,
      conference: attendee.conference === "cebu" ? "CEBU Conference" : "LEYTE Conference",
      checkedIn: !!checkin?.checked_in,
      lunch: !!checkin?.lunch,
      isWalkIn: typeof attendee.attendee_key === "string" && attendee.attendee_key.startsWith("walk-"),
      ...(paymentDetails
        ? {
            paymentStatus: paymentDetails.paymentStatus,
            paidAt: paymentDetails.paidAt,
            paidByCommittee: paymentDetails.paidByCommittee,
          }
        : {}),
      ...(kitDetails
        ? {
            kit: {
              toteBag: kitDetails.toteBag,
              mug: kitDetails.mug,
              notebook: kitDetails.notebook,
              pencil: kitDetails.pencil,
              claimedAt: kitDetails.claimedAt,
              claimedByCommittee: kitDetails.claimedByCommittee,
            },
          }
        : {}),
    });
  }

  const { data: checkin, error: checkinErr } = await checkinPromise;

  if (checkinErr && checkinErr.code === "42P01") {
    return NextResponse.json(
      { error: "Database table attendee_checkins is missing. Run migration 010_create_attendee_checkins.sql in Supabase." },
      { status: 500 },
    );
  }

  if (committeeName) {
    void (async () => {
      try {
        await supabase.from("qr_scan_logs").insert({
          attendee_id: attendeeId,
          attendee_name: attendee.full_name,
          committee_name: committeeName,
          action_type: "lookup",
          conference: attendee.conference,
        });
      } catch {
        // Ignore lookup log failures.
      }
    })();
  }

  return NextResponse.json({
    attendeeId,
    fullName: attendee.full_name,
    church: attendee.church,
    ministry: attendee.ministry,
    conference: attendee.conference === "cebu" ? "CEBU Conference" : "LEYTE Conference",
    checkedIn: !!checkin?.checked_in,
    lunch: !!checkin?.lunch,
    isWalkIn: typeof attendee.attendee_key === "string" && attendee.attendee_key.startsWith("walk-"),
    ...(paymentDetails
      ? {
          paymentStatus: paymentDetails.paymentStatus,
          paidAt: paymentDetails.paidAt,
          paidByCommittee: paymentDetails.paidByCommittee,
        }
      : {}),
    ...(kitDetails
      ? {
          kit: {
            toteBag: kitDetails.toteBag,
            mug: kitDetails.mug,
            notebook: kitDetails.notebook,
            pencil: kitDetails.pencil,
            claimedAt: kitDetails.claimedAt,
            claimedByCommittee: kitDetails.claimedByCommittee,
          },
        }
      : {}),
  });
}
