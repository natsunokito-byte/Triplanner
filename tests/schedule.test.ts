import { test } from "node:test";
import assert from "node:assert/strict";
import { schedState, isUnscheduled, resolveSchedule, safeBack } from "../src/lib/schedule";

const iso = (l: string) => `ISO(${l})`;

test("state matrix", () => {
  assert.equal(schedState({ start_at: "x", plan_date: null, plan_time: null }), "full");
  assert.equal(schedState({ start_at: null, plan_date: "2026-11-08", plan_time: null }), "dateOnly");
  assert.equal(schedState({ start_at: null, plan_date: null, plan_time: "19:00:00" }), "timeOnly");
  assert.equal(schedState({ start_at: null, plan_date: null, plan_time: null }), "none");
  assert.equal(isUnscheduled({ start_at: null, plan_date: "2026-11-08", plan_time: null }), false);
  assert.equal(isUnscheduled({ start_at: null, plan_date: null, plan_time: "19:00" }), true);
});
test("resolveSchedule keeps the invariant", () => {
  assert.deepEqual(resolveSchedule("2026-11-08", "19:00", iso), { start_at: "ISO(2026-11-08T19:00)", plan_date: null, plan_time: null });
  assert.deepEqual(resolveSchedule("2026-11-08", "", iso), { start_at: null, plan_date: "2026-11-08", plan_time: null });
  assert.deepEqual(resolveSchedule("", "19:00", iso), { start_at: null, plan_date: null, plan_time: "19:00" });
  assert.deepEqual(resolveSchedule("", "", iso), { start_at: null, plan_date: null, plan_time: null });
  assert.deepEqual(resolveSchedule("garbage", "25", iso), { start_at: null, plan_date: null, plan_time: null });
});
test("safeBack only allows this trip's paths", () => {
  const id = "abc";
  assert.equal(safeBack(id, "/t/abc/plans?types=dinner", "/f"), "/t/abc/plans?types=dinner");
  assert.equal(safeBack(id, "/t/abc", "/f"), "/t/abc");
  assert.equal(safeBack(id, "/t/abcdef/plans", "/f"), "/f");
  assert.equal(safeBack(id, "https://evil.com", "/f"), "/f");
  assert.equal(safeBack(id, "//evil.com", "/f"), "/f");
  assert.equal(safeBack(id, "/t/abc/\\evil", "/f"), "/f");
  assert.equal(safeBack(id, undefined, "/f"), "/f");
});

import { placeStart } from "../src/lib/reorder";
test("placeStart: after a plan, first slot, empty day", () => {
  const H = 3600000;
  const others = [{ id: "a", startMs: 9 * H, endMs: 10 * H }, { id: "b", startMs: 12 * H, endMs: 13 * H }];
  assert.equal(placeStart({ others, index: 1, durationMs: H, travelMin: () => 30 }), 10.5 * H);
  assert.equal(placeStart({ others, index: 2, durationMs: H, travelMin: () => 0 }), 13 * H);
  assert.equal(placeStart({ others, index: 0, durationMs: 2 * H, travelMin: () => 0 }), 7 * H);
  assert.equal(placeStart({ others, index: 0, durationMs: 2 * H, travelMin: () => 0, floorMs: 8 * H }), 8 * H);
  assert.equal(placeStart({ others: [], index: 0, durationMs: H, travelMin: () => 0 }), null);
});
