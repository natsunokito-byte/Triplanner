import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { ClaimRow } from "@/components/claim-row";
import { createClient } from "@/lib/supabase/server";
import { decideClaim } from "@/app/availability-actions";
import { expireOldClaims } from "@/lib/claims";

export default async function Requests({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("requests");
  const supabase = await createClient();
  const { data: trip } = await supabase.from("trips").select("id,title,timezone").eq("id", id).maybeSingle();
  if (!trip) notFound();
  await expireOldClaims(supabase, id);
  const [{ data: reqs }, { data: people }, { data: planRows }] = await Promise.all([
    supabase.from("plan_claims").select("*").eq("trip_id", id).order("created_at", { ascending: false }).limit(100),
    supabase.from("people").select("email").eq("trip_id", id),
    supabase.from("plans").select("id,title,start_at,plan_date").eq("trip_id", id),
  ]);
  const planById = new Map((planRows ?? []).map((x) => [x.id as string, x]));
  const known = new Set((people ?? []).map((p) => (p.email ?? "").toLowerCase()));
  const fmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: trip.timezone });
  const pending = (reqs ?? []).filter((r) => r.status === "pending");
  const past = (reqs ?? []).filter((r) => r.status !== "pending");

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-8">
        <Link href={`/t/${id}`} className="inline-flex items-center gap-1 text-muted hover:text-text"><ArrowLeft size={14} /> {t("back")}</Link>
        <h1 className="text-xl font-semibold">{t("title")}</h1>
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
