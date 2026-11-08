// To-do grouping — PURE. Default grouping is by date: the to-do's own due date, else the date of the plan it belongs to.
export type DateInfo = { due_date: string | null; plan_id: string | null };

export const todoDate = (t: DateInfo, planDates: ReadonlyMap<string, string | null>): string | null =>
  t.due_date ?? (t.plan_id ? planDates.get(t.plan_id) ?? null : null);

/** Ascending dates, undated last. Order inside a group is kept. */
export function groupByDate<T>(items: T[], dateOf: (t: T) => string | null): { date: string | null; items: T[] }[] {
  const m = new Map<string | null, T[]>();
  for (const it of items) {
    const d = dateOf(it);
    m.set(d, [...(m.get(d) ?? []), it]);
  }
  return [...m.entries()]
    .sort(([a], [b]) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1))
    .map(([date, list]) => ({ date, items: list }));
}
