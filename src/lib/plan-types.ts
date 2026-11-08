import { Coffee, Utensils, UtensilsCrossed, CupSoda, Hammer, Sparkles, Heart, Users, Ticket, ListChecks, AlarmClock, Briefcase, Flame, type LucideIcon } from "lucide-react";

// Every type that can exist in the database. breakfast/lunch/dinner were merged into "meal" and workshop into
// "crunch" (migration 006); the legacy values stay valid so nothing breaks before the migration is run.
export const PLAN_TYPES = [
  "meal", "tea", "crunch", "work", "cosplay_photoshoot", "date", "hangout", "event", "task", "wake_up",
  "breakfast", "lunch", "dinner", "workshop",
] as const;
export type PlanType = (typeof PLAN_TYPES)[number];

/** Offered in the plan form. wake_up is not a regular plan (set from the day column); legacy values are gone from the UI. */
export const SELECTABLE_TYPES: readonly PlanType[] = ["meal", "tea", "crunch", "work", "cosplay_photoshoot", "date", "hangout", "event", "task"];
/** Types a visitor may request through "Make a plan". */
export const REQUEST_TYPES: readonly PlanType[] = ["meal", "tea", "cosplay_photoshoot", "date", "hangout", "event"];
/** Types whose to-dos are "task to-dos" (shown in their own tab on the to-do page). */
export const TASK_TODO_TYPES: readonly PlanType[] = ["task", "crunch"];

export const PLAN_ICON: Record<PlanType, LucideIcon> = {
  meal: Utensils, work: Briefcase, crunch: Flame,
  breakfast: Coffee, lunch: Utensils, dinner: UtensilsCrossed, tea: CupSoda, workshop: Hammer,
  cosplay_photoshoot: Sparkles, date: Heart, hangout: Users, event: Ticket, task: ListChecks, wake_up: AlarmClock,
};

// CSS variable key for each type (see globals.css --pt-*)
export const ptKey = (t: PlanType) => (t === "cosplay_photoshoot" ? "cosplay" : t === "wake_up" ? "wake" : t);

/** Plan types that are not "time spent" (no duration/cost/people UI; never busy, never on the scoreboard). */
export const NON_ACTIVITY: readonly PlanType[] = ["task", "wake_up"];
export const ptVars = (t: PlanType) => ({
  bg: `var(--pt-${ptKey(t)}-bg)`,
  fg: `var(--pt-${ptKey(t)}-fg)`,
  dot: `var(--pt-${ptKey(t)})`,
});

export const VISIBILITIES = ["normal", "participants_only", "owner_only"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

/** A plan can be opened for public claiming only if it is an invite-able type and visible to everyone. */
export function canOpenClaim(type: string, visibility: string): boolean {
  return (REQUEST_TYPES as readonly string[]).includes(type) && visibility === "normal";
}
