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
  paymentMethod: string;
  paymentStatus: string;
  paidAt: string | null;
  paidByCommittee: string | null;
  notes?: string | null;
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
      // If no attendeeId provided, return recent paid payments for dashboard
      try {
        const { data: listData, error: listError } = await supabase
          .from("payments")
          .select(
            "id,attendee_id,attendee_name,amount,payment_method,payment_status,paid_at,paid_by_committee,notes"
          )
          .eq("payment_status", "paid")
          .order("paid_at", { ascending: false })
          .limit(200);

        if (listError && listError.code !== "PGRST205") throw listError;

        return NextResponse.json({
          success: true,
          data: Array.isArray(listData)
            ? listData.map((d: any) => ({
                id: d.id,
                attendeeId: d.attendee_id,
                attendeeName: d.attendee_name,
                amount: d.amount,
                paymentMethod: d.payment_method,
                paymentStatus: d.payment_status,
                paidAt: d.paid_at,
                paidByCommittee: d.paid_by_committee,
                notes: d.notes ?? null,
              }))
            : [],
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to fetch payments list.";
        return NextResponse.json({ success: false, message }, { status: 500 });
      }
  }

  try {
    const { data, error } = await supabase
      .from("payments")
      .select(
        "id,attendee_id,attendee_name,amount,payment_method,payment_status,paid_at,paid_by_committee,notes"
      )
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
          paymentMethod: data.payment_method,
          paymentStatus: data.payment_status,
          paidAt: data.paid_at,
          paidByCommittee: data.paid_by_committee,
          notes: data.notes ?? null,
        },
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
        .select(
          "id,attendee_id,attendee_name,amount,payment_method,payment_status,paid_at,paid_by_committee,notes"
        )
        .single();

      if (error) throw error;
      payment = data;
    } else {
      const { data, error } = await supabase
        .from("payments")
        .insert({
          attendee_id: attendeeId,
          attendee_name: attendeeName,
          amount: 200.0,
          currency: "PHP",
          payment_method: "cash",
          payment_status: "paid",
          paid_at: new Date().toISOString(),
          paid_by_committee: committeeName,
          conference: conference,
        })
        .select(
          "id,attendee_id,attendee_name,amount,payment_method,payment_status,paid_at,paid_by_committee,notes"
        )
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
        paymentMethod: payment.payment_method,
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

export async function PATCH(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ success: false, message: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  let body: { id?: string; attendeeId?: string; paymentMethod?: string; notes?: string };
  try {
    body = (await request.json()) as { id?: string; attendeeId?: string; paymentMethod?: string; notes?: string };
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON" }, { status: 400 });
  }

  if (!body.id && !body.attendeeId) {
    return NextResponse.json({ success: false, message: "id or attendeeId is required" }, { status: 400 });
  }

  const updates: any = {};
  if (body.paymentMethod) updates.payment_method = body.paymentMethod;
  if (typeof body.notes !== "undefined") updates.notes = body.notes;
  updates.updated_at = new Date().toISOString();

  try {
    const query = supabase.from("payments").update(updates).select(
      "id,attendee_id,attendee_name,amount,payment_method,payment_status,paid_at,paid_by_committee,notes"
    );

    if (body.id) query.eq("id", body.id);
    else query.eq("attendee_id", body.attendeeId!);

    const { data, error } = await query.maybeSingle();
    if (error) throw error;

    if (!data) {
      return NextResponse.json({ success: false, message: "Payment not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: data.id,
        attendeeId: data.attendee_id,
        amount: data.amount,
        paymentMethod: data.payment_method,
        paymentStatus: data.payment_status,
        paidAt: data.paid_at,
        paidByCommittee: data.paid_by_committee,
        notes: data.notes ?? null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update payment.";
    return NextResponse.json({ success: false, message }, { status: 500 });
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
