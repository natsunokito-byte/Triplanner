// Trip-local time helpers. All plan/hotel times are entered and shown in the trip's IANA timezone.

function offsetMs(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(date);
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** "YYYY-MM-DDTHH:mm" in `tz` -> UTC Date */
export function localToUtc(local: string, tz: string): Date {
  const [d, t] = local.split("T");
  const [y, m, dd] = d.split("-").map(Number);
  const [hh, mm] = t.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, dd, hh, mm);
  let utc = guess - offsetMs(new Date(guess), tz);
  const off2 = offsetMs(new Date(utc), tz);
  utc = guess - off2;
  return new Date(utc);
}

/** ISO instant -> "YYYY-MM-DDTHH:mm" in `tz` */
export function utcToLocal(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

export const localDate = (iso: string, tz: string) => utcToLocal(iso, tz).slice(0, 10);

export const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

export function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  const n = dayDiff(start, end);
  for (let i = 0; i <= n; i++) out.push(new Date(Date.parse(start) + i * 86400000).toISOString().slice(0, 10));
  return out;
}
