import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

function normalizePersonName(value: string) {
  const cleaned = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!cleaned) return "";

  return cleaned
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) return null;

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  let body: { attendeeId?: string; substituteFullName?: string; committeeName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const attendeeId = String(body.attendeeId ?? "").trim();
  const substituteFullName = normalizePersonName(String(body.substituteFullName ?? ""));
  const committeeName = String(body.committeeName ?? "").trim() || null;

  if (!attendeeId) {
    return NextResponse.json({ error: "attendeeId is required." }, { status: 400 });
  }

  if (!substituteFullName) {
    return NextResponse.json({ error: "Substitute full name is required." }, { status: 400 });
  }

  const { data: attendeeRow, error: attendeeError } = await supabase
    .from("attendee_call_queue")
    .select("id,attendee_key,source_type,source_id,source_index,conference,full_name")
    .eq("id", attendeeId)
    .maybeSingle();

  if (attendeeError) {
    return NextResponse.json({ error: attendeeError.message }, { status: 500 });
  }

  if (!attendeeRow) {
    return NextResponse.json({ error: "Attendee not found." }, { status: 404 });
  }

  const originalFullName = String(attendeeRow.full_name ?? "").trim();
  if (!originalFullName) {
    return NextResponse.json({ error: "Attendee has no existing full name." }, { status: 400 });
  }

  if (originalFullName.toLowerCase() === substituteFullName.toLowerCase()) {
    return NextResponse.json({ error: "Substitute name is the same as current attendee name." }, { status: 400 });
  }

  const { error: updateQueueError } = await supabase
    .from("attendee_call_queue")
    .update({ full_name: substituteFullName })
    .eq("id", attendeeId);

  if (updateQueueError) {
    return NextResponse.json({ error: updateQueueError.message }, { status: 500 });
  }

  const attendeeKey = String(attendeeRow.attendee_key ?? "");
  const resolvedSourceType = attendeeKey.startsWith("walk-")
    ? "walkin"
    : String(attendeeRow.source_type ?? "individual");

  const substitutionPayload = {
    attendee_id: attendeeRow.id,
    attendee_key: attendeeKey,
    source_type: resolvedSourceType,
    source_id: String(attendeeRow.source_id ?? attendeeRow.id),
    source_index: Number(attendeeRow.source_index ?? 0),
    conference: String(attendeeRow.conference ?? "leyte"),
    original_full_name: originalFullName,
    substitute_full_name: substituteFullName,
    requested_by_committee: committeeName,
    substituted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error: substitutionError } = await (supabase as any)
    .from("attendee_substitutions")
    .upsert(substitutionPayload, { onConflict: "attendee_id" });

  if (substitutionError) {
    if ((substitutionError as { code?: string }).code === "PGRST205") {
      return NextResponse.json(
        { error: "Table attendee_substitutions is missing. Run migrations/019_create_attendee_substitutions.sql in Supabase SQL Editor." },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: substitutionError.message }, { status: 500 });
  }

  return NextResponse.json({
    message: "Attendee substitution saved.",
    data: {
      attendeeId,
      originalFullName,
      substituteFullName,
      requestedByCommittee: committeeName,
    },
  });
}
