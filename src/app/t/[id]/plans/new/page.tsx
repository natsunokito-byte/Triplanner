import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { PlanForm } from "@/components/plan-form";
import { createClient } from "@/lib/supabase/server";
import { createPlan } from "@/app/actions";
import { PLAN_TYPES, type PlanType } from "@/lib/plan-types";
import type { Person, Trip } from "@/lib/types";

export default async function NewPlan({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string; type?: string; undated?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const t = await getTranslations("plan");
  const c = await getTranslations("common");
  const supabase = await createClient();
  const [{ data: tripRow }, { data: peopleRows }, { data: catRows }] = await Promise.all([
    supabase.from("trips").select("*").eq("id", id).maybeSingle(),
    supabase.from("people").select("*").eq("trip_id", id).order("is_me", { ascending: false }).order("name"),
    supabase.from("todo_categories").select("id,name").eq("trip_id", id).order("position"),
  ]);
  if (!tripRow) notFound();
  const trip = tripRow as Trip;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : trip.start_date;
  const type: PlanType = (PLAN_TYPES as readonly string[]).includes(sp.type ?? "") ? (sp.type as PlanType) : "hangout";
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-8 space-y-6">
        <Link href={`/t/${id}`} className="inline-flex items-center gap-1 text-muted hover:text-text"><ArrowLeft size={14} /> {c("back")}</Link>
        <h1 className="text-xl font-semibold">{t("newTitle")}</h1>
        <div className="card p-5">
          <PlanForm
            action={createPlan.bind(null, id)}
            people={(peopleRows ?? []) as Person[]}
            categories={(catRows ?? []) as { id: string; name: string }[]}
            tz={trip.timezone}
            currency={trip.currency}
            defaults={{ start: sp.undated === "1" ? null : `${date}T12:00`, type, fallbackStart: `${date}T12:00` }}
            submitLabel={t("create")}
          />
        </div>
      </main>
    </>
  );
}
