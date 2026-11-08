"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { CLAIM_TRIP_COLS, createClaim, verifyTurnstile, type ClaimTrip } from "@/lib/claims";

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
    name: String(fd.get("name") ?? ""), email: String(fd.get("email") ?? ""), message: String(fd.get("message") ?? ""),
  });
  return r.ok ? { done: true } : { error: r.error };
}
