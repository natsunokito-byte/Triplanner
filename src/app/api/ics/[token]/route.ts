import { createAdminClient } from "@/lib/supabase/admin";
import { buildIcs } from "@/lib/invite";

export const dynamic = "force-dynamic";

/** Public, unguessable per-plan link. Only title/time/place/note/link — no cost, no people. owner_only plans are never served. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  if (!admin || !/^[a-f0-9]{24}$/.test(token.replace(/\.ics$/, ""))) return new Response("Not found", { status: 404 });
  const { data: plan } = await admin.from("plans")
    .select("id,title,type,start_at,duration_min,location_name,location_address,link,note,visibility,trip_id")
    .eq("ics_token", token.replace(/\.ics$/, "")).maybeSingle();
  if (!plan || plan.visibility === "owner_only") return new Response("Not found", { status: 404 });
  const { data: trip } = await admin.from("trips").select("invite_locale").eq("id", plan.trip_id).maybeSingle();
  const body = buildIcs(plan, trip?.invite_locale === "en" ? "en" : "zh-TW");
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${plan.id.slice(0, 8)}.ics"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
