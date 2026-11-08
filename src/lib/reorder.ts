// Drag-to-reorder timing — PURE. `others` = the day's scheduled plans WITHOUT the dragged one, sorted by start.
export type Slot = { id: string; startMs: number; endMs: number };

/**
 * New start time (ms) for a plan dropped at `index` among `others`.
 *  - after a plan: right when that plan ends, plus the travel time to get there (minutes)
 *  - first in the day: ends exactly when the current first plan starts, but never earlier than `floorMs` (wake-up time)
 */
export function placeStart(opts: {
  others: Slot[];
  index: number;
  durationMs: number;
  travelMin: (prevId: string) => number;
  floorMs?: number | null;
}): number | null {
  const { others, index } = opts;
  if (others.length === 0) return null;
  if (index <= 0) {
    const candidate = others[0].startMs - opts.durationMs;
    return opts.floorMs != null ? Math.max(candidate, opts.floorMs) : candidate;
  }
  const prev = others[Math.min(index, others.length) - 1];
  return prev.endMs + opts.travelMin(prev.id) * 60000;
}
