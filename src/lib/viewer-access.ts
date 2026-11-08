// Viewer permission model — PURE functions, no I/O. Everything a viewer receives goes through shapeForViewer().
// Rules (SPEC §2):
//   restricted viewer (email on the people list)   -> only plans they are a participant of; no hotels, no commutes, no costs
//   full viewer (people.can_view_all)              -> everything except owner_only / participants_only plans they're not on;
//                                                     costs only if trip.viewers_see_costs
//   visibility: owner_only is never visible; participants_only only to listed participants (full viewers get no exception)
//   emails never leave this module.

export type Role = "restricted" | "full";
export type Viewer = { personId: string; role: Role };
export type Mode = "mine" | "all";
export type Visibility = "normal" | "participants_only" | "owner_only";

export type RawTrip = {
  title: string; start_date: string; end_date: string; timezone: string; currency: string;
  destinations: string[]; viewers_see_costs: boolean; usd_rate_override: number | null;
};
export type RawPlan = {
  id: string; type: string; title: string; location_name: string | null; location_address: string | null;
  start_at: string; duration_min: number; cost: number | null; cost_currency: string | null;
  usd_per_unit_at_completion: number | null; link: string | null; note: string | null; character_name: string | null;
  visibility: Visibility; completed: boolean;
};
export type RawHotel = {
  id: string; name: string; address: string | null; booking_status: "confirmed" | "not_booked";
  check_in: string; check_out: string; cost: number | null; cost_currency: string | null;
};
export type RawCommute = {
  id: string; from_plan_id: string | null; to_plan_id: string | null; method: string; start_at: string;
  duration_min: number; cost: number | null; cost_currency: string | null;
};
export type RawPerson = { id: string; name: string; color: string | null; is_me: boolean };
export type RawInput = {
  trip: RawTrip;
  plans: RawPlan[];
  planPeople: { plan_id: string; person_id: string }[];
  people: RawPerson[];
  hotels: RawHotel[];
  commutes: RawCommute[];
  photos: { id: string; plan_id: string; storage_path: string }[];
};

export type SafePlan = Omit<RawPlan, "visibility" | "cost" | "cost_currency" | "usd_per_unit_at_completion"> & {
  cost: number | null; cost_currency: string | null; usd_frozen: number | null;
  people: { id: string; name: string; isMe: boolean }[];
};
export type ViewerData = {
  mode: Mode;
  role: Role;
  canSeeCosts: boolean;
  trip: Omit<RawTrip, "viewers_see_costs" | "usd_rate_override"> & { usd_rate_override: number | null };
  plans: SafePlan[];
  hotels: (Omit<RawHotel, "cost" | "cost_currency"> & { cost: number | null; cost_currency: string | null })[];
  commutes: (Omit<RawCommute, "cost" | "cost_currency"> & { cost: number | null; cost_currency: string | null })[];
  photos: { id: string; plan_id: string; storage_path: string }[];
};

export const effectiveMode = (viewer: Viewer, requested: string | undefined): Mode =>
  viewer.role === "full" && requested !== "mine" ? "all" : "mine";

export const costsVisible = (viewer: Viewer, trip: Pick<RawTrip, "viewers_see_costs">) => viewer.role === "full" && trip.viewers_see_costs;

export function canSeePlan(visibility: Visibility, participantIds: string[], viewer: Viewer, mode: Mode): boolean {
  if (visibility === "owner_only") return false;
  const involved = participantIds.includes(viewer.personId);
  if (visibility === "participants_only") return involved;
  if (viewer.role === "full" && mode === "all") return true;
  return involved;
}

export function shapeForViewer(raw: RawInput, viewer: Viewer, requestedMode?: string): ViewerData {
  const mode = effectiveMode(viewer, requestedMode);
  const canSeeCosts = costsVisible(viewer, raw.trip);
  const peopleById = new Map(raw.people.map((p) => [p.id, p]));
  const participants = new Map<string, string[]>();
  for (const r of raw.planPeople) participants.set(r.plan_id, [...(participants.get(r.plan_id) ?? []), r.person_id]);

  // Unscheduled plans (start_at null) are the owner's backlog — never shown to viewers.
  const visiblePlans = raw.plans.filter((p) => p.start_at != null && canSeePlan(p.visibility, participants.get(p.id) ?? [], viewer, mode));
  const visibleIds = new Set(visiblePlans.map((p) => p.id));

  const plans: SafePlan[] = visiblePlans.map((p) => ({
    id: p.id, type: p.type, title: p.title, location_name: p.location_name, location_address: p.location_address,
    start_at: p.start_at, duration_min: p.duration_min, link: p.link, note: p.note, character_name: p.character_name,
    completed: p.completed,
    cost: canSeeCosts ? p.cost : null,
    cost_currency: canSeeCosts ? p.cost_currency : null,
    usd_frozen: canSeeCosts ? p.usd_per_unit_at_completion : null,
    people: (participants.get(p.id) ?? []).flatMap((pid) => {
      const person = peopleById.get(pid);
      return person ? [{ id: person.id, name: person.name, isMe: person.is_me }] : []; // name only — never email
    }),
  }));

  const seesStructure = viewer.role === "full" && mode === "all";
  const hotels = seesStructure
    ? raw.hotels.map((h) => ({
        id: h.id, name: h.name, address: h.address, booking_status: h.booking_status, check_in: h.check_in, check_out: h.check_out,
        cost: canSeeCosts ? h.cost : null, cost_currency: canSeeCosts ? h.cost_currency : null,
      }))
    : [];
  // A commute is only shown when every plan it touches is visible (otherwise it would leak a hidden plan's time/place).
  const commutes = seesStructure
    ? raw.commutes
        .filter((c) => (c.from_plan_id == null || visibleIds.has(c.from_plan_id)) && (c.to_plan_id == null || visibleIds.has(c.to_plan_id)))
        .map((c) => ({
          id: c.id, from_plan_id: c.from_plan_id, to_plan_id: c.to_plan_id, method: c.method, start_at: c.start_at, duration_min: c.duration_min,
          cost: canSeeCosts ? c.cost : null, cost_currency: canSeeCosts ? c.cost_currency : null,
        }))
    : [];

  return {
    mode, role: viewer.role, canSeeCosts,
    trip: {
      title: raw.trip.title, start_date: raw.trip.start_date, end_date: raw.trip.end_date, timezone: raw.trip.timezone,
      currency: raw.trip.currency, destinations: raw.trip.destinations,
      usd_rate_override: canSeeCosts ? raw.trip.usd_rate_override : null,
    },
    plans, hotels, commutes,
    photos: raw.photos.filter((ph) => visibleIds.has(ph.plan_id)),
  };
}
