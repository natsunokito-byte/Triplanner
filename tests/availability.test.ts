import test from "node:test";
import assert from "node:assert/strict";
import { computeFreeSlots, fitsInSlot, mergeIntervals, startOptions, maxDurationMin, type AvailabilityInput } from "../src/lib/availability";
import { localToUtc } from "../src/lib/tz";

const H = 3600_000;
const u = (local: string, tz = "Asia/Tokyo") => localToUtc(local, tz).getTime();
const base = (over: Partial<AvailabilityInput> = {}): AvailabilityInput => ({
  tz: "Asia/Tokyo", days: ["2027-03-02"], windowStart: "09:00", windowEnd: "22:00", bufferMin: 0, minNoticeHours: 0,
  now: u("2027-03-01T00:00"), busy: [], ...over,
});
const fmt = (s: { start: number; end: number }, tz = "Asia/Tokyo") =>
  `${new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz }).format(s.start)}-${new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz }).format(s.end)}`;
const show = (i: AvailabilityInput) => computeFreeSlots(i).map((s) => fmt(s, i.tz));

test("empty day = whole window", () => assert.deepEqual(show(base()), ["09:00-22:00"]));

test("busy block splits the day; buffer pads both sides", () => {
  const busy = [{ start: u("2027-03-02T12:00"), end: u("2027-03-02T14:00") }];
  assert.deepEqual(show(base({ busy })), ["09:00-12:00", "14:00-22:00"]);
  assert.deepEqual(show(base({ busy, bufferMin: 30 })), ["09:00-11:30", "14:30-22:00"]);
});

test("gaps under 30 min vanish; buffers that overlap merge", () => {
  const busy = [{ start: u("2027-03-02T12:00"), end: u("2027-03-02T13:00") }, { start: u("2027-03-02T13:20"), end: u("2027-03-02T15:00") }];
  assert.deepEqual(show(base({ busy })), ["09:00-12:00", "15:00-22:00"]); // 13:00–13:20 is only 20 min → dropped
});

test("with a 30 min buffer, a 50 min gap between two busy blocks disappears", () => {
  const busy = [{ start: u("2027-03-02T12:00"), end: u("2027-03-02T13:00") }, { start: u("2027-03-02T13:50"), end: u("2027-03-02T15:00") }];
  assert.deepEqual(show(base({ busy, bufferMin: 30 })), ["09:00-11:30", "15:30-22:00"]);
});

test("exactly 30 min slot is kept, 29 min is dropped", () => {
  const ok = [{ start: u("2027-03-02T09:30"), end: u("2027-03-02T21:30") }];
  assert.deepEqual(show(base({ busy: ok })), ["09:00-09:30", "21:30-22:00"]);
  const tiny = [{ start: u("2027-03-02T09:29"), end: u("2027-03-02T21:31") }];
  assert.deepEqual(show(base({ busy: tiny })), []);
});

test("busy spanning midnight blocks the next morning", () => {
  const busy = [{ start: u("2027-03-02T20:00"), end: u("2027-03-03T10:00") }];
  const i = base({ days: ["2027-03-02", "2027-03-03"], busy });
  assert.deepEqual(show(i), ["09:00-20:00", "10:00-22:00"]);
});

test("past time and minimum notice are not offered", () => {
  const now = u("2027-03-02T10:10");
  assert.deepEqual(show(base({ now })), ["10:10-22:00"]);
  assert.deepEqual(show(base({ now, minNoticeHours: 2 })), ["12:10-22:00"]);
  assert.deepEqual(show(base({ now: u("2027-03-02T23:00") })), []);
});

test("window end 24:00 reaches local midnight", () => {
  assert.deepEqual(show(base({ windowEnd: "24:00" })), ["09:00-00:00"]);
});

test("DST: America/New_York spring-forward day has a 23h calendar day but window is wall-clock", () => {
  const tz = "America/New_York";
  const i = base({ tz, days: ["2027-03-14"], windowStart: "00:00", windowEnd: "24:00", now: u("2027-03-10T00:00", tz) });
  const [s] = computeFreeSlots(i);
  assert.equal((s.end - s.start) / H, 23);
  const fall = base({ tz, days: ["2027-11-07"], windowStart: "00:00", windowEnd: "24:00", now: u("2027-11-01T00:00", tz) });
  const [f] = computeFreeSlots(fall);
  assert.equal((f.end - f.start) / H, 25);
});

test("fitsInSlot / startOptions / maxDurationMin", () => {
  const slots = computeFreeSlots(base({ busy: [{ start: u("2027-03-02T12:00"), end: u("2027-03-02T14:00") }] }));
  assert.ok(fitsInSlot(slots, u("2027-03-02T10:00"), 120));
  assert.ok(!fitsInSlot(slots, u("2027-03-02T11:00"), 120), "overlaps busy");
  assert.ok(!fitsInSlot(slots, u("2027-03-02T10:00"), 29), "under 30 min");
  assert.ok(!fitsInSlot(slots, u("2027-03-02T08:30"), 60), "before window");
  const opts = startOptions(slots[0]).map((t) => fmt({ start: t, end: t }).slice(0, 5));
  assert.equal(opts[0], "09:00");
  assert.equal(opts.at(-1), "11:30");
  assert.equal(maxDurationMin(slots[0], u("2027-03-02T10:00")), 120);
  assert.equal(maxDurationMin(slots[1], u("2027-03-02T14:00")), 480); // capped
});

test("mergeIntervals", () => {
  assert.deepEqual(mergeIntervals([{ start: 5, end: 8 }, { start: 1, end: 3 }, { start: 3, end: 4 }, { start: 7, end: 9 }, { start: 2, end: 2 }]), [{ start: 1, end: 4 }, { start: 5, end: 9 }]);
});
