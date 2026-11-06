// Pure money / FX helpers (safe on server and client).
// "rate" everywhere means USD per 1 unit of the currency.

export type FxCtx = {
  tripCurrency: string;
  override: number | null; // trip.usd_rate_override: USD per 1 trip-currency unit, wins over market rate
  rates: Record<string, number>;
};

/** frozen = rate frozen on the day a plan was completed (always wins). */
export function usdPerUnit(ctx: FxCtx, currency: string, frozen?: number | null): number | null {
  if (frozen && frozen > 0) return frozen;
  if (currency === "USD") return 1;
  if (currency === ctx.tripCurrency && ctx.override && ctx.override > 0) return ctx.override;
  return ctx.rates[currency] ?? null;
}

export function toUsd(ctx: FxCtx, amount: number, currency: string, frozen?: number | null): number | null {
  const r = usdPerUnit(ctx, currency, frozen);
  return r == null ? null : amount * r;
}

/** Convert to the trip's main currency (via USD). null when a rate is missing. */
export function toTrip(ctx: FxCtx, amount: number, currency: string, frozen?: number | null): number | null {
  if (currency === ctx.tripCurrency && !frozen) return amount;
  const usd = toUsd(ctx, amount, currency, frozen);
  const tripRate = usdPerUnit(ctx, ctx.tripCurrency);
  return usd == null || !tripRate ? null : usd / tripRate;
}

export function fmtMoney(amount: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      currencyDisplay: currency === "USD" ? "symbol" : "code",
      minimumFractionDigits: currency === "USD" ? undefined : 0,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
