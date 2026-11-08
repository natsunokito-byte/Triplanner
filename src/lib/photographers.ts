// Photographer fee lookup — PURE.
export type Photographer = { id: string; name: string; rate_1h: number | null; rate_2h: number | null };

/** Under 2 hours -> the 1-hour fee; 2 hours or more -> the 2-hour fee. A missing tier is an error (e.g. HC has no 1-hour option). */
export function photographerFee(p: Pick<Photographer, "rate_1h" | "rate_2h">, durationMin: number): { fee: number } | { error: "min2h" | "min1h" } {
  if (durationMin >= 120) return p.rate_2h != null ? { fee: p.rate_2h } : { error: "min1h" };
  return p.rate_1h != null ? { fee: p.rate_1h } : { error: "min2h" };
}

/** Supabase numeric columns arrive as strings; normalise a DB result into Photographer[]. */
export function toPhotographers(rows: { id: string; name: string; rate_1h: number | string | null; rate_2h: number | string | null }[] | null): Photographer[] {
  return (rows ?? []).map((r) => ({ id: r.id, name: r.name, rate_1h: r.rate_1h == null ? null : Number(r.rate_1h), rate_2h: r.rate_2h == null ? null : Number(r.rate_2h) }));
}
