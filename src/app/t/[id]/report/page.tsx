import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { TripReportExport, type ReportPlan } from "@/components/trip-report-export";
import { createClient } from "@/lib/supabase/server";
import { localDate, utcToLocal } from "@/lib/tz";
import type { Person, Plan, Trip } from "@/lib/types";

const PER_PLAN_PHOTOS = 3;

export default async function Report({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("export");
  const tp = await getTranslations("plan");
  const locale = await getLocale();
  const supabase = await createClient();
  const { data: tripRow } = await supabase.from("trips").select("*").eq("id", id).maybeSingle();
  if (!tripRow) notFound();
  const trip = tripRow as Trip;
  const [{ data: planRows }, { data: peopleRows }] = await Promise.all([
    supabase.from("plans").select("*").eq("trip_id", id).eq("completed", true).not("start_at", "is", null).order("start_at"),
    supabase.from("people").select("*").eq("trip_id", id),
  ]);
  const plans = (planRows ?? []) as Plan[];
  const people = (peopleRows ?? []) as Person[];
  const ids = plans.map((p) => p.id);
  const [{ data: pp }, { data: ph }] = ids.length
    ? await Promise.all([
        supabase.from("plan_people").select("plan_id,person_id").in("plan_id", ids),
        supabase.from("plan_photos").select("plan_id,storage_path").in("plan_id", ids).order("created_at"),
      ])
    : [{ data: [] }, { data: [] }];
  const photoRows = (ph ?? []).filter((r, i, a) => a.filter((x, j) => j <= i && x.plan_id === r.plan_id).length <= PER_PLAN_PHOTOS);
  const signed = photoRows.length ? (await supabase.storage.from("trip-photos").createSignedUrls(photoRows.map((r) => r.storage_path), 3600)).data ?? [] : [];
  const urlOf = (path: string) => signed.find((s) => s.path === path)?.signedUrl;

  const reportPlans: ReportPlan[] = plans.map((p) => ({
    id: p.id,
    day: localDate(p.start_at!, trip.timezone),
    time: utcToLocal(p.start_at!, trip.timezone).slice(11, 16),
    title: p.title,
    typeLabel: tp(`types.${p.type}`),
    location: p.location_name,
    people: (pp ?? []).filter((r) => r.plan_id === p.id).flatMap((r) => people.find((x) => x.id === r.person_id && !x.is_me)?.name ?? []),
    private: p.visibility !== "normal",
    photoUrls: photoRows.filter((r) => r.plan_id === p.id).flatMap((r) => urlOf(r.storage_path) ?? []),
  }));
  const fmt = new Intl.DateTimeFormat(locale, { month: "long", day: "numeric", weekday: "short", timeZone: "UTC" });
  const dayLabels = Object.fromEntries([...new Set(reportPlans.map((p) => p.day))].map((d) => [d, fmt.format(new Date(`${d}T00:00:00Z`))]));
  const range = `${trip.start_date} – ${trip.end_date}`;

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-4 px-4 py-8">
        <Link href={`/t/${id}`} className="inline-flex items-center gap-1 text-muted hover:text-text"><ArrowLeft size={14} /> {t("back")}</Link>
        <h1 className="text-[28px] font-semibold leading-tight">{t("tripReport")}</h1>
        <TripReportExport d={{ title: trip.title, subtitle: trip.destinations.join(" · "), watermark: `${trip.title} · ${range}`, dayLabels, plans: reportPlans }} />
      </main>
    </>
  );
}
