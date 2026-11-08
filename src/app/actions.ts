"use server";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { localDate, localToUtc, utcToLocal } from "@/lib/tz";
import { rateForDay } from "@/lib/fx";
import { PLAN_TYPES, VISIBILITIES } from "@/lib/plan-types";
import { planTotal, type CostItem } from "@/lib/cost";
import { resolveSchedule, safeBack } from "@/lib/schedule";
import { METHODS, PAYMENTS } from "@/lib/commute";

const localeSchema = z.enum(["zh-TW", "en"]);

export async function setLocale(locale: string) {
  const l = localeSchema.parse(locale);
  (await cookies()).set("locale", l, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return { supabase, user: data.user };
}

/** Storage objects are not removed by DB cascades, so delete them explicitly before deleting plans/trips. */
async function purgePhotos(supabase: Awaited<ReturnType<typeof createClient>>, planIds: string[]) {
  if (planIds.length === 0) return;
  const { data } = await supabase.from("plan_photos").select("storage_path").in("plan_id", planIds);
  const paths = (data ?? []).map((r) => r.storage_path as string);
  if (paths.length) await supabase.storage.from("trip-photos").remove(paths);
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const tripSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    start_date: date,
    end_date: date,
    timezone: z.string().trim().min(1).max(64),
    currency: z.string().trim().length(3).transform((s) => s.toUpperCase()),
    invite_locale: localeSchema,
    destinations: z.array(z.string().trim().min(1).max(120)).max(12),
    usd_rate_override: z.string().trim().transform((s) => (s === "" ? null : Number(s))).pipe(z.number().positive().max(1e9).nullable()),
  })
  .refine((v) => v.end_date >= v.start_date, { message: "end before start" });

function parseTrip(fd: FormData) {
  let destinations: unknown = [];
  try {
    destinations = JSON.parse(String(fd.get("destinations") ?? "[]"));
  } catch {}
  return tripSchema.parse({
    title: fd.get("title"),
    start_date: fd.get("start_date"),
    end_date: fd.get("end_date"),
    timezone: fd.get("timezone"),
    currency: fd.get("currency"),
    invite_locale: fd.get("invite_locale") ?? "zh-TW",
    destinations,
    usd_rate_override: String(fd.get("usd_rate_override") ?? ""),
  });
}

export async function createTrip(fd: FormData) {
  const { supabase, user } = await requireUser();
  const v = parseTrip(fd);
  const { data, error } = await supabase
    .from("trips")
    .insert({ ...v, owner_id: user.id })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  // The owner is always a person on their own trip.
  await supabase.from("people").insert({
    trip_id: data.id,
    name: (user.email ?? "Me").split("@")[0],
    email: user.email ?? null,
    is_me: true,
    can_view_all: true,
  });
  redirect(`/t/${data.id}`);
}

export async function updateTrip(id: string, fd: FormData) {
  const { supabase } = await requireUser();
  const v = parseTrip(fd);
  const { error } = await supabase.from("trips").update(v).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/t/${id}`, "layout");
}

export async function deleteTrip(id: string) {
  const { supabase } = await requireUser();
  const { data: plans } = await supabase.from("plans").select("id").eq("trip_id", id);
  await purgePhotos(supabase, (plans ?? []).map((p) => p.id as string));
  const { error } = await supabase.from("trips").delete().eq("id", id);
  if (error) throw new Error(error.message);
  redirect("/");
}

export async function updateSharing(id: string, fd: FormData) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("trips")
    .update({ share_enabled: fd.get("share_enabled") === "on", viewers_see_costs: fd.get("viewers_see_costs") === "on" })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/t/${id}/settings`);
}

export async function regenerateShareToken(id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("trips").update({ share_token: randomBytes(16).toString("hex") }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/t/${id}/settings`);
}

const personSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(200)
    .transform((s) => s || null)
    .pipe(z.string().email().nullable()),
  locale: localeSchema,
  can_view_all: z.boolean(),
});

function parsePerson(fd: FormData) {
  return personSchema.parse({
    name: fd.get("name"),
    email: String(fd.get("email") ?? ""),
    locale: fd.get("locale") ?? "zh-TW",
    can_view_all: fd.get("can_view_all") === "on",
  });
}

export async function addPerson(tripId: string, fd: FormData) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("people").insert({ ...parsePerson(fd), trip_id: tripId });
  if (error) throw new Error(error.message);
  revalidatePath(`/t/${tripId}/settings`);
}

export async function savePerson(tripId: string, personId: string, fd: FormData) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("people").update(parsePerson(fd)).eq("id", personId).eq("trip_id", tripId);
  if (error) throw new Error(error.message);
  revalidatePath(`/t/${tripId}/settings`);
}

export async function deletePerson(tripId: string, personId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("people").delete().eq("id", personId).eq("trip_id", tripId).eq("is_me", false);
  if (error) throw new Error(error.message);
  revalidatePath(`/t/${tripId}/settings`);
}

export async function touchTrip(id: string) {
  const { supabase } = await requireUser();
  await supabase.from("trips").update({ last_opened_at: new Date().toISOString() }).eq("id", id);
}

// ───────────────────────── Hotels (M2) ─────────────────────────
const localDt = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
const optText = (max: number) =>
  z.string().trim().max(max).transform((s) => s || null);

const hotelSchema = z.object({
  name: z.string().trim().min(1).max(160),
  address: optText(300),
  booking_status: z.enum(["confirmed", "not_booked"]),
  check_in: localDt,
  check_out: localDt,
  cost: z
    .string()
    .trim()
    .transform((s) => (s === "" ? null : Number(s)))
    .pipe(z.number().min(0).max(1e9).nullable()),
  cost_currency: z
    .string()
    .trim()
    .transform((s) => (s === "" ? null : s.toUpperCase()))
    .pipe(z.string().length(3).nullable()),
  link: optText(500).pipe(z.string().url().nullable()),
  note: optText(2000),
});

async function parseHotel(supabase: Awaited<ReturnType<typeof createClient>>, tripId: string, fd: FormData) {
  const { data: trip, error } = await supabase.from("trips").select("timezone").eq("id", tripId).single();
  if (error || !trip) throw new Error("trip not found");
  const v = hotelSchema.parse({
    name: fd.get("name"),
    address: String(fd.get("address") ?? ""),
    booking_status: fd.get("booking_status"),
    check_in: fd.get("check_in"),
    check_out: fd.get("check_out"),
    cost: String(fd.get("cost") ?? ""),
    cost_currency: String(fd.get("cost_currency") ?? ""),
    link: String(fd.get("link") ?? ""),
    note: String(fd.get("note") ?? ""),
  });
  const inUtc = localToUtc(v.check_in, trip.timezone);
  const outUtc = localToUtc(v.check_out, trip.timezone);
  if (outUtc <= inUtc) throw new Error("check-out must be after check-in");
  return { ...v, check_in: inUtc.toISOString(), check_out: outUtc.toISOString() };
}

/** Keep the auto "book this hotel" to-do in step with booking status. */
async function syncHotelTodo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tripId: string,
  hotel: { id: string; name: string; booking_status: string },
) {
  if (hotel.booking_status === "not_booked") {
    const t = await getTranslations("hotel");
    const title = t("bookTodo", { name: hotel.name });
    const { data: existing } = await supabase
      .from("todos")
      .select("id")
      .eq("hotel_id", hotel.id)
      .eq("auto_generated", true)
      .maybeSingle();
    if (existing) await supabase.from("todos").update({ title }).eq("id", existing.id);
    else await supabase.from("todos").insert({ trip_id: tripId, category: "hotel", title, hotel_id: hotel.id, auto_generated: true });
  } else {
    await supabase.from("todos").delete().eq("hotel_id", hotel.id).eq("auto_generated", true).eq("done", false);
  }
}

export async function createHotel(tripId: string, fd: FormData) {
  const { supabase } = await requireUser();
  const v = await parseHotel(supabase, tripId, fd);
  const { data, error } = await supabase.from("hotels").insert({ ...v, trip_id: tripId }).select("id,name,booking_status").single();
  if (error) throw new Error(error.message);
  await syncHotelTodo(supabase, tripId, data);
  revalidatePath(`/t/${tripId}`);
  redirect(`/t/${tripId}`);
}

export async function updateHotel(tripId: string, hotelId: string, fd: FormData) {
  const { supabase } = await requireUser();
  const v = await parseHotel(supabase, tripId, fd);
  const { data, error } = await supabase
    .from("hotels")
    .update(v)
    .eq("id", hotelId)
    .eq("trip_id", tripId)
    .select("id,name,booking_status")
    .single();
  if (error) throw new Error(error.message);
  await syncHotelTodo(supabase, tripId, data);
  revalidatePath(`/t/${tripId}`);
  redirect(`/t/${tripId}`);
}

export async function deleteHotel(tripId: string, hotelId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("hotels").delete().eq("id", hotelId).eq("trip_id", tripId);
  if (error) throw new Error(error.message);
  revalidatePath(`/t/${tripId}`);
  redirect(`/t/${tripId}`);
}

export async function addHotelTodo(tripId: string, hotelId: string, fd: FormData) {
  const { supabase } = await requireUser();
  const title = z.string().trim().min(1).max(200).parse(fd.get("title"));
  const { error } = await supabase.from("todos").insert({ trip_id: tripId, hotel_id: hotelId, category: "hotel", title });
  if (error) throw new Error(error.message);
  revalidatePath(`/t/${tripId}/hotels/${hotelId}`);
}

export async function toggleTodo(tripId: string, hotelId: string, todoId: string, done: boolean) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("todos").update({ done }).eq("id", todoId).eq("trip_id", tripId);
  if (error) throw new Error(error.message);
  revalidatePath(`/t/${tripId}/hotels/${hotelId}`);
}

export async function deleteTodo(tripId: string, hotelId: string, todoId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("todos").delete().eq("id", todoId).eq("trip_id", tripId);
  if (error) throw new Error(error.message);
  revalidatePath(`/t/${tripId}/hotels/${hotelId}`);
}

// ───────────────────────── Plans (M3) ─────────────────────────

const planSchema = z.object({
  type: z.enum(PLAN_TYPES),
  title: z.string().trim().min(1).max(160),
  location_name: optText(200),
  location_address: optText(300),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), // optional
  time: z.string().regex(/^\d{2}:\d{2}$/).nullable(), // optional
  duration_min: z.coerce.number().int().min(30).max(2880),
  cost_items: z
    .array(z.object({ label: z.string().trim().min(1).max(80), amount: z.number().min(0).max(1e9), per_hour: z.boolean() }))
    .max(30),
  photographer_name: optText(120),
  studio_name: optText(120),
  photographer_fee: z.string().trim().transform((s) => (s === "" ? null : Number(s))).pipe(z.number().min(0).max(1e9).nullable()),
  studio_fee: z.string().trim().transform((s) => (s === "" ? null : Number(s))).pipe(z.number().min(0).max(1e9).nullable()),
  new_todos: z.array(z.object({ title: z.string().trim().min(1).max(200), cat: z.string().max(60) })).max(30),
  cost_currency: z
    .string()
    .trim()
    .transform((s) => (s === "" ? null : s.toUpperCase()))
    .pipe(z.string().length(3).nullable()),
  fx_rate_to_trip: z
    .string()
    .trim()
    .transform((s) => (s === "" ? null : Number(s)))
    .pipe(z.number().positive().max(1e9).nullable()),
  link: optText(500).pipe(z.string().url().nullable()),
  note: optText(2000),
  character_name: optText(120),
  visibility: z.enum(VISIBILITIES),
  people: z.array(z.string().uuid()).max(50),
});

async function parsePlan(supabase: Awaited<ReturnType<typeof createClient>>, tripId: string, fd: FormData) {
  const { data: trip, error } = await supabase.from("trips").select("timezone,currency").eq("id", tripId).single();
  if (error || !trip) throw new Error("trip not found");
  const jsonField = (k: string): unknown => {
    try {
      return JSON.parse(String(fd.get(k) ?? "[]"));
    } catch {
      return [];
    }
  };
  const v = planSchema.parse({
    type: fd.get("type"),
    title: fd.get("title"),
    location_name: String(fd.get("location_name") ?? ""),
    location_address: String(fd.get("location_address") ?? ""),
    date: String(fd.get("date") ?? "") || null,
    time: String(fd.get("time") ?? "") || null,
    duration_min: fd.get("duration_min"),
    cost_items: jsonField("cost_items"),
    photographer_name: String(fd.get("photographer_name") ?? ""),
    studio_name: String(fd.get("studio_name") ?? ""),
    photographer_fee: String(fd.get("photographer_fee") ?? ""),
    studio_fee: String(fd.get("studio_fee") ?? ""),
    new_todos: jsonField("new_todos"),
    cost_currency: String(fd.get("cost_currency") ?? ""),
    fx_rate_to_trip: String(fd.get("fx_rate_to_trip") ?? ""),
    link: String(fd.get("link") ?? ""),
    note: String(fd.get("note") ?? ""),
    character_name: String(fd.get("character_name") ?? ""),
    visibility: fd.get("visibility") ?? "normal",
    people: fd.getAll("person").map(String),
  });
  const { date, time, people, cost_items, new_todos, ...rest } = v;
  const sameCur = !rest.cost_currency || rest.cost_currency === trip.currency;
  const isCosplay = rest.type === "cosplay_photoshoot";
  const photographer_fee = isCosplay ? rest.photographer_fee : null;
  const studio_fee = isCosplay ? rest.studio_fee : null;
  return {
    items: cost_items as CostItem[],
    newTodos: new_todos,
    values: {
      ...rest,
      photographer_name: isCosplay ? rest.photographer_name : null,
      studio_name: isCosplay ? rest.studio_name : null,
      photographer_fee,
      studio_fee,
      // plans.cost is always the computed total (server-side; the client preview is advisory only)
      cost: planTotal({ items: cost_items, durationMin: rest.duration_min, photographerFee: photographer_fee, studioFee: studio_fee }),
      ...resolveSchedule(date, time, (l) => localToUtc(l, trip.timezone).toISOString()),
      cost_currency: sameCur ? null : rest.cost_currency,
      fx_rate_to_trip: sameCur ? null : rest.fx_rate_to_trip,
      character_name: rest.type === "cosplay_photoshoot" ? rest.character_name : null,
    },
    // "Only me" plans never carry participants (they could never see or be invited to it).
    personIds: rest.visibility === "owner_only" ? [] : people,
  };
}

async function syncPlanPeople(supabase: Awaited<ReturnType<typeof createClient>>, tripId: string, planId: string, personIds: string[]) {
  await supabase.from("plan_people").delete().eq("plan_id", planId);
  if (personIds.length === 0) return;
  // Only people that belong to this trip.
  const { data: valid } = await supabase.from("people").select("id").eq("trip_id", tripId).in("id", personIds);
  const rows = (valid ?? []).map((p) => ({ plan_id: planId, person_id: p.id }));
  if (rows.length) await supabase.from("plan_people").insert(rows);
}

async function saveCostItems(supabase: Awaited<ReturnType<typeof createClient>>, planId: string, items: CostItem[]) {
  await supabase.from("plan_cost_items").delete().eq("plan_id", planId);
  if (items.length === 0) return;
  const { error } = await supabase
    .from("plan_cost_items")
    .insert(items.map((i, position) => ({ plan_id: planId, label: i.label, amount: i.amount, per_hour: i.per_hour, position })));
  if (error) throw new Error(error.message);
}

/** cat: "b:<builtin>" (plan | cosplay | general) or "c:<custom category uuid>". Unknown values fall back to built-in "plan". */
async function insertPlanTodos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tripId: string,
  planId: string,
  list: { title: string; cat: string }[],
) {
  if (list.length === 0) return;
  const { data: cats } = await supabase.from("todo_categories").select("id").eq("trip_id", tripId);
  const valid = new Set((cats ?? []).map((c) => c.id as string));
  const rows = list.map((x, i) => {
    const custom = x.cat.startsWith("c:") && valid.has(x.cat.slice(2)) ? x.cat.slice(2) : null;
    const b = x.cat.slice(2);
    const category = custom ? "general" : x.cat.startsWith("b:") && ["plan", "cosplay", "general"].includes(b) ? b : "plan";
    return { trip_id: tripId, plan_id: planId, title: x.title, category, category_id: custom, sort: i };
  });
  const { error } = await supabase.from("todos").insert(rows);
  if (error) throw new Error(error.message);
}

export async function createPlan(tripId: string, fd: FormData) {
  const { supabase } = await requireUser();
  const { values, personIds, items, newTodos } = await parsePlan(supabase, tripId, fd);
  const { data, error } = await supabase.from("plans").insert({ ...values, trip_id: tripId }).select("id").single();
  if (error) throw new Error(error.message);
  await saveCostItems(supabase, data.id, items);
  await insertPlanTodos(supabase, tripId, data.id, newTodos);
  await syncPlanPeople(supabase, tripId, data.id, personIds);
  revalidatePath(`/t/${tripId}`);
  redirect(safeBack(tripId, fd.get("back"), `/t/${tripId}`));
}

export async function updatePlan(tripId: string, planId: string, fd: FormData) {
  const { supabase } = await requireUser();
  const { values, personIds, items, newTodos } = await parsePlan(supabase, tripId, fd);
  const { error } = await supabase.from("plans").update(values).eq("id", planId).eq("trip_id", tripId);
  if (error) throw new Error(error.message);
  await saveCostItems(supabase, planId, items);
  await insertPlanTodos(supabase, tripId, planId, newTodos);
  await freezePlanRate(supabase, tripId, planId); // currency may have changed on an already-completed plan
  await syncPlanPeople(supabase, tripId, planId, personIds);
  revalidatePath(`/t/${tripId}`);
  redirect(safeBack(tripId, fd.get("back"), `/t/${tripId}`));
}

/** Clone a plan row + people, cost items and checklist. Not copied: completion, photos, frozen FX, .ics link. */
async function clonePlan(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tripId: string,
  planId: string,
  overrides: Record<string, unknown> = {},
) {
  const { data: src, error: e0 } = await supabase.from("plans").select("*").eq("id", planId).eq("trip_id", tripId).single();
  if (e0 || !src) throw new Error("plan not found");
  const t = await getTranslations("plan");
  const {
    id: _id, created_at: _c, ics_token: _t, completed: _d, completed_at: _ca, usd_per_unit_at_completion: _u, ...keep
  } = src as Record<string, unknown>;
  void [_id, _c, _t, _d, _ca, _u];
  const { data: copy, error } = await supabase
    .from("plans")
    .insert({ ...keep, title: `${String(src.title).slice(0, 140)} ${t("copySuffix")}`, completed: false, ...overrides })
    .select("id")
    .single();
  if (error || !copy) throw new Error(error?.message ?? "copy failed");
  const [{ data: items }, { data: pp }, { data: todos }] = await Promise.all([
    supabase.from("plan_cost_items").select("label,amount,per_hour,position").eq("plan_id", planId),
    supabase.from("plan_people").select("person_id").eq("plan_id", planId),
    supabase.from("todos").select("category,category_id,title,due_date,sort").eq("plan_id", planId),
  ]);
  if (items?.length) await supabase.from("plan_cost_items").insert(items.map((i) => ({ ...i, plan_id: copy.id })));
  if (pp?.length) await supabase.from("plan_people").insert(pp.map((r) => ({ plan_id: copy.id, person_id: r.person_id })));
  if (todos?.length) await supabase.from("todos").insert(todos.map((x) => ({ ...x, trip_id: tripId, plan_id: copy.id, done: false })));
  return { id: copy.id as string, src };
}

/** Plan page button: exact copy (same date/time), then open it. */
export async function duplicatePlan(tripId: string, planId: string) {
  const { supabase } = await requireUser();
  const { id } = await clonePlan(supabase, tripId, planId);
  revalidatePath(`/t/${tripId}`);
  redirect(`/t/${tripId}/plans/${id}`);
}

/** Card button: copy lands in the SAME day column with the date but no time ("time TBD"). */
export async function duplicatePlanToSameDay(tripId: string, planId: string) {
  const { supabase } = await requireUser();
  const [{ data: trip }, { data: src }] = await Promise.all([
    supabase.from("trips").select("timezone").eq("id", tripId).single(),
    supabase.from("plans").select("start_at,plan_date").eq("id", planId).eq("trip_id", tripId).single(),
  ]);
  if (!trip || !src) throw new Error("not found");
  const day = src.start_at ? localDate(src.start_at, trip.timezone) : (src.plan_date as string | null);
  if (!day) throw new Error("plan has no date");
  await clonePlan(supabase, tripId, planId, { start_at: null, plan_date: day, plan_time: null });
  revalidatePath(`/t/${tripId}`);
}

export async function deletePlan(tripId: string, planId: string, back?: unknown) {
  const { supabase } = await requireUser();
  await purgePhotos(supabase, [planId]);
  const { error } = await supabase.from("plans").delete().eq("id", planId).eq("trip_id", tripId);
  if (error) throw new Error(error.message);
  revalidatePath(`/t/${tripId}`);
  redirect(safeBack(tripId, back, `/t/${tripId}`));
}

/**
 * Drag-and-drop / "schedule on" select: put a plan on a (trip-local) day.
 *  - has a time -> keep the time of day
 *  - had only a time (no date) -> becomes a full start_at with that time
 *  - otherwise -> date only ("time TBD"); no invented 12:00 default
 */
export async function movePlanToDay(tripId: string, planId: string, date: string) {
  const { supabase } = await requireUser();
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(date);
  const [{ data: trip }, { data: plan }] = await Promise.all([
    supabase.from("trips").select("timezone").eq("id", tripId).single(),
    supabase.from("plans").select("start_at,plan_date,plan_time").eq("id", planId).eq("trip_id", tripId).single(),
  ]);
  if (!trip || !plan) throw new Error("not found");
  let patch: Record<string, unknown>;
  if (plan.start_at) {
    if (localDate(plan.start_at, trip.timezone) === date) return;
    const time = utcToLocal(plan.start_at, trip.timezone).slice(11);
    patch = { start_at: localToUtc(`${date}T${time}`, trip.timezone).toISOString() };
  } else if (plan.plan_time) {
    patch = { start_at: localToUtc(`${date}T${String(plan.plan_time).slice(0, 5)}`, trip.timezone).toISOString(), plan_time: null, plan_date: null };
  } else {
    if (plan.plan_date === date) return;
    patch = { plan_date: date };
  }
  const { error } = await supabase.from("plans").update(patch).eq("id", planId).eq("trip_id", tripId);
  if (error) throw new Error(error.message);
  revalidatePath(`/t/${tripId}`);
}

// Cosplay checklist = todos (category 'cosplay') attached to the plan.
export async function addPlanTodo(tripId: string, planId: string, fd: FormData) {
  const { supabase } = await requireUser();
  const title = z.string().trim().min(1).max(200).parse(fd.get("title"));
  const { error } = await supabase.from("todos").insert({ trip_id: tripId, plan_id: planId, category: "cosplay", title });
  if (error) throw new Error(error.message);
  revalidatePath(`/t/${tripId}/plans/${planId}`);
}

export async function togglePlanTodo(tripId: string, planId: string, todoId: string, done: boolean) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("todos").update({ done }).eq("id", todoId).eq("trip_id", tripId);
  if (error) throw new Error(error.message);
  revalidatePath(`/t/${tripId}/plans/${planId}`);
}

export async function deletePlanTodo(tripId: string, planId: string, todoId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("todos").delete().eq("id", todoId).eq("trip_id", tripId);
  if (error) throw new Error(error.message);
  revalidatePath(`/t/${tripId}/plans/${planId}`);
}

// ───────────────────────── Commutes (M4) ─────────────────────────
const commuteSchema = z.object({
  from_plan_id: z.string().uuid().nullable(),
  to_plan_id: z.string().uuid().nullable(),
  method: z.enum(METHODS),
  start: localDt,
  duration_min: z.coerce.number().int().min(0).max(2880), // commutes have no minimum
  cost: z.string().trim().transform((s) => (s === "" ? null : Number(s))).pipe(z.number().min(0).max(1e9).nullable()),
  cost_currency: z.string().trim().transform((s) => (s === "" ? null : s.toUpperCase())).pipe(z.string().length(3).nullable()),
  payment: z.enum(PAYMENTS).nullable(),
  note: optText(1000),
  origin_label: optText(300),
  origin_place_id: optText(300),
  dest_label: optText(300),
  dest_place_id: optText(300),
  distance_m: z.string().trim().transform((s) => (s === "" ? null : Number(s))).pipe(z.number().int().min(0).max(1e8).nullable()),
  duration_source: z.enum(["manual", "google"]),
  stops: z.array(z.object({ label: z.string().trim().min(1).max(120), stay_min: z.number().int().min(0).max(1440) })).max(5),
});

async function parseCommute(supabase: Awaited<ReturnType<typeof createClient>>, tripId: string, fd: FormData) {
  const { data: trip, error } = await supabase.from("trips").select("timezone,currency").eq("id", tripId).single();
  if (error || !trip) throw new Error("trip not found");
  const nz = (k: string) => {
    const v = String(fd.get(k) ?? "");
    return v === "" ? null : v;
  };
  const v = commuteSchema.parse({
    from_plan_id: nz("from_plan_id"),
    to_plan_id: nz("to_plan_id"),
    method: fd.get("method"),
    start: fd.get("start"),
    duration_min: fd.get("duration_min"),
    cost: String(fd.get("cost") ?? ""),
    cost_currency: String(fd.get("cost_currency") ?? ""),
    payment: nz("payment"),
    note: String(fd.get("note") ?? ""),
    origin_label: String(fd.get("origin_label") ?? ""),
    origin_place_id: String(fd.get("origin_place_id") ?? ""),
    dest_label: String(fd.get("dest_label") ?? ""),
    dest_place_id: String(fd.get("dest_place_id") ?? ""),
    distance_m: String(fd.get("distance_m") ?? ""),
    duration_source: fd.get("duration_source") ?? "manual",
    stops: (() => {
      try { return JSON.parse(String(fd.get("stops") ?? "[]")); } catch { return []; }
    })(),
  });
  const { start, stops, ...rest } = v;
  return {
    stops,
    values: {
    ...rest,
    start_at: localToUtc(start, trip.timezone).toISOString(),
    cost_currency: !rest.cost_currency || rest.cost_currency === trip.currency ? null : rest.cost_currency,
    estimated_at: rest.duration_source === "google" ? new Date().toISOString() : null,
    },
  };
}

/** payment = ticket  ->  auto "buy ticket" to-do; anything else removes the unfinished auto to-do. */
async function syncCommuteTodo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tripId: string,
  c: { id: string; payment: string | null; origin_label: string | null; dest_label: string | null },
) {
  if (c.payment === "ticket") {
    const t = await getTranslations("commute");
    const unk = t("unknownPlace");
    const title = t("ticketTodo", { from: c.origin_label ?? unk, to: c.dest_label ?? unk });
    const { data: existing } = await supabase.from("todos").select("id").eq("commute_id", c.id).eq("auto_generated", true).maybeSingle();
    if (existing) await supabase.from("todos").update({ title }).eq("id", existing.id);
    else await supabase.from("todos").insert({ trip_id: tripId, category: "ticket", title, commute_id: c.id, auto_generated: true });
  } else {
    await supabase.from("todos").delete().eq("commute_id", c.id).eq("auto_generated", true).eq("done", false);
  }
}

async function saveStops(supabase: Awaited<ReturnType<typeof createClient>>, commuteId: string, stops: { label: string; stay_min: number }[]) {
  await supabase.from("commute_stops").delete().eq("commute_id", commuteId);
  if (stops.length === 0) return;
  const { error } = await supabase.from("commute_stops").insert(stops.map((x, position) => ({ commute_id: commuteId, label: x.label, stay_min: x.stay_min, position })));
  if (error) throw new Error(error.message);
}

export async function createCommute(tripId: string, fd: FormData) {
  const { supabase } = await requireUser();
  const { values: v, stops } = await parseCommute(supabase, tripId, fd);
  const { data, error } = await supabase.from("commutes").insert({ ...v, trip_id: tripId }).select("id,payment,origin_label,dest_label").single();
  if (error) throw new Error(error.message);
  await saveStops(supabase, data.id, stops);
  await syncCommuteTodo(supabase, tripId, data);
  revalidatePath(`/t/${tripId}`);
  redirect(`/t/${tripId}`);
}

export async function updateCommute(tripId: string, commuteId: string, fd: FormData) {
  const { supabase } = await requireUser();
  const { values: v, stops } = await parseCommute(supabase, tripId, fd);
  const { data, error } = await supabase
    .from("commutes").update(v).eq("id", commuteId).eq("trip_id", tripId).select("id,payment,origin_label,dest_label").single();
  if (error) throw new Error(error.message);
  await saveStops(supabase, commuteId, stops);
  await syncCommuteTodo(supabase, tripId, data);
  revalidatePath(`/t/${tripId}`);
  redirect(`/t/${tripId}`);
}

export async function deleteCommute(tripId: string, commuteId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("commutes").delete().eq("id", commuteId).eq("trip_id", tripId);
  if (error) throw new Error(error.message);
  revalidatePath(`/t/${tripId}`);
  redirect(`/t/${tripId}`);
}

export async function addCommuteTodo(tripId: string, commuteId: string, fd: FormData) {
  const { supabase } = await requireUser();
  const title = z.string().trim().min(1).max(200).parse(fd.get("title"));
  const { error } = await supabase.from("todos").insert({ trip_id: tripId, commute_id: commuteId, category: "ticket", title });
  if (error) throw new Error(error.message);
  revalidatePath(`/t/${tripId}/commutes/${commuteId}`);
}

export async function toggleCommuteTodo(tripId: string, commuteId: string, todoId: string, done: boolean) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("todos").update({ done }).eq("id", todoId).eq("trip_id", tripId);
  if (error) throw new Error(error.message);
  revalidatePath(`/t/${tripId}/commutes/${commuteId}`);
}

export async function deleteCommuteTodo(tripId: string, commuteId: string, todoId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("todos").delete().eq("id", todoId).eq("trip_id", tripId);
  if (error) throw new Error(error.message);
  revalidatePath(`/t/${tripId}/commutes/${commuteId}`);
}

// ───────────────────────── Completion & photos (M5) ─────────────────────────
const MAX_PHOTOS = 12;

/** Freeze USD-per-unit for a completed plan, using the rate of the (trip-local) day it was completed. */
async function freezePlanRate(supabase: Awaited<ReturnType<typeof createClient>>, tripId: string, planId: string) {
  const [{ data: trip }, { data: plan }] = await Promise.all([
    supabase.from("trips").select("timezone,currency").eq("id", tripId).single(),
    supabase.from("plans").select("completed,completed_at,cost_currency").eq("id", planId).eq("trip_id", tripId).single(),
  ]);
  if (!trip || !plan?.completed) return;
  const cur = (plan.cost_currency as string | null) ?? trip.currency;
  const day = localDate((plan.completed_at as string | null) ?? new Date().toISOString(), trip.timezone);
  const rate = await rateForDay(supabase, cur, day);
  await supabase.from("plans").update({ usd_per_unit_at_completion: rate }).eq("id", planId);
}

export async function setPlanCompleted(tripId: string, planId: string, completed: boolean) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("plans")
    .update({
      completed,
      completed_at: completed ? new Date().toISOString() : null,
      usd_per_unit_at_completion: null, // re-frozen below when completing; cleared when un-completing
    })
    .eq("id", planId)
    .eq("trip_id", tripId);
  if (error) throw new Error(error.message);
  if (completed) await freezePlanRate(supabase, tripId, planId);
  revalidatePath(`/t/${tripId}`, "layout");
}

export async function registerPlanPhoto(tripId: string, planId: string, path: string) {
  const { supabase } = await requireUser();
  const ok = new RegExp(`^${tripId}/${planId}/[0-9a-f-]{36}\\.(jpg|jpeg|png|webp)$`);
  if (!ok.test(path)) throw new Error("invalid path");
  const { data: plan } = await supabase.from("plans").select("completed").eq("id", planId).eq("trip_id", tripId).single();
  if (!plan?.completed) throw new Error("plan not completed");
  const { count } = await supabase.from("plan_photos").select("id", { count: "exact", head: true }).eq("plan_id", planId);
  if ((count ?? 0) >= MAX_PHOTOS) {
    await supabase.storage.from("trip-photos").remove([path]);
    throw new Error("photo limit reached");
  }
  const { error } = await supabase.from("plan_photos").insert({ plan_id: planId, storage_path: path });
  if (error) throw new Error(error.message);
  revalidatePath(`/t/${tripId}/plans/${planId}`);
}

export async function deletePlanPhoto(tripId: string, planId: string, photoId: string) {
  const { supabase } = await requireUser();
  const { data: photo } = await supabase.from("plan_photos").select("storage_path").eq("id", photoId).eq("plan_id", planId).single();
  if (!photo) return;
  await supabase.storage.from("trip-photos").remove([photo.storage_path]);
  const { error } = await supabase.from("plan_photos").delete().eq("id", photoId);
  if (error) throw new Error(error.message);
  revalidatePath(`/t/${tripId}/plans/${planId}`);
}

// ───────────────────────── Dashboard (M7) ─────────────────────────
export async function toggleDashTodo(tripId: string, todoId: string, done: boolean) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("todos").update({ done }).eq("id", todoId).eq("trip_id", tripId);
  if (error) throw new Error(error.message);
  revalidatePath(`/t/${tripId}/dashboard`);
}

export async function addGeneralTodo(tripId: string, fd: FormData) {
  const { supabase } = await requireUser();
  const title = z.string().trim().min(1).max(200).parse(fd.get("title"));
  const { error } = await supabase.from("todos").insert({ trip_id: tripId, category: "general", title });
  if (error) throw new Error(error.message);
  revalidatePath(`/t/${tripId}/dashboard`);
}

export async function deleteGeneralTodo(tripId: string, todoId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("todos").delete().eq("id", todoId).eq("trip_id", tripId).eq("category", "general");
  if (error) throw new Error(error.message);
  revalidatePath(`/t/${tripId}/dashboard`);
}


// ───────────────────────── To-do page & custom categories (M13) ─────────────────────────
const todoPath = (tripId: string) => `/t/${tripId}/todos`;

export async function createTodoCategory(tripId: string, fd: FormData) {
  const { supabase } = await requireUser();
  const name = z.string().trim().min(1).max(40).parse(fd.get("name"));
  const { count } = await supabase.from("todo_categories").select("id", { count: "exact", head: true }).eq("trip_id", tripId);
  if ((count ?? 0) >= 30) throw new Error("too many categories");
  const { error } = await supabase.from("todo_categories").insert({ trip_id: tripId, name, position: count ?? 0 });
  if (error) throw new Error(error.message);
  revalidatePath(todoPath(tripId));
}

export async function renameTodoCategory(tripId: string, categoryId: string, fd: FormData) {
  const { supabase } = await requireUser();
  const name = z.string().trim().min(1).max(40).parse(fd.get("name"));
  const { error } = await supabase.from("todo_categories").update({ name }).eq("id", categoryId).eq("trip_id", tripId);
  if (error) throw new Error(error.message);
  revalidatePath(todoPath(tripId));
}

/** Todos in a deleted category are kept (category_id -> null, they fall back to their built-in category). */
export async function deleteTodoCategory(tripId: string, categoryId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("todo_categories").delete().eq("id", categoryId).eq("trip_id", tripId);
  if (error) throw new Error(error.message);
  revalidatePath(todoPath(tripId));
}

export async function addTodoItem(tripId: string, fd: FormData) {
  const { supabase } = await requireUser();
  const title = z.string().trim().min(1).max(200).parse(fd.get("title"));
  const due = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().parse(String(fd.get("due_date") ?? "") || null);
  const cat = String(fd.get("cat") ?? "b:general");
  let category_id: string | null = null;
  if (cat.startsWith("c:")) {
    const { data } = await supabase.from("todo_categories").select("id").eq("id", cat.slice(2)).eq("trip_id", tripId).maybeSingle();
    category_id = data?.id ?? null;
  }
  const { error } = await supabase.from("todos").insert({ trip_id: tripId, category: "general", category_id, title, due_date: due });
  if (error) throw new Error(error.message);
  revalidatePath(todoPath(tripId));
}

export async function toggleTodoItem(tripId: string, todoId: string, done: boolean) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("todos").update({ done }).eq("id", todoId).eq("trip_id", tripId);
  if (error) throw new Error(error.message);
  revalidatePath(todoPath(tripId));
  revalidatePath(`/t/${tripId}/dashboard`);
}

/** Move any todo into a custom category ("b:" prefix = back to its built-in one). */
export async function moveTodoItem(tripId: string, todoId: string, fd: FormData) {
  const { supabase } = await requireUser();
  const cat = String(fd.get("cat") ?? "");
  let category_id: string | null = null;
  if (cat.startsWith("c:")) {
    const { data } = await supabase.from("todo_categories").select("id").eq("id", cat.slice(2)).eq("trip_id", tripId).maybeSingle();
    if (!data) return;
    category_id = data.id;
  }
  const { error } = await supabase.from("todos").update({ category_id }).eq("id", todoId).eq("trip_id", tripId);
  if (error) throw new Error(error.message);
  revalidatePath(todoPath(tripId));
}

/** Delete: user-made todos only (auto-generated hotel/ticket ones are managed from their source). */
export async function deleteTodoItem(tripId: string, todoId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("todos").delete().eq("id", todoId).eq("trip_id", tripId).eq("auto_generated", false);
  if (error) throw new Error(error.message);
  revalidatePath(todoPath(tripId));
}
