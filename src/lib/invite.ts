// Invite text + .ics — PURE. Never includes cost, emails, or other participants' emails.
import { localDate, utcToLocal } from "./tz";

export type InviteLocale = "zh-TW" | "en";
export type InvitePlan = {
  id: string; title: string; type: string; start_at: string; duration_min: number;
  location_name: string | null; location_address: string | null; link: string | null; note: string | null;
};

export const TYPE_LABEL: Record<InviteLocale, Record<string, string>> = {
  "zh-TW": { breakfast: "早餐", lunch: "午餐", dinner: "晚餐", tea: "下午茶", workshop: "工作坊", cosplay_photoshoot: "Cosplay 拍攝", date: "約會", hangout: "聚會", event: "活動", task: "任務", wake_up: "起床" },
  en: { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", tea: "Tea", workshop: "Workshop", cosplay_photoshoot: "Cosplay photoshoot", date: "Date", hangout: "Hangout", event: "Event", task: "Task", wake_up: "Wake up" },
};

const pad = (n: number) => String(n).padStart(2, "0");

/** "2027-03-02" + minutes -> local clock like "14:30" in the trip timezone. */
const clock = (iso: string, tz: string) => utcToLocal(iso, tz).slice(11, 16);

export function buildInviteText(plan: InvitePlan, tz: string, locale: InviteLocale, opts: { recipient?: string; tripTitle?: string } = {}): string {
  const startMs = Date.parse(plan.start_at);
  const endIso = new Date(startMs + plan.duration_min * 60000).toISOString();
  const day = localDate(plan.start_at, tz);
  const dateStr = new Intl.DateTimeFormat(locale, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
  const when = `${dateStr} ${clock(plan.start_at, tz)}–${clock(endIso, tz)} (${tz})`;
  const where = [plan.location_name, plan.location_address].filter(Boolean).join(" — ");
  const label = TYPE_LABEL[locale][plan.type] ?? plan.type;
  const zh = locale === "zh-TW";
  const lines: string[] = [];
  lines.push(opts.recipient ? (zh ? `嗨 ${opts.recipient}，` : `Hi ${opts.recipient},`) : zh ? "嗨，" : "Hi,");
  lines.push(zh ? `想邀你一起參加${opts.tripTitle ? `「${opts.tripTitle}」的` : ""}${label}：${plan.title}` : `I'd love to invite you to ${label.toLowerCase()}: ${plan.title}${opts.tripTitle ? ` (${opts.tripTitle})` : ""}`);
  lines.push("");
  lines.push(`${zh ? "時間" : "When"}：${when}`.replace("：", zh ? "：" : ": "));
  if (where) lines.push(`${zh ? "地點" : "Where"}${zh ? "：" : ": "}${where}`);
  if (plan.link) lines.push(`${zh ? "連結" : "Link"}${zh ? "：" : ": "}${plan.link}`);
  if (plan.note) lines.push(`${zh ? "備註" : "Note"}${zh ? "：" : ": "}${plan.note}`);
  lines.push("");
  lines.push(zh ? "方便的話回覆我一聲，謝謝！" : "Let me know if you can make it. Thanks!");
  return lines.join("\n");
}

// ── iCalendar ──
const icsDate = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
};
export const icsEscape = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Fold at 75 octets (RFC 5545 §3.1) without splitting a UTF-8 character. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > limit) { out.push(cur); cur = ""; bytes = 0; limit = 74; } // continuation lines start with a space
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function buildIcs(plan: InvitePlan, locale: InviteLocale, now = Date.now(), host = "trip-planner"): string {
  const start = Date.parse(plan.start_at);
  const where = [plan.location_name, plan.location_address].filter(Boolean).join(", ");
  const desc = [plan.note, plan.link].filter(Boolean).join("\n");
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//${host}//Trip Planner//${locale === "en" ? "EN" : "ZH"}`, "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${plan.id}@${host}`,
    `DTSTAMP:${icsDate(now)}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(start + plan.duration_min * 60000)}`,
    `SUMMARY:${icsEscape(plan.title)}`,
    ...(where ? [`LOCATION:${icsEscape(where)}`] : []),
    ...(desc ? [`DESCRIPTION:${icsEscape(desc)}`] : []),
    "END:VEVENT", "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
