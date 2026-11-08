"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOtpEmail } from "@/lib/mail";
import {
  OTP_MAX_ATTEMPTS, OTP_MAX_PER_HOUR, OTP_TTL_MS, SESSION_TTL_MS,
  checkCode, cookieName, generateCode, hashCode, normalizeEmail, signSession,
} from "@/lib/viewer-session";

export type VerifyState = { step: "email" | "code"; email?: string; error?: "invalid" | "tooMany" | "config" | "wrongCode" | "locked" };

const secret = () => {
  const s = process.env.VIEWER_COOKIE_SECRET;
  return s && s.length >= 32 ? s : null;
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function tripByToken(token: string) {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin.from("trips").select("id,title").eq("share_token", token).eq("share_enabled", true).maybeSingle();
  return data ? { admin, trip: data as { id: string; title: string } } : null;
}

/** Always answers "code sent" for any well-formed email, whether or not it is on the list (no enumeration). */
export async function requestOtp(token: string, _prev: VerifyState, fd: FormData): Promise<VerifyState> {
  const email = normalizeEmail(String(fd.get("email") ?? ""));
  if (!EMAIL_RE.test(email) || email.length > 254) return { step: "email", error: "invalid" };
  const sec = secret();
  const ctx = await tripByToken(token);
  if (!sec || !ctx) return { step: "email", error: "config" };
  const { admin, trip } = ctx;

  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin.from("viewer_otps").select("id", { count: "exact", head: true })
    .eq("trip_id", trip.id).eq("email", email).eq("purpose", "view").gte("created_at", hourAgo);
  if ((count ?? 0) >= OTP_MAX_PER_HOUR) return { step: "email", error: "tooMany" };

  // Count the attempt even for unlisted emails so the response and the rate limit look identical.
  const code = generateCode();
  const { data: person } = await admin.from("people").select("id,locale").eq("trip_id", trip.id).ilike("email", email).maybeSingle();
  await admin.from("viewer_otps").delete().eq("trip_id", trip.id).eq("email", email).eq("purpose", "view").lt("expires_at", new Date().toISOString());
  await admin.from("viewer_otps").insert({
    trip_id: trip.id, email, purpose: "view", code_hash: hashCode(sec, trip.id, email, person ? code : generateCode()),
    expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
  });
  if (person) await sendOtpEmail(email, code, trip.title, person.locale === "en" ? "en" : "zh-TW");
  return { step: "code", email };
}

export async function verifyOtp(token: string, _prev: VerifyState, fd: FormData): Promise<VerifyState> {
  const email = normalizeEmail(String(fd.get("email") ?? ""));
  const code = String(fd.get("code") ?? "").trim();
  const sec = secret();
  const ctx = await tripByToken(token);
  if (!sec || !ctx) return { step: "email", error: "config" };
  const { admin, trip } = ctx;
  if (!/^\d{6}$/.test(code)) return { step: "code", email, error: "wrongCode" };

  const { data: row } = await admin.from("viewer_otps").select("id,code_hash,attempts")
    .eq("trip_id", trip.id).eq("email", email).eq("purpose", "view").gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!row) return { step: "code", email, error: "wrongCode" };
  if (row.attempts >= OTP_MAX_ATTEMPTS) return { step: "code", email, error: "locked" };

  if (!checkCode(sec, trip.id, email, code, row.code_hash)) {
    await admin.from("viewer_otps").update({ attempts: row.attempts + 1 }).eq("id", row.id);
    return { step: "code", email, error: row.attempts + 1 >= OTP_MAX_ATTEMPTS ? "locked" : "wrongCode" };
  }
  // A matching hash can only exist for a listed person (unlisted rows hash a random code) — still re-check.
  const { data: person } = await admin.from("people").select("id").eq("trip_id", trip.id).ilike("email", email).maybeSingle();
  if (!person) return { step: "code", email, error: "wrongCode" };

  await admin.from("viewer_otps").delete().eq("trip_id", trip.id).eq("email", email).eq("purpose", "view");
  await admin.from("viewer_sessions").insert({ trip_id: trip.id, person_id: person.id, email });
  (await cookies()).set(cookieName(token), signSession(sec, trip.id, email), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: `/v/${token}`, maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  redirect(`/v/${token}`);
}

export async function signOutViewer(token: string) {
  (await cookies()).delete({ name: cookieName(token), path: `/v/${token}` });
  redirect(`/v/${token}`);
}
