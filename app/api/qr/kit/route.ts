import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type KitResponse = {
  attendeeId: string;
  toteBag: boolean;
  mug: boolean;
  notebook: boolean;
  pencil: boolean;
  allClaimed: boolean;
  claimedAt: string | null;
  claimedByCommittee: string | null;
};

type KitRequest = {
  attendeeId?: string;
  committeeName?: string;
  toteBag?: boolean;
  mug?: boolean;
  notebook?: boolean;
  pencil?: boolean;
  claimAll?: boolean;
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) return null;

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function toKitResponse(attendeeId: string, row?: any): KitResponse {
  const toteBag = !!row?.tote_bag;
  const mug = !!row?.mug;
  const notebook = !!row?.notebook;
  const pencil = !!row?.pencil;

  return {
    attendeeId,
    toteBag,
    mug,
    notebook,
    pencil,
    allClaimed: toteBag && mug && notebook && pencil,
    claimedAt: row?.claimed_at ?? null,
    claimedByCommittee: row?.claimed_by_committee ?? null,
  };
}

export async function GET(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ success: false, message: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  const url = new URL(request.url);
  const attendeeId = String(url.searchParams.get("attendeeId") ?? "").trim();
  if (!attendeeId) {
    return NextResponse.json({ success: false, message: "attendeeId is required" }, { status: 400 });
  }

  try {
    const { data, error } = await supabase
      .from("attendee_kit_claims")
      .select("attendee_id,tote_bag,mug,notebook,pencil,claimed_at,claimed_by_committee")
      .eq("attendee_id", attendeeId)
      .maybeSingle();

    if (error && error.code !== "PGRST205") {
      throw error;
    }

    return NextResponse.json({
      success: true,
      data: toKitResponse(attendeeId, data || undefined),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch kit status.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ success: false, message: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  let body: KitRequest;
  try {
    body = (await request.json()) as KitRequest;
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON" }, { status: 400 });
  }

  const attendeeId = String(body.attendeeId ?? "").trim();
  const committeeName = String(body.committeeName ?? "").trim();
  if (!attendeeId) {
    return NextResponse.json({ success: false, message: "attendeeId is required" }, { status: 400 });
  }
  if (!committeeName) {
    return NextResponse.json({ success: false, message: "committeeName is required" }, { status: 400 });
  }

  try {
    // Require confirmed payment before kit can be claimed.
    const { data: paidPayment, error: paymentErr } = await supabase
      .from("payments")
      .select("id")
      .eq("attendee_id", attendeeId)
      .eq("payment_status", "paid")
      .limit(1)
      .maybeSingle();

    if (paymentErr && paymentErr.code !== "PGRST116") {
      throw paymentErr;
    }

    if (!paidPayment) {
      return NextResponse.json(
        { success: false, message: "Payment must be confirmed before kit can be claimed." },
        { status: 400 },
      );
    }

    const claimAll = !!body.claimAll;
    const toteBag = claimAll ? true : !!body.toteBag;
    const mug = claimAll ? true : !!body.mug;
    const notebook = claimAll ? true : !!body.notebook;
    const pencil = claimAll ? true : !!body.pencil;

    const hasAnyClaim = toteBag || mug || notebook || pencil;

    const { data, error } = await supabase
      .from("attendee_kit_claims")
      .upsert(
        {
          attendee_id: attendeeId,
          tote_bag: toteBag,
          mug,
          notebook,
          pencil,
          claimed_at: hasAnyClaim ? new Date().toISOString() : null,
          claimed_by_committee: hasAnyClaim ? committeeName : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "attendee_id" },
      )
      .select("attendee_id,tote_bag,mug,notebook,pencil,claimed_at,claimed_by_committee")
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      data: toKitResponse(attendeeId, data),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save kit claims.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
