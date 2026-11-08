"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, Circle, X } from "lucide-react";
import { deleteShoppingItem, updateShoppingItem } from "@/app/shopping-actions";

export type ShoppingItem = { id: string; title: string; done: boolean; amount: number | null; currency: string | null; note: string | null };
export const COMMON_CURRENCIES = ["TWD", "JPY", "USD", "EUR", "KRW", "GBP", "HKD", "THB", "SGD"];

/** One shopping-list line: check (purchased) / amount + currency / note. Every change saves by itself. */
export function ShoppingItemRow({
  tripId, item, tripCurrency, onGone,
}: { tripId: string; item: ShoppingItem; tripCurrency: string; onGone?: (id: string) => void }) {
  const t = useTranslations("todos");
  const [, start] = useTransition();
  const [done, setDone] = useState(item.done);
  const [title, setTitle] = useState(item.title);
  const [amount, setAmount] = useState(item.amount != null ? String(item.amount) : "");
  const [cur, setCur] = useState(item.currency ?? tripCurrency);
  const [note, setNote] = useState(item.note ?? "");
  const [gone, setGone] = useState(false);
  const [err, setErr] = useState(false);
  const save = (patch: Parameters<typeof updateShoppingItem>[2]) =>
    start(async () => {
      setErr(false);
      try { await updateShoppingItem(tripId, item.id, patch); } catch { setErr(true); }
    });
  if (gone) return null;
  const amt = amount.trim() === "" ? null : Number(amount);
  const amtOk = amt == null || (Number.isFinite(amt) && amt >= 0);
  return (
    <li
      className="space-y-1.5 py-1.5"
      onKeyDown={(e) => { if (e.key === "Enter" && e.target instanceof HTMLInputElement && !e.nativeEvent.isComposing) { e.preventDefault(); e.target.blur(); } }}
    >
      <div className="flex items-center gap-2">
        <button
          type="button" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md hover:bg-surface-2" aria-label={done ? t("notBought") : t("bought")} aria-pressed={done}
          onClick={() => { setDone(!done); save({ done: !done }); }}
        >
          {done ? <Check size={18} className="text-success" /> : <Circle size={18} className="text-muted" />}
        </button>
        <input
          className={`input flex-1 ${done ? "text-muted line-through" : ""}`} value={title} maxLength={200} aria-label={t("shoppingPh")}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => { const v = title.trim(); if (v && v !== item.title) save({ title: v }); else if (!v) setTitle(item.title); }}
        />
        <button
          type="button" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-danger" aria-label={t("removeItem")}
          onClick={() => { setGone(true); onGone?.(item.id); start(async () => { try { await deleteShoppingItem(tripId, item.id); } catch { setGone(false); setErr(true); } }); }}
        ><X size={14} /></button>
      </div>
      <div className="grid grid-cols-[6rem_4.5rem_1fr] gap-2 pl-12">
        <input
          className="input" inputMode="decimal" placeholder={t("amount")} aria-label={t("amount")} value={amount}
          aria-invalid={!amtOk}
          onChange={(e) => setAmount(e.target.value)}
          onBlur={() => { if (amtOk && amt !== item.amount) save({ amount: amt }); }}
        />
        <input
          className="input uppercase" list="shopping-currencies" maxLength={3} value={cur} aria-label="currency"
          onChange={(e) => setCur(e.target.value.toUpperCase())}
          onBlur={() => { if (/^[A-Z]{3}$/.test(cur) && cur !== (item.currency ?? tripCurrency)) save({ currency: cur }); else if (!/^[A-Z]{3}$/.test(cur)) setCur(item.currency ?? tripCurrency); }}
        />
        <input
          className="input" placeholder={t("note")} aria-label={t("note")} value={note} maxLength={500}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => { if (note.trim() !== (item.note ?? "")) save({ note: note.trim() || null }); }}
        />
      </div>
      {err && <p role="alert" className="pl-12 text-xs text-danger">!</p>}
    </li>
  );
}

export function CurrencyList() {
  return <datalist id="shopping-currencies">{COMMON_CURRENCIES.map((c) => <option key={c} value={c} />)}</datalist>;
}
