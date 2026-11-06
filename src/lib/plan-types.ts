import { Coffee, Utensils, UtensilsCrossed, CupSoda, Hammer, Sparkles, Heart, Users, Ticket, type LucideIcon } from "lucide-react";

export const PLAN_TYPES = [
  "breakfast", "lunch", "dinner", "tea", "workshop", "cosplay_photoshoot", "date", "hangout", "event",
] as const;
export type PlanType = (typeof PLAN_TYPES)[number];

export const PLAN_ICON: Record<PlanType, LucideIcon> = {
  breakfast: Coffee, lunch: Utensils, dinner: UtensilsCrossed, tea: CupSoda, workshop: Hammer,
  cosplay_photoshoot: Sparkles, date: Heart, hangout: Users, event: Ticket,
};

// CSS variable key for each type (see globals.css --pt-*)
export const ptKey = (t: PlanType) => (t === "cosplay_photoshoot" ? "cosplay" : t);
export const ptVars = (t: PlanType) => ({
  bg: `var(--pt-${ptKey(t)}-bg)`,
  fg: `var(--pt-${ptKey(t)}-fg)`,
  dot: `var(--pt-${ptKey(t)})`,
});

export const VISIBILITIES = ["normal", "participants_only", "owner_only"] as const;
export type Visibility = (typeof VISIBILITIES)[number];
