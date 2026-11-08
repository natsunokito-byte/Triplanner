// Commute stopovers — PURE. A commute's occupied time = travel + the sum of stay times at its stops.
export type Stop = { label: string; stay_min: number };
export const MAX_STOPS = 5;

export const totalStay = (stops: { stay_min: number }[]) => stops.reduce((s, x) => s + Math.max(0, x.stay_min || 0), 0);
export const occupiedMin = (travelMin: number, stops: { stay_min: number }[]) => (travelMin || 0) + totalStay(stops);

/** Legs to estimate for origin -> stop1 -> ... -> dest. Stops without a label are skipped. */
export function legsOf<T>(origin: T, stops: { label: string }[], dest: T, toPoint: (label: string) => T): [T, T][] {
  const pts = [origin, ...stops.filter((s) => s.label.trim()).map((s) => toPoint(s.label.trim())), dest];
  return pts.slice(0, -1).map((p, i) => [p, pts[i + 1]] as [T, T]);
}
