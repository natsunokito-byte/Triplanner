import { NextResponse } from "next/server";
import { fetchRates, persistRates } from "@/lib/fx";

// Daily FX refresh. Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not set" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const f = await fetchRates("latest");
  if (!f) return NextResponse.json({ error: "providers unavailable" }, { status: 502 });
  const stored = await persistRates(f.day, f.rates);
  return NextResponse.json({ day: f.day, currencies: Object.keys(f.rates).length, stored });
}
