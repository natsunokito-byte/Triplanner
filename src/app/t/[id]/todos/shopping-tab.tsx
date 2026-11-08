import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { CurrencyList, ShoppingItemRow, type ShoppingItem } from "@/components/shopping-item-row";
import { SubmitButton } from "@/components/submit-button";
import { createClient } from "@/lib/supabase/server";
import { addShoppingItemForm } from "@/app/shopping-actions";
import { localDate } from "@/lib/tz";

type Filter = "all" | "todo" | "bought";

/** "Tasks & lists" page, shopping tab: one group per shopping plan (by date), finished groups folded away. */
export async function ShoppingTab({ id, filter, tripTitle, tz, currency }: { id: string; filter: Filter; tripTitle: string; tz: string; currency: string }) {
  const t = await getTranslations("todos");
  const c = await getTranslations("common");
  const locale = await getLocale();
  const supabase = await createClient();
  const [{ data: planRows }, { data: itemRows }] = await Promise.all([
    supabase.from("plans").select("id,title,start_at,plan_date,completed").eq("trip_id", id).eq("type", "shopping"),
    supabase.from("shopping_items").select("id,plan_id,title,done,amount,currency,note").eq("trip_id", id).order("position"),
  ]);
  const items = new Map<string, ShoppingItem[]>();
  for (const r of itemRows ?? []) {
    const list = items.get(r.plan_id as string) ?? [];
    list.push({ id: r.id as string, title: r.title as string, done: r.done as boolean, amount: r.amount == null ? null : Number(r.amount), currency: r.currency as string | null, note: r.note as string | null });
    items.set(r.plan_id as string, list);
  }
  const plans = (planRows ?? [])
    .map((p) => ({
      id: p.id as string, title: p.title as string, completed: p.completed as boolean,
      date: p.start_at ? localDate(p.start_at as string, tz) : ((p.plan_date as string | null) ?? null),
    }))
    .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999") || a.title.localeCompare(b.title));
  const dayFmt = new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric", weekday: "short", timeZone: "UTC" });

  const groups = plans
    .map((p) => {
      const all = items.get(p.id) ?? [];
      const shown = filter === "todo" ? all.filter((x) => !x.done) : filter === "bought" ? all.filter((x) => x.done) : all;
      const doneAll = all.length > 0 && all.every((x) => x.done);
      const spent = new Map<string, number>();
      for (const x of all) if (x.done && x.amount) spent.set(x.currency ?? currency, (spent.get(x.currency ?? currency) ?? 0) + x.amount);
      return { ...p, all, shown, finished: p.completed || doneAll, spent };
    })
    .filter((g) => filter === "all" || g.shown.length > 0);

  const chip = (on: boolean) => `chip ${on ? "" : "!bg-surface-2 !text-muted"}`;
  const fHref = (f: Filter) => `/t/${id}/todos?tab=shopping${f === "all" ? "" : `&f=${f}`}`;
  const money = (cur: string, n: number) => new Intl.NumberFormat(locale, { style: "currency", currency: cur }).format(n);

  const renderGroup = (g: (typeof groups)[number]) => (
    <details key={g.id} open={!g.finished} className="card p-4">
      <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-2">
        <span className="font-medium">{g.date ? dayFmt.format(new Date(g.date)) : t("noDateShort")} · {g.title}</span>
        <span className="text-xs tabular-nums text-muted">{t("itemsProgress", { done: g.all.filter((x) => x.done).length, total: g.all.length })}</span>
        {g.spent.size > 0 && <span className="text-xs tabular-nums text-muted">{[...g.spent].map(([cur, n]) => money(cur, n)).join(" + ")}</span>}
        <Link href={`/t/${id}/plans/${g.id}`} className="ml-auto text-muted hover:text-text" aria-label={t("goPlan")}><ExternalLink size={14} /></Link>
      </summary>
      <ul className="mt-2 divide-y divide-border">
        {g.shown.map((x) => <ShoppingItemRow key={x.id} tripId={id} item={x} tripCurrency={currency} />)}
      </ul>
      {g.shown.length === 0 && <p className="mt-2 text-sm text-muted">{t("shoppingNoMatch")}</p>}
      <form action={addShoppingItemForm.bind(null, id, g.id)} className="mt-3 flex gap-2 border-t border-border pt-3">
        <input name="title" className="input" maxLength={200} required placeholder={t("shoppingPh")} />
        <SubmitButton className="shrink-0">{c("add")}</SubmitButton>
      </form>
    </details>
  );

  const active = groups.filter((g) => !g.finished);
  const finished = groups.filter((g) => g.finished);

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-8">
        <div>
          <Link href={`/t/${id}`} className="inline-flex items-center gap-1 text-muted hover:text-text"><ArrowLeft size={14} /> {c("back")}</Link>
          <h1 className="mt-1 text-[28px] font-semibold leading-tight">{tripTitle} · {t("title")}</h1>
        </div>
        <nav className="tabs" aria-label={t("title")}>
          <Link href={`/t/${id}/todos`} className="tab">{t("tabTasks")}</Link>
          <Link href={`/t/${id}/todos?tab=shopping`} className="tab tab-active" aria-current="page">{t("tabShopping")}</Link>
        </nav>
        <div className="flex flex-wrap gap-2">
          <Link href={fHref("all")} className={chip(filter === "all")}>{t("allItems")}</Link>
          <Link href={fHref("todo")} className={chip(filter === "todo")}>{t("notBought")}</Link>
          <Link href={fHref("bought")} className={chip(filter === "bought")}>{t("bought")}</Link>
        </div>
        <CurrencyList />
        {plans.length === 0 && <p className="text-muted">{t("shoppingEmpty")}</p>}
        {plans.length > 0 && groups.length === 0 && <p className="text-muted">{t("shoppingNoMatch")}</p>}
        {active.map(renderGroup)}
        {finished.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-muted">{t("completedPlans")} <span className="tabular-nums">{finished.length}</span></h2>
            {finished.map(renderGroup)}
          </section>
        )}
      </main>
    </>
  );
}
