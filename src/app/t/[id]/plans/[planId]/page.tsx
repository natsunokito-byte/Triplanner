import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, Check, Circle, CircleCheck, Copy, Trash2 } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { ConfirmButton } from "@/components/confirm-button";
import { PhotoUploader } from "@/components/photo-uploader";
import { InvitePanel } from "@/components/invite-panel";
import { PlanReportExport } from "@/components/plan-report-export";
import { PlanForm } from "@/components/plan-form";
import { SubmitButton } from "@/components/submit-button";
import { createClient } from "@/lib/supabase/server";
import { addPlanTodo, deletePlan, duplicatePlan, deletePlanTodo, setPlanCompleted, togglePlanTodo, updatePlan } from "@/app/actions";
import { headers } from "next/headers";
import { fmtMoney } from "@/lib/money";
import { utcToLocal } from "@/lib/tz";
import type { Person, Plan, Todo, Trip } from "@/lib/types";

export default async function EditPlan({ params }: { params: Promise<{ id: string; planId: string }> }) {
  const { id, planId } = await params;
  const t = await getTranslations("plan");
  const c = await getTranslations("common");
  const ti = await getTranslations("invite");
  const te = await getTranslations("export");
  const locale = await getLocale();
  const supabase = await createClient();
  const [{ data: tripRow }, { data: planRow }, { data: peopleRows }, { data: ppRows }, { data: todoRows }, { data: photoRows }, { data: itemRows }, { data: catRows }] = await Promise.all([
    supabase.from("trips").select("*").eq("id", id).maybeSingle(),
    supabase.from("plans").select("*").eq("id", planId).eq("trip_id", id).maybeSingle(),
    supabase.from("people").select("*").eq("trip_id", id).order("is_me", { ascending: false }).order("name"),
    supabase.from("plan_people").select("person_id").eq("plan_id", planId),
    supabase.from("todos").select("*").eq("plan_id", planId).eq("category", "cosplay").order("done").order("title"),
    supabase.from("plan_photos").select("id,storage_path").eq("plan_id", planId).order("created_at"),
    supabase.from("plan_cost_items").select("label,amount,per_hour").eq("plan_id", planId).order("position"),
    supabase.from("todo_categories").select("id,name").eq("trip_id", id).order("position"),
  ]);
  if (!tripRow || !planRow) notFound();
  const trip = tripRow as Trip;
  const plan = planRow as Plan;
  const todos = (todoRows ?? []) as Todo[];
  const photoList = (photoRows ?? []) as { id: string; storage_path: string }[];
  const signed = photoList.length
    ? (await supabase.storage.from("trip-photos").createSignedUrls(photoList.map((p) => p.storage_path), 3600)).data ?? []
    : [];
  const photos = photoList.flatMap((p) => {
    const url = signed.find((s) => s.path === p.storage_path)?.signedUrl;
    return url ? [{ id: p.id, url }] : [];
  });

  const h = await headers();
  const origin = process.env.NEXT_PUBLIC_SITE_URL || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const peopleList = (peopleRows ?? []) as Person[];
  const onPlan = new Set((ppRows ?? []).map((r) => r.person_id as string));
  const recipients = peopleList.filter((p) => !p.is_me && onPlan.has(p.id)).map((p) => p.name);

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-8 space-y-6">
        <Link href={`/t/${id}`} className="inline-flex items-center gap-1 text-muted hover:text-text"><ArrowLeft size={14} /> {c("back")}</Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">{t("editTitle")}</h1>
          <div className="flex gap-2">
            <form action={duplicatePlan.bind(null, id, planId)}>
              <button className="btn btn-sm"><Copy size={14} /> {t("copy")}</button>
            </form>
            <form action={setPlanCompleted.bind(null, id, planId, !plan.completed)}>
              <button className={`btn btn-sm ${plan.completed ? "text-success" : ""}`}>
                {plan.completed ? <CircleCheck size={14} /> : <Circle size={14} />} {plan.completed ? t("markIncomplete") : t("markComplete")}
              </button>
            </form>
          </div>
        </div>

        <div className="card p-5">
          <PlanForm
            action={updatePlan.bind(null, id, planId)}
            plan={plan}
            costItems={((itemRows ?? []) as { label: string; amount: number | string; per_hour: boolean }[]).map((i) => ({ ...i, amount: Number(i.amount) }))}
            categories={(catRows ?? []) as { id: string; name: string }[]}
            planPeople={(ppRows ?? []).map((r) => r.person_id as string)}
            people={(peopleRows ?? []) as Person[]}
            tz={trip.timezone}
            currency={trip.currency}
            defaults={{ start: utcToLocal(plan.start_at, trip.timezone), type: plan.type }}
            submitLabel={c("save")}
          />
        </div>

        <section className="space-y-3">
          <h2 className="font-semibold">{te("planReport")}</h2>
          <PlanReportExport
            d={{
              title: plan.title,
              typeLabel: t(`types.${plan.type}`),
              when: `${utcToLocal(plan.start_at, trip.timezone).replace("T", " ")} · ${plan.duration_min} min`,
              location: plan.location_name,
              people: peopleList.filter((p) => !p.is_me && onPlan.has(p.id)).map((p) => p.name),
              note: plan.note,
              costText: plan.cost != null ? fmtMoney(Number(plan.cost), plan.cost_currency ?? trip.currency, locale) : null,
              photoUrls: photos.map((p) => p.url),
              watermark: `${trip.title} · ${trip.start_date} – ${trip.end_date}`,
              completed: plan.completed,
            }}
          />
        </section>

        {plan.visibility !== "owner_only" ? (
          <InvitePanel plan={plan} tz={trip.timezone} tripTitle={trip.title} defaultLocale={trip.invite_locale} icsUrl={`${origin}/api/ics/${plan.ics_token}`} recipients={recipients} />
        ) : (
          <p className="text-xs text-muted">{ti("privateNote")}</p>
        )}

        {plan.type === "cosplay_photoshoot" && (
          <section className="card p-5 space-y-3">
            <h2 className="font-semibold">{t("checklist")}</h2>
            {todos.length === 0 ? (
              <p className="text-muted">{t("noChecklist")}</p>
            ) : (
              <ul className="space-y-1">
                {todos.map((todo) => (
                  <li key={todo.id} className="flex items-center gap-2">
                    <form action={togglePlanTodo.bind(null, id, planId, todo.id, !todo.done)}>
                      <button className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-surface-2" aria-label={todo.done ? "undo" : "done"}>
                        {todo.done ? <Check size={18} className="text-success" /> : <Circle size={18} className="text-muted" />}
                      </button>
                    </form>
                    <span className={`flex-1 ${todo.done ? "text-muted line-through" : ""}`}>{todo.title}</span>
                    <form action={deletePlanTodo.bind(null, id, planId, todo.id)}>
                      <button className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-danger" aria-label={c("delete")}>
                        <Trash2 size={14} />
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <form action={addPlanTodo.bind(null, id, planId)} className="flex gap-2 border-t border-border pt-3">
              <input name="title" className="input" required maxLength={200} placeholder={t("checklistPh")} />
              <SubmitButton className="shrink-0">{t("addItem")}</SubmitButton>
            </form>
          </section>
        )}

        <section className="card p-5 space-y-3">
          <h2 className="font-semibold">{t("photos")}</h2>
          {plan.completed ? (
            <PhotoUploader tripId={id} planId={planId} photos={photos} max={12} />
          ) : (
            <p className="text-muted">{t("photosLocked")}</p>
          )}
        </section>

        <section className="card border-danger/40 p-5">
          <form action={deletePlan.bind(null, id, planId)}>
            <ConfirmButton className="btn-danger" message={t("deleteConfirm")}>{t("deletePlan")}</ConfirmButton>
          </form>
        </section>
      </main>
    </>
  );
}
