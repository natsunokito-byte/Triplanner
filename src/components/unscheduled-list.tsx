"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Plus } from "lucide-react";
import { movePlanToDay } from "@/app/actions";
import { PLAN_ICON, ptVars, type PlanType } from "@/lib/plan-types";
import { formatHours } from "@/lib/cost";

export type UndatedPlan = { id: string; type: PlanType; title: string; duration_min: number; location_name: string | null; plan_time: string | null };

/** Collapsed-by-default backlog of plans without a date, shown at the bottom of the trip page. */
export function UnscheduledList({ tripId, plans, days }: { tripId: string; plans: UndatedPlan[]; days: string[] }) {
  const t = useTranslations("plan");
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);

  return (
    <section className="card">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <button type="button" className="flex flex-1 items-center gap-2 text-left font-semibold" aria-expanded={open} onClick={() => setOpen(!open)}>
          <ChevronDown size={16} className={`transition-transform ${open ? "" : "-rotate-90"}`} />
          {t("unscheduled")} <span className="text-xs font-normal text-muted tabular-nums">{plans.length}</span>
        </button>
        <Link href={`/t/${tripId}/plans/new?undated=1`} className="btn btn-sm"><Plus size={14} /> {t("addUndated")}</Link>
      </div>
      {open && (
        <div className="space-y-2 border-t border-border p-3">
          {failed && <p role="alert" className="text-xs text-danger">{t("saveFailed")}</p>}
          {plans.length === 0 && <p className="text-xs text-muted">{t("unscheduledEmpty")}</p>}
          {plans.map((p) => {
            const Icon = PLAN_ICON[p.type];
            const c = ptVars(p.type);
            return (
              <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-[8px] border border-border bg-surface p-2 pl-3" style={{ borderLeft: `4px solid ${c.dot}` }}>
                <Link href={`/t/${tripId}/plans/${p.id}`} className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 text-xs text-muted"><Icon size={13} style={{ color: c.fg }} /> {t(`types.${p.type}`)}{p.type !== "wake_up" && <> · {t("hours", { h: formatHours(p.duration_min) })}</>}</div>
                  <div className="mt-0.5 inline-block rounded-full bg-surface-2 px-2 text-[11px] text-muted">{p.plan_time ? t("noDateHasTime", { time: p.plan_time }) : t("noDateNoTime")}</div>
                  <div className="truncate font-semibold">{p.title}</div>
                </Link>
                <select
                  aria-label={t("scheduleTo")} disabled={pending} value=""
                  onChange={(e) => {
                    const d = e.target.value;
                    if (!d) return;
                    setFailed(false);
                    start(async () => { try { await movePlanToDay(tripId, p.id, d); } catch { setFailed(true); } });
                  }}
                  className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-muted"
                >
                  <option value="">{t("scheduleTo")}…</option>
                  {days.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
