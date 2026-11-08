import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Check, Circle, ExternalLink, Trash2 } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { ConfirmButton } from "@/components/confirm-button";
import { SubmitButton } from "@/components/submit-button";
import { createClient } from "@/lib/supabase/server";
import {
  addTodoItem, createTodoCategory, deleteTodoCategory, deleteTodoItem, moveTodoItem, renameTodoCategory, toggleTodoItem,
} from "@/app/actions";
import type { Todo } from "@/lib/types";

const BUILTIN = ["hotel", "ticket", "cosplay", "plan", "general"] as const;

export default async function TodosPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; cat?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = sp.tab === "done" ? "done" : "open";
  const t = await getTranslations("todos");
  const c = await getTranslations("common");
  const dc = await getTranslations("dash");
  const supabase = await createClient();
  const [{ data: trip }, { data: catRows }, { data: todoRows }] = await Promise.all([
    supabase.from("trips").select("id,title").eq("id", id).maybeSingle(),
    supabase.from("todo_categories").select("id,name").eq("trip_id", id).order("position").order("name"),
    supabase.from("todos").select("*").eq("trip_id", id).order("due_date", { nullsFirst: false }).order("title"),
  ]);
  if (!trip) notFound();
  const cats = (catRows ?? []) as { id: string; name: string }[];
  const todos = (todoRows ?? []) as (Todo & { due_date: string | null })[];
  const openCount = todos.filter((x) => !x.done).length;
  const doneCount = todos.length - openCount;

  // Group key: custom category id, else the built-in category.
  const keyOf = (x: Todo) => (x.category_id && cats.some((k) => k.id === x.category_id) ? `c:${x.category_id}` : `b:${x.category}`);
  const groups = [
    ...cats.map((k) => ({ key: `c:${k.id}`, label: k.name, custom: k })),
    ...BUILTIN.map((b) => ({ key: `b:${b}`, label: dc(`cats.${b}`), custom: null as null | { id: string; name: string } })),
  ];
  const shown = todos.filter((x) => (tab === "done" ? x.done : !x.done));
  const filter = sp.cat && groups.some((g) => g.key === sp.cat) ? sp.cat : null;
  const href = (over: { tab?: string; cat?: string | null }) => {
    const q = new URLSearchParams();
    const tb = over.tab ?? tab;
    if (tb === "done") q.set("tab", "done");
    const ct = over.cat === undefined ? filter : over.cat;
    if (ct) q.set("cat", ct);
    const s = q.toString();
    return `/t/${id}/todos${s ? `?${s}` : ""}`;
  };
  const srcHref = (x: Todo) =>
    x.hotel_id ? `/t/${id}/hotels/${x.hotel_id}` : x.commute_id ? `/t/${id}/commutes/${x.commute_id}` : x.plan_id ? `/t/${id}/plans/${x.plan_id}` : null;

  const tabCls = (on: boolean) => `rounded-full px-4 py-1.5 text-sm ${on ? "bg-primary text-white" : "bg-surface-2 text-muted hover:text-text"}`;
  const chipCls = (on: boolean) => `chip ${on ? "" : "!bg-surface-2 !text-muted"}`;

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-8">
        <div>
          <Link href={`/t/${id}`} className="inline-flex items-center gap-1 text-muted hover:text-text"><ArrowLeft size={14} /> {c("back")}</Link>
          <h1 className="mt-1 text-[28px] font-semibold leading-tight">{trip.title} · {t("title")}</h1>
        </div>

        <div className="flex gap-2" role="tablist">
          <Link role="tab" aria-selected={tab === "open"} href={href({ tab: "open" })} className={tabCls(tab === "open")}>{t("open")} ({openCount})</Link>
          <Link role="tab" aria-selected={tab === "done"} href={href({ tab: "done" })} className={tabCls(tab === "done")}>{t("done")} ({doneCount})</Link>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href={href({ cat: null })} className={chipCls(!filter)}>{t("all")}</Link>
          {groups.map((g) => (
            <Link key={g.key} href={href({ cat: g.key })} className={chipCls(filter === g.key)}>{g.label}</Link>
          ))}
        </div>

        {shown.length === 0 ? (
          <p className="text-muted">{tab === "done" ? t("emptyDone") : t("emptyOpen")}</p>
        ) : (
          groups
            .filter((g) => !filter || g.key === filter)
            .map((g) => {
              const list = shown.filter((x) => keyOf(x) === g.key);
              if (list.length === 0) return null;
              return (
                <section key={g.key} className="card space-y-1 p-4">
                  <h2 className="font-medium">{g.label} <span className="text-xs text-muted tabular-nums">{list.length}</span></h2>
                  <ul>
                    {list.map((x) => {
                      const src = srcHref(x);
                      return (
                        <li key={x.id} className="flex flex-wrap items-center gap-2">
                          <form action={toggleTodoItem.bind(null, id, x.id, !x.done)}>
                            <button className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-surface-2" aria-label={x.done ? t("reopen") : t("complete")}>
                              {x.done ? <Check size={18} className="text-success" /> : <Circle size={18} className="text-muted" />}
                            </button>
                          </form>
                          <span className={`min-w-0 flex-1 ${x.done ? "text-muted line-through" : ""}`}>
                            {x.title}
                            {x.due_date && <span className="ml-2 text-xs text-muted tabular-nums">{t("due", { d: x.due_date })}</span>}
                          </span>
                          {cats.length > 0 && (
                            <form action={moveTodoItem.bind(null, id, x.id)} className="flex items-center gap-1">
                              <select name="cat" defaultValue={keyOf(x)} className="input !h-8 !w-auto !py-0 text-xs" aria-label={t("move")}>
                                <option value={`b:${x.category}`}>{dc(`cats.${x.category}`)}</option>
                                {cats.map((k) => <option key={k.id} value={`c:${k.id}`}>{k.name}</option>)}
                              </select>
                              <button className="btn btn-sm">{t("move")}</button>
                            </form>
                          )}
                          {src && <Link href={src} className="text-muted hover:text-text" aria-label={dc("open")}><ExternalLink size={14} /></Link>}
                          {!x.auto_generated && (
                            <form action={deleteTodoItem.bind(null, id, x.id)}>
                              <button className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-danger" aria-label={c("delete")}><Trash2 size={14} /></button>
                            </form>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })
        )}

        <section className="card space-y-3 p-4">
          <h2 className="font-semibold">{t("add")}</h2>
          <form action={addTodoItem.bind(null, id)} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_9rem_9rem_auto]">
            <input name="title" className="input" required maxLength={200} placeholder={t("titlePh")} />
            <select name="cat" className="input" defaultValue={filter?.startsWith("c:") ? filter : "b:general"} aria-label={t("category")}>
              <option value="b:general">{dc("cats.general")}</option>
              {cats.map((k) => <option key={k.id} value={`c:${k.id}`}>{k.name}</option>)}
            </select>
            <input name="due_date" type="date" className="input" aria-label={t("dueLabel")} />
            <SubmitButton>{t("addBtn")}</SubmitButton>
          </form>
        </section>

        <section className="card space-y-3 p-4">
          <h2 className="font-semibold">{t("categories")}</h2>
          <p className="text-xs text-muted">{t("categoriesHint")}</p>
          {cats.length > 0 && (
            <ul className="space-y-2">
              {cats.map((k) => (
                <li key={k.id} className="flex items-center gap-2">
                  <form action={renameTodoCategory.bind(null, id, k.id)} className="flex flex-1 gap-2">
                    <input name="name" className="input" required maxLength={40} defaultValue={k.name} aria-label={t("categoryName")} />
                    <button className="btn btn-sm shrink-0">{c("save")}</button>
                  </form>
                  <form action={deleteTodoCategory.bind(null, id, k.id)}>
                    <ConfirmButton className="btn-danger btn-sm" message={t("deleteCategoryConfirm")}>{c("delete")}</ConfirmButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <form action={createTodoCategory.bind(null, id)} className="flex gap-2 border-t border-border pt-3">
            <input name="name" className="input" required maxLength={40} placeholder={t("categoryPh")} />
            <SubmitButton className="shrink-0">{t("addCategory")}</SubmitButton>
          </form>
        </section>
      </main>
    </>
  );
}
