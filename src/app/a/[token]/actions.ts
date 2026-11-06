"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOtpEmail } from "@/lib/mail";
import { TRIP_AVAIL_COLS, createRequest, parseRequestForm, verifyTurnstile, type AvailTrip } from "@/lib/request-core";
import {
  OTP_MAX_ATTEMPTS, OTP_MAX_PER_HOUR, OTP_TTL_MS, SESSION_TTL_MS,
  checkCode, generateCode, hashCode, normalizeEmail, requestCookieName, requestScope, signSession, verifySession,
} from "@/lib/viewer-session";
import type { VerifyState, RequestState } from "../../v/[token]/actions";

const TRIP_OTP_CAP_PER_HOUR = 30; // mail-bombing guard: total request-OTP rows per trip per hour
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const secret = () => {
  const s = process.env.VIEWER_COOKIE_SECRET;
  return s && s.length >= 32 ? s : null;
};

async function tripByAvailToken(token: string) {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin.from("trips").select(TRIP_AVAIL_COLS).eq("availability_token", token).eq("availability_enabled", true).eq("availability_public", true).maybeSingle();
  return data ? { admin, trip: data as unknown as AvailTrip } : null;
}

/** Any email may ask for a code (the request flow is open to anyone) — Turnstile + rate limits protect the mailbox. */
export async function requestRequesterOtp(token: string, _prev: VerifyState, fd: FormData): Promise<VerifyState> {
  const email = normalizeEmail(String(fd.get("email") ?? ""));
  if (!EMAIL_RE.test(email) || email.length > 254) return { step: "email", error: "invalid" };
  const sec = secret();
  const ctx = await tripByAvailToken(token);
  if (!sec || !ctx) return { step: "email", error: "config" };
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!(await verifyTurnstile(String(fd.get("cf-turnstile-response") ?? "") || null, ip))) return { step: "email", error: "invalid" };
  const { admin, trip } = ctx;

  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const [{ count: mine }, { count: all }] = await Promise.all([
    admin.from("viewer_otps").select("id", { count: "exact", head: true }).eq("trip_id", trip.id).eq("email", email).eq("purpose", "request").gte("created_at", hourAgo),
    admin.from("viewer_otps").select("id", { count: "exact", head: true }).eq("trip_id", trip.id).eq("purpose", "request").gte("created_at", hourAgo),
  ]);
  if ((mine ?? 0) >= OTP_MAX_PER_HOUR || (all ?? 0) >= TRIP_OTP_CAP_PER_HOUR) return { step: "email", error: "tooMany" };

  const blocked = (trip.availability_blocked_emails ?? []).includes(email);
  const code = generateCode();
  await admin.from("viewer_otps").delete().eq("trip_id", trip.id).eq("email", email).eq("purpose", "request").lt("expires_at", new Date().toISOString());
  await admin.from("viewer_otps").insert({
    trip_id: trip.id, email, purpose: "request", code_hash: hashCode(sec, requestScope(trip.id), email, blocked ? generateCode() : code),
    expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
  });
  if (!blocked) await sendOtpEmail(email, code, trip.title, trip.invite_locale === "en" ? "en" : "zh-TW");
  return { step: "code", email }; // identical answer whether blocked or not
}

export async function verifyRequesterOtp(token: string, _prev: VerifyState, fd: FormData): Promise<VerifyState> {
  const email = normalizeEmail(String(fd.get("email") ?? ""));
  const code = String(fd.get("code") ?? "").trim();
  const sec = secret();
  const ctx = await tripByAvailToken(token);
  if (!sec || !ctx) return { step: "email", error: "config" };
  const { admin, trip } = ctx;
  if (!/^\d{6}$/.test(code)) return { step: "code", email, error: "wrongCode" };
  const { data: row } = await admin.from("viewer_otps").select("id,code_hash,attempts")
    .eq("trip_id", trip.id).eq("email", email).eq("purpose", "request").gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!row) return { step: "code", email, error: "wrongCode" };
  if (row.attempts >= OTP_MAX_ATTEMPTS) return { step: "code", email, error: "locked" };
  if (!checkCode(sec, requestScope(trip.id), email, code, row.code_hash)) {
    await admin.from("viewer_otps").update({ attempts: row.attempts + 1 }).eq("id", row.id);
    return { step: "code", email, error: row.attempts + 1 >= OTP_MAX_ATTEMPTS ? "locked" : "wrongCode" };
  }
  await admin.from("viewer_otps").delete().eq("trip_id", trip.id).eq("email", email).eq("purpose", "request");
  (await cookies()).set(requestCookieName(token), signSession(sec, requestScope(trip.id), email), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: `/a/${token}`, maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  redirect(`/a/${token}`);
}

export async function submitPublicRequest(token: string, _prev: RequestState, fd: FormData): Promise<RequestState> {
  const sec = secret();
  const ctx = await tripByAvailToken(token);
  if (!sec || !ctx) return { error: "disabled" };
  const session = verifySession(sec, (await cookies()).get(requestCookieName(token))?.value, requestScope(ctx.trip.id));
  if (!session) return { error: "session" };
  const r = await createRequest(ctx.admin, ctx.trip, session.e, parseRequestForm(fd));
  return r.ok ? { done: true } : { error: r.error };
}

export async function signOutRequester(token: string) {
  (await cookies()).delete({ name: requestCookieName(token), path: `/a/${token}` });
  redirect(`/a/${token}`);
}
