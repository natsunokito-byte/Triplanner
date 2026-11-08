// Server-only helpers for "Make a plan": busy-time collection, free slots, request creation, owner decisions.
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeFreeSlots, fitsInSlot, mergeIntervals, type FreeSlot, type Interval } from "./availability";
import { sendMail } from "./mail";
import { eachDay } from "./tz";
import { normalizeEmail } from "./viewer-session";

export const MAX_PENDING_PER_EMAIL = 3;
export const MAX_PER_EMAIL_PER_DAY = 5;
export const REQUEST_EXPIRY_DAYS = 7;
const MIN = 60_000;

export type AvailTrip = {
  id: string; owner_id: string; title: string; timezone: string; start_date: string; end_date: string; invite_locale: string;
  availability_enabled: boolean; availability_public: boolean; avail_day_start: string; avail_day_end: string;
  avail_buffer_min: number; avail_min_notice_hours: number; availability_blocked_emails: string[];
};

/** Everything that makes the owner busy. Privacy: only intervals leave this function, never titles or places. */
export async function loadBusy(db: SupabaseClient, tripId: string): Promise<Interval[]> {
  const [{ data: plans }, { data: commutes }, { data: blocks }, { data: hotels }] = await Promise.all([
    db.from("plans").select("start_at,duration_min").eq("trip_id", tripId),
    db.from("commutes").select("start_at,duration_min").eq("trip_id", tripId),
    db.from("availability_blocks").select("start_at,end_at").eq("trip_id", tripId),
    db.from("hotels").select("check_in,check_out").eq("trip_id", tripId),
  ]);
  const out: Interval[] = [];
  for (const p of plans ?? []) { if (!p.start_at) continue; /* unscheduled plans are never busy */ const s = Date.parse(p.start_at); out.push({ start: s, end: s + p.duration_min * MIN }); }
  for (const c of commutes ?? []) { const s = Date.parse(c.start_at); if (Number.isFinite(s)) out.push({ start: s, end: s + (c.duration_min ?? 0) * MIN }); }
  for (const b of blocks ?? []) out.push({ start: Date.parse(b.start_at), end: Date.parse(b.end_at) });
  for (const h of hotels ?? []) {
    const ci = Date.parse(h.check_in), co = Date.parse(h.check_out);
    out.push({ start: ci, end: ci + 30 * MIN }, { start: co - 30 * MIN, end: co });
  }
  return mergeIntervals(out);
}

export async function loadFreeSlots(db: SupabaseClient, trip: AvailTrip, now = Date.now(), opts: { ignoreNotice?: boolean } = {}): Promise<FreeSlot[]> {
  return computeFreeSlots({
    tz: trip.timezone, days: eachDay(trip.start_date, trip.end_date),
    windowStart: trip.avail_day_start, windowEnd: trip.avail_day_end, bufferMin: trip.avail_buffer_min,
    minNoticeHours: opts.ignoreNotice ? 0 : trip.avail_min_notice_hours, now, busy: await loadBusy(db, trip.id),
  });
}

export const TRIP_AVAIL_COLS =
  "id,owner_id,title,timezone,start_date,end_date,invite_locale,availability_enabled,availability_public,avail_day_start,avail_day_end,avail_buffer_min,avail_min_notice_hours,availability_blocked_emails";

export type RequestInput = { name: string; type: string; startMs: number; durationMin: number; location: string; message: string };
export type CreateResult = { ok: true } | { ok: false; error: "invalid" | "blocked" | "tooMany" | "pendingLimit" | "slotTaken" | "disabled" };

const PLAN_TYPES = ["breakfast", "lunch", "dinner", "tea", "workshop", "cosplay_photoshoot", "date", "hangout", "event"];

export async function createRequest(db: SupabaseClient, trip: AvailTrip, emailRaw: string, input: RequestInput, verifiedAt = new Date()): Promise<CreateResult> {
  const email = normalizeEmail(emailRaw);
  if (!trip.availability_enabled) return { ok: false, error: "disabled" };
  const name = input.name.trim().slice(0, 80);
  if (!name || !PLAN_TYPES.includes(input.type) || !Number.isFinite(input.startMs) || input.durationMin < 30 || input.durationMin > 720) return { ok: false, error: "invalid" };
  if ((trip.availability_blocked_emails ?? []).includes(email)) return { ok: false, error: "blocked" };

  await expireOld(db, trip.id);
  const dayAgo = new Date(Date.now() - 86400000).toISOString();
  const [{ count: today }, { count: pending }] = await Promise.all([
    db.from("plan_requests").select("id", { count: "exact", head: true }).eq("trip_id", trip.id).eq("requester_email", email).gte("created_at", dayAgo),
    db.from("plan_requests").select("id", { count: "exact", head: true }).eq("trip_id", trip.id).eq("requester_email", email).eq("status", "pending"),
  ]);
  if ((today ?? 0) >= MAX_PER_EMAIL_PER_DAY) return { ok: false, error: "tooMany" };
  if ((pending ?? 0) >= MAX_PENDING_PER_EMAIL) return { ok: false, error: "pendingLimit" };

  // Re-check against the real free slots on the server — never trust the client's idea of "free".
  const slots = await loadFreeSlots(db, trip);
  if (!fitsInSlot(slots, input.startMs, input.durationMin)) return { ok: false, error: "slotTaken" };

  const { data: person } = await db.from("people").select("id").eq("trip_id", trip.id).ilike("email", email).maybeSingle();
  const { error } = await db.from("plan_requests").insert({
    trip_id: trip.id, requester_email: email, requester_person_id: person?.id ?? null, email_verified_at: verifiedAt.toISOString(),
    requester_name: name, type: input.type, start_at: new Date(input.startMs).toISOString(), duration_min: input.durationMin,
    location_text: input.location.trim().slice(0, 200) || null, message: input.message.trim().slice(0, 1000) || null,
  });
  if (error) return { ok: false, error: "invalid" };
  await notifyOwner(db, trip, name, input);
  return { ok: true };
}

export async function expireOld(db: SupabaseClient, tripId: string) {
  const cutoff = new Date(Date.now() - REQUEST_EXPIRY_DAYS * 86400000).toISOString();
  await db.from("plan_requests").update({ status: "expired", decided_at: new Date().toISOString() }).eq("trip_id", tripId).eq("status", "pending").lt("created_at", cutoff);
}

async function notifyOwner(db: SupabaseClient, trip: AvailTrip, name: string, input: RequestInput) {
  try {
    const { data } = await db.auth.admin.getUserById(trip.owner_id);
    const to = data.user?.email;
    if (!to) return;
    const zh = trip.invite_locale !== "en";
    const when = new Intl.DateTimeFormat(zh ? "zh-TW" : "en", { dateStyle: "medium", timeStyle: "short", timeZone: trip.timezone }).format(input.startMs);
    const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
    await sendMail(
      to,
      zh ? `${name} 想約你（${trip.title}）` : `${name} wants to make a plan (${trip.title})`,
      zh ? `${name} 想在 ${when}（${trip.timezone}）約 ${input.durationMin} 分鐘。\n到請求收件匣查看：${site}/t/${trip.id}/requests`
         : `${name} would like to meet ${when} (${trip.timezone}) for ${input.durationMin} min.\nReview it here: ${site}/t/${trip.id}/requests`,
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

export function parseRequestForm(fd: FormData, fallbackName = ""): RequestInput {
  return {
    name: String(fd.get("name") ?? fallbackName),
    type: String(fd.get("type") ?? "hangout"),
    startMs: Number(fd.get("start")),
    durationMin: Number(fd.get("duration")),
    location: String(fd.get("location") ?? ""),
    message: String(fd.get("message") ?? ""),
  };
}
