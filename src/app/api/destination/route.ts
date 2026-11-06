import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { formatPlaceLabel } from "@/lib/geo";

// Destination search via Google Places (New) + Time Zone API, server-side (key never reaches the browser).
// Replaces the Open-Meteo geocoder, whose zh results are Simplified Chinese. Google returns Traditional for zh-TW.
// Requires GOOGLE_MAPS_SERVER_KEY with "Places API (New)" and "Time Zone API" enabled.

const hits = new Map<string, number[]>();
function limited(user: string) {
  const now = Date.now();
  const recent = (hits.get(user) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(user, recent);
  return recent.length > 60;
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (limited(data.user.id)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) return NextResponse.json({ error: "not_configured" }, { status: 501 });

  const u = new URL(req.url);
  const lang = u.searchParams.get("lang") === "en" ? "en" : "zh-TW";
  const session = (u.searchParams.get("s") ?? "").slice(0, 64) || undefined;
  const placeId = u.searchParams.get("placeId");
  const q = (u.searchParams.get("q") ?? "").trim().slice(0, 100);

  if (placeId) {
    if (!/^[\w-]{10,300}$/.test(placeId)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    const qs = new URLSearchParams({ languageCode: lang, ...(session ? { sessionToken: session } : {}) });
    const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}?${qs}`, {
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "id,displayName,location,addressComponents" },
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ error: "upstream" }, { status: 502 });
    const p = (await res.json()) as {
      displayName?: { text?: string };
      location?: { latitude: number; longitude: number };
      addressComponents?: { shortText?: string; types?: string[] }[];
    };
    const cc = p.addressComponents?.find((c) => c.types?.includes("country"))?.shortText;
    let timezone = "";
    if (p.location) {
      const tz = await fetch(
        `https://maps.googleapis.com/maps/api/timezone/json?location=${p.location.latitude},${p.location.longitude}&timestamp=${Math.floor(Date.now() / 1000)}&key=${key}`,
        { cache: "no-store" },
      ).then((r) => r.json()).catch(() => null);
      if (tz?.status === "OK" && typeof tz.timeZoneId === "string") timezone = tz.timeZoneId;
    }
    // Label: the place's own name + the country from ISO code via Unicode CLDR (Taiwan => "台灣" / "Taiwan").
    const label = formatPlaceLabel({ name: p.displayName?.text ?? "", country_code: cc }, lang);
    return NextResponse.json({ place: { label, timezone, country_code: cc ?? "" } });
  }

  if (q.length < 2) return NextResponse.json({ suggestions: [] });
  const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
    body: JSON.stringify({
      input: q, languageCode: lang, ...(session ? { sessionToken: session } : {}),
      includedPrimaryTypes: ["locality", "administrative_area_level_1", "administrative_area_level_2", "country", "sublocality_level_1"],
    }),
    cache: "no-store",
  });
  if (!res.ok) return NextResponse.json({ error: "upstream" }, { status: 502 });
  const json = (await res.json()) as { suggestions?: { placePrediction?: { placeId: string; text: { text: string } } }[] };
  return NextResponse.json({
    suggestions: (json.suggestions ?? []).flatMap((s) => (s.placePrediction ? [{ placeId: s.placePrediction.placeId, text: s.placePrediction.text.text }] : [])),
  });
}
