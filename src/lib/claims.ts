// Server-only helpers for the public "open claim" page: a visitor asks to join one of the owner's open plans.
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendMail } from "./mail";
import { REQUEST_TYPES } from "./plan-types";

export const CLAIM_EXPIRY_DAYS = 14;
const MAX_CLAIMS_PER_NAME_PER_DAY = 5;
const MAX_CLAIMS_PER_TRIP_PER_HOUR = 40;

export type ClaimTrip = {
  id: string; owner_id: string; title: string; timezone: string; invite_locale: string;
  availability_blocked_emails: string[];
};

export const CLAIM_TRIP_COLS = "id,owner_id,title,timezone,invite_locale,availability_blocked_emails";

export type ClaimInput = { name: string; message: string };
export type ClaimResult = { ok: true } | { ok: false; error: "invalid" | "blocked" | "tooMany" | "duplicate" | "closed" };

export async function createClaim(db: SupabaseClient, trip: ClaimTrip, planId: string, input: ClaimInput): Promise<ClaimResult> {
  // Friends-only for now: no email is collected (claimer_email stays '' and no mail goes to the claimer).
  const name = input.name.trim().slice(0, 80);
  if (!name) return { ok: false, error: "invalid" };

  const { data: plan } = await db.from("plans").select("id,title,open_claim,visibility,completed")
    .eq("id", planId).eq("trip_id", trip.id).maybeSingle();
  if (!plan || !plan.open_claim || plan.visibility !== "normal" || plan.completed) return { ok: false, error: "closed" };

  const dayAgo = new Date(Date.now() - 86400000).toISOString();
  const hourAgo = new Date(Date.now() - 3600000).toISOString();
  const safeName = name.replace(/[%_\\]/g, (c) => `\\${c}`);
  const [{ count: mine }, { count: all }, { count: dup }] = await Promise.all([
    db.from("plan_claims").select("id", { count: "exact", head: true }).eq("trip_id", trip.id).ilike("claimer_name", safeName).gte("created_at", dayAgo),
    db.from("plan_claims").select("id", { count: "exact", head: true }).eq("trip_id", trip.id).gte("created_at", hourAgo),
    db.from("plan_claims").select("id", { count: "exact", head: true }).eq("plan_id", planId).ilike("claimer_name", safeName).eq("status", "pending"),
  ]);
  if ((dup ?? 0) > 0) return { ok: false, error: "duplicate" };
  if ((mine ?? 0) >= MAX_CLAIMS_PER_NAME_PER_DAY || (all ?? 0) >= MAX_CLAIMS_PER_TRIP_PER_HOUR) return { ok: false, error: "tooMany" };

  const { error } = await db.from("plan_claims").insert({
    trip_id: trip.id, plan_id: planId, claimer_name: name, claimer_email: "", message: input.message.trim().slice(0, 1000) || null,
  });
  if (error) return { ok: false, error: "invalid" };
  await notifyOwner(db, trip, name, plan.title as string);
  return { ok: true };
}

export async function expireOldClaims(db: SupabaseClient, tripId: string) {
  const cutoff = new Date(Date.now() - CLAIM_EXPIRY_DAYS * 86400000).toISOString();
  await db.from("plan_claims").update({ status: "expired", decided_at: new Date().toISOString() }).eq("trip_id", tripId).eq("status", "pending").lt("created_at", cutoff);
}

async function notifyOwner(db: SupabaseClient, trip: ClaimTrip, name: string, planTitle: string, proposal = false) {
  try {
    const { data } = await db.auth.admin.getUserById(trip.owner_id);
    const to = data.user?.email;
    if (!to) return;
    const zh = trip.invite_locale !== "en";
    const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
    await sendMail(
      to,
      proposal
        ? (zh ? `${name} 提議了行程「${planTitle}」（${trip.title}）` : `${name} proposed "${planTitle}" (${trip.title})`)
        : (zh ? `${name} 想認領「${planTitle}」（${trip.title}）` : `${name} wants to join "${planTitle}" (${trip.title})`),
      proposal
        ? (zh ? `${name} 提議了行程「${planTitle}」。\n到行程認領頁查看：${site}/t/${trip.id}/requests` : `${name} proposed the plan "${planTitle}".\nReview it here: ${site}/t/${trip.id}/requests`)
        : (zh ? `${name} 想認領你的行程「${planTitle}」。\n到收件匣查看：${site}/t/${trip.id}/requests`
           : `${name} would like to join your plan "${planTitle}".\nReview it here: ${site}/t/${trip.id}/requests`),
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

export type ProposalInput = {
  name: string; type: string; title: string; note: string; roughDate: string; roughTime: string; roughLocation: string;
};

/** A visitor suggests a plan (no email collected). The owner can later turn it into a real plan. */
export async function createProposal(db: SupabaseClient, trip: ClaimTrip, input: ProposalInput): Promise<ClaimResult> {
  const name = input.name.trim().slice(0, 80);
  const title = input.title.trim().slice(0, 200);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(input.roughDate) ? input.roughDate : null;
  if (!name || !title || !(REQUEST_TYPES as readonly string[]).includes(input.type)) return { ok: false, error: "invalid" };

  const dayAgo = new Date(Date.now() - 86400000).toISOString();
  const hourAgo = new Date(Date.now() - 3600000).toISOString();
  const safeName = name.replace(/[%_\\]/g, (c) => `\\${c}`);
  const [{ count: mine }, { count: all }] = await Promise.all([
    db.from("plan_proposals").select("id", { count: "exact", head: true }).eq("trip_id", trip.id).ilike("proposer_name", safeName).gte("created_at", dayAgo),
    db.from("plan_proposals").select("id", { count: "exact", head: true }).eq("trip_id", trip.id).gte("created_at", hourAgo),
  ]);
  if ((mine ?? 0) >= MAX_CLAIMS_PER_NAME_PER_DAY || (all ?? 0) >= MAX_CLAIMS_PER_TRIP_PER_HOUR) return { ok: false, error: "tooMany" };

  const { error } = await db.from("plan_proposals").insert({
    trip_id: trip.id, proposer_name: name, type: input.type, title,
    note: input.note.trim().slice(0, 1000) || null, rough_date: date,
    rough_time: input.roughTime.trim().slice(0, 80) || null, rough_location: input.roughLocation.trim().slice(0, 200) || null,
  });
  if (error) return { ok: false, error: "invalid" };
  await notifyOwner(db, trip, name, title, true);
  return { ok: true };
}
