"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Money } from "./fx";

export type BarItem = {
  id: string;
  label: string;
  value: number; // money: in trip currency; minutes: duration
  details?: { label: string; value: number }[];
};

export function formatMinutes(min: number, t: (k: "hm" | "h" | "m", v: { h: number; m: number }) => string) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h && m) return t("hm", { h, m });
  if (h) return t("h", { h, m });
  return t("m", { h, m });
}

/**
 * Ranked horizontal bars, one hue. Spec: bars ≤24px, 4px rounded data-end / square baseline, 2px gap between rows,
 * value at the bar tip in text ink (never the series color), per-bar tooltip on hover AND keyboard focus, plus a table view.
 */
export function BarList({
  items, unit, tripCurrency, ariaLabel,
}: {
  items: BarItem[];
  unit: "money" | "minutes";
  tripCurrency: string;
  ariaLabel: string;
}) {
  const t = useTranslations("dash");
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(...items.map((i) => i.value), 0);

  const fmt = (v: number) =>
    unit === "money"
      ? <Money amount={v} currency={tripCurrency} />
      : <>{formatMinutes(v, (k, vars) => t(k, vars))}</>;

  return (
    <div>
      <ul aria-label={ariaLabel} className="flex flex-col gap-[2px]">
        {items.map((it) => {
          const pct = max > 0 ? (it.value / max) * 82 : 0; // leave room at the tip for the value label
          const on = active === it.id;
          return (
            <li
              key={it.id}
              tabIndex={0}
              onPointerEnter={() => setActive(it.id)}
              onPointerLeave={() => setActive((a) => (a === it.id ? null : a))}
              onFocus={() => setActive(it.id)}
              onBlur={() => setActive((a) => (a === it.id ? null : a))}
              className={`relative grid grid-cols-[minmax(6rem,11rem)_1fr] items-center gap-3 rounded-md px-1 py-[3px] outline-none focus-visible:ring-2 focus-visible:ring-primary ${on ? "bg-surface-2" : ""}`}
            >
              <span className="truncate text-[13px] text-text" title={it.label}>{it.label}</span>
              <div className="flex h-6 items-center">
                <div
                  className="h-6 rounded-r-[4px] bg-primary transition-[filter]"
                  style={{ width: `${pct}%`, minWidth: it.value > 0 ? 4 : 0, filter: on ? "brightness(1.12)" : undefined }}
                />
                <span className="ml-2 text-[13px] font-medium tabular-nums text-text">{fmt(it.value)}</span>
              </div>

              {on && it.details && it.details.length > 0 && (
                <div role="tooltip" className="card pointer-events-none absolute left-[11.75rem] top-full z-20 mt-1 min-w-[12rem] p-3" style={{ boxShadow: "var(--shadow-2)" }}>
                  <div className="text-xs text-muted">{it.label}</div>
                  <div className="mb-1 text-base font-semibold tabular-nums">{fmt(it.value)}</div>
                  <ul className="space-y-0.5">
                    {it.details.map((d) => (
                      <li key={d.label} className="flex justify-between gap-4 text-xs">
                        <span className="text-muted">{d.label}</span>
                        <span className="font-medium tabular-nums">{fmt(d.value)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-muted hover:text-text">{t("table")}</summary>
        <table className="mt-2 w-full">
          <thead>
            <tr className="text-left text-muted"><th className="py-1 font-medium">{t("colName")}</th><th className="py-1 text-right font-medium">{t("colValue")}</th></tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-t border-border"><td className="py-1">{it.label}</td><td className="py-1 text-right tabular-nums">{fmt(it.value)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
