// How "scheduled" a plan is — PURE.
//   full      start_at set (date + time known)
//   dateOnly  plan_date set, time not decided   -> shown in that day's "time TBD" section
//   timeOnly  plan_time set, date not decided   -> shown under "Unscheduled"
//   none      neither                           -> shown under "Unscheduled"
// Invariant kept by the server: start_at set => plan_date/plan_time null.
export type SchedFields = { start_at: string | null; plan_date: string | null; plan_time: string | null };
export type SchedState = "full" | "dateOnly" | "timeOnly" | "none";

export function schedState(p: SchedFields): SchedState {
  if (p.start_at) return "full";
  if (p.plan_date) return "dateOnly";
  if (p.plan_time) return "timeOnly";
  return "none";
}

/** Unscheduled = has no date (so it can't sit in a day column). */
export const isUnscheduled = (p: SchedFields) => schedState(p) === "timeOnly" || schedState(p) === "none";

export const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : null);

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

/** Normalise form input (empty string = not decided) into the three stored fields. `toUtc` converts trip-local "YYYY-MM-DDTHH:MM" to ISO. */
export function resolveSchedule(
  dateIn: string | null | undefined,
  timeIn: string | null | undefined,
  toUtc: (local: string) => string,
): SchedFields {
  const date = dateIn && DATE.test(dateIn) ? dateIn : null;
  const time = timeIn && TIME.test(timeIn) ? timeIn : null;
  if (date && time) return { start_at: toUtc(`${date}T${time}`), plan_date: null, plan_time: null };
  return { start_at: null, plan_date: date, plan_time: time };
}

/** Only same-origin trip paths are allowed as a "back" target. */
export function safeBack(tripId: string, raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const base = `/t/${tripId}`;
  if (!raw.startsWith(base) || raw.startsWith("//") || /[\r\n\\]/.test(raw)) return fallback;
  const rest = raw.slice(base.length);
  return rest === "" || /^[/?#]/.test(rest) ? raw : fallback;
}
