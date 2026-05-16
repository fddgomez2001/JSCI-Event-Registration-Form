import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type BulkAttendee = {
  id: string;
  name: string;
  church: string | null;
  ministry: string | null;
  conference: string | null;
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) return null;

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ success: false, message: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  const url = new URL(request.url);
  const bulkRegistrationId = url.searchParams.get("bulkRegistrationId");
  const contactPerson = url.searchParams.get("contactPerson");

  if (!bulkRegistrationId) {
    return NextResponse.json({ success: false, message: "bulkRegistrationId is required" }, { status: 400 });
  }

  try {
    // First, fetch the bulk registration to get attendee names
    const { data: bulkReg, error: bulkError } = await supabase
      .from("bulk_registration_attendees")
      .select("id, attendee_name, church, ministry, conference")
      .eq("bulk_registration_id", bulkRegistrationId);

    if (bulkError) {
      console.error("Error fetching bulk attendees:", bulkError);
      throw bulkError;
    }

    if (!bulkReg || bulkReg.length === 0) {
      return NextResponse.json({
        success: false,
        message: "No attendees found for this bulk registration",
      }, { status: 404 });
    }

    // Map to response format
    const attendees: BulkAttendee[] = bulkReg.map((att) => ({
      id: att.id,
      name: att.attendee_name,
      church: att.church || null,
      ministry: att.ministry || null,
      conference: att.conference || null,
    }));

    return NextResponse.json({
      success: true,
      data: {
        bulkRegistrationId,
        contactPerson: contactPerson || null,
        attendees,
        totalAttendees: attendees.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch bulk attendees.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
