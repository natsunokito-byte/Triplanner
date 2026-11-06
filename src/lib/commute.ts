import { Bike, Bus, Car, CarTaxiFront, Footprints, Plane, Route, TrainFront, TramFront, type LucideIcon } from "lucide-react";

export const METHODS = ["walk", "train", "subway", "bus", "taxi", "flight", "car", "bike", "other"] as const;
export type Method = (typeof METHODS)[number];
export const PAYMENTS = ["ticket", "ic_card", "cash"] as const;
export type Payment = (typeof PAYMENTS)[number];

export const METHOD_ICON: Record<Method, LucideIcon> = {
  walk: Footprints, train: TrainFront, subway: TramFront, bus: Bus, taxi: CarTaxiFront, flight: Plane, car: Car, bike: Bike, other: Route,
};

// Google Routes API travel modes. flight/other have no estimate (manual only).
export const GOOGLE_MODE: Partial<Record<Method, "WALK" | "BICYCLE" | "DRIVE" | "TRANSIT">> = {
  walk: "WALK", bike: "BICYCLE", car: "DRIVE", taxi: "DRIVE", train: "TRANSIT", subway: "TRANSIT", bus: "TRANSIT",
};
