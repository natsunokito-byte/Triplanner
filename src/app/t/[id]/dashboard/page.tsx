import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { BarList, type BarItem } from "@/components/bar-list";
import { CurrencyToggle, FxProvider, Money } from "@/components/fx";
import { DashboardExport } from "@/components/dashboard-export";
import { Scoreboard, type ScoreEntry } from "@/components/scoreboard";
import { createClient } from "@/lib/supabase/server";
import { getLatestRates } from "@/lib/fx";
import { toTrip, type FxCtx } from "@/lib/money";
import { NON_ACTIVITY, PLAN_TYPES } from "@/lib/plan-types";
import { groupByDate, todoDate } from "@/lib/todo-groups";
import { localDate } from "@/lib/tz";
import type { Commute, Hotel, Person, Plan, Todo, Trip } from "@/lib/types";


export default async function Dashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("dash");
  const tp = await getTranslations("plan");
  const supabase = await createClient();

  const { data: tripRow } = await supabase.from("trips").select("*").eq("id", id).maybeSingle();
  if (!tripRow) notFound();
  const trip = tripRow as Trip;

  const [{ data: hotelRows }, { data: planRows }, { data: commuteRows }, { data: todoRows }, { data: peopleRows }] = await Promise.all([
    supabase.from("hotels").select("*").eq("trip_id", id),
    supabase.from("plans").select("*").eq("trip_id", id),
    supabase.from("commutes").select("*").eq("trip_id", id),
    supabase.from("todos").select("*").eq("trip_id", id).order("done").order("title"),
    supabase.from("people").select("*").eq("trip_id", id),
  ]);
  const hotels = (hotelRows ?? []) as Hotel[];
  const plans = (planRows ?? []) as Plan[];
  const commutes = (commuteRows ?? []) as Commute[];
  const todos = (todoRows ?? []) as Todo[];
  const people = (peopleRows ?? []) as Person[];
  const planIds = plans.map((p) => p.id);
  const { data: ppRows } = planIds.length ? await supabase.from("plan_people").select("plan_id,person_id").in("plan_id", planIds) : { data: [] };

  const rates = await getLatestRates(supabase, [
    trip.currency,
    ...hotels.map((h) => h.cost_currency),
    ...plans.map((p) => p.cost_currency),
    ...commutes.map((c) => c.cost_currency),
  ].filter((x): x is string => !!x));
  const ctx: FxCtx = { tripCurrency: trip.currency, override: trip.usd_rate_override == null ? null : Number(trip.usd_rate_override), rates };

  // ── cost, in trip currency ──
  let missing = 0;
  let completedTotal = 0;
  const conv = (amount: number | null, cur: string | null, frozen: number | null = null) => {
    if (amount == null) return null;
    const v = toTrip(ctx, Number(amount), cur ?? trip.currency, frozen);
    if (v == null) missing++;
    return v;
  };
  const groups = new Map<string, { label: string; value: number; details: Map<string, number> }>();
  const add = (key: string, label: string, v: number | null, detail: string) => {
    if (v == null || v <= 0) return;
    const g = groups.get(key) ?? { label, value: 0, details: new Map() };
    g.value += v;
    g.details.set(detail, (g.details.get(detail) ?? 0) + v);
    groups.set(key, g);
  };
  for (const h of hotels) add("hotel", t("hotelCat"), conv(h.cost, h.cost_currency), h.name);
  for (const c of commutes) add("commute", t("commuteCat"), conv(c.cost, c.cost_currency), `${c.origin_label ?? "?"} → ${c.dest_label ?? "?"}`);
  for (const p of plans) {
    const frozen = p.usd_per_unit_at_completion == null ? null : Number(p.usd_per_unit_at_completion);
    const v = conv(p.cost, p.cost_currency, frozen);
    add(`plan:${p.type}`, tp(`types.${p.type}`), v, p.title);
    if (p.completed && v != null) completedTotal += v;
  }
  const costItems: BarItem[] = [...groups.entries()]
    .map(([key, g]) => ({
      id: key, label: g.label, value: g.value,
      details: [...g.details.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value]) => ({ label, value })),
    }))
    .sort((a, b) => b.value - a.value);
  const totalCost = costItems.reduce((s, i) => s + i.value, 0);

  // ── todos ──
  const doneCount = todos.filter((x) => x.done).length;
  // No default categories: to-dos are summarised by date (own due date, else the plan's date).
  const planDates = new Map<string, string | null>(plans.map((p) => [p.id, p.start_at ? localDate(p.start_at, trip.timezone) : p.plan_date]));
  const todoByDate = groupByDate(todos, (x) => todoDate(x, planDates));

  // ── scoreboard (completed plans only, everyone except me) ──
  const others = people.filter((p) => !p.is_me).map((p) => ({ id: p.id, name: p.name }));
  const entries: ScoreEntry[] = plans
    .filter((p) => p.completed && p.visibility !== "owner_only")
    .map((p) => ({ type: p.type, duration: p.duration_min, personIds: (ppRows ?? []).filter((r) => r.plan_id === p.id).map((r) => r.person_id as string) }))
    .filter((e) => (PLAN_TYPES as readonly string[]).includes(e.type) && !NON_ACTIVITY.includes(e.type)); // tasks/alarms are not time together
  const hangoutMin = entries.filter((e) => e.personIds.some((pid) => others.some((o) => o.id === pid))).reduce((s, e) => s + e.duration, 0);

  const exportData = {
    title: trip.title, watermark: `${trip.title} · ${trip.start_date} – ${trip.end_date}`, currency: trip.currency,
    totalCost, completedCost: completedTotal, todosDone: doneCount, todosTotal: todos.length, hangoutMin,
    costRows: costItems.map((i) => ({ label: i.label, value: i.value })),
    todoRows: todoByDate.map((g) => ({ label: g.date ?? t("noDate"), done: g.items.filter((x) => x.done).length, total: g.items.length })),
    people: others, entries,
  };
  const te = await getTranslations("export");

  const tile = "card p-4";
  return (
    <FxProvider ctx={ctx}>
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-8 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href={`/t/${id}`} className="inline-flex items-center gap-1 text-muted hover:text-text"><ArrowLeft size={14} /> {t("back")}</Link>
            <h1 className="mt-1 text-[28px] font-semibold leading-tight">{trip.title} · {t("title")}</h1>
          </div>
          <CurrencyToggle />
        </div>

        <section className="grid gap-3 sm:grid-cols-3">
          <div className={tile}>
            <div className="text-xs text-muted">{t("kpiCost")}</div>
            <div className="mt-1 text-[28px] font-semibold leading-tight tabular-nums"><Money amount={totalCost} currency={trip.currency} /></div>
            <div className="mt-1 text-xs text-muted tabular-nums"><Money amount={completedTotal} currency={trip.currency} /> {t("kpiCostDone")}</div>
          </div>
          <div className={tile}>
            <div className="text-xs text-muted">{t("kpiTodos")}</div>
            <div className="mt-1 text-[28px] font-semibold leading-tight tabular-nums">{doneCount}/{todos.length}</div>
          </div>
          <div className={tile}>
            <div className="text-xs text-muted">{t("kpiHangout")}</div>
            <div className="mt-1 text-[28px] font-semibold leading-tight tabular-nums">{(hangoutMin / 60).toFixed(1)}<span className="ml-1 text-sm font-normal text-muted">h</span></div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">{t("costBy")}</h2>
          <div className="card p-4">
            {costItems.length === 0 ? (
              <p className="py-4 text-center text-muted">{t("costNone")}</p>
            ) : (
              <BarList items={costItems} unit="money" tripCurrency={trip.currency} ariaLabel={t("costBy")} />
            )}
            {missing > 0 && <p className="mt-3 text-xs text-warning">{t("noRate", { n: missing })}</p>}
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold">{t("scoreboard")}</h2>
            <p className="text-xs text-muted">{t("scoreHint")}</p>
          </div>
          <Scoreboard people={others} entries={entries} />
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">{te("exportDash")}</h2>
          <DashboardExport d={exportData} />
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between"><h2 className="text-base font-semibold">{t("todos")}</h2><Link href={`/t/${id}/todos`} className="text-sm text-primary hover:underline">{t("openTodoPage")}</Link></div>
          <div className="card space-y-3 p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">{t("todoProgress", { done: doneCount, total: todos.length })}</span>
            </div>
            {todos.length > 0 && (
              <div className="h-1 overflow-hidden rounded-full bg-primary-soft" aria-hidden>
                <div className="h-full rounded-full bg-primary" style={{ width: `${(doneCount / todos.length) * 100}%` }} />
              </div>
            )}
            {todos.length === 0 && <p className="text-muted">{t("noTodos")}</p>}
            <ul className="space-y-1">
              {todoByDate.map((g) => (
                <li key={g.date ?? "none"} className="flex items-center justify-between text-sm">
                  <span>{g.date ?? t("noDate")}</span>
                  <span className="text-xs tabular-nums text-muted">{t("todoProgress", { done: g.items.filter((x) => x.done).length, total: g.items.length })}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
    </FxProvider>
  );
}
