"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { recomputeShoppingCost } from "@/lib/plan-cost";

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return { supabase };
}

const refresh = (tripId: string) => {
  revalidatePath(`/t/${tripId}`, "layout");
};

export async function addShoppingItem(tripId: string, planId: string, title: string) {
  const { supabase } = await requireUser();
  const clean = z.string().trim().min(1).max(200).parse(title);
  const { data: last } = await supabase.from("shopping_items").select("position").eq("plan_id", planId).order("position", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase
    .from("shopping_items")
    .insert({ trip_id: tripId, plan_id: planId, title: clean, position: ((last?.position as number | undefined) ?? -1) + 1 })
    .select("id,title,done,amount,currency,note")
    .single();
  if (error) throw new Error(error.message);
  refresh(tripId);
  return data as { id: string; title: string; done: boolean; amount: number | null; currency: string | null; note: string | null };
}

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  done: z.boolean().optional(),
  amount: z.number().min(0).max(1e9).nullable().optional(),
  currency: z.string().trim().length(3).transform((s) => s.toUpperCase()).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

/** Partial update of one list item (check, amount, currency, note, title). Keeps the plan's cost in step. */
export async function updateShoppingItem(tripId: string, itemId: string, patch: z.input<typeof patchSchema>) {
  const { supabase } = await requireUser();
  const v = patchSchema.parse(patch);
  const clean = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "note" && x === "" ? null : x]));
  const { data, error } = await supabase.from("shopping_items").update(clean).eq("id", itemId).eq("trip_id", tripId).select("plan_id").single();
  if (error) throw new Error(error.message);
  if ("done" in v || "amount" in v || "currency" in v) await recomputeShoppingCost(supabase, tripId, data.plan_id as string);
  refresh(tripId);
}

export async function deleteShoppingItem(tripId: string, itemId: string) {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("shopping_items").select("plan_id").eq("id", itemId).eq("trip_id", tripId).maybeSingle();
  const { error } = await supabase.from("shopping_items").delete().eq("id", itemId).eq("trip_id", tripId);
  if (error) throw new Error(error.message);
  if (data) await recomputeShoppingCost(supabase, tripId, data.plan_id as string);
  refresh(tripId);
}

/** Form wrapper for the "add item" row under each shopping plan. */
export async function addShoppingItemForm(tripId: string, planId: string, fd: FormData) {
  const title = String(fd.get("title") ?? "").trim();
  if (!title) return;
  await addShoppingItem(tripId, planId, title);
}

/** New order for (a subset of) a plan's items: the given ids take over the positions those items already occupied. */
export async function reorderShoppingItems(tripId: string, planId: string, ids: string[]) {
  const { supabase } = await requireUser();
  const wanted = z.array(z.string().uuid()).max(500).parse(ids);
  const { data } = await supabase.from("shopping_items").select("id").eq("trip_id", tripId).eq("plan_id", planId).order("position").order("created_at");
  const all = (data ?? []).map((r) => r.id as string);
  const set = new Set(wanted.filter((x) => all.includes(x)));
  const queue = wanted.filter((x) => set.has(x));
  const finalOrder = all.map((id) => (set.has(id) ? queue.shift()! : id));
  await Promise.all(finalOrder.map((id, i) => supabase.from("shopping_items").update({ position: i }).eq("id", id).eq("trip_id", tripId)));
  refresh(tripId);
}
