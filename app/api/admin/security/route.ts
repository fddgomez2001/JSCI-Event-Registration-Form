import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  createAdminGateToken,
  getAdminGateCookieName,
  getAdminGateTokenMaxAgeSeconds,
  getCookieValue,
  hashAccessCode,
  isFourDigitCode,
  verifyAccessCode,
  verifyAdminGateToken,
} from "../../../../utils/admin/security";

const SETTINGS_ID = 1;
const SETTINGS_TABLE = "admin_access_settings";
const DEFAULT_ADMIN_ACCESS_CODE = "1234";
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "Admin@123!";

function isAdminAuthorized(request: Request) {
  const username = request.headers.get("x-admin-username") ?? "";
  const password = request.headers.get("x-admin-password") ?? "";
  return username === ADMIN_USERNAME && password === ADMIN_PASSWORD;
}

function hasGateAccess(request: Request) {
  const cookieValue = getCookieValue(request.headers.get("cookie"), getAdminGateCookieName());
  return verifyAdminGateToken(cookieValue);
}

async function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return { error: "SUPABASE_SERVICE_ROLE_KEY is required for admin security route." } as const;
  }

  return {
    supabase: createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
  } as const;
}

async function getOrCreateAccessHash(supabase: any) {
  const { data, error } = await (supabase as any)
    .from(SETTINGS_TABLE)
    .select("id,code_hash")
    .eq("id", SETTINGS_ID)
    .maybeSingle();

  if (error) {
    if ((error as { code?: string }).code === "PGRST205") {
      return {
        error:
          "Database table is missing. Run migrations/007_create_admin_access_settings.sql in Supabase SQL Editor.",
      } as const;
    }

    return { error: error.message } as const;
  }

  const existingHash = String((data as { code_hash?: string } | null)?.code_hash ?? "").trim();
  if (existingHash) {
    return { codeHash: existingHash } as const;
  }

  const bootstrapHash = hashAccessCode(DEFAULT_ADMIN_ACCESS_CODE);
  const { error: insertError } = await (supabase as any).from(SETTINGS_TABLE).upsert(
    {
      id: SETTINGS_ID,
      code_hash: bootstrapHash,
    },
    { onConflict: "id" },
  );

  if (insertError) {
    return { error: insertError.message } as const;
  }

  return { codeHash: bootstrapHash } as const;
}

export async function POST(request: Request) {
  let body: { code?: string; action?: string };
  try {
    body = (await request.json()) as { code?: string; action?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.action === "logout") {
    const response = NextResponse.json({ message: "Admin security session cleared." });
    response.cookies.set(getAdminGateCookieName(), "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 0,
    });
    return response;
  }

  const code = String(body.code ?? "").trim();
  if (!isFourDigitCode(code)) {
    return NextResponse.json({ error: "Enter a valid 4-digit code." }, { status: 400 });
  }

  const adminResult = await getSupabaseAdmin();
  if ("error" in adminResult) {
    return NextResponse.json({ error: adminResult.error }, { status: 500 });
  }

  const hashResult = await getOrCreateAccessHash(adminResult.supabase);
  if ("error" in hashResult) {
    return NextResponse.json({ error: hashResult.error }, { status: 500 });
  }

  if (!verifyAccessCode(code, hashResult.codeHash)) {
    return NextResponse.json({ error: "Invalid admin access code." }, { status: 401 });
  }

  const response = NextResponse.json({ message: "Access granted." });
  response.cookies.set(getAdminGateCookieName(), createAdminGateToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: getAdminGateTokenMaxAgeSeconds(),
  });

  return response;
}

export async function PATCH(request: Request) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!hasGateAccess(request)) {
    return NextResponse.json({ error: "Admin access code verification is required." }, { status: 401 });
  }

  let body: { currentCode?: string; newCode?: string; confirmCode?: string };
  try {
    body = (await request.json()) as { currentCode?: string; newCode?: string; confirmCode?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const currentCode = String(body.currentCode ?? "").trim();
  const newCode = String(body.newCode ?? "").trim();
  const confirmCode = String(body.confirmCode ?? "").trim();

  if (!isFourDigitCode(currentCode) || !isFourDigitCode(newCode) || !isFourDigitCode(confirmCode)) {
    return NextResponse.json({ error: "Current and new code must be 4 digits." }, { status: 400 });
  }

  if (newCode !== confirmCode) {
    return NextResponse.json({ error: "New code and confirmation do not match." }, { status: 400 });
  }

  const adminResult = await getSupabaseAdmin();
  if ("error" in adminResult) {
    return NextResponse.json({ error: adminResult.error }, { status: 500 });
  }

  const hashResult = await getOrCreateAccessHash(adminResult.supabase);
  if ("error" in hashResult) {
    return NextResponse.json({ error: hashResult.error }, { status: 500 });
  }

  if (!verifyAccessCode(currentCode, hashResult.codeHash)) {
    return NextResponse.json({ error: "Current code is incorrect." }, { status: 401 });
  }

  const { error } = await (adminResult.supabase as any)
    .from(SETTINGS_TABLE)
    .update({
      code_hash: hashAccessCode(newCode),
      updated_at: new Date().toISOString(),
    })
    .eq("id", SETTINGS_ID);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: "Admin access code updated successfully." });
}
