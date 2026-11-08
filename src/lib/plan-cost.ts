import type { SupabaseClient } from "@supabase/supabase-js";
import { rateForDay } from "@/lib/fx";
import { planTotal, type CostItem } from "@/lib/cost";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Purchased shopping-list amounts, converted into the plan's currency (today's rate). Items that cannot be converted are skipped. */
export async function purchasedTotal(db: SupabaseClient, planId: string, planCur: string): Promise<number> {
  const { data } = await db.from("shopping_items").select("amount,currency").eq("plan_id", planId).eq("done", true).not("amount", "is", null);
  const today = new Date().toISOString().slice(0, 10);
  const rates = new Map<string, number | null>();
  const rate = async (cur: string) => {
    if (!rates.has(cur)) rates.set(cur, await rateForDay(db, cur, today));
    return rates.get(cur)!;
  };
  let sum = 0;
  for (const r of data ?? []) {
    const amt = Number(r.amount);
    const cur = ((r.currency as string | null) ?? planCur).toUpperCase();
    if (!Number.isFinite(amt) || amt <= 0) continue;
    if (cur === planCur) { sum += amt; continue; }
    const [from, to] = await Promise.all([rate(cur), rate(planCur)]);
    if (from && to) sum += (amt * from) / to;
  }
  return round2(sum);
}

/** plans.cost for a shopping plan = normal cost model (items + fees) + purchased list amounts. */
export async function recomputeShoppingCost(db: SupabaseClient, tripId: string, planId: string) {
  const [{ data: trip }, { data: plan }, { data: items }] = await Promise.all([
    db.from("trips").select("currency").eq("id", tripId).single(),
    db.from("plans").select("type,duration_min,cost_currency,photographer_fee,studio_fee").eq("id", planId).eq("trip_id", tripId).single(),
    db.from("plan_cost_items").select("label,amount,per_hour").eq("plan_id", planId),
  ]);
  if (!trip || !plan || plan.type !== "shopping") return;
  const planCur = ((plan.cost_currency as string | null) ?? (trip.currency as string)).toUpperCase();
  const base = planTotal({
    items: (items ?? []).map((i) => ({ label: i.label as string, amount: Number(i.amount), per_hour: i.per_hour as boolean })) as CostItem[],
    durationMin: plan.duration_min as number,
    photographerFee: plan.photographer_fee as number | null,
    studioFee: plan.studio_fee as number | null,
  });
  const bought = await purchasedTotal(db, planId, planCur);
  const cost = base == null && bought === 0 ? null : round2((base ?? 0) + bought);
  await db.from("plans").update({ cost }).eq("id", planId).eq("trip_id", tripId);
}
