// Free-time computation for "Make a plan" — PURE. All inputs are UTC ms; days/window are trip-local.
import { localToUtc } from "./tz";

export const MIN_SLOT_MIN = 30;
const MIN = 60_000;

export type Interval = { start: number; end: number };
export type FreeSlot = Interval & { day: string };

export type AvailabilityInput = {
  tz: string;
  days: string[];                // YYYY-MM-DD, trip-local
  windowStart: string;           // "09:00" (HH:MM or HH:MM:SS), trip-local
  windowEnd: string;             // "22:00"; "24:00" or "00:00" means end of day
  bufferMin: number;             // padding added before AND after every busy interval
  minNoticeHours: number;
  now: number;
  busy: Interval[];              // raw busy intervals (plans, commutes, blocks, hotel check-in/out)
};

const hhmm = (s: string) => s.slice(0, 5);

/** Merge overlapping/adjacent intervals. */
export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

export function dayWindow(tz: string, day: string, windowStart: string, windowEnd: string): Interval {
  const start = localToUtc(`${day}T${hhmm(windowStart)}`, tz).getTime();
  const e = hhmm(windowEnd);
  let end: number;
  if (e === "24:00" || e === "00:00") {
    const next = new Date(Date.parse(`${day}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    end = localToUtc(`${next}T00:00`, tz).getTime();
  } else {
    end = localToUtc(`${day}T${e}`, tz).getTime();
  }
  return { start, end };
}

/** Free slots (≥30 min), per trip-local day. Busy time is padded by the buffer; past and "too soon" time is not offered. */
export function computeFreeSlots(inp: AvailabilityInput): FreeSlot[] {
  const pad = inp.bufferMin * MIN;
  const busy = mergeIntervals(inp.busy.map((b) => ({ start: b.start - pad, end: b.end + pad })));
  const earliest = inp.now + inp.minNoticeHours * 3600_000;
  const out: FreeSlot[] = [];
  for (const day of inp.days) {
    const w = dayWindow(inp.tz, day, inp.windowStart, inp.windowEnd);
    let cursor = Math.max(w.start, earliest);
    if (cursor >= w.end) continue;
    for (const b of busy) {
      if (b.end <= cursor) continue;
      if (b.start >= w.end) break;
      if (b.start > cursor) push(out, day, cursor, Math.min(b.start, w.end));
      cursor = Math.max(cursor, b.end);
      if (cursor >= w.end) break;
    }
    if (cursor < w.end) push(out, day, cursor, w.end);
  }
  return out;
}

function push(out: FreeSlot[], day: string, start: number, end: number) {
  if (end - start >= MIN_SLOT_MIN * MIN) out.push({ day, start, end });
}

/** Is [start, start+durationMin] fully inside one free slot? (Used server-side on submit AND again on accept.) */
export function fitsInSlot(slots: Interval[], start: number, durationMin: number): boolean {
  if (durationMin < MIN_SLOT_MIN) return false;
  const end = start + durationMin * MIN;
  return slots.some((s) => start >= s.start && end <= s.end);
}

/** Round a slot's start up to the next :00/:30 so offered start times are tidy. */
export function snapUp(ms: number, stepMin = 30): number {
  const step = stepMin * MIN;
  return Math.ceil(ms / step) * step;
}

/** Start times (every 30 min, local-clock aligned in UTC since all real offsets are multiples of 15–30 min) that leave ≥30 min. */
export function startOptions(slot: Interval, stepMin = 30): number[] {
  const out: number[] = [];
  for (let t = snapUp(slot.start, stepMin); t + MIN_SLOT_MIN * MIN <= slot.end; t += stepMin * MIN) out.push(t);
  return out;
}

export function maxDurationMin(slot: Interval, start: number, stepMin = 30, capMin = 480): number {
  const room = Math.floor((slot.end - start) / MIN / stepMin) * stepMin;
  return Math.min(room, capMin);
}
