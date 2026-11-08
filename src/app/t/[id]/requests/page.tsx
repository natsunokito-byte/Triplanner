import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, CalendarClock, MapPin } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { ClaimRow } from "@/components/claim-row";
import { CopyButton } from "@/components/copy-button";
import { createClient } from "@/lib/supabase/server";
import { decideClaim, regenerateAvailabilityToken, setClaimPageEnabled } from "@/app/availability-actions";
import { expireOldClaims } from "@/lib/claims";

type OpenPlan = {
  id: string; title: string; type: string; start_at: string | null; plan_date: string | null; duration_min: number;
  location_name: string | null; claim_proposal: string | null; open_claim: boolean;
};

export default async function Requests({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("requests");
  const tp = await getTranslations("plan");
  const tc = await getTranslations("claim");
  const supabase = await createClient();
  const { data: tripRow } = await supabase.from("trips").select("id,title,timezone,availability_enabled,availability_public,availability_token").eq("id", id).maybeSingle();
  if (!tripRow) notFound();
  const trip = tripRow as unknown as { id: string; title: string; timezone: string; availability_enabled: boolean; availability_public: boolean; availability_token: string };
  await expireOldClaims(supabase, id);
  const [{ data: reqs, error: claimsErr }, { data: people }, { data: planRows, error: plansErr }] = await Promise.all([
    supabase.from("plan_claims").select("*").eq("trip_id", id).order("created_at", { ascending: false }).limit(100),
    supabase.from("people").select("email").eq("trip_id", id),
    supabase.from("plans").select("id,title,type,start_at,plan_date,duration_min,location_name,claim_proposal,open_claim").eq("trip_id", id),
  ]);
  const plans = (planRows ?? []) as OpenPlan[];
  const planById = new Map(plans.map((x) => [x.id, x]));
  const open = plans.filter((p) => p.open_claim).sort((a, b) => (a.start_at ? Date.parse(a.start_at) : Infinity) - (b.start_at ? Date.parse(b.start_at) : Infinity));
  const known = new Set((people ?? []).map((p) => (p.email ?? "").toLowerCase()));
  const fmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: trip.timezone });
  const pending = (reqs ?? []).filter((r) => r.status === "pending");
  const past = (reqs ?? []).filter((r) => r.status !== "pending");
  const pendingByPlan = new Map<string, number>();
  for (const r of pending) pendingByPlan.set(r.plan_id, (pendingByPlan.get(r.plan_id) ?? 0) + 1);
  const on = trip.availability_enabled && trip.availability_public;
  const link = `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/a/${trip.availability_token}`;

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-8">
        <Link href={`/t/${id}`} className="inline-flex items-center gap-1 text-muted hover:text-text"><ArrowLeft size={14} /> {t("back")}</Link>
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        {(claimsErr || plansErr) && <p role="alert" className="card border-danger/40 p-3 text-sm text-danger">{t("dbError")}</p>}

        <section className="card space-y-3 p-4">
          <h2 className="font-semibold">{t("publicPage")}</h2>
          <p className="text-xs text-muted">{t("publicHint")}</p>
          {on ? (
            <>
              <div className="flex items-center gap-2"><input readOnly className="input" value={link} /><CopyButton text={link} /></div>
              <div className="flex flex-wrap gap-2">
                <a href={link} target="_blank" rel="noreferrer" className="btn btn-sm">{t("preview")}</a>
                <form action={regenerateAvailabilityToken.bind(null, id)}><button className="btn btn-sm">{t("regenerate")}</button></form>
                <form action={setClaimPageEnabled.bind(null, id, false)}><button className="btn btn-sm">{t("turnOff")}</button></form>
              </div>
            </>
          ) : (
            <form action={setClaimPageEnabled.bind(null, id, true)}><button className="btn btn-primary btn-sm">{t("turnOn")}</button></form>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold">{t("openPlans")} ({open.length})</h2>
          {open.length === 0 && <p className="card p-6 text-center text-muted">{t("noOpen")}</p>}
          {open.map((p) => (
            <Link key={p.id} href={`/t/${id}/plans/${p.id}`} className="card block space-y-1 p-4 hover:bg-surface-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">{p.title}</span>
                <span className="flex items-center gap-2 text-xs">
                  <span className="rounded-full bg-surface-2 px-2">{tp(`types.${p.type}`)}</span>
                  {(pendingByPlan.get(p.id) ?? 0) > 0 && <span className="rounded-full bg-primary px-2 text-white">{t("pendingCount", { n: pendingByPlan.get(p.id) ?? 0 })}</span>}
                </span>
              </div>
              <div className="flex items-center gap-1 text-sm text-muted"><CalendarClock size={14} /> {p.start_at ? fmt.format(new Date(p.start_at)) : p.plan_date ? `${p.plan_date} · ${tc("timeTbd")}` : tc("dateTbd")}</div>
              {p.location_name && <div className="flex items-center gap-1 text-sm text-muted"><MapPin size={14} /> {p.location_name}</div>}
              {p.claim_proposal && <p className="whitespace-pre-line text-sm">{p.claim_proposal}</p>}
            </Link>
          ))}
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold">{t("pending")} ({pending.length})</h2>
          {pending.length === 0 && <p className="card p-6 text-center text-muted">{t("none")}</p>}
          {pending.map((r) => (
            <ClaimRow
              key={r.id} action={decideClaim.bind(null, id, r.id)} name={r.claimer_name} email={r.claimer_email}
              planTitle={planById.get(r.plan_id)?.title ?? "–"} when={fmt.format(new Date(r.created_at))}
              message={r.message} knownPerson={known.has(r.claimer_email)}
            />
          ))}
        </section>
        {past.length > 0 && (
          <section className="space-y-2">
            <h2 className="font-semibold">{t("history")}</h2>
            <ul className="space-y-2">
              {past.map((r) => (
                <li key={r.id} className="card flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <span>{r.claimer_name} · {planById.get(r.plan_id)?.title ?? "–"}</span>
                  <span className="text-xs text-muted">{t(`status.${r.status}`)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
