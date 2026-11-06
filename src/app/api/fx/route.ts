import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLatestRates } from "@/lib/fx";

// GET /api/fx?c=JPY,TWD  ->  { rates: { JPY: 0.0066, ... } }  (USD per 1 unit). Used for live "≈ USD" hints in forms.
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const list = (new URL(req.url).searchParams.get("c") ?? "").split(",").map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z]{3}$/.test(s)).slice(0, 20);
  const rates = await getLatestRates(supabase, list);
  return NextResponse.json({ rates }, { headers: { "Cache-Control": "private, max-age=300" } });
}
