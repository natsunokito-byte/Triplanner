"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { CLAIM_TRIP_COLS, createClaim, createProposal, verifyTurnstile, type ClaimTrip } from "@/lib/claims";

export type ClaimState = { done?: boolean; error?: "invalid" | "blocked" | "tooMany" | "duplicate" | "closed" | "disabled" | "captcha" };

/** Public: anyone with the link may ask to join an open plan. The owner still has to accept. */
export async function submitClaim(token: string, planId: string, _prev: ClaimState, fd: FormData): Promise<ClaimState> {
  const admin = createAdminClient();
  if (!admin) return { error: "disabled" };
  const { data } = await admin.from("trips").select(CLAIM_TRIP_COLS).eq("availability_token", token).eq("availability_enabled", true).eq("availability_public", true).maybeSingle();
  if (!data) return { error: "disabled" };
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!(await verifyTurnstile(String(fd.get("cf-turnstile-response") ?? "") || null, ip))) return { error: "captcha" };
  const r = await createClaim(admin, data as unknown as ClaimTrip, planId, {
    name: String(fd.get("name") ?? ""), message: String(fd.get("message") ?? ""),
  });
  return r.ok ? { done: true } : { error: r.error };
}

/** Public: suggest a new plan (activity type, idea, rough time and place). The owner reviews it. */
export async function submitProposal(token: string, _prev: ClaimState, fd: FormData): Promise<ClaimState> {
  const admin = createAdminClient();
  if (!admin) return { error: "disabled" };
  const { data } = await admin.from("trips").select(CLAIM_TRIP_COLS).eq("availability_token", token).eq("availability_enabled", true).eq("availability_public", true).maybeSingle();
  if (!data) return { error: "disabled" };
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!(await verifyTurnstile(String(fd.get("cf-turnstile-response") ?? "") || null, ip))) return { error: "captcha" };
  const g = (k: string) => String(fd.get(k) ?? "");
  const r = await createProposal(admin, data as unknown as ClaimTrip, {
    name: g("name"), type: g("type"), title: g("title"), note: g("note"), roughDate: g("rough_date"), roughTime: g("rough_time"), roughLocation: g("rough_location"),
  });
  return r.ok ? { done: true } : { error: r.error };
}
