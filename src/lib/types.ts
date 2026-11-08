export type Trip = {
  id: string;
  owner_id: string;
  title: string;
  start_date: string;
  end_date: string;
  timezone: string;
  currency: string;
  destinations: string[];
  share_token: string;
  share_enabled: boolean;
  viewers_see_costs: boolean;
  invite_locale: "zh-TW" | "en";
  usd_rate_override: number | null;
  last_opened_at: string | null;
};

export type Person = {
  id: string;
  trip_id: string;
  name: string;
  email: string | null;
  is_me: boolean;
  can_view_all: boolean;
  locale: "zh-TW" | "en";
  color: string | null;
};

export type Hotel = {
  id: string;
  trip_id: string;
  name: string;
  address: string | null;
  booking_status: "confirmed" | "not_booked";
  check_in: string;
  check_out: string;
  cost: number | null;
  cost_currency: string | null;
  link: string | null;
  note: string | null;
};

export type Todo = {
  id: string;
  trip_id: string;
  category: "hotel" | "ticket" | "cosplay" | "plan" | "general";
  category_id: string | null;
  is_task: boolean;
  due_date: string | null;
  title: string;
  done: boolean;
  hotel_id: string | null;
  commute_id: string | null;
  plan_id: string | null;
  auto_generated: boolean;
  sort: number | null;
};

import type { PlanType, Visibility } from "./plan-types";

export type Plan = {
  id: string;
  trip_id: string;
  type: PlanType;
  title: string;
  location_name: string | null;
  location_address: string | null;
  start_at: string | null; // null = date and/or time not decided
  plan_date: string | null; // date known, no time
  has_meeting: boolean;
  open_claim: boolean;
  claim_proposal: string | null;
  plan_time: string | null; // time known, no date ('HH:MM:SS')
  studio_name: string | null;
  duration_min: number;
  cost: number | null;
  cost_currency: string | null;
  fx_rate_to_trip: number | null;
  link: string | null;
  note: string | null;
  character_name: string | null;
  photographer_name: string | null;
  photographer_fee: number | null;
  studio_fee: number | null;
  visibility: Visibility;
  completed: boolean;
  usd_per_unit_at_completion: number | null;
  ics_token: string;
};

import type { Method, Payment } from "./commute";

export type CommuteStop = { id: string; commute_id: string; label: string; stay_min: number; position: number };

export type Commute = {
  id: string;
  trip_id: string;
  from_plan_id: string | null;
  to_plan_id: string | null;
  method: Method;
  start_at: string;
  duration_min: number;
  cost: number | null;
  cost_currency: string | null;
  payment: Payment | null;
  note: string | null;
  origin_label: string | null;
  origin_place_id: string | null;
  dest_label: string | null;
  dest_place_id: string | null;
  distance_m: number | null;
  duration_source: "manual" | "google";
  estimated_at: string | null;
};
