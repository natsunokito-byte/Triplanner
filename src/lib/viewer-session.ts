// Viewer sessions + email OTP primitives — PURE (node:crypto only), unit-tested.
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_PER_HOUR = 5;
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const normalizeEmail = (s: string) => s.trim().toLowerCase();

export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

function mac(secret: string, data: string) {
  return createHmac("sha256", secret).update(data).digest();
}

export function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Codes are stored only as a keyed hash bound to trip + email. */
export function hashCode(secret: string, tripId: string, email: string, code: string): string {
  return mac(secret, `otp:${tripId}:${normalizeEmail(email)}:${code}`).toString("hex");
}

export function checkCode(secret: string, tripId: string, email: string, code: string, storedHash: string): boolean {
  const given = Buffer.from(hashCode(secret, tripId, email, code.trim()), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return safeEqual(given, stored);
}

export type SessionPayload = { t: string; e: string; x: number }; // tripId, email, expiry (ms)

export function signSession(secret: string, tripId: string, email: string, now = Date.now()): string {
  const payload: SessionPayload = { t: tripId, e: normalizeEmail(email), x: now + SESSION_TTL_MS };
  const body = b64(JSON.stringify(payload));
  return `${body}.${b64(mac(secret, `sess:${body}`))}`;
}

export function verifySession(secret: string, cookie: string | undefined, tripId: string, now = Date.now()): SessionPayload | null {
  if (!cookie) return null;
  const [body, sig] = cookie.split(".");
  if (!body || !sig) return null;
  const expected = mac(secret, `sess:${body}`);
  let given: Buffer;
  try { given = Buffer.from(sig, "base64url"); } catch { return null; }
  if (!safeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
    if (p.t !== tripId || typeof p.e !== "string" || typeof p.x !== "number" || p.x < now) return null;
    return p;
  } catch {
    return null;
  }
}
export const cookieName = (token: string) => `tp_v_${token.slice(0, 16)}`;
export const requestCookieName = (availabilityToken: string) => `tp_a_${availabilityToken.slice(0, 16)}`;
/** Request sessions are bound to a different "trip id" string so a viewer cookie can never be replayed as one (and vice versa). */
export const requestScope = (tripId: string) => `req:${tripId}`;
