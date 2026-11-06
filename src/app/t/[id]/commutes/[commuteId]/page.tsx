import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Check, Circle, Trash2 } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { CommuteForm } from "@/components/commute-form";
import { ConfirmButton } from "@/components/confirm-button";
import { SubmitButton } from "@/components/submit-button";
import { createClient } from "@/lib/supabase/server";
import { addCommuteTodo, deleteCommute, deleteCommuteTodo, toggleCommuteTodo, updateCommute } from "@/app/actions";
import { utcToLocal } from "@/lib/tz";
import type { Commute, Todo, Trip } from "@/lib/types";

export default async function EditCommute({ params }: { params: Promise<{ id: string; commuteId: string }> }) {
  const { id, commuteId } = await params;
  const t = await getTranslations("commute");
  const c = await getTranslations("common");
  const supabase = await createClient();
  const [{ data: tripRow }, { data: cRow }, { data: todoRows }] = await Promise.all([
    supabase.from("trips").select("*").eq("id", id).maybeSingle(),
    supabase.from("commutes").select("*").eq("id", commuteId).eq("trip_id", id).maybeSingle(),
    supabase.from("todos").select("*").eq("commute_id", commuteId).order("done").order("title"),
  ]);
  if (!tripRow || !cRow) notFound();
  const trip = tripRow as Trip;
  const commute = cRow as Commute;
  const todos = (todoRows ?? []) as Todo[];

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-8 space-y-6">
        <Link href={`/t/${id}`} className="inline-flex items-center gap-1 text-muted hover:text-text"><ArrowLeft size={14} /> {c("back")}</Link>
        <h1 className="text-xl font-semibold">{t("editTitle")}</h1>

        <div className="card p-5">
          <CommuteForm
            action={updateCommute.bind(null, id, commuteId)}
            commute={commute}
            fromPlanId={commute.from_plan_id}
            toPlanId={commute.to_plan_id}
            defaults={{
              origin: { label: commute.origin_label ?? "", placeId: commute.origin_place_id ?? "" },
              dest: { label: commute.dest_label ?? "", placeId: commute.dest_place_id ?? "" },
              start: utcToLocal(commute.start_at, trip.timezone),
              method: commute.method,
              duration: commute.duration_min,
            }}
            tz={trip.timezone}
            currency={trip.currency}
            submitLabel={c("save")}
          />
        </div>

        {(commute.payment === "ticket" || todos.length > 0) && (
          <section className="card p-5 space-y-3">
            <h2 className="font-semibold">{t("todos")}</h2>
            {todos.length === 0 ? (
              <p className="text-muted">{t("noTodos")}</p>
            ) : (
              <ul className="space-y-1">
                {todos.map((todo) => (
                  <li key={todo.id} className="flex items-center gap-2">
                    <form action={toggleCommuteTodo.bind(null, id, commuteId, todo.id, !todo.done)}>
                      <button className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-surface-2" aria-label={todo.done ? "undo" : "done"}>
                        {todo.done ? <Check size={18} className="text-success" /> : <Circle size={18} className="text-muted" />}
                      </button>
                    </form>
                    <span className={`flex-1 ${todo.done ? "text-muted line-through" : ""}`}>{todo.title}</span>
                    {!todo.auto_generated && (
                      <form action={deleteCommuteTodo.bind(null, id, commuteId, todo.id)}>
                        <button className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-danger" aria-label={c("delete")}>
                          <Trash2 size={14} />
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <form action={addCommuteTodo.bind(null, id, commuteId)} className="flex gap-2 border-t border-border pt-3">
              <input name="title" className="input" required maxLength={200} placeholder={t("todoPh")} />
              <SubmitButton className="shrink-0">{t("addTodo")}</SubmitButton>
            </form>
          </section>
        )}

        <section className="card border-danger/40 p-5">
          <form action={deleteCommute.bind(null, id, commuteId)}>
            <ConfirmButton className="btn-danger" message={t("deleteConfirm")}>{t("deleteCommute")}</ConfirmButton>
          </form>
        </section>
      </main>
    </>
  );
}
