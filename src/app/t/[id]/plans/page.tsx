import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, Building2, Camera, Check, MapPin, Plus } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { createClient } from "@/lib/supabase/server";
import { PLAN_ICON, PLAN_TYPES, ptVars, type PlanType } from "@/lib/plan-types";
import { formatHours } from "@/lib/cost";
import { fmtMoney } from "@/lib/money";
import { localDate, utcToLocal } from "@/lib/tz";
import type { Plan, Trip } from "@/lib/types";

export default async function PlanOverview({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ types?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const t = await getTranslations("plan");
  const c = await getTranslations("common");
  const locale = await getLocale();
  const supabase = await createClient();
  const [{ data: tripRow }, { data: planRows }] = await Promise.all([
    supabase.from("trips").select("*").eq("id", id).maybeSingle(),
    supabase.from("plans").select("*").eq("trip_id", id).order("start_at", { nullsFirst: false }),
  ]);
  if (!tripRow) notFound();
  const trip = tripRow as Trip;
  const all = (planRows ?? []) as Plan[];

  // Multi-select type filter: ?types=dinner,cosplay_photoshoot (empty = all)
  const active = new Set((sp.types ?? "").split(",").filter((x): x is PlanType => (PLAN_TYPES as readonly string[]).includes(x)));
  const present = PLAN_TYPES.filter((k) => all.some((p) => p.type === k));
  const toggleHref = (k: PlanType) => {
    const next = new Set(active);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    const q = [...next].join(",");
    return `/t/${id}/plans${q ? `?types=${q}` : ""}`;
  };
  const shown = active.size ? all.filter((p) => active.has(p.type)) : all;
  const dated = shown.filter((p) => p.start_at);
  const undated = shown.filter((p) => !p.start_at);

  const byDay = new Map<string, Plan[]>();
  for (const p of dated) {
    const d = localDate(p.start_at!, trip.timezone);
    byDay.set(d, [...(byDay.get(d) ?? []), p]);
  }
  const dayFmt = new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric", weekday: "short", timeZone: "UTC" });

  const Row = ({ p }: { p: Plan }) => {
    const Icon = PLAN_ICON[p.type];
    const col = ptVars(p.type);
    return (
      <li>
        <Link
          href={`/t/${id}/plans/${p.id}`}
          className={`flex items-start gap-3 rounded-[8px] border border-border bg-surface p-3 hover:shadow-[var(--shadow-2)] ${p.completed ? "opacity-60" : ""}`}
          style={{ borderLeft: `4px solid ${col.dot}` }}
        >
          <Icon size={18} style={{ color: col.fg }} className="mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 text-xs tabular-nums text-muted">
              {p.start_at ? utcToLocal(p.start_at, trip.timezone).slice(11, 16) : t("undatedShort")} · {t("hours", { h: formatHours(p.duration_min) })}
              <span className="rounded-full px-2 text-[11px]" style={{ background: col.bg, color: col.fg }}>{t(`types.${p.type}`)}</span>
            </div>
            <div className={`font-semibold ${p.completed ? "line-through" : ""}`}>{p.title}</div>
            {p.location_name && <div className="flex items-center gap-1 text-xs text-muted"><MapPin size={12} />{p.location_name}</div>}
            {p.photographer_name && <div className="flex items-center gap-1 text-xs text-muted"><Camera size={12} />{p.photographer_name}</div>}
            {p.studio_name && <div className="flex items-center gap-1 text-xs text-muted"><Building2 size={12} />{p.studio_name}</div>}
          </div>
          <div className="shrink-0 text-right text-xs tabular-nums text-muted">
            {p.completed && <Check size={14} className="ml-auto text-success" />}
            {p.cost != null && fmtMoney(Number(p.cost), p.cost_currency ?? trip.currency, locale)}
          </div>
        </Link>
      </li>
    );
  };

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link href={`/t/${id}`} className="inline-flex items-center gap-1 text-muted hover:text-text"><ArrowLeft size={14} /> {c("back")}</Link>
            <h1 className="mt-1 text-[28px] font-semibold leading-tight">{trip.title} · {t("overviewTitle")}</h1>
          </div>
          <div className="flex gap-2">
            <Link href={`/t/${id}/plans/new`} className="btn btn-sm btn-primary"><Plus size={14} /> {t("add")}</Link>
            <Link href={`/t/${id}/plans/new?undated=1`} className="btn btn-sm"><Plus size={14} /> {t("addUndated")}</Link>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/t/${id}/plans`} className={`chip ${active.size ? "!bg-surface-2 !text-muted" : ""}`}>{t("allTypes")}</Link>
          {present.map((k) => (
            <Link key={k} href={toggleHref(k)} className={`chip ${active.has(k) ? "" : "!bg-surface-2 !text-muted"}`} aria-pressed={active.has(k)}>{t(`types.${k}`)}</Link>
          ))}
        </div>

        {shown.length === 0 && <p className="text-muted">{t("overviewEmpty")}</p>}

        {[...byDay.keys()].sort().map((d) => (
          <section key={d} className="space-y-2">
            <h2 className="font-semibold">{dayFmt.format(new Date(d))}</h2>
            <ul className="space-y-2">{byDay.get(d)!.map((p) => <Row key={p.id} p={p} />)}</ul>
          </section>
        ))}

        {undated.length > 0 && (
          <section className="space-y-2">
            <h2 className="font-semibold">{t("unscheduled")} <span className="text-xs font-normal text-muted">{undated.length}</span></h2>
            <ul className="space-y-2">{undated.map((p) => <Row key={p.id} p={p} />)}</ul>
          </section>
        )}
      </main>
    </>
  );
}
