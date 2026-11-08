import { test } from "node:test";
import assert from "node:assert/strict";
import { planTotal, itemTotal, hoursToMinutes, formatHours } from "../src/lib/cost";

test("no inputs -> null, zero stays 0", () => {
  assert.equal(planTotal({ items: [], durationMin: 60 }), null);
  assert.equal(planTotal({ items: [{ label: "a", amount: 0, per_hour: false }], durationMin: 60 }), 0);
});
test("sums fixed and per-hour items", () => {
  const t = planTotal({ items: [{ label: "ticket", amount: 1000, per_hour: false }, { label: "rental", amount: 500, per_hour: true }], durationMin: 150 });
  assert.equal(t, 2250);
});
test("cosplay: photographer + studio + items", () => {
  const t = planTotal({ items: [{ label: "props", amount: 300, per_hour: false }], durationMin: 120, photographerFee: 5000, studioFee: 2000 });
  assert.equal(t, 7300);
  assert.equal(planTotal({ items: [], durationMin: 60, photographerFee: 5000 }), 5000);
});
test("rounding to 2dp", () => {
  assert.equal(itemTotal({ label: "x", amount: 10.01, per_hour: true }, 90), 15.02);
});
test("hours input snaps to 30 min, min 30", () => {
  assert.equal(hoursToMinutes(1.5), 90);
  assert.equal(hoursToMinutes(0.1), 30);
  assert.equal(hoursToMinutes(2.2), 120);
  assert.ok(Number.isNaN(hoursToMinutes(NaN)));
  assert.equal(formatHours(90), "1.5");
  assert.equal(formatHours(120), "2");
});
