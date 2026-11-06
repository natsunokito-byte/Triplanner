"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, MapPin } from "lucide-react";
import { Money, useFx } from "@/components/fx";
import { METHOD_ICON, type Method } from "@/lib/commute";
import { PLAN_ICON, ptVars, type PlanType } from "@/lib/plan-types";
import { toTrip } from "@/lib/money";
import { localDate } from "@/lib/tz";
import type { ViewerData } from "@/lib/viewer-access";

export type ViewerPhoto = { id: string; plan_id: string; url: string };

export function ViewerBoard({ data, days, photos }: { data: ViewerData; days: string[]; photos: ViewerPhoto[] }) {
  const t = useTranslations("plan");
  const tc = useTranslations("commute");
  const tv = useTranslations("viewer");
  const fx = useFx();
  const locale = useLocale();
  const tz = data.trip.timezone;
  const hm = useMemo(() => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz }), [locale, tz]);
  const md = useMemo(() => new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric", timeZone: "UTC" }), [locale]);
  const wd = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }), [locale]);

  const byDay = new Map<string, typeof data.plans>();
  for (const p of data.plans) {
    const k = localDate(p.start_at, tz);
    byDay.set(k, [...(byDay.get(k) ?? []), p]);
  }
  const columns = [...new Set([...days, ...byDay.keys()])].sort();

  if (data.plans.length === 0) return <p className="card p-6 text-center text-muted">{tv("noPlans")}</p>;

  return (
    <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3 md:snap-none">
      {columns.map((d) => {
        const list = (byDay.get(d) ?? []).sort((a, b) => a.start_at.localeCompare(b.start_at));
        let total = 0;
        let hasTotal = false;
        if (fx && data.canSeeCosts) {
          const add = (a: number | null, c: string | null, f: number | null) => {
            if (a == null) return;
            const v = toTrip(fx.ctx, a, c ?? fx.ctx.tripCurrency, f);
            if (v != null) { total += v; hasTotal = true; }
          };
          for (const p of list) add(p.cost, p.cost_currency, p.usd_frozen);
          for (const x of data.commutes) if (localDate(x.start_at, tz) === d) add(x.cost, x.cost_currency, null);
        }
        return (
          <div key={d} className="card flex w-[86vw] max-w-[320px] shrink-0 snap-start flex-col sm:w-[280px]">
            <div className="rounded-t-[12px] border-b border-border bg-surface px-3 py-2">
              <span className="font-semibold">{md.format(new Date(d))}</span> <span className="text-xs text-muted">{wd.format(new Date(d))}</span>
              {hasTotal && fx && <div className="text-[11px] tabular-nums text-muted"><Money amount={total} currency={fx.ctx.tripCurrency} /></div>}
            </div>
            <ul className="flex flex-1 flex-col gap-2 p-2">
              {list.length === 0 && <li className="py-6 text-center text-xs text-muted">{t("dayEmpty")}</li>}
              {list.map((p, idx) => {
                const type = p.type as PlanType;
                const Icon = PLAN_ICON[type];
                const c = ptVars(type);
                const start = Date.parse(p.start_at);
                const next = list[idx + 1];
                const link = next ? data.commutes.find((x) => x.from_plan_id === p.id && x.to_plan_id === next.id) : undefined;
                const CIcon = link ? METHOD_ICON[link.method as Method] : null;
                const pics = photos.filter((ph) => ph.plan_id === p.id);
                return (
                  <li key={p.id}>
                    <div className={`rounded-[8px] border border-border bg-surface p-2 pl-3 shadow-[var(--shadow-1)] ${p.completed ? "opacity-80" : ""}`} style={{ borderLeft: `4px solid ${c.dot}` }}>
                      <div className="flex items-center gap-1 text-xs tabular-nums text-muted">
                        <Icon size={13} style={{ color: c.fg }} />
                        {hm.format(start)}–{hm.format(start + p.duration_min * 60000)}
                        {p.completed && <Check size={14} className="ml-auto text-success" aria-label={t("complete")} />}
                      </div>
                      <div className={`mt-0.5 font-semibold leading-snug ${p.completed ? "line-through decoration-1" : ""}`}>{p.title}</div>
                      <div className="mt-0.5 inline-block rounded-full px-2 text-[11px]" style={{ background: c.bg, color: c.fg }}>{t(`types.${type}`)}</div>
                      {p.location_name && <div className="mt-1 flex items-center gap-1 text-xs text-muted"><MapPin size={12} className="shrink-0" /><span className="truncate">{p.location_name}</span></div>}
                      {p.cost != null && <div className="mt-1 text-xs tabular-nums text-muted"><Money amount={p.cost} currency={p.cost_currency} frozen={p.usd_frozen} /></div>}
                      {p.note && <div className="mt-1 whitespace-pre-line text-xs text-muted">{p.note}</div>}
                      {p.people.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {p.people.map((x) => <span key={x.id} className={`rounded-full px-2 text-[11px] ${x.isMe ? "bg-primary-soft text-primary" : "bg-surface-2"}`}>{x.name}</span>)}
                        </div>
                      )}
                      {pics.length > 0 && (
                        <div className="mt-2 grid grid-cols-3 gap-1" aria-label={tv("photos")}>
                          {pics.map((ph) => (
                            <a key={ph.id} href={ph.url} target="_blank" rel="noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={ph.url} alt="" loading="lazy" className="aspect-square w-full rounded-md object-cover" />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                    {link && CIcon && (
                      <div className="mx-auto mt-2 flex w-fit items-center gap-1 rounded-full bg-surface-2 px-3 py-1 text-xs">
                        <CIcon size={12} /> {tc(`methods.${link.method}`)} · {tc("min", { n: link.duration_min })}
                        {link.cost != null && <> · <Money amount={link.cost} currency={link.cost_currency ?? fx?.ctx.tripCurrency} /></>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
