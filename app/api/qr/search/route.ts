import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) return null;

  return createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  let body: { query?: string; includeLunch?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const query = String(body.query ?? "").trim();
  const includeLunch = body.includeLunch === true;
  if (!query || query.length < 1) {
    return NextResponse.json({
      success: true,
      data: [],
    });
  }

  try {
    const { data: attendees, error } = await supabase
      .from("attendee_call_queue")
      .select("id,attendee_key,full_name,church,ministry,conference")
      .ilike("full_name", `%${query}%`)
      .limit(25);

    if (error && error.code !== "PGRST205") {
      throw error;
    }
    // Fetch payment and lunch status for each attendee
    if (attendees && attendees.length > 0) {
      const attendeeIds = attendees.map((a: any) => a.id);
      const { data: payments } = await supabase
        .from("payments")
        .select("attendee_id,payment_status")
        .in("attendee_id", attendeeIds);

      let lunchRows: Array<{ attendee_id: string; lunch: boolean }> | null = null;
      if (includeLunch) {
        const lunchResult = await supabase
          .from("attendee_checkins")
          .select("attendee_id,lunch")
          .in("attendee_id", attendeeIds);

        if (lunchResult.error && lunchResult.error.code !== "42P01") {
          throw lunchResult.error;
        }
        lunchRows = lunchResult.data as Array<{ attendee_id: string; lunch: boolean }> | null;
      }

      // Map payment and lunch status to attendees.
      const paymentMap = new Map();
      if (payments) {
        payments.forEach((p: any) => {
          paymentMap.set(p.attendee_id, p.payment_status);
        });
      }

      const lunchMap = new Map();
      if (lunchRows) {
        lunchRows.forEach((row: any) => {
          lunchMap.set(row.attendee_id, !!row.lunch);
        });
      }

      const enrichedAttendees = attendees.map((a: any) => ({
        ...a,
        payment_status: paymentMap.get(a.id) || "pending",
        lunch_claimed: lunchMap.get(a.id) || false,
      }));

      return NextResponse.json({
        success: true,
        data: enrichedAttendees,
      });
    }

    return NextResponse.json({
      success: true,
      data: attendees || [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to search attendees.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
