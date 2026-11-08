import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/app-header";
import { ClaimList } from "@/components/claim-list";
import { ProposeModal } from "@/components/propose-modal";
import { REQUEST_TYPES } from "@/lib/plan-types";
import { createAdminClient } from "@/lib/supabase/admin";
import { submitProposal } from "./actions";
import { CLAIM_TRIP_COLS, type ClaimTrip } from "@/lib/claims";

export const dynamic = "force-dynamic";

const nowMs = () => Date.now();

type OpenPlan = {
  id: string; title: string; type: string; start_at: string | null; plan_date: string | null; plan_time: string | null;
  duration_min: number; location_name: string | null; claim_proposal: string | null;
};

/** Public "open claim" page. Exposes ONLY the plans the owner opened, and only title/type/when/where/proposal. */
export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const locale = await getLocale();
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

  const full = new Intl.DateTimeFormat(locale, { dateStyle: "full", timeStyle: "short", timeZone: trip.timezone });
  const dateOnly = new Intl.DateTimeFormat(locale, { dateStyle: "full", timeZone: "UTC" });
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
          <div className="pt-3">
            <ProposeModal action={submitProposal.bind(null, token)} types={REQUEST_TYPES.map((k) => ({ value: k, label: tp(`types.${k}`) }))} />
          </div>
        </div>
        <ClaimList
          token={token}
          items={plans.map((p) => ({
            id: p.id, title: p.title, type: p.type, typeLabel: tp(`types.${p.type}`), when: when(p),
            duration: p.start_at ? t("minutes", { n: p.duration_min }) : "", location: p.location_name, proposal: p.claim_proposal,
          }))}
        />
      </main>
    </>
  );
}
