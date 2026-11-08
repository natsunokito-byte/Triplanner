import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { DrawerShell } from "@/components/drawer-shell";
import { PlanForm } from "@/components/plan-form";
import { createClient } from "@/lib/supabase/server";
import { createPlan } from "@/app/actions";
import { PLAN_TYPES, type PlanType } from "@/lib/plan-types";
import { toPhotographers as photographers } from "@/lib/photographers";
import type { Person, Trip } from "@/lib/types";

export async function NewPlanContent({
  id, sp, back, intercepted,
}: {
  id: string;
  sp: { date?: string; type?: string; undated?: string };
  back: string;
  intercepted: boolean;
}) {
  const t = await getTranslations("plan");
  const supabase = await createClient();
  const [{ data: tripRow }, { data: peopleRows }, { data: catRows }, { data: photographerRows }] = await Promise.all([
    supabase.from("trips").select("*").eq("id", id).maybeSingle(),
    supabase.from("people").select("*").eq("trip_id", id).order("is_me", { ascending: false }).order("name"),
    supabase.from("todo_categories").select("id,name").eq("trip_id", id).order("position"),
    supabase.from("photographers").select("id,name,rate_1h,rate_2h").order("position"),
  ]);
  if (!tripRow) notFound();
  const trip = tripRow as Trip;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : trip.start_date;
  const undated = sp.undated === "1";
  const type: PlanType = (PLAN_TYPES as readonly string[]).includes(sp.type ?? "") ? (sp.type as PlanType) : "hangout";
  return (
    <DrawerShell title={t("newTitle")} intercepted={intercepted} closeHref={back} formId="plan-form" submitLabel={t("createShort")}>
      <PlanForm
        formId="plan-form"
        intercepted={intercepted}
        action={createPlan.bind(null, id)}
        people={(peopleRows ?? []) as Person[]}
        categories={(catRows ?? []) as { id: string; name: string }[]}
        photographers={photographers(photographerRows)}
        tz={trip.timezone}
        currency={trip.currency}
        defaults={{ date: undated ? null : date, time: undated ? null : "12:00", type }}
        back={back}
        submitLabel={t("create")}
      />
    </DrawerShell>
  );
}
