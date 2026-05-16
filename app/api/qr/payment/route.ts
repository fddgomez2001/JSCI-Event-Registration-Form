import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PaymentRequest = {
  attendeeId: string;
  attendeeName: string;
  committeeName: string;
  conferenceLabel?: string;
};

type BulkPaymentRequest = {
  attendeeIds: string[];
  attendeeNames: string[];
  committeeName: string;
  conferenceLabel?: string;
};

type PaymentResponse = {
  id: string;
  attendeeId: string;
  amount: number;
  paymentStatus: string;
  paidAt: string | null;
  paidByCommittee: string | null;
};

type BulkPaymentResponse = {
  successful: PaymentResponse[];
  failed: Array<{ attendeeId: string; attendeeName: string; error: string }>;
  totalProcessed: number;
  totalFailed: number;
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) return null;

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function mapConferenceLabel(label: string | undefined): "leyte" | "cebu" {
  if (!label) return "leyte";
  return label.toLowerCase().includes("cebu") ? "cebu" : "leyte";
}

export async function GET(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ success: false, message: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  const url = new URL(request.url);
  const attendeeId = url.searchParams.get("attendeeId");

  if (!attendeeId) {
    return NextResponse.json({ success: false, message: "attendeeId is required" }, { status: 400 });
  }

  try {
    const { data, error } = await supabase
      .from("payments")
      .select("id,attendee_id,attendee_name,amount,payment_status,paid_at,paid_by_committee")
      .eq("attendee_id", attendeeId)
      .maybeSingle();

    if (error && error.code !== "PGRST205") {
      throw error;
    }

    if (data) {
      return NextResponse.json({
        success: true,
        data: {
          id: data.id,
          attendeeId: data.attendee_id,
          amount: data.amount,
          paymentStatus: data.payment_status,
          paidAt: data.paid_at,
          paidByCommittee: data.paid_by_committee,
        } as PaymentResponse,
      });
    }

    return NextResponse.json({
      success: true,
      data: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch payment status.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

async function processSinglePayment(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  attendeeId: string,
  attendeeName: string,
  committeeName: string,
  conference: "leyte" | "cebu"
): Promise<{ success: boolean; payment?: PaymentResponse; error?: string }> {
  try {
    const { data: existingPayment, error: fetchError } = await supabase
      .from("payments")
      .select("id")
      .eq("attendee_id", attendeeId)
      .maybeSingle();

    if (fetchError && fetchError.code !== "PGRST205") {
      throw fetchError;
    }

    let payment;

    if (existingPayment) {
      const { data, error } = await supabase
        .from("payments")
        .update({
          payment_status: "paid",
          paid_at: new Date().toISOString(),
          paid_by_committee: committeeName,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingPayment.id)
        .select("id,attendee_id,attendee_name,amount,payment_status,paid_at,paid_by_committee")
        .single();

      if (error) throw error;
      payment = data;
    } else {
      const { data, error } = await supabase
        .from("payments")
        .insert({
          attendee_id: attendeeId,
          attendee_name: attendeeName,
          amount: 200.00,
          currency: "PHP",
          payment_method: "cash",
          payment_status: "paid",
          paid_at: new Date().toISOString(),
          paid_by_committee: committeeName,
          conference: conference,
        })
        .select("id,attendee_id,attendee_name,amount,payment_status,paid_at,paid_by_committee")
        .single();

      if (error) throw error;
      payment = data;
    }

    return {
      success: true,
      payment: {
        id: payment.id,
        attendeeId: payment.attendee_id,
        amount: payment.amount,
        paymentStatus: payment.payment_status,
        paidAt: payment.paid_at,
        paidByCommittee: payment.paid_by_committee,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      error: errorMessage,
    };
  }
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ success: false, message: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  let body: PaymentRequest | BulkPaymentRequest;
  try {
    body = (await request.json()) as PaymentRequest | BulkPaymentRequest;
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON" }, { status: 400 });
  }

  // Check if this is bulk payment
  if ("attendeeIds" in body && Array.isArray(body.attendeeIds)) {
    const bulkBody = body as BulkPaymentRequest;

    if (!Array.isArray(bulkBody.attendeeIds) || bulkBody.attendeeIds.length === 0) {
      return NextResponse.json({ success: false, message: "attendeeIds must be a non-empty array" }, { status: 400 });
    }

    if (!bulkBody.committeeName) {
      return NextResponse.json({ success: false, message: "committeeName is required" }, { status: 400 });
    }

    const conference = mapConferenceLabel(bulkBody.conferenceLabel);
    const successful: PaymentResponse[] = [];
    const failed: Array<{ attendeeId: string; attendeeName: string; error: string }> = [];

    // Process all payments
    for (let i = 0; i < bulkBody.attendeeIds.length; i++) {
      const attendeeId = bulkBody.attendeeIds[i];
      const attendeeName = bulkBody.attendeeNames[i] || `Attendee ${i + 1}`;

      const result = await processSinglePayment(supabase, attendeeId, attendeeName, bulkBody.committeeName, conference);

      if (result.success && result.payment) {
        successful.push(result.payment);
      } else {
        failed.push({
          attendeeId,
          attendeeName,
          error: result.error || "Failed to process payment",
        });
      }
    }

    return NextResponse.json({
      success: failed.length === 0,
      data: {
        successful,
        failed,
        totalProcessed: successful.length,
        totalFailed: failed.length,
      } as BulkPaymentResponse,
    });
  } else {
    // Single payment
    const singleBody = body as PaymentRequest;

    if (!singleBody.attendeeId || !singleBody.attendeeName) {
      return NextResponse.json({ success: false, message: "attendeeId and attendeeName are required" }, { status: 400 });
    }

    if (!singleBody.committeeName) {
      return NextResponse.json({ success: false, message: "committeeName is required" }, { status: 400 });
    }

    const conference = mapConferenceLabel(singleBody.conferenceLabel);
    const result = await processSinglePayment(supabase, singleBody.attendeeId, singleBody.attendeeName, singleBody.committeeName, conference);

    if (result.success && result.payment) {
      return NextResponse.json({
        success: true,
        data: result.payment,
      });
    } else {
      return NextResponse.json({
        success: false,
        message: result.error || "Unable to record payment",
      }, { status: 500 });
    }
  }
}
