import test from "node:test";
import assert from "node:assert/strict";
import { buildIcs, buildInviteText, foldLine, icsEscape, type InvitePlan } from "../src/lib/invite";

const plan: InvitePlan = {
  id: "abc12345-0000", title: "Ramen, 晚餐; fun", type: "dinner", start_at: "2027-03-02T09:30:00Z", duration_min: 90,
  location_name: "一蘭 Shibuya", location_address: "1-2-3 Shibuya", link: "https://example.com/r", note: "line1\nline2",
};

test("ics: UTC times, end = start + duration, CRLF, escaped text", () => {
  const ics = buildIcs(plan, "zh-TW", Date.UTC(2027, 0, 1));
  assert.ok(ics.includes("DTSTART:20270302T093000Z"));
  assert.ok(ics.includes("DTEND:20270302T110000Z"));
  assert.ok(ics.includes("SUMMARY:Ramen\\, 晚餐\; fun"));
  assert.ok(ics.includes("UID:abc12345-0000@trip-planner"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.ok(!/[^\r]\n/.test(ics.replace(/\\n/g, "")), "only CRLF line breaks");
});

test("ics contains no cost or email", () => {
  const ics = buildIcs({ ...plan, ...{ cost: 5000, email: "a@b.c" } } as InvitePlan, "en");
  assert.ok(!ics.includes("5000") && !ics.includes("@b.c"));
});

test("folding: lines ≤75 octets, multibyte chars not split, unfolds back to original", () => {
  const long = "SUMMARY:" + "晚".repeat(60);
  const folded = foldLine(long);
  const enc = new TextEncoder();
  for (const l of folded.split("\r\n")) assert.ok(enc.encode(l).length <= 75, l);
  assert.equal(folded.replace(/\r\n /g, ""), long);
});

test("escape", () => assert.equal(icsEscape("a,b;c\\d\ne"), "a\\,b\;c\\\\d\\ne"));

test("invite text zh: trip-local time, place, recipient; en variant", () => {
  const zh = buildInviteText(plan, "Asia/Tokyo", "zh-TW", { recipient: "小明", tripTitle: "東京" });
  assert.ok(zh.startsWith("嗨 小明，"));
  assert.ok(zh.includes("18:30–20:00")); // 09:30Z = 18:30 JST
  assert.ok(zh.includes("一蘭 Shibuya — 1-2-3 Shibuya"));
  assert.ok(zh.includes("晚餐"));
  const en = buildInviteText(plan, "Asia/Tokyo", "en");
  assert.ok(en.startsWith("Hi,"));
  assert.ok(en.includes("Where: ") && en.includes("When: "));
});

test("invite text omits empty optional lines", () => {
  const t = buildInviteText({ ...plan, location_name: null, location_address: null, link: null, note: null }, "UTC", "en");
  assert.ok(!t.includes("Where") && !t.includes("Link") && !t.includes("Note"));
});
