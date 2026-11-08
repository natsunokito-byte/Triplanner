import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { GOOGLE_MODE, METHODS } from "@/lib/commute";

// Server-side proxy to Google Routes API (computeRoutes). The key never reaches the browser.
// No routingPreference is sent, so DRIVE stays on the basic (non traffic-aware) tier.

const place = z
  .object({ placeId: z.string().max(300).optional(), address: z.string().trim().max(300).optional() })
  .refine((p) => p.placeId || p.address, "place required");

const body = z.object({
  origin: place,
  destination: place,
  method: z.enum(METHODS),
  departureTime: z.string().datetime().optional(),
});

// Best-effort per-user throttle (in-memory: per server instance).
const hits = new Map<string, number[]>();
function limited(user: string) {
  const now = Date.now();
  const recent = (hits.get(user) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(user, recent);
  return recent.length > 20;
}

const wp = (p: z.infer<typeof place>) => (p.placeId ? { placeId: p.placeId } : { address: p.address });

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (limited(data.user.id)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) return NextResponse.json({ error: "not_configured" }, { status: 501 });

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const { origin, destination, method, departureTime } = parsed.data;

  const travelMode = GOOGLE_MODE[method];
  if (!travelMode) return NextResponse.json({ error: "unsupported_method" }, { status: 400 });

  const payload: Record<string, unknown> = {
    origin: wp(origin),
    destination: wp(destination),
    travelMode,
    units: "METRIC",
  };
  // Only transit takes a departure time here (and only in the future). DRIVE without a traffic-aware
  // routingPreference rejects it ("Timestamp cannot be set for TRAFFIC_UNAWARE routing mode").
  if (departureTime && travelMode === "TRANSIT" && Date.parse(departureTime) > Date.now() + 60_000) {
    payload.departureTime = departureTime;
  }

  const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "routes.duration,routes.distanceMeters",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("routes api error", res.status, text);
    let detail = "";
    try {
      const e = (JSON.parse(text) as { error?: { status?: string; message?: string } }).error;
      detail = [e?.status, e?.message].filter(Boolean).join(": ").slice(0, 300);
    } catch {}
    return NextResponse.json({ error: "upstream", upstream_status: res.status, detail }, { status: 502 });
  }
  const json = (await res.json()) as { routes?: { duration?: string; distanceMeters?: number }[] };
  const route = json.routes?.[0];
  if (!route?.duration) return NextResponse.json({ error: "no_route" }, { status: 404 });

  const seconds = Number.parseInt(route.duration, 10); // "1234s"
  return NextResponse.json({
    duration_min: Math.max(1, Math.round(seconds / 60)),
    distance_m: route.distanceMeters ?? null,
  });
}
