"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { fmtMoney, toUsd, usdPerUnit, type FxCtx } from "@/lib/money";

type Value = { ctx: FxCtx; showUsd: boolean; setShowUsd: (b: boolean) => void };
const Ctx = createContext<Value | null>(null);

export function FxProvider({ ctx, children }: { ctx: FxCtx; children: React.ReactNode }) {
  const [showUsd, setShowUsd] = useState(false);
  return <Ctx.Provider value={{ ctx, showUsd, setShowUsd }}>{children}</Ctx.Provider>;
}

export const useFx = () => useContext(Ctx);

/** Segmented "TWD | USD" switch — flips every <Money> under the provider. */
export function CurrencyToggle() {
  const fx = useFx();
  const t = useTranslations("fx");
  if (!fx || fx.ctx.tripCurrency === "USD") return null;
  const opt = (on: boolean, label: string, value: boolean) => (
    <button
      type="button"
      role="radio"
      aria-checked={fx.showUsd === value}
      onClick={() => fx.setShowUsd(value)}
      className={`h-7 px-3 text-xs font-medium transition-colors ${on ? "bg-primary text-white" : "bg-surface text-muted hover:text-text"}`}
    >
      {label}
    </button>
  );
  return (
    <div role="radiogroup" aria-label={t("showIn")} className="inline-flex overflow-hidden rounded-full border border-border">
      {opt(!fx.showUsd, fx.ctx.tripCurrency, false)}
      {opt(fx.showUsd, "USD", true)}
    </div>
  );
}

/** Amount in its own currency, or "≈ US$…" when the toggle is on. `frozen` = rate frozen at plan completion. */
export function Money({ amount, currency, frozen }: { amount: number; currency?: string | null; frozen?: number | null }) {
  const fx = useFx();
  const locale = useLocale();
  const cur = currency || fx?.ctx.tripCurrency || "USD";
  if (fx?.showUsd && cur !== "USD") {
    const usd = toUsd(fx.ctx, amount, cur, frozen);
    if (usd != null) return <>≈ {fmtMoney(usd, "USD", locale)}</>;
  }
  return <>{fmtMoney(amount, cur, locale)}</>;
}

// ── live USD hint for forms (no provider needed) ──
const cache = new Map<string, Promise<number | null>>();
function marketRate(cur: string): Promise<number | null> {
  if (!cache.has(cur)) {
    cache.set(
      cur,
      fetch(`/api/fx?c=${cur}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => (j?.rates?.[cur] as number | undefined) ?? null)
        .catch(() => null),
    );
  }
  return cache.get(cur)!;
}

export function UsdHint({ amount, currency }: { amount: number | null; currency: string }) {
  const locale = useLocale();
  const [rate, setRate] = useState<number | null>(null);
  const valid = /^[A-Z]{3}$/.test(currency) && currency !== "USD";
  useEffect(() => {
    let alive = true;
    if (valid) marketRate(currency).then((r) => alive && setRate(r));
    return () => { alive = false; };
  }, [currency, valid]);
  if (!valid || !amount || amount <= 0 || !rate) return null;
  return <p className="mt-1 text-xs text-muted">≈ {fmtMoney(amount * rate, "USD", locale)}</p>;
}

export { usdPerUnit };

export function CostFields({
  amountName, currencyName, defaultAmount, defaultCurrency, costLabel, currencyLabel,
}: {
  amountName: string; currencyName: string; defaultAmount: number | null; defaultCurrency: string; costLabel: string; currencyLabel: string;
}) {
  const [amt, setAmt] = useState(defaultAmount != null ? String(defaultAmount) : "");
  const [cur, setCur] = useState(defaultCurrency);
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="col-span-2">
        <label className="label" htmlFor={amountName}>{costLabel}</label>
        <input id={amountName} name={amountName} type="number" min="0" step="0.01" className="input" value={amt} onChange={(e) => setAmt(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor={currencyName}>{currencyLabel}</label>
        <input id={currencyName} name={currencyName} className="input uppercase" maxLength={3} value={cur} onChange={(e) => setCur(e.target.value.toUpperCase())} />
      </div>
      <div className="col-span-3 -mt-2"><UsdHint amount={amt === "" ? null : Number(amt)} currency={cur} /></div>
    </div>
  );
}
