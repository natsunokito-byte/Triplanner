import test from "node:test";
import assert from "node:assert/strict";
import { shapeForViewer, canSeePlan, type RawInput, type Viewer } from "../src/lib/viewer-access";

const plan = (id: string, visibility: "normal" | "participants_only" | "owner_only", extra = {}) => ({
  id, type: "hangout", title: `plan-${id}`, location_name: "Somewhere", location_address: null, start_at: "2027-03-02T03:00:00Z",
  duration_min: 60, cost: 1000, cost_currency: null, usd_per_unit_at_completion: 0.03, link: null, note: "n", character_name: null,
  visibility, completed: true, ...extra,
});

const raw = (over: Partial<RawInput> = {}): RawInput => ({
  trip: { title: "Tokyo", start_date: "2027-03-01", end_date: "2027-03-05", timezone: "Asia/Tokyo", currency: "JPY", destinations: [], viewers_see_costs: true, usd_rate_override: 0.0065 },
  plans: [plan("A", "normal"), plan("B", "normal"), plan("C", "participants_only"), plan("D", "owner_only"), plan("E", "normal")],
  // A: ann+bob, B: bob only, C: ann+bob (participants_only), D: ann (owner_only, shouldn't exist but must still be hidden), E: nobody
  planPeople: [
    { plan_id: "A", person_id: "ann" }, { plan_id: "A", person_id: "bob" },
    { plan_id: "B", person_id: "bob" },
    { plan_id: "C", person_id: "ann" }, { plan_id: "C", person_id: "bob" },
    { plan_id: "D", person_id: "ann" },
  ],
  people: [
    { id: "me", name: "Owner", color: null, is_me: true }, { id: "ann", name: "Ann", color: null, is_me: false },
    { id: "bob", name: "Bob", color: null, is_me: false }, { id: "zed", name: "Zed", color: null, is_me: false },
  ],
  hotels: [{ id: "H", name: "Hotel", address: "1-2-3 Secret St", booking_status: "confirmed", check_in: "2027-03-01T06:00:00Z", check_out: "2027-03-03T02:00:00Z", cost: 50000, cost_currency: null }],
  commutes: [
    { id: "c1", from_plan_id: "A", to_plan_id: "B", method: "subway", start_at: "2027-03-02T04:00:00Z", duration_min: 10, cost: 200, cost_currency: null },
    { id: "c2", from_plan_id: "A", to_plan_id: "D", method: "taxi", start_at: "2027-03-02T05:00:00Z", duration_min: 10, cost: 900, cost_currency: null },
  ],
  photos: [
    { id: "p1", plan_id: "A", storage_path: "t/A/1.jpg" }, { id: "p2", plan_id: "B", storage_path: "t/B/1.jpg" },
    { id: "p3", plan_id: "D", storage_path: "t/D/1.jpg" }, { id: "p4", plan_id: "E", storage_path: "t/E/1.jpg" },
  ],
  ...over,
});

const ids = (d: ReturnType<typeof shapeForViewer>) => d.plans.map((p) => p.id).sort().join("");
const ann: Viewer = { personId: "ann", role: "restricted" };
const bob: Viewer = { personId: "bob", role: "restricted" };
const zedRestricted: Viewer = { personId: "zed", role: "restricted" };
const zedFull: Viewer = { personId: "zed", role: "full" };
const annFull: Viewer = { personId: "ann", role: "full" };

test("owner_only plans are invisible to everyone, including full viewers who are listed on them", () => {
  for (const v of [ann, bob, zedRestricted, zedFull, annFull]) {
    for (const mode of ["mine", "all"]) assert.ok(!shapeForViewer(raw(), v, mode).plans.some((p) => p.id === "D"), `${v.role}/${v.personId}/${mode}`);
  }
});

test("restricted viewer sees only plans they are on (normal + participants_only)", () => {
  assert.equal(ids(shapeForViewer(raw(), ann)), "AC");
  assert.equal(ids(shapeForViewer(raw(), bob)), "ABC");
  assert.equal(ids(shapeForViewer(raw(), zedRestricted)), "");
});

test("restricted viewer cannot escalate with ?view=all", () => {
  assert.equal(shapeForViewer(raw(), ann, "all").mode, "mine");
  assert.equal(ids(shapeForViewer(raw(), ann, "all")), "AC");
});

test("full viewer: all normal plans, but participants_only only if they are on it", () => {
  assert.equal(ids(shapeForViewer(raw(), zedFull)), "ABE"); // not C (participants_only, zed not on it), not D
  assert.equal(ids(shapeForViewer(raw(), annFull)), "ABCE");
});

test("full viewer in 'mine' mode behaves like a restricted viewer for plans and loses hotels/commutes", () => {
  const d = shapeForViewer(raw(), annFull, "mine");
  assert.equal(d.mode, "mine");
  assert.equal(ids(d), "AC");
  assert.equal(d.hotels.length, 0);
  assert.equal(d.commutes.length, 0);
});

test("hotels and commutes: restricted never; full(all) yes — but commutes touching hidden plans are dropped", () => {
  const r = shapeForViewer(raw(), bob);
  assert.equal(r.hotels.length, 0);
  assert.equal(r.commutes.length, 0);
  const f = shapeForViewer(raw(), zedFull);
  assert.equal(f.hotels.length, 1);
  assert.deepEqual(f.commutes.map((c) => c.id), ["c1"]); // c2 touches owner_only D
});

test("costs: restricted never see any cost; full only when viewers_see_costs", () => {
  const r = shapeForViewer(raw(), bob);
  assert.ok(r.plans.every((p) => p.cost === null && p.cost_currency === null && p.usd_frozen === null));
  assert.equal(r.trip.usd_rate_override, null);
  const off = shapeForViewer(raw({ trip: { ...raw().trip, viewers_see_costs: false } }), zedFull);
  assert.ok(off.plans.every((p) => p.cost === null && p.usd_frozen === null));
  assert.ok(off.hotels.every((h) => h.cost === null));
  assert.ok(off.commutes.every((c) => c.cost === null));
  assert.equal(off.canSeeCosts, false);
  const on = shapeForViewer(raw(), zedFull);
  assert.equal(on.canSeeCosts, true);
  assert.equal(on.plans[0].cost, 1000);
  assert.equal(on.hotels[0].cost, 50000);
});

test("photos only for visible plans", () => {
  assert.deepEqual(shapeForViewer(raw(), ann).photos.map((p) => p.id), ["p1"]);
  assert.deepEqual(shapeForViewer(raw(), zedFull).photos.map((p) => p.id).sort(), ["p1", "p2", "p4"]);
});

test("participants are exposed by name only; nothing in the payload looks like an email", () => {
  const withEmails = raw({ people: raw().people.map((p) => ({ ...p, email: `${p.id}@example.com` })) as RawInput["people"] });
  for (const v of [ann, zedFull]) {
    const json = JSON.stringify(shapeForViewer(withEmails, v));
    assert.ok(!json.includes("@"), "no @ anywhere");
    assert.ok(!json.includes("email"), "no email field");
  }
  const d = shapeForViewer(raw(), ann);
  assert.deepEqual(d.plans.find((p) => p.id === "A")!.people.map((x) => x.name).sort(), ["Ann", "Bob"]);
});

test("visibility flag itself is not sent to the viewer", () => {
  const json = JSON.stringify(shapeForViewer(raw(), annFull));
  assert.ok(!json.includes("participants_only") && !json.includes("owner_only"));
});

test("canSeePlan truth table", () => {
  const cases: [Parameters<typeof canSeePlan>[0], string[], Viewer, "mine" | "all", boolean][] = [
    ["normal", [], zedFull, "all", true],
    ["normal", [], zedFull, "mine", false],
    ["normal", [], zedRestricted, "all", false],
    ["normal", ["zed"], zedRestricted, "mine", true],
    ["participants_only", [], zedFull, "all", false],
    ["participants_only", ["zed"], zedFull, "all", true],
    ["participants_only", ["zed"], zedRestricted, "mine", true],
    ["owner_only", ["zed"], zedFull, "all", false],
    ["owner_only", ["zed"], zedRestricted, "mine", false],
  ];
  for (const [vis, parts, viewer, mode, want] of cases) assert.equal(canSeePlan(vis, parts, viewer, mode), want, `${vis} ${parts} ${viewer.role} ${mode}`);
});

test("M13: photographer/studio fees and cost items never reach viewers", async () => {
  const { shapeForViewer } = await import("../src/lib/viewer-access");
  const raw = {
    trip: { title: "T", start_date: "2026-11-07", end_date: "2026-11-09", timezone: "Asia/Tokyo", currency: "JPY", destinations: [], viewers_see_costs: true, usd_rate_override: null },
    plans: [{
      id: "p1", type: "cosplay_photoshoot", title: "Shoot", location_name: null, location_address: null, start_at: "2026-11-07T01:00:00Z",
      duration_min: 120, cost: 7000, cost_currency: null, usd_per_unit_at_completion: null, link: null, note: null, character_name: "X",
      visibility: "normal", completed: false, photographer_name: "SECRET-PHOTOG", photographer_fee: 5000, studio_fee: 2000,
    }],
    planPeople: [{ plan_id: "p1", person_id: "a" }],
    people: [{ id: "a", name: "A", color: null, is_me: false }],
    hotels: [], commutes: [], photos: [],
  };
  const out = shapeForViewer(raw as never, { personId: "a", role: "full" }, "all");
  const json = JSON.stringify(out);
  assert.ok(!json.includes("SECRET-PHOTOG"));
  assert.ok(!json.includes("photographer_fee") && !json.includes("studio_fee"));
});
