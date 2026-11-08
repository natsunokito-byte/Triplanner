import { test } from "node:test";
import assert from "node:assert/strict";
import { groupByDate, todoDate } from "../src/lib/todo-groups";

test("own due date wins, else the plan's date, else none", () => {
  const pd = new Map<string, string | null>([["p1", "2026-11-09"], ["p2", null]]);
  assert.equal(todoDate({ due_date: "2026-11-08", plan_id: "p1" }, pd), "2026-11-08");
  assert.equal(todoDate({ due_date: null, plan_id: "p1" }, pd), "2026-11-09");
  assert.equal(todoDate({ due_date: null, plan_id: "p2" }, pd), null);
  assert.equal(todoDate({ due_date: null, plan_id: null }, pd), null);
});
test("groups ascend by date with undated last, keeping inner order", () => {
  const items = [
    { id: "a", d: null }, { id: "b", d: "2026-11-10" }, { id: "c", d: "2026-11-08" }, { id: "d", d: "2026-11-10" },
  ];
  const g = groupByDate(items, (x) => x.d);
  assert.deepEqual(g.map((x) => x.date), ["2026-11-08", "2026-11-10", null]);
  assert.deepEqual(g[1].items.map((x) => x.id), ["b", "d"]);
});
