import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

type Db = SupabaseClient;
export type Rates = Record<string, number>; // currency -> USD per 1 unit

const fiat = (() => {
  try {
    return new Set((Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("currency"));
  } catch {
    return null;
  }
})();

async function getJson(urls: string[]): Promise<Record<string, unknown> | null> {
  for (const u of urls) {
    try {
      const res = await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (res.ok) return (await res.json()) as Record<string, unknown>;
    } catch {
      /* try next mirror */
    }
  }
  return null;
}

function invert(perUsd: Record<string, unknown>): Rates {
  const out: Rates = { USD: 1 };
  for (const [k, v] of Object.entries(perUsd)) {
    const c = k.toUpperCase();
    if (/^[A-Z]{3}$/.test(c) && (!fiat || fiat.has(c)) && typeof v === "number" && v > 0) out[c] = 1 / v;
  }
  return out;
}

/**
 * Daily rates. Primary: fawazahmed0 currency-api (~200 currencies incl. TWD, history from 2024-03-02, jsDelivr + Cloudflare mirror).
 * Fallback: Frankfurter (ECB, ~30 currencies, no TWD). `day` = "latest" or YYYY-MM-DD.
 */
export async function fetchRates(day: string): Promise<{ day: string; rates: Rates } | null> {
  const a = await getJson([
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${day}/v1/currencies/usd.min.json`,
    `https://${day}.currency-api.pages.dev/v1/currencies/usd.min.json`,
  ]);
  if (a?.usd && typeof a.usd === "object") {
    return { day: typeof a.date === "string" ? a.date : new Date().toISOString().slice(0, 10), rates: invert(a.usd as Record<string, unknown>) };
  }
  const b = await getJson([`https://api.frankfurter.dev/v1/${day}?base=USD`]);
  if (b?.rates && typeof b.rates === "object") {
    return { day: typeof b.date === "string" ? b.date : new Date().toISOString().slice(0, 10), rates: invert(b.rates as Record<string, unknown>) };
  }
  return null;
}

export async function persistRates(day: string, rates: Rates): Promise<number> {
  const admin = createAdminClient();
  if (!admin) return 0; // no service key: serve from memory only
  const rows = Object.entries(rates).map(([currency, usd_per_unit]) => ({ day, currency, usd_per_unit }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin.from("fx_rates").upsert(rows.slice(i, i + 500), { onConflict: "day,currency" });
    if (error) {
      console.error("fx upsert failed", error.message);
      return i;
    }
  }
  return rows.length;
}

const shift = (day: string, n: number) => new Date(Date.parse(day) + n * 86400000).toISOString().slice(0, 10);

/** Most recent stored rate per currency (≤10 days old); fetches + stores the latest set if any are missing. */
export async function getLatestRates(supabase: Db, currencies: string[]): Promise<Rates> {
  const need = [...new Set(currencies.filter((c) => /^[A-Z]{3}$/.test(c) && c !== "USD"))];
  const out: Rates = { USD: 1 };
  if (need.length === 0) return out;
  const since = shift(new Date().toISOString().slice(0, 10), -10);
  const { data } = await supabase
    .from("fx_rates").select("currency,day,usd_per_unit").in("currency", need).gte("day", since).order("day", { ascending: false });
  for (const r of data ?? []) if (!(r.currency in out)) out[r.currency] = Number(r.usd_per_unit);
  const missing = need.filter((c) => !(c in out));
  if (missing.length) {
    const f = await fetchRates("latest");
    if (f) {
      await persistRates(f.day, f.rates);
      for (const c of missing) if (f.rates[c]) out[c] = f.rates[c];
    }
  }
  return out;
}

/** Rate for a specific (trip-local) day, e.g. the day a plan was completed. Uses the nearest earlier stored day (≤5 days). */
export async function rateForDay(supabase: Db, currency: string, day: string): Promise<number | null> {
  if (currency === "USD") return 1;
  const today = new Date().toISOString().slice(0, 10);
  const target = day > today ? today : day;
  const { data } = await supabase
    .from("fx_rates").select("day,usd_per_unit").eq("currency", currency)
    .lte("day", target).gte("day", shift(target, -5)).order("day", { ascending: false }).limit(1);
  if (data?.[0]) return Number(data[0].usd_per_unit);
  const f = await fetchRates(target === today ? "latest" : target);
  if (!f) return null;
  await persistRates(f.day, f.rates);
  return f.rates[currency] ?? null;
}
