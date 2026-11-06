"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { BarList, formatMinutes, type BarItem } from "./bar-list";
import { PLAN_TYPES, type PlanType } from "@/lib/plan-types";

export type ScoreEntry = { type: PlanType; duration: number; personIds: string[] };

export function Scoreboard({ people, entries }: { people: { id: string; name: string }[]; entries: ScoreEntry[] }) {
  const t = useTranslations("dash");
  const tp = useTranslations("plan");
  const [selected, setSelected] = useState<Set<PlanType>>(new Set(PLAN_TYPES));
  const typesPresent = useMemo(() => PLAN_TYPES.filter((k) => entries.some((e) => e.type === k)), [entries]);

  const items: BarItem[] = useMemo(() => {
    const out: BarItem[] = [];
    for (const p of people) {
      const byType = new Map<PlanType, number>();
      for (const e of entries) {
        if (!selected.has(e.type) || !e.personIds.includes(p.id)) continue;
        byType.set(e.type, (byType.get(e.type) ?? 0) + e.duration);
      }
      const total = [...byType.values()].reduce((a, b) => a + b, 0);
      if (total > 0) {
        out.push({
          id: p.id, label: p.name, value: total,
          details: [...byType.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: tp(`types.${k}`), value: v })),
        });
      }
    }
    return out.sort((a, b) => b.value - a.value);
  }, [people, entries, selected, tp]);

  const toggle = (k: PlanType) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });

  return (
    <div className="space-y-3">
      {typesPresent.length > 1 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("scoreFilter")}>
          {typesPresent.map((k) => (
            <button key={k} type="button" aria-pressed={selected.has(k)} onClick={() => toggle(k)} className={`chip ${selected.has(k) ? "" : "!bg-surface-2 !text-muted"}`}>
              {tp(`types.${k}`)}
            </button>
          ))}
          {selected.size < typesPresent.length && (
            <button type="button" className="text-xs text-primary hover:underline" onClick={() => setSelected(new Set(PLAN_TYPES))}>{t("selectAll")}</button>
          )}
        </div>
      )}
      <div className="card p-4">
        {items.length === 0 ? (
          <p className="py-4 text-center text-muted">{t("scoreNone")}</p>
        ) : (
          <BarList items={items} unit="minutes" tripCurrency="" ariaLabel={t("scoreboard")} />
        )}
      </div>
    </div>
  );
}

export { formatMinutes };
