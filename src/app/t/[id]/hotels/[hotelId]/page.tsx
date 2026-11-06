import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Check, Circle, Trash2 } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { ConfirmButton } from "@/components/confirm-button";
import { HotelForm } from "@/components/hotel-form";
import { SubmitButton } from "@/components/submit-button";
import { createClient } from "@/lib/supabase/server";
import { addHotelTodo, deleteHotel, deleteTodo, toggleTodo, updateHotel } from "@/app/actions";
import { utcToLocal } from "@/lib/tz";
import type { Hotel, Todo, Trip } from "@/lib/types";

export default async function EditHotel({ params }: { params: Promise<{ id: string; hotelId: string }> }) {
  const { id, hotelId } = await params;
  const t = await getTranslations("hotel");
  const c = await getTranslations("common");
  const supabase = await createClient();
  const [{ data: tripRow }, { data: hotelRow }, { data: todoRows }] = await Promise.all([
    supabase.from("trips").select("*").eq("id", id).maybeSingle(),
    supabase.from("hotels").select("*").eq("id", hotelId).eq("trip_id", id).maybeSingle(),
    supabase.from("todos").select("*").eq("hotel_id", hotelId).order("done").order("sort", { nullsFirst: false }).order("title"),
  ]);
  if (!tripRow || !hotelRow) notFound();
  const trip = tripRow as Trip;
  const hotel = hotelRow as Hotel;
  const todos = (todoRows ?? []) as Todo[];

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-8 space-y-6">
        <Link href={`/t/${id}`} className="inline-flex items-center gap-1 text-muted hover:text-text"><ArrowLeft size={14} /> {c("back")}</Link>
        <h1 className="text-xl font-semibold">{t("editTitle")}</h1>

        <div className="card p-5">
          <HotelForm
            action={updateHotel.bind(null, id, hotelId)}
            hotel={hotel}
            tz={trip.timezone}
            currency={trip.currency}
            defaults={{ check_in: utcToLocal(hotel.check_in, trip.timezone), check_out: utcToLocal(hotel.check_out, trip.timezone) }}
            submitLabel={c("save")}
          />
        </div>

        {(hotel.booking_status === "not_booked" || todos.length > 0) && (
          <section className="card p-5 space-y-3">
            <h2 className="font-semibold">{t("todos")}</h2>
            {todos.length === 0 ? (
              <p className="text-muted">{t("noTodos")}</p>
            ) : (
              <ul className="space-y-1">
                {todos.map((todo) => (
                  <li key={todo.id} className="flex items-center gap-2">
                    <form action={toggleTodo.bind(null, id, hotelId, todo.id, !todo.done)}>
                      <button className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-surface-2" aria-label={todo.done ? "undo" : "done"}>
                        {todo.done ? <Check size={18} className="text-success" /> : <Circle size={18} className="text-muted" />}
                      </button>
                    </form>
                    <span className={`flex-1 ${todo.done ? "text-muted line-through" : ""}`}>{todo.title}</span>
                    {!todo.auto_generated && (
                      <form action={deleteTodo.bind(null, id, hotelId, todo.id)}>
                        <button className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-danger" aria-label={c("delete")}>
                          <Trash2 size={14} />
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <form action={addHotelTodo.bind(null, id, hotelId)} className="flex gap-2 border-t border-border pt-3">
              <input name="title" className="input" required maxLength={200} placeholder={t("todoPh")} />
              <SubmitButton className="shrink-0">{t("addTodo")}</SubmitButton>
            </form>
          </section>
        )}

        <section className="card border-danger/40 p-5">
          <form action={deleteHotel.bind(null, id, hotelId)}>
            <ConfirmButton className="btn-danger" message={t("deleteConfirm")}>{t("deleteHotel")}</ConfirmButton>
          </form>
        </section>
      </main>
    </>
  );
}
