import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CalendarClock, List, ListChecks, ImageDown, LayoutDashboard, MapPin, Settings } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { createClient } from "@/lib/supabase/server";
import { touchTrip } from "@/app/actions";
import { ScrollSync } from "@/components/scroll-sync";
import { UnscheduledList } from "@/components/unscheduled-list";
import { HotelTimeline } from "@/components/hotel-timeline";
import { DayBoard, type BoardPlan } from "@/components/day-board";
import { hhmm, isUnscheduled } from "@/lib/schedule";
import { eachDay } from "@/lib/tz";
import { getLatestRates } from "@/lib/fx";
import { CurrencyToggle, FxProvider } from "@/components/fx";
import type { Commute, Hotel, Plan, Trip } from "@/lib/types";

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getTranslations("common");
  const te = await getTranslations("export");
  const td = await getTranslations("dash");
  const tt = await getTranslations("todos");
  const tp = await getTranslations("plan");
  const supabase = await createClient();
  const { data } = await supabase.from("trips").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const trip = data as Trip;
  await touchTrip(id);
  const { count: pendingCount } = await supabase.from("plan_requests").select("id", { count: "exact", head: true }).eq("trip_id", id).eq("status", "pending");
  const tr = await getTranslations("requests");
  const { data: hotelRows } = await supabase.from("hotels").select("*").eq("trip_id", id).order("check_in");
  const hotels = (hotelRows ?? []) as Hotel[];
  const [{ data: planRows }, { data: peopleRows }, { data: ppRows }, { data: commuteRows }, { data: stopRows }] = await Promise.all([
    supabase.from("plans").select("*").eq("trip_id", id).order("start_at"),
    supabase.from("people").select("id,name").eq("trip_id", id),
    supabase.from("plan_people").select("plan_id,person_id"),
    supabase.from("commutes").select("*").eq("trip_id", id),
    supabase.from("commute_stops").select("commute_id,label,stay_min").order("position"),
  ]);
  const commutes = (commuteRows ?? []) as Commute[];
  const plansAll = (planRows ?? []) as Plan[];
  const rates = await getLatestRates(supabase, [
    trip.currency,
    ...hotels.map((h) => h.cost_currency),
    ...plansAll.map((p) => p.cost_currency),
    ...commutes.map((x) => x.cost_currency),
  ].filter((x): x is string => !!x));
  const nameOf = new Map((peopleRows ?? []).map((p) => [p.id as string, p.name as string]));
  const boardPlans: BoardPlan[] = ((planRows ?? []) as Plan[]).filter((p) => !isUnscheduled(p)).map((p) => ({
    id: p.id, type: p.type, title: p.title, location_name: p.location_name, start_at: p.start_at, plan_date: p.plan_date,
    photographer_name: p.photographer_name, studio_name: p.studio_name, has_meeting: p.has_meeting,
    duration_min: p.duration_min, visibility: p.visibility, completed: p.completed,
    cost: p.cost == null ? null : Number(p.cost), cost_currency: p.cost_currency, usd_frozen: p.usd_per_unit_at_completion == null ? null : Number(p.usd_per_unit_at_completion),
    people: (ppRows ?? []).filter((r) => r.plan_id === p.id && nameOf.has(r.person_id)).map((r) => ({ id: r.person_id as string, name: nameOf.get(r.person_id)! })),
  }));

  return (
    <FxProvider ctx={{ tripCurrency: trip.currency, override: trip.usd_rate_override == null ? null : Number(trip.usd_rate_override), rates }}>
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-[28px] font-semibold leading-tight">{trip.title}</h1>
            <p className="text-muted mt-1">
              {trip.start_date} → {trip.end_date} · {trip.timezone} · {trip.currency}
            </p>
            {trip.destinations.length > 0 && (
              <p className="mt-2 flex items-center gap-1 text-muted"><MapPin size={14} /> {trip.destinations.join(" · ")}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CurrencyToggle />
            <Link href={`/t/${id}/dashboard`} className="btn btn-sm"><LayoutDashboard size={14} /> {td("title")}</Link>
            <Link href={`/t/${id}/plans`} className="btn btn-sm"><List size={14} /> {tp("overviewTitle")}</Link>
            <Link href={`/t/${id}/todos`} className="btn btn-sm"><ListChecks size={14} /> {tt("title")}</Link>
            <Link href={`/t/${id}/requests`} className="btn btn-sm"><CalendarClock size={14} /> {tr("badge")}{(pendingCount ?? 0) > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] text-white">{pendingCount}</span>}</Link>
            <Link href={`/t/${id}/report`} className="btn btn-sm"><ImageDown size={14} /> {te("tripReportLink")}</Link>
            <Link href={`/t/${id}/settings`} className="btn btn-sm"><Settings size={14} /> {c("settings")}</Link>
          </div>
        </div>
        <ScrollSync />
        <DayBoard tripId={id} tz={trip.timezone} days={eachDay(trip.start_date, trip.end_date)} plans={boardPlans} commutes={commutes.map(({ id, from_plan_id, to_plan_id, method, start_at, duration_min, cost, cost_currency, payment }) => ({ id, from_plan_id, to_plan_id, method, start_at, duration_min, cost: cost == null ? null : Number(cost), cost_currency, payment, stops: (stopRows ?? []).filter((x) => x.commute_id === id).map((x) => ({ label: x.label as string, stay_min: x.stay_min as number })) }))} currency={trip.currency} />
        <HotelTimeline trip={trip} hotels={hotels} />
        <UnscheduledList
          tripId={id}
          days={eachDay(trip.start_date, trip.end_date)}
          plans={plansAll.filter((p) => isUnscheduled(p)).map((p) => ({ id: p.id, type: p.type, title: p.title, duration_min: p.duration_min, location_name: p.location_name, plan_time: hhmm(p.plan_time) }))}
        />
      </main>
    </FxProvider>
  );
}
