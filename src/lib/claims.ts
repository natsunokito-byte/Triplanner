// Server-only helpers for the public "open claim" page: a visitor asks to join one of the owner's open plans.
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendMail } from "./mail";
import { normalizeEmail } from "./viewer-session";

export const CLAIM_EXPIRY_DAYS = 14;
const MAX_CLAIMS_PER_EMAIL_PER_DAY = 5;
const MAX_CLAIMS_PER_TRIP_PER_HOUR = 40;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ClaimTrip = {
  id: string; owner_id: string; title: string; timezone: string; invite_locale: string;
  availability_blocked_emails: string[];
};

export const CLAIM_TRIP_COLS = "id,owner_id,title,timezone,invite_locale,availability_blocked_emails";

export type ClaimInput = { name: string; email: string; message: string };
export type ClaimResult = { ok: true } | { ok: false; error: "invalid" | "blocked" | "tooMany" | "duplicate" | "closed" };

export async function createClaim(db: SupabaseClient, trip: ClaimTrip, planId: string, input: ClaimInput): Promise<ClaimResult> {
  const email = normalizeEmail(input.email);
  const name = input.name.trim().slice(0, 80);
  if (!name || !EMAIL_RE.test(email) || email.length > 254) return { ok: false, error: "invalid" };
  if ((trip.availability_blocked_emails ?? []).includes(email)) return { ok: false, error: "blocked" };

  const { data: plan } = await db.from("plans").select("id,title,start_at,plan_date,duration_min,open_claim,visibility,completed")
    .eq("id", planId).eq("trip_id", trip.id).maybeSingle();
  if (!plan || !plan.open_claim || plan.visibility !== "normal" || plan.completed) return { ok: false, error: "closed" };

  const dayAgo = new Date(Date.now() - 86400000).toISOString();
  const hourAgo = new Date(Date.now() - 3600000).toISOString();
  const [{ count: mine }, { count: all }, { count: dup }] = await Promise.all([
    db.from("plan_claims").select("id", { count: "exact", head: true }).eq("trip_id", trip.id).eq("claimer_email", email).gte("created_at", dayAgo),
    db.from("plan_claims").select("id", { count: "exact", head: true }).eq("trip_id", trip.id).gte("created_at", hourAgo),
    db.from("plan_claims").select("id", { count: "exact", head: true }).eq("plan_id", planId).eq("claimer_email", email).eq("status", "pending"),
  ]);
  if ((dup ?? 0) > 0) return { ok: false, error: "duplicate" };
  if ((mine ?? 0) >= MAX_CLAIMS_PER_EMAIL_PER_DAY || (all ?? 0) >= MAX_CLAIMS_PER_TRIP_PER_HOUR) return { ok: false, error: "tooMany" };

  const { error } = await db.from("plan_claims").insert({
    trip_id: trip.id, plan_id: planId, claimer_name: name, claimer_email: email, message: input.message.trim().slice(0, 1000) || null,
  });
  if (error) return { ok: false, error: "invalid" };
  await notifyOwner(db, trip, name, plan.title as string);
  return { ok: true };
}

export async function expireOldClaims(db: SupabaseClient, tripId: string) {
  const cutoff = new Date(Date.now() - CLAIM_EXPIRY_DAYS * 86400000).toISOString();
  await db.from("plan_claims").update({ status: "expired", decided_at: new Date().toISOString() }).eq("trip_id", tripId).eq("status", "pending").lt("created_at", cutoff);
}

async function notifyOwner(db: SupabaseClient, trip: ClaimTrip, name: string, planTitle: string) {
  try {
    const { data } = await db.auth.admin.getUserById(trip.owner_id);
    const to = data.user?.email;
    if (!to) return;
    const zh = trip.invite_locale !== "en";
    const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
    await sendMail(
      to,
      zh ? `${name} 想認領「${planTitle}」（${trip.title}）` : `${name} wants to join "${planTitle}" (${trip.title})`,
      zh ? `${name} 想認領你的行程「${planTitle}」。\n到收件匣查看：${site}/t/${trip.id}/requests`
         : `${name} would like to join your plan "${planTitle}".\nReview it here: ${site}/t/${trip.id}/requests`,
    );
  } catch { /* notification is best-effort */ }
}

/** Turnstile verification. When no secret is configured: allowed outside production, refused in production. */
export async function verifyTurnstile(token: string | null, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) });
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: AbortSignal.timeout(8000) });
    const j = (await res.json()) as { success?: boolean };
    return j.success === true;
  } catch {
    return false;
  }
}
