"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { fitsInSlot } from "@/lib/availability";
import { TYPE_LABEL } from "@/lib/invite";
import { sendMail } from "@/lib/mail";
import { TRIP_AVAIL_COLS, loadFreeSlots, type AvailTrip } from "@/lib/request-core";
import { localToUtc } from "@/lib/tz";
import { normalizeEmail } from "@/lib/viewer-session";

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return { supabase };
}

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/);

export async function updateAvailability(id: string, fd: FormData) {
  const { supabase } = await requireUser();
  const v = z.object({
    start: time, end: time,
    buffer: z.coerce.number().int().min(0).max(240),
    notice: z.coerce.number().int().min(0).max(24 * 14),
  }).parse({ start: fd.get("avail_day_start"), end: fd.get("avail_day_end"), buffer: fd.get("avail_buffer_min"), notice: fd.get("avail_min_notice_hours") });
  if (v.end !== "24:00" && v.end <= v.start) throw new Error("window end must be after start");
  const { error } = await supabase.from("trips").update({
    availability_enabled: fd.get("availability_enabled") === "on",
    availability_public: fd.get("availability_public") === "on",
    avail_day_start: v.start, avail_day_end: v.end, avail_buffer_min: v.buffer, avail_min_notice_hours: v.notice,
  }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/t/${id}/settings`);
}

export async function regenerateAvailabilityToken(id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("trips").update({ availability_token: randomBytes(16).toString("hex") }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/t/${id}/settings`);
}

export async function addBlock(id: string, fd: FormData) {
  const { supabase } = await requireUser();
  const { data: trip } = await supabase.from("trips").select("timezone").eq("id", id).single();
  if (!trip) throw new Error("not found");
  const v = z.object({ start: z.string().min(16), end: z.string().min(16), note: z.string().max(200).optional() })
    .parse({ start: fd.get("start"), end: fd.get("end"), note: String(fd.get("note") ?? "") || undefined });
  const start_at = localToUtc(v.start, trip.timezone), end_at = localToUtc(v.end, trip.timezone);
  if (!(end_at > start_at)) throw new Error("end must be after start");
  const { error } = await supabase.from("availability_blocks").insert({ trip_id: id, start_at: start_at.toISOString(), end_at: end_at.toISOString(), note: v.note ?? null });
  if (error) throw new Error(error.message);
  revalidatePath(`/t/${id}/settings`);
}

export async function deleteBlock(id: string, blockId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("availability_blocks").delete().eq("id", blockId).eq("trip_id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/t/${id}/settings`);
}

export async function unblockEmail(id: string, email: string) {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("trips").select("availability_blocked_emails").eq("id", id).single();
  const next = ((data?.availability_blocked_emails as string[] | null) ?? []).filter((e) => e !== normalizeEmail(email));
  await supabase.from("trips").update({ availability_blocked_emails: next }).eq("id", id);
  revalidatePath(`/t/${id}/settings`);
}

export type DecideState = { error?: "conflict" | "failed" | "notPending" };

/** Accept (creates the plan + person, re-checks the slot) or decline. Emails the requester either way. */
export async function decideRequest(tripId: string, requestId: string, _prev: DecideState, fd: FormData): Promise<DecideState> {
  const { supabase } = await requireUser();
  const decision = fd.get("decision") === "accept" ? "accept" : "decline";
  const reply = String(fd.get("reply") ?? "").trim().slice(0, 1000);
  const block = fd.get("block") === "on";

  const [{ data: tripRow }, { data: req }] = await Promise.all([
    supabase.from("trips").select(TRIP_AVAIL_COLS).eq("id", tripId).single(),
    supabase.from("plan_requests").select("*").eq("id", requestId).eq("trip_id", tripId).single(),
  ]);
  if (!tripRow || !req) return { error: "failed" };
  if (req.status !== "pending") return { error: "notPending" };
  const trip = tripRow as unknown as AvailTrip;
  const zh = trip.invite_locale !== "en";
  const loc: "zh-TW" | "en" = zh ? "zh-TW" : "en";
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const start = Date.parse(req.start_at);
  const when = new Intl.DateTimeFormat(zh ? "zh-TW" : "en", { dateStyle: "medium", timeStyle: "short", timeZone: trip.timezone }).format(start);

  let planId: string | null = null;
  let icsUrl = "";
  if (decision === "accept") {
    // Re-validate: the schedule may have changed since the request came in. The owner may override notice time, not conflicts.
    const slots = await loadFreeSlots(supabase, trip, Date.now(), { ignoreNotice: true });
    if (!fitsInSlot(slots, start, req.duration_min)) return { error: "conflict" };

    let personId = req.requester_person_id as string | null;
    if (!personId) {
      const { data: existing } = await supabase.from("people").select("id").eq("trip_id", tripId).ilike("email", req.requester_email).maybeSingle();
      personId = existing?.id ?? null;
    }
    if (!personId) {
      const { data: created, error } = await supabase.from("people").insert({ trip_id: tripId, name: req.requester_name, email: req.requester_email, locale: loc }).select("id").single();
      if (error) return { error: "failed" };
      personId = created.id;
    }
    const label = TYPE_LABEL[loc][req.type] ?? req.type;
    const { data: plan, error: pe } = await supabase.from("plans").insert({
      trip_id: tripId, type: req.type, title: `${label}: ${req.requester_name}`, location_name: req.location_text,
      start_at: req.start_at, duration_min: req.duration_min, note: req.message,
    }).select("id,ics_token").single();
    if (pe || !plan) return { error: "failed" };
    await supabase.from("plan_people").insert({ plan_id: plan.id, person_id: personId });
    planId = plan.id;
    icsUrl = `${site}/api/ics/${plan.ics_token}`;
  }

  const { error } = await supabase.from("plan_requests").update({
    status: decision === "accept" ? "accepted" : "declined", plan_id: planId, owner_reply: reply || null, decided_at: new Date().toISOString(),
  }).eq("id", requestId);
  if (error) return { error: "failed" };

  if (block) {
    const next = [...new Set([...(trip.availability_blocked_emails ?? []), normalizeEmail(req.requester_email)])];
    await supabase.from("trips").update({ availability_blocked_emails: next }).eq("id", tripId);
  }

  const subject = decision === "accept"
    ? (zh ? `約定成功：${trip.title}` : `You're on: ${trip.title}`)
    : (zh ? `關於你的邀約：${trip.title}` : `About your request: ${trip.title}`);
  const body = decision === "accept"
    ? (zh ? `對方接受了你的邀約：${when}（${trip.timezone}），${req.duration_min} 分鐘。` : `Your request was accepted: ${when} (${trip.timezone}), ${req.duration_min} min.`) +
      (reply ? `\n\n${reply}` : "") + `\n\n${zh ? "加入行事曆" : "Add to calendar"}: ${icsUrl}`
    : (zh ? `這次時間無法配合，謝謝你的邀約。` : `Thanks for asking — this time doesn't work out.`) + (reply ? `\n\n${reply}` : "");
  // Best-effort: a mail failure must not undo the decision.
  await sendMail(req.requester_email, subject, body);

  revalidatePath(`/t/${tripId}/requests`);
  revalidatePath(`/t/${tripId}`);
  return {};
}
