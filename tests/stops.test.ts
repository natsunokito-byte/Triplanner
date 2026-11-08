import { test } from "node:test";
import assert from "node:assert/strict";
import { legsOf, occupiedMin, totalStay } from "../src/lib/stops";

test("occupied time adds stays", () => {
  assert.equal(totalStay([{ stay_min: 20 }, { stay_min: 45 }]), 65);
  assert.equal(occupiedMin(30, [{ stay_min: 20 }, { stay_min: 45 }]), 95);
  assert.equal(occupiedMin(30, []), 30);
  assert.equal(totalStay([{ stay_min: -5 }]), 0);
});
test("legs chain origin -> stops -> dest, skipping blank stops", () => {
  const legs = legsOf("A", [{ label: "x" }, { label: "  " }, { label: "y" }], "B", (l) => l);
  assert.deepEqual(legs, [["A", "x"], ["x", "y"], ["y", "B"]]);
  assert.deepEqual(legsOf("A", [], "B", (l) => l), [["A", "B"]]);
});
