import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { RequestRow } from "@/components/request-row";
import { createClient } from "@/lib/supabase/server";
import { decideRequest } from "@/app/availability-actions";
import { expireOld } from "@/lib/request-core";

export default async function Requests({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("requests");
  const tp = await getTranslations("plan");
  const supabase = await createClient();
  const { data: trip } = await supabase.from("trips").select("id,title,timezone").eq("id", id).maybeSingle();
  if (!trip) notFound();
  await expireOld(supabase, id);
  const [{ data: reqs }, { data: people }] = await Promise.all([
    supabase.from("plan_requests").select("*").eq("trip_id", id).order("created_at", { ascending: false }).limit(100),
    supabase.from("people").select("email").eq("trip_id", id),
  ]);
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
        <p className="text-xs text-muted">{t("tzNote", { tz: trip.timezone })}</p>
        <section className="space-y-3">
          <h2 className="font-semibold">{t("pending")} ({pending.length})</h2>
          {pending.length === 0 && <p className="card p-6 text-center text-muted">{t("none")}</p>}
          {pending.map((r) => (
            <RequestRow
              key={r.id} action={decideRequest.bind(null, id, r.id)} name={r.requester_name} email={r.requester_email}
              when={fmt.format(new Date(r.start_at))} minutes={r.duration_min} typeLabel={tp(`types.${r.type}`)}
              location={r.location_text} message={r.message} knownPerson={known.has(r.requester_email)}
            />
          ))}
        </section>
        {past.length > 0 && (
          <section className="space-y-2">
            <h2 className="font-semibold">{t("history")}</h2>
            <ul className="space-y-2">
              {past.map((r) => (
                <li key={r.id} className="card flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <span>{r.requester_name} · {fmt.format(new Date(r.start_at))}</span>
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
