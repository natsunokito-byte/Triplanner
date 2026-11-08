"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendMail } from "@/lib/mail";
import { normalizeEmail } from "@/lib/viewer-session";

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return { supabase };
}

export async function regenerateAvailabilityToken(id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("trips").update({ availability_token: randomBytes(16).toString("hex") }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/t/${id}/settings`);
}

/** Turn the public claim page on/off (enabled + public always move together). */
export async function setClaimPageEnabled(id: string, enabled: boolean) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("trips").update({ availability_enabled: enabled, availability_public: enabled }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/t/${id}/requests`);
  revalidatePath(`/t/${id}/settings`);
}

export async function unblockEmail(id: string, email: string) {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("trips").select("availability_blocked_emails").eq("id", id).single();
  const next = ((data?.availability_blocked_emails as string[] | null) ?? []).filter((e) => e !== normalizeEmail(email));
  await supabase.from("trips").update({ availability_blocked_emails: next }).eq("id", id);
  revalidatePath(`/t/${id}/settings`);
}

export type DecideState = { error?: "failed" | "notPending" };

/** Accept (adds the claimer to the plan and closes it) or decline. Emails the claimer either way. */
export async function decideClaim(tripId: string, claimId: string, _prev: DecideState, fd: FormData): Promise<DecideState> {
  const { supabase } = await requireUser();
  const decision = fd.get("decision") === "accept" ? "accept" : "decline";
  const reply = String(fd.get("reply") ?? "").trim().slice(0, 1000);
  const block = fd.get("block") === "on";

  const [{ data: trip }, { data: claim }] = await Promise.all([
    supabase.from("trips").select("id,title,timezone,invite_locale,availability_blocked_emails").eq("id", tripId).single(),
    supabase.from("plan_claims").select("*").eq("id", claimId).eq("trip_id", tripId).single(),
  ]);
  if (!trip || !claim) return { error: "failed" };
  if (claim.status !== "pending") return { error: "notPending" };
  const { data: plan } = await supabase.from("plans").select("id,title,start_at,duration_min,ics_token,open_claim").eq("id", claim.plan_id).eq("trip_id", tripId).single();
  if (!plan) return { error: "failed" };

  const zh = trip.invite_locale !== "en";
  const loc: "zh-TW" | "en" = zh ? "zh-TW" : "en";
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const now = new Date().toISOString();
  const when = plan.start_at
    ? new Intl.DateTimeFormat(zh ? "zh-TW" : "en", { dateStyle: "medium", timeStyle: "short", timeZone: trip.timezone }).format(new Date(plan.start_at))
    : "";

  if (decision === "accept") {
    if (!plan.open_claim) return { error: "notPending" }; // someone else already got it
    let personId: string | null = null;
    // Reuse a person already on the trip (by email when we have one, otherwise by exact name).
    const email = (claim.claimer_email as string) || null;
    const safeName = String(claim.claimer_name).replace(/[%_\\]/g, (c) => `\\${c}`);
    const { data: existing } = email
      ? await supabase.from("people").select("id").eq("trip_id", tripId).ilike("email", email).maybeSingle()
      : await supabase.from("people").select("id").eq("trip_id", tripId).ilike("name", safeName).limit(1).maybeSingle();
    personId = existing?.id ?? null;
    if (!personId) {
      const { data: created, error } = await supabase.from("people").insert({ trip_id: tripId, name: claim.claimer_name, email, locale: loc }).select("id").single();
      if (error || !created) return { error: "failed" };
      personId = created.id;
    }
    const { data: linked } = await supabase.from("plan_people").select("person_id").eq("plan_id", plan.id).eq("person_id", personId).maybeSingle();
    if (!linked) {
      const { error } = await supabase.from("plan_people").insert({ plan_id: plan.id, person_id: personId });
      if (error) return { error: "failed" };
    }
    // The plan is taken: close it and tell the other pending claimers.
    await supabase.from("plans").update({ open_claim: false }).eq("id", plan.id);
    const { data: others } = await supabase.from("plan_claims").select("id,claimer_email").eq("plan_id", plan.id).eq("status", "pending").neq("id", claimId);
    if ((others ?? []).length) {
      await supabase.from("plan_claims").update({ status: "declined", decided_at: now }).in("id", (others ?? []).map((o) => o.id as string));
      for (const o of (others ?? []).filter((x) => x.claimer_email)) {
        await sendMail(o.claimer_email as string, zh ? `關於「${plan.title}」：${trip.title}` : `About "${plan.title}": ${trip.title}`,
          zh ? "這個行程已經有人認領了，謝謝你的興趣。" : "Someone else already joined this plan. Thanks for your interest.");
      }
    }
  }

  const { error } = await supabase.from("plan_claims").update({
    status: decision === "accept" ? "accepted" : "declined", owner_reply: reply || null, decided_at: now,
  }).eq("id", claimId);
  if (error) return { error: "failed" };

  if (block && claim.claimer_email) {
    const next = [...new Set([...(trip.availability_blocked_emails ?? []), normalizeEmail(claim.claimer_email)])];
    await supabase.from("trips").update({ availability_blocked_emails: next }).eq("id", tripId);
  }

  const subject = decision === "accept"
    ? (zh ? `認領成功：${plan.title}` : `You're in: ${plan.title}`)
    : (zh ? `關於你的認領：${plan.title}` : `About your request: ${plan.title}`);
  const ics = decision === "accept" && plan.start_at ? `\n\n${zh ? "加入行事曆" : "Add to calendar"}: ${site}/api/ics/${plan.ics_token}` : "";
  const body = decision === "accept"
    ? (zh ? `對方接受了你的認領：「${plan.title}」${when ? `，${when}（${trip.timezone}）` : "，時間確定後會再通知你"}。` : `Your request was accepted: "${plan.title}"${when ? `, ${when} (${trip.timezone})` : ". The time is not set yet; you'll hear when it is"}.`) + (reply ? `\n\n${reply}` : "") + ics
    : (zh ? "這次無法配合，謝謝你的興趣。" : "Thanks for asking — this time doesn't work out.") + (reply ? `\n\n${reply}` : "");
  // Best-effort: a mail failure must not undo the decision.
  if (claim.claimer_email) await sendMail(claim.claimer_email, subject, body);

  revalidatePath(`/t/${tripId}/requests`);
  revalidatePath(`/t/${tripId}`, "layout");
  return {};
}
