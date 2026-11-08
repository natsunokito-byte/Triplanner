import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/app-header";
import { CurrencyToggle, FxProvider, Money } from "@/components/fx";
import { HotelTimeline } from "@/components/hotel-timeline";
import { Scoreboard, type ScoreEntry } from "@/components/scoreboard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLatestRates } from "@/lib/fx";
import { toTrip, type FxCtx } from "@/lib/money";
import { PLAN_TYPES, type PlanType } from "@/lib/plan-types";
import { eachDay } from "@/lib/tz";
import { shapeForViewer, type RawInput, type Viewer } from "@/lib/viewer-access";
import { cookieName, verifySession } from "@/lib/viewer-session";
import { signOutViewer } from "./actions";
import { VerifyForm } from "./verify-form";
import { ViewerBoard, type ViewerPhoto } from "./viewer-board";

export const dynamic = "force-dynamic";

export default async function ViewerPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ view?: string; tab?: string }> }) {
  const { token } = await params;
  const { view } = await searchParams;
  const t = await getTranslations("viewer");
  const admin = createAdminClient();
  const secret = process.env.VIEWER_COOKIE_SECRET;
  if (!admin || !secret || secret.length < 32) {
    return (<><AppHeader signedIn={false} /><main className="mx-auto max-w-lg p-8 text-muted">{t("configMissing")}</main></>);
  }

  const { data: trip } = await admin.from("trips").select("*").eq("share_token", token).eq("share_enabled", true).maybeSingle();
  if (!trip) notFound();

  const session = verifySession(secret, (await cookies()).get(cookieName(token))?.value, trip.id);
  const { data: person } = session
    ? await admin.from("people").select("id,name,can_view_all").eq("trip_id", trip.id).ilike("email", session.e).maybeSingle()
    : { data: null };

  if (!session || !person) {
    return (
      <>
        <AppHeader signedIn={false} />
        <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-4 py-12">
          <h1 className="text-center text-[28px] font-semibold">{trip.title}</h1>
          <VerifyForm token={token} />
        </main>
      </>
    );
  }

  // Role is recomputed from the DB on every request — revoking can_view_all takes effect immediately.
  const viewer: Viewer = { personId: person.id, role: person.can_view_all ? "full" : "restricted" };

  const [{ data: plans }, { data: people }, { data: hotels }, { data: commutes }] = await Promise.all([
    admin.from("plans").select("*").eq("trip_id", trip.id),
    admin.from("people").select("id,name,color,is_me").eq("trip_id", trip.id),
    admin.from("hotels").select("*").eq("trip_id", trip.id),
    admin.from("commutes").select("*").eq("trip_id", trip.id),
  ]);
  const planIds = (plans ?? []).map((p) => p.id as string);
  const [{ data: planPeople }, { data: photoRows }] = planIds.length
    ? await Promise.all([
        admin.from("plan_people").select("plan_id,person_id").in("plan_id", planIds),
        admin.from("plan_photos").select("id,plan_id,storage_path").in("plan_id", planIds),
      ])
    : [{ data: [] }, { data: [] }];

  const raw: RawInput = {
    trip: {
      title: trip.title, start_date: trip.start_date, end_date: trip.end_date, timezone: trip.timezone, currency: trip.currency,
      destinations: trip.destinations ?? [], viewers_see_costs: trip.viewers_see_costs,
      usd_rate_override: trip.usd_rate_override == null ? null : Number(trip.usd_rate_override),
    },
    plans: (plans ?? []).map((p) => ({ ...p, cost: p.cost == null ? null : Number(p.cost), usd_per_unit_at_completion: p.usd_per_unit_at_completion == null ? null : Number(p.usd_per_unit_at_completion) })),
    planPeople: planPeople ?? [],
    people: people ?? [],
    hotels: (hotels ?? []).map((h) => ({ ...h, cost: h.cost == null ? null : Number(h.cost) })),
    commutes: (commutes ?? []).map((c) => ({ ...c, cost: c.cost == null ? null : Number(c.cost) })),
    photos: photoRows ?? [],
  };
  const data = shapeForViewer(raw, viewer, view);

  // Photos: only for plans the viewer can see, via short-lived signed URLs.
  const photos: ViewerPhoto[] = [];
  if (data.photos.length) {
    const { data: signed } = await admin.storage.from("trip-photos").createSignedUrls(data.photos.map((p) => p.storage_path), 3600);
    data.photos.forEach((p, i) => { const u = signed?.[i]?.signedUrl; if (u) photos.push({ id: p.id, plan_id: p.plan_id, url: u }); });
  }

  const rates = data.canSeeCosts
    ? await getLatestRates(admin, [trip.currency, ...data.plans.map((p) => p.cost_currency), ...data.hotels.map((h) => h.cost_currency), ...data.commutes.map((c) => c.cost_currency)].filter((x): x is string => !!x))
    : {};
  const ctx: FxCtx = { tripCurrency: trip.currency, override: data.trip.usd_rate_override, rates };

  const days = eachDay(trip.start_date, trip.end_date);
  const done = data.plans.filter((p) => p.completed).length;
  const myPlans = data.plans.filter((p) => p.completed && p.people.some((x) => x.id === viewer.personId));
  const myMinutes = myPlans.reduce((s, p) => s + p.duration_min, 0);

  let totalCost: number | null = null;
  if (data.canSeeCosts) {
    let sum = 0;
    const add = (a: number | null, c: string | null, f: number | null) => { if (a == null) return; const v = toTrip(ctx, a, c ?? trip.currency, f); if (v != null) sum += v; };
    data.plans.forEach((p) => add(p.cost, p.cost_currency, p.usd_frozen));
    data.hotels.forEach((h) => add(h.cost, h.cost_currency, null));
    data.commutes.forEach((c) => add(c.cost, c.cost_currency, null));
    totalCost = sum;
  }

  const showScoreboard = data.role === "full" && data.mode === "all";
  const others = raw.people.filter((p) => !p.is_me).map((p) => ({ id: p.id, name: p.name }));
  const entries: ScoreEntry[] = data.plans
    .filter((p) => p.completed && (PLAN_TYPES as readonly string[]).includes(p.type))
    .map((p) => ({ type: p.type as PlanType, duration: p.duration_min, personIds: p.people.map((x) => x.id) }));

  const seg = (active: boolean) => `seg-item ${active ? "seg-item-active" : ""}`;
  return (
    <FxProvider ctx={ctx}>
      <AppHeader signedIn={false} />
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-8 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[28px] font-semibold leading-tight">{trip.title}</h1>
            <p className="text-xs text-muted">{person.name} · {t("readOnly")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {viewer.role === "full" && (
              <div className="seg">
                <Link href={`/v/${token}?view=all`} className={seg(data.mode === "all")}>{t("viewAll")}</Link>
                <Link href={`/v/${token}?view=mine`} className={seg(data.mode === "mine")}>{t("viewMine")}</Link>
              </div>
            )}
            {data.canSeeCosts && <CurrencyToggle />}
            <form action={signOutViewer.bind(null, token)}><button className="btn btn-sm">{t("signOut")}</button></form>
          </div>
        </div>

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="card p-4">
            <div className="text-xs text-muted">{t("progress", { done, total: data.plans.length })}</div>
            <div className="mt-1 text-[28px] font-semibold tabular-nums">{done}/{data.plans.length}</div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-muted">{t("myHours")}</div>
            <div className="mt-1 text-[28px] font-semibold tabular-nums">{(myMinutes / 60).toFixed(1)}<span className="ml-1 text-sm font-normal text-muted">h</span></div>
          </div>
          {totalCost != null && (
            <div className="card p-4">
              <div className="text-xs text-muted">{t("totalCost")}</div>
              <div className="mt-1 text-[28px] font-semibold tabular-nums"><Money amount={totalCost} currency={trip.currency} /></div>
            </div>
          )}
        </section>

        {data.hotels.length > 0 && <HotelTimeline trip={{ id: trip.id, start_date: trip.start_date, end_date: trip.end_date, timezone: trip.timezone }} hotels={data.hotels} readOnly />}

        <ViewerBoard data={data} days={days} photos={photos} />

        {showScoreboard && (
          <section className="space-y-3">
            <h2 className="text-base font-semibold">{t("scoreboard")}</h2>
            <Scoreboard people={others} entries={entries} />
          </section>
        )}
      </main>
    </FxProvider>
  );
}
