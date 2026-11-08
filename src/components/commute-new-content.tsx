import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { DrawerShell } from "@/components/drawer-shell";
import { CommuteForm } from "@/components/commute-form";
import { createClient } from "@/lib/supabase/server";
import { createCommute } from "@/app/actions";
import { localDate, utcToLocal } from "@/lib/tz";
import type { Plan, Trip } from "@/lib/types";

const placeText = (p: Plan | null) => (p ? p.location_address || p.location_name || "" : "");

export async function NewCommuteContent({
  id, sp, back, intercepted,
}: {
  id: string; sp: { from?: string; to?: string }; back: string; intercepted: boolean;
}) {
  const t = await getTranslations("commute");
  const supabase = await createClient();
  const [{ data: tripRow }, { data: fromRow }, { data: toRow }, { data: hotelRows }] = await Promise.all([
    supabase.from("trips").select("*").eq("id", id).maybeSingle(),
    sp.from ? supabase.from("plans").select("*").eq("id", sp.from).eq("trip_id", id).maybeSingle() : Promise.resolve({ data: null }),
    sp.to ? supabase.from("plans").select("*").eq("id", sp.to).eq("trip_id", id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("hotels").select("name,address,check_in,check_out").eq("trip_id", id).order("check_in"),
  ]);
  if (!tripRow) notFound();
  const trip = tripRow as Trip;
  const from = fromRow as Plan | null;
  const to = toRow as Plan | null;
  // Missing end = the hotel you are staying at on that plan's day (latest check-in on/before it; falls back to the first one).
  const refIso = (from ?? to)?.start_at ?? null;
  const refDay = refIso ? localDate(refIso, trip.timezone) : null;
  const hotels = (hotelRows ?? []) as { name: string; address: string | null; check_in: string; check_out: string }[];
  const stay = refDay
    ? [...hotels].reverse().find((h) => localDate(h.check_in, trip.timezone) <= refDay && refDay <= localDate(h.check_out, trip.timezone)) ?? null
    : null;
  const hotelText = stay ? stay.address || stay.name : "";
  // Default departure = when the previous plan ends.
  const startIso = from?.start_at ? new Date(Date.parse(from.start_at) + from.duration_min * 60000).toISOString() : to?.start_at ?? new Date().toISOString();

  return (
    <DrawerShell title={t("newTitle")} intercepted={intercepted} closeHref={back} formId="commute-form" submitLabel={t("create")}>
      {(from || to) && <p className="text-muted">{t("fromTo", { from: from?.title ?? "–", to: to?.title ?? "–" })}</p>}
      <CommuteForm
        formId="commute-form"
        intercepted={intercepted}
        back={back}
        action={createCommute.bind(null, id)}
        fromPlanId={from?.id ?? null}
        toPlanId={to?.id ?? null}
        defaults={{
          origin: { label: from ? placeText(from) : hotelText, placeId: "" },
          dest: { label: to ? placeText(to) : hotelText, placeId: "" },
          start: utcToLocal(startIso, trip.timezone),
          method: "subway",
          duration: 15,
        }}
        tz={trip.timezone}
        currency={trip.currency}
        submitLabel={t("create")}
      />
    </DrawerShell>
  );
}
