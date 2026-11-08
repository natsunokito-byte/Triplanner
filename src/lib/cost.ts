// Plan cost model — PURE. plans.cost stores the computed total of:
//   photographer_fee + studio_fee (cosplay only) + sum(items), where a per_hour item = amount x duration hours.
export type CostItem = { label: string; amount: number; per_hour: boolean };

export const hoursOf = (durationMin: number) => durationMin / 60;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function itemTotal(item: CostItem, durationMin: number): number {
  return round2(item.per_hour ? item.amount * hoursOf(durationMin) : item.amount);
}

/** Returns null when nothing was entered at all (so "no cost" stays distinct from "0"). */
export function planTotal(opts: {
  items: CostItem[];
  durationMin: number;
  photographerFee?: number | null;
  studioFee?: number | null;
}): number | null {
  const parts: number[] = [];
  if (opts.photographerFee != null) parts.push(opts.photographerFee);
  if (opts.studioFee != null) parts.push(opts.studioFee);
  for (const it of opts.items) parts.push(itemTotal(it, opts.durationMin));
  if (parts.length === 0) return null;
  return round2(parts.reduce((a, b) => a + b, 0));
}

/** Hours input -> minutes, snapped to 30-minute steps (min 30). */
export function hoursToMinutes(h: number): number {
  if (!Number.isFinite(h)) return NaN;
  return Math.max(30, Math.round((h * 60) / 30) * 30);
}

export const formatHours = (min: number) => {
  const h = min / 60;
  return Number.isInteger(h) ? String(h) : h.toFixed(1).replace(/\.0$/, "");
};
