import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, Check, Circle, ExternalLink, Trash2 } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { TodoCategorySelect, TodoDuePicker } from "@/components/todo-row-controls";
import { ConfirmButton } from "@/components/confirm-button";
import { SubmitButton } from "@/components/submit-button";
import { createClient } from "@/lib/supabase/server";
import {
  addTodoItem, createTodoCategory, deleteTodoCategory, deleteTodoItem, moveTodoItem, renameTodoCategory, setTodoDue, toggleTodoItem,
} from "@/app/actions";
import { groupByDate, todoDate } from "@/lib/todo-groups";
import { localDate } from "@/lib/tz";
import type { Todo } from "@/lib/types";

export default async function TodosPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cat?: string; group?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const t = await getTranslations("todos");
  const c = await getTranslations("common");
  const locale = await getLocale();
  const supabase = await createClient();
  const [{ data: trip }, { data: catRows }, { data: todoRows }, { data: planRows }] = await Promise.all([
    supabase.from("trips").select("id,title,timezone").eq("id", id).maybeSingle(),
    supabase.from("todo_categories").select("id,name").eq("trip_id", id).order("position").order("name"),
    supabase.from("todos").select("*").eq("trip_id", id).order("title"),
    supabase.from("plans").select("id,start_at,plan_date").eq("trip_id", id),
  ]);
  if (!trip) notFound();
  const cats = (catRows ?? []) as { id: string; name: string }[];
  const todos = (todoRows ?? []) as Todo[];
  const hasCats = cats.length > 0;
  const planDates = new Map<string, string | null>(
    (planRows ?? []).map((p) => [p.id as string, p.start_at ? localDate(p.start_at as string, trip.timezone) : ((p.plan_date as string | null) ?? null)]),
  );
  const dateOf = (x: Todo) => todoDate(x, planDates);

  // "Uncategorised" = no (still existing) custom category. Custom categories only exist once the user makes them.
  const catKeyOf = (x: Todo) => (x.category_id && cats.some((k) => k.id === x.category_id) ? `c:${x.category_id}` : "u");
  const catGroups = [...cats.map((k) => ({ key: `c:${k.id}`, label: k.name })), { key: "u", label: t("uncategorized") }];
  const filter = hasCats && sp.cat && catGroups.some((g) => g.key === sp.cat) ? sp.cat : null;
  const groupMode: "date" | "cat" = hasCats && sp.group === "cat" ? "cat" : "date"; // date is the default

  const visible = filter ? todos.filter((x) => catKeyOf(x) === filter) : todos;
  const byDate = (a: Todo, b: Todo) => (dateOf(a) ?? "9999").localeCompare(dateOf(b) ?? "9999") || a.title.localeCompare(b.title);
  const open = visible.filter((x) => !x.done).sort(byDate);
  const done = visible.filter((x) => x.done).sort(byDate);

  const href = (over: { cat?: string | null; group?: string }) => {
    const q = new URLSearchParams();
    const ct = over.cat === undefined ? filter : over.cat;
    if (ct) q.set("cat", ct);
    const gp = over.group ?? groupMode;
    if (gp === "cat") q.set("group", "cat");
    const s = q.toString();
    return `/t/${id}/todos${s ? `?${s}` : ""}`;
  };
  const srcHref = (x: Todo) =>
    x.hotel_id ? `/t/${id}/hotels/${x.hotel_id}` : x.commute_id ? `/t/${id}/commutes/${x.commute_id}` : x.plan_id ? `/t/${id}/plans/${x.plan_id}` : null;
  const dayFmt = new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric", weekday: "short", timeZone: "UTC" });

  const sections: { key: string; heading: string | null; items: Todo[] }[] =
    groupMode === "date"
      ? groupByDate(open, dateOf).map((g) => ({ key: g.date ?? "none", heading: g.date ? dayFmt.format(new Date(g.date)) : t("noDate"), items: g.items }))
      : catGroups.map((g) => ({ key: g.key, heading: g.label, items: open.filter((x) => catKeyOf(x) === g.key) })).filter((g) => g.items.length > 0);

  const chipCls = (on: boolean) => `chip ${on ? "" : "!bg-surface-2 !text-muted"}`;
  const segCls = (on: boolean) => `seg-item ${on ? "seg-item-active" : ""}`;

  const row = (x: Todo) => {
    const src = srcHref(x);
    return (
      <li key={x.id} className="flex min-h-10 flex-wrap items-center gap-2">
        {src && <Link href={src} className="text-muted hover:text-text" aria-label={t("open")}><ExternalLink size={14} /></Link>}
        <form action={toggleTodoItem.bind(null, id, x.id, !x.done)} className="flex items-center">
          <button className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-surface-2" aria-label={x.done ? t("reopen") : t("complete")}>
            {x.done ? <Check size={18} className="text-success" /> : <Circle size={18} className="text-muted" />}
          </button>
        </form>
        <span className={`min-w-0 flex-1 ${x.done ? "text-muted line-through" : ""}`}>
          {x.title}
          {groupMode === "cat" && !x.due_date && dateOf(x) && <span className="ml-2 text-xs text-muted tabular-nums">{dateOf(x)}</span>}
        </span>
        <TodoDuePicker action={setTodoDue.bind(null, id, x.id)} value={x.due_date} />
        {hasCats && <TodoCategorySelect action={moveTodoItem.bind(null, id, x.id)} value={catKeyOf(x) === "u" ? "b:none" : catKeyOf(x)} cats={cats} />}
        {!x.auto_generated && (
          <form action={deleteTodoItem.bind(null, id, x.id)} className="flex items-center">
            <button className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-danger" aria-label={c("delete")}><Trash2 size={14} /></button>
          </form>
        )}
      </li>
    );
  };

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-8">
        <div>
          <Link href={`/t/${id}`} className="inline-flex items-center gap-1 text-muted hover:text-text"><ArrowLeft size={14} /> {c("back")}</Link>
          <h1 className="mt-1 text-[28px] font-semibold leading-tight">{trip.title} · {t("title")}</h1>
        </div>

        {hasCats && (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex flex-wrap gap-2">
              <Link href={href({ cat: null })} className={chipCls(!filter)}>{t("all")}</Link>
              {catGroups.map((g) => (
                <Link key={g.key} href={href({ cat: g.key })} className={chipCls(filter === g.key)}>{g.label}</Link>
              ))}
            </div>
            <div className="seg" role="group" aria-label={t("groupBy")}>
              <Link href={href({ group: "date" })} className={segCls(groupMode === "date")} aria-pressed={groupMode === "date"}>{t("byDate")}</Link>
              <Link href={href({ group: "cat" })} className={segCls(groupMode === "cat")} aria-pressed={groupMode === "cat"}>{t("byCategory")}</Link>
            </div>
          </div>
        )}

        {open.length === 0 ? (
          <p className="text-muted">{t("emptyOpen")}</p>
        ) : (
          sections.map((g) => (
            <section key={g.key} className="card space-y-1 p-4">
              {g.heading && <h2 className="font-medium">{g.heading} <span className="text-xs text-muted tabular-nums">{g.items.length}</span></h2>}
              <ul>{g.items.map(row)}</ul>
            </section>
          ))
        )}

        <section className="card space-y-3 p-4">
          <h2 className="font-semibold">{t("add")}</h2>
          <form action={addTodoItem.bind(null, id)} className={`grid grid-cols-1 gap-2 ${hasCats ? "sm:grid-cols-[1fr_9rem_9rem_auto]" : "sm:grid-cols-[1fr_9rem_auto]"}`}>
            <input name="title" className="input" required maxLength={200} placeholder={t("titlePh")} />
            {hasCats ? (
              <select name="cat" className="input" defaultValue={filter?.startsWith("c:") ? filter : "b:none"} aria-label={t("category")}>
                <option value="b:none">{t("uncategorized")}</option>
                {cats.map((k) => <option key={k.id} value={`c:${k.id}`}>{k.name}</option>)}
              </select>
            ) : <input type="hidden" name="cat" value="b:none" />}
            <input name="due_date" type="date" className="input" aria-label={t("dueLabel")} />
            <SubmitButton>{t("addBtn")}</SubmitButton>
          </form>
        </section>

        {done.length > 0 && (
          <details className="card p-4">
            <summary className="cursor-pointer font-medium">{t("done")} <span className="text-xs text-muted tabular-nums">{done.length}</span></summary>
            <ul className="mt-2">{done.map(row)}</ul>
          </details>
        )}

        <section className="card space-y-3 p-4">
          <h2 className="font-semibold">{t("categories")}</h2>
          <p className="text-xs text-muted">{t("categoriesHint")}</p>
          {cats.length > 0 && (
            <ul className="space-y-2">
              {cats.map((k) => (
                <li key={k.id} className="flex items-center gap-2">
                  <form action={renameTodoCategory.bind(null, id, k.id)} className="flex flex-1 items-center gap-2">
                    <input name="name" className="input" required maxLength={40} defaultValue={k.name} aria-label={t("categoryName")} />
                    <button className="btn shrink-0">{c("save")}</button>
                  </form>
                  <form action={deleteTodoCategory.bind(null, id, k.id)} className="flex items-center">
                    <ConfirmButton className="btn-danger shrink-0" message={t("deleteCategoryConfirm")}>{c("delete")}</ConfirmButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <form action={createTodoCategory.bind(null, id)} className="flex items-center gap-2 border-t border-border pt-3">
            <input name="name" className="input" required maxLength={40} placeholder={t("categoryPh")} />
            <SubmitButton className="shrink-0">{t("addCategory")}</SubmitButton>
          </form>
        </section>
      </main>
    </>
  );
}
