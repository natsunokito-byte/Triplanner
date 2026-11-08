"use client";

import Link from "next/link";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Building2, Camera, Check, Copy, EyeOff, Hand, Users, MapPin, Plus } from "lucide-react";
import { WakeUpButton } from "./wake-up-button";
import { duplicatePlanToSameDay, movePlanToDay, placePlan, setPlanCompleted } from "@/app/actions";
import { placeStart } from "@/lib/reorder";
import { METHOD_ICON, type Method, type Payment } from "@/lib/commute";
import { Money, useFx } from "./fx";
import { toTrip } from "@/lib/money";
import { PLAN_ICON, ptVars, type PlanType, type Visibility } from "@/lib/plan-types";
import { localDate, localToUtc, utcToLocal } from "@/lib/tz";

export type BoardPlan = {
  id: string;
  type: PlanType;
  title: string;
  location_name: string | null;
  has_meeting?: boolean;
  open_claim?: boolean;
  photographer_name?: string | null;
  studio_name?: string | null;
  start_at: string | null; // null = date known, time TBD (plan_date)
  plan_date: string | null;
  duration_min: number;
  visibility: Visibility;
  completed: boolean;
  cost: number | null;
  cost_currency: string | null;
  usd_frozen: number | null; // USD per unit frozen when the plan was completed
  people: { id: string; name: string }[];
};

export type BoardCommute = {
  id: string; from_plan_id: string | null; to_plan_id: string | null; method: Method; start_at: string;
  duration_min: number; cost: number | null; cost_currency: string | null; payment: Payment | null;
  stops: { label: string; stay_min: number }[];
};

export function DayBoard({
  tripId, tz, days, plans, commutes, currency,
}: { tripId: string; tz: string; days: string[]; plans: BoardPlan[]; commutes: BoardCommute[]; currency: string }) {
  const t = useTranslations("plan");
  const tc = useTranslations("commute");
  const tf = useTranslations("fx");
  const fx = useFx();
  const locale = useLocale();
  const [, startTransition] = useTransition();
  const [over, setOver] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [overCard, setOverCard] = useState<{ id: string; before: boolean } | null>(null);

  const [optPlans, moveOptimistic] = useOptimistic(plans, (state, m: { kind: "move"; id: string; date: string } | { kind: "complete"; id: string; completed: boolean } | { kind: "place"; id: string; startIso: string }) =>
    state.map((p) => {
      if (p.id !== m.id) return p;
      if (m.kind === "complete") return { ...p, completed: m.completed };
      if (m.kind === "place") return { ...p, start_at: m.startIso };
      if (!p.start_at) return { ...p, plan_date: m.date };
      return { ...p, start_at: localToUtc(`${m.date}T${utcToLocal(p.start_at, tz).slice(11)}`, tz).toISOString() };
    }),
  );

  const hm = useMemo(() => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz }), [locale, tz]);
  const md = useMemo(() => new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric", timeZone: "UTC" }), [locale]);
  const wd = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }), [locale]);

  const byDay = new Map<string, BoardPlan[]>();
  for (const p of optPlans) {
    const k = p.start_at ? localDate(p.start_at, tz) : p.plan_date;
    if (!k) continue;
    byDay.set(k, [...(byDay.get(k) ?? []), p]);
  }
  // Plans outside the trip range still get a column so nothing is hidden.
  const columns = [...new Set([...days, ...byDay.keys()])].sort();

  function drop(date: string, id: string) {
    setOver(null);
    setFailed(false);
    startTransition(async () => {
      moveOptimistic({ kind: "move", id, date });
      try { await movePlanToDay(tripId, id, date); } catch { setFailed(true); }
    });
  }

  /** Dropped on/between scheduled cards: take the start time from the neighbours (previous end + travel). */
  function dropOnCard(list: BoardPlan[], wakes: BoardPlan[], targetId: string, before: boolean, draggedId: string) {
    setOverCard(null);
    setOver(null);
    const dragged = optPlans.find((x) => x.id === draggedId);
    if (!dragged || dragged.id === targetId || dragged.type === "wake_up") return;
    const others = list.filter((x) => x.id !== draggedId).map((x) => ({ id: x.id, startMs: Date.parse(x.start_at!), endMs: Date.parse(x.start_at!) + x.duration_min * 60000 }));
    const at = others.findIndex((x) => x.id === targetId);
    if (at < 0) return;
    const startMs = placeStart({
      others, index: before ? at : at + 1, durationMs: dragged.duration_min * 60000,
      travelMin: (prevId) => commutes.find((x) => x.from_plan_id === prevId)?.duration_min ?? 0,
      floorMs: wakes[0]?.start_at ? Date.parse(wakes[0].start_at) : null,
    });
    if (startMs == null) return;
    const startIso = new Date(Math.round(startMs / 60000) * 60000).toISOString();
    setFailed(false);
    startTransition(async () => {
      moveOptimistic({ kind: "place", id: draggedId, startIso });
      try { await placePlan(tripId, draggedId, startIso); } catch { setFailed(true); }
    });
  }

  function copyHere(id: string) {
    setFailed(false);
    startTransition(async () => {
      try { await duplicatePlanToSameDay(tripId, id); } catch { setFailed(true); }
    });
  }

  function toggle(id: string, completed: boolean) {
    setFailed(false);
    startTransition(async () => {
      moveOptimistic({ kind: "complete", id, completed });
      try { await setPlanCompleted(tripId, id, completed); } catch { setFailed(true); }
    });
  }

  function pill(link: BoardCommute | undefined, href: string, emptyLabel: string, extra = "mt-2") {
    const CIcon = link ? METHOD_ICON[link.method] : null;
    return (
      <Link
        href={link ? `/t/${tripId}/commutes/${link.id}` : href}
        className={`mx-auto ${extra} flex w-fit items-center gap-1 rounded-full px-3 py-1 text-xs ${
          link ? "bg-surface-2 text-text" : "border border-dashed border-border text-muted hover:text-text"
        }`}
      >
        {link && CIcon ? (
          <>
            <CIcon size={12} /> {tc(`methods.${link.method}`)} · {tc("min", { n: link.duration_min })}{link.stops.length > 0 && <> · {tc("stopsCount", { n: link.stops.length })}</>}
            {link.cost != null && <> · <Money amount={link.cost} currency={link.cost_currency ?? currency} /></>}
          </>
        ) : (
          emptyLabel
        )}
      </Link>
    );
  }

  function renderCard(p: BoardPlan, d: string, Icon: LucideIcon, c: ReturnType<typeof ptVars>, timeLabel: string) {
    return (
      <>
                      <div className="group relative">
                      <Link
                        href={`/t/${tripId}/plans/${p.id}`}
                        draggable
                        onDragStart={(e) => { e.dataTransfer.setData("text/plain", p.id); e.dataTransfer.effectAllowed = "move"; }}
                        className={`block rounded-[8px] border border-border bg-surface p-2 pl-3 pr-9 shadow-[var(--shadow-1)] transition-shadow hover:shadow-[var(--shadow-2)] ${p.completed ? "opacity-60" : ""}`}
                        style={{ borderLeft: `4px solid ${c.dot}` }}
                      >
                        <div className="flex items-center gap-1 text-xs tabular-nums text-muted">
                          <Icon size={13} style={{ color: c.fg }} />
                          {timeLabel}
                          {p.visibility !== "normal" && <EyeOff size={12} className="ml-auto" aria-label={t("private")} />}
                        </div>
                        <div className={`mt-0.5 font-semibold leading-snug ${p.completed ? "line-through" : ""}`}>{p.title}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1">
                          <span className="inline-block rounded-full px-2 text-[11px]" style={{ background: c.bg, color: c.fg }}>{t(`types.${p.type}`)}</span>
                          {p.open_claim && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-primary px-2 text-[11px] font-medium text-primary"><Hand size={11} />{t("openClaimPill")}</span>
                          )}
                          {p.has_meeting && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-warning px-2 text-[11px] font-semibold text-white"><Users size={11} />{t("meetingPill")}</span>
                          )}
                        </div>
                        {p.location_name && (
                          <div className="mt-1 flex items-center gap-1 text-xs text-muted"><MapPin size={12} className="shrink-0" /><span className="truncate">{p.location_name}</span></div>
                        )}
                        {p.photographer_name && (
                          <div className="mt-1 flex items-center gap-1 text-xs text-muted"><Camera size={12} className="shrink-0" /><span className="truncate">{p.photographer_name}</span></div>
                        )}
                        {p.studio_name && (
                          <div className="mt-1 flex items-center gap-1 text-xs text-muted"><Building2 size={12} className="shrink-0" /><span className="truncate">{p.studio_name}</span></div>
                        )}
                        {p.cost != null && (
                          <div className="mt-1 text-xs tabular-nums text-muted"><Money amount={p.cost} currency={p.cost_currency} frozen={p.usd_frozen} /></div>
                        )}
                        {p.people.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {p.people.map((x) => <span key={x.id} className="rounded-full bg-surface-2 px-2 text-[11px]">{x.name}</span>)}
                          </div>
                        )}
                      </Link>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={p.completed}
                        aria-label={t("complete")}
                        onClick={() => toggle(p.id, !p.completed)}
                        className={`absolute bottom-2 right-2 flex h-8 w-8 items-center md:h-6 md:w-6 justify-center rounded-full border transition-colors ${
                          p.completed ? "border-success bg-success text-white" : "border-border bg-surface text-transparent hover:border-success hover:text-success"
                        }`}
                      >
                        <Check size={14} />
                      </button>
                      <button
                        type="button"
                        aria-label={t("copyHere")}
                        title={t("copyHere")}
                        onClick={() => copyHere(p.id)}
                        className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface text-muted transition-opacity hover:text-primary focus:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                      >
                        <Copy size={13} />
                      </button>
                      </div>
                      <div className="mt-1 md:hidden">
                        <select
                          aria-label={t("moveTo")}
                          value={d}
                          onChange={(e) => drop(e.target.value, p.id)}
                          className="h-8 w-full rounded-md border border-border bg-surface px-2 text-xs text-muted"
                        >
                          {columns.map((col) => <option key={col} value={col}>{t("moveTo")}: {md.format(new Date(col))} {wd.format(new Date(col))}</option>)}
                        </select>
                      </div>
      </>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="hidden text-xs text-muted md:block">{t("dragHint")}</p>
        <p className="text-xs text-muted md:hidden">{t("swipeHint")}</p>
        {failed && <p role="alert" className="text-xs text-danger">{t("saveFailed")}</p>}
      </div>
      <div data-sync="board" className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3 md:snap-none">
        {columns.map((d) => {
          const dayPlans = byDay.get(d) ?? [];
          const wakes = dayPlans.filter((p) => p.start_at && p.type === "wake_up").sort((a, b) => a.start_at!.localeCompare(b.start_at!));
          const list = dayPlans.filter((p) => p.start_at && p.type !== "wake_up").sort((a, b) => a.start_at!.localeCompare(b.start_at!));
          const tbd = dayPlans.filter((p) => !p.start_at);
          const outside = !days.includes(d);
          let prevEnd = 0;
          let total = 0;
          let hasTotal = false;
          if (fx) {
            const add = (amount: number | null, cur: string | null, frozen: number | null) => {
              if (amount == null) return;
              const v = toTrip(fx.ctx, amount, cur ?? fx.ctx.tripCurrency, frozen);
              if (v != null) { total += v; hasTotal = true; }
            };
            for (const p of dayPlans) add(p.cost, p.cost_currency, p.usd_frozen);
            for (const x of commutes) if (localDate(x.start_at, tz) === d) add(x.cost, x.cost_currency, null);
          }
          return (
            <div
              key={d}
              data-col
              className={`card flex w-[86vw] max-w-[320px] shrink-0 snap-start flex-col sm:w-[280px] ${over === d ? "border-primary bg-primary-soft/40" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setOver(d); }}
              onDragLeave={() => setOver((cur) => (cur === d ? null : cur))}
              onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain"); if (id) drop(d, id); }}
            >
              <div className="sticky top-0 flex items-center justify-between rounded-t-[12px] border-b border-border bg-surface px-3 py-2">
                <div>
                  <span className="font-semibold">{md.format(new Date(d))}</span>{" "}
                  <span className="text-xs text-muted">{wd.format(new Date(d))}</span>
                  {outside && <div className="text-[11px] text-warning">{t("outside")}</div>}
                  {hasTotal && fx && (
                    <div className="text-[11px] tabular-nums text-muted">{tf("dayTotal")} <Money amount={total} currency={fx.ctx.tripCurrency} /></div>
                  )}
                </div>
                <Link href={`/t/${tripId}/plans/new?date=${d}`} className="btn btn-sm !h-7 !px-2" aria-label={t("add")}><Plus size={14} /></Link>
              </div>

              <ul className="flex flex-1 flex-col gap-2 p-2">
                <li className="flex flex-col items-center justify-center gap-2">
                  <WakeUpButton
                    key={`${d}-${wakes[0]?.start_at ?? "none"}`}
                    tripId={tripId}
                    date={d}
                    current={wakes[0] ? { id: wakes[0].id, time: hm.format(Date.parse(wakes[0].start_at!)) } : null}
                  />
                  {list[0] && (
                    <span className="[&>a]:!mx-0 [&>a]:!mt-0">
                      {pill(
                        commutes.find((x) => x.from_plan_id === null && x.to_plan_id === list[0].id),
                        `/t/${tripId}/commutes/new?to=${list[0].id}`,
                        tc("addFromHotel"),
                      )}
                    </span>
                  )}
                </li>
                {dayPlans.filter((p) => p.type !== "wake_up").length === 0 && <li className="py-6 text-center text-xs text-muted">{t("dayEmpty")}</li>}
                {list.map((p, idx) => {
                  const next = list[idx + 1];
                  const link = next ? commutes.find((x) => x.from_plan_id === p.id && x.to_plan_id === next.id) : undefined;
                  const lastLink = commutes.find((x) => x.from_plan_id === p.id && x.to_plan_id === null);
                  const Icon = PLAN_ICON[p.type];
                  const c = ptVars(p.type);
                  const startMs = Date.parse(p.start_at!);
                  const endMs = startMs + p.duration_min * 60000;
                  const overlap = prevEnd > startMs;
                  prevEnd = Math.max(prevEnd, endMs);
                  return (
                    <li
                      key={p.id}
                      className={overCard?.id === p.id ? (overCard.before ? "rounded-md border-t-2 border-primary" : "rounded-md border-b-2 border-primary") : ""}
                      onDragOver={(e) => {
                        e.preventDefault(); e.stopPropagation();
                        const r = e.currentTarget.getBoundingClientRect();
                        const before = e.clientY < r.top + r.height / 2;
                        setOver(null);
                        setOverCard((cur) => (cur?.id === p.id && cur.before === before ? cur : { id: p.id, before }));
                      }}
                      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOverCard((cur) => (cur?.id === p.id ? null : cur)); }}
                      onDrop={(e) => {
                        e.preventDefault(); e.stopPropagation();
                        const id = e.dataTransfer.getData("text/plain");
                        const r = e.currentTarget.getBoundingClientRect();
                        if (id) dropOnCard(list, wakes, p.id, e.clientY < r.top + r.height / 2, id);
                      }}
                    >
                      {overlap && (
                        <div className="mb-1 flex items-center gap-1 text-[11px] text-warning"><AlertTriangle size={12} /> {t("overlap")}</div>
                      )}
                      {renderCard(p, d, Icon, c, `${hm.format(startMs)}–${hm.format(endMs)}`)}
                      {next && pill(link, `/t/${tripId}/commutes/new?from=${p.id}&to=${next.id}`, tc("add"))}
                      {!next && pill(lastLink, `/t/${tripId}/commutes/new?from=${p.id}`, tc("addToHotel"))}
                    </li>
                  );
                })}
                {tbd.length > 0 && (
                  <li className="space-y-2">
                    <div className="border-t border-dashed border-border pt-2 text-[11px] font-medium text-muted">{t("timeTbd")}</div>
                    {tbd.map((p) => (
                      <div key={p.id}>{renderCard(p, d, PLAN_ICON[p.type], ptVars(p.type), t("timeTbd"))}</div>
                    ))}
                  </li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
