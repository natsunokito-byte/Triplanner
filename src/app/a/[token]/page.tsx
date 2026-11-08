import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CalendarClock, MapPin } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { ClaimForm } from "@/components/claim-form";
import { createAdminClient } from "@/lib/supabase/admin";
import { CLAIM_TRIP_COLS, type ClaimTrip } from "@/lib/claims";
import { submitClaim } from "./actions";

export const dynamic = "force-dynamic";

const nowMs = () => Date.now();

type OpenPlan = {
  id: string; title: string; type: string; start_at: string | null; plan_date: string | null; plan_time: string | null;
  duration_min: number; location_name: string | null; claim_proposal: string | null;
};

/** Public "open claim" page. Exposes ONLY the plans the owner opened, and only title/type/when/where/proposal. */
export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations("claim");
  const tp = await getTranslations("plan");
  const tv = await getTranslations("viewer");
  const admin = createAdminClient();
  if (!admin) return (<><AppHeader signedIn={false} /><main className="mx-auto max-w-lg p-8 text-muted">{tv("configMissing")}</main></>);

  const { data } = await admin.from("trips").select(CLAIM_TRIP_COLS).eq("availability_token", token).eq("availability_enabled", true).eq("availability_public", true).maybeSingle();
  if (!data) notFound();
  const trip = data as unknown as ClaimTrip;

  const { data: rows } = await admin.from("plans")
    .select("id,title,type,start_at,plan_date,plan_time,duration_min,location_name,claim_proposal")
    .eq("trip_id", trip.id).eq("open_claim", true).eq("visibility", "normal").eq("completed", false);
  const now = nowMs();
  const plans = ((rows ?? []) as OpenPlan[])
    .filter((p) => !p.start_at || Date.parse(p.start_at) + p.duration_min * 60000 > now)
    .sort((a, b) => (a.start_at ? Date.parse(a.start_at) : Infinity) - (b.start_at ? Date.parse(b.start_at) : Infinity));

  const full = new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short", timeZone: trip.timezone });
  const dateOnly = new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeZone: trip.timezone });
  const when = (p: OpenPlan) =>
    p.start_at ? full.format(new Date(p.start_at))
    : p.plan_date ? `${dateOnly.format(new Date(`${p.plan_date}T12:00:00Z`))} · ${t("timeTbd")}`
    : t("dateTbd");

  return (
    <>
      <AppHeader signedIn={false} />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-5 px-4 py-8">
        <div>
          <h1 className="text-[28px] font-semibold leading-tight">{t("title", { trip: trip.title })}</h1>
          <p className="text-muted">{t("subtitle")}</p>
          <p className="text-xs text-muted">{t("tzNote", { tz: trip.timezone })}</p>
        </div>
        {plans.length === 0 && <p className="card p-6 text-center text-muted">{t("none")}</p>}
        {plans.map((p) => (
          <section key={p.id} className="card space-y-2 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">{p.title}</h2>
              <span className="rounded-full bg-surface-2 px-2 text-xs">{tp(`types.${p.type}`)}</span>
            </div>
            <div className="flex items-center gap-1 text-sm text-muted"><CalendarClock size={14} /> {when(p)}{p.start_at ? ` · ${p.duration_min} min` : ""}</div>
            {p.location_name && <div className="flex items-center gap-1 text-sm text-muted"><MapPin size={14} /> {p.location_name}</div>}
            {p.claim_proposal && <p className="whitespace-pre-line rounded-md bg-surface-2 p-2 text-sm">{p.claim_proposal}</p>}
            <ClaimForm action={submitClaim.bind(null, token, p.id)} />
          </section>
        ))}
      </main>
    </>
  );
}
