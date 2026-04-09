import crypto from "crypto";

const ADMIN_GATE_COOKIE_NAME = "admin_gate";
const GATE_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 6;

function getGateSecret() {
  return (
    process.env.ADMIN_GATE_TOKEN_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "dev-admin-gate-secret-change-me"
  );
}

function signValue(value: string) {
  return crypto.createHmac("sha256", getGateSecret()).update(value).digest("hex");
}

export function isFourDigitCode(value: string) {
  return /^\d{4}$/.test(String(value ?? "").trim());
}

export function hashAccessCode(code: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(code, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyAccessCode(code: string, storedHash: string) {
  const parts = String(storedHash ?? "").split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }

  const [, salt, savedHex] = parts;
  const derivedHex = crypto.scryptSync(code, salt, 64).toString("hex");
  const savedBuffer = Buffer.from(savedHex, "hex");
  const derivedBuffer = Buffer.from(derivedHex, "hex");

  if (savedBuffer.length !== derivedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(savedBuffer, derivedBuffer);
}

export function createAdminGateToken() {
  const expiresAt = Math.floor(Date.now() / 1000) + GATE_TOKEN_MAX_AGE_SECONDS;
  const payload = String(expiresAt);
  const signature = signValue(payload);
  return `${payload}.${signature}`;
}

export function verifyAdminGateToken(token: string | null | undefined) {
  if (!token) return false;

  const [expiresAtRaw, signature] = String(token).split(".");
  if (!expiresAtRaw || !signature) return false;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt)) return false;
  if (Math.floor(Date.now() / 1000) > expiresAt) return false;

  const expected = signValue(expiresAtRaw);
  const expectedBuffer = Buffer.from(expected, "hex");
  const signatureBuffer = Buffer.from(signature, "hex");

  if (expectedBuffer.length !== signatureBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}

export function getCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null;

  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));

  if (!match) return null;

  const value = match.slice(name.length + 1);
  return decodeURIComponent(value);
}

export function getAdminGateCookieName() {
  return ADMIN_GATE_COOKIE_NAME;
}

export function getAdminGateTokenMaxAgeSeconds() {
  return GATE_TOKEN_MAX_AGE_SECONDS;
}
