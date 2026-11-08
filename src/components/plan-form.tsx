"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { UsdHint } from "./fx";
import { PLAN_ICON, SELECTABLE_TYPES, TASK_TODO_TYPES, VISIBILITIES, ptVars, type PlanType, type Visibility } from "@/lib/plan-types";
import { formatHours, hoursToMinutes, planTotal } from "@/lib/cost";
import { Plus, X } from "lucide-react";
import type { Person, Plan } from "@/lib/types";

type Item = { label: string; amount: string; per_hour: boolean };
type TodoLine = { title: string; cat: string };

export function PlanForm({
  action,
  plan,
  planPeople = [],
  people,
  defaults,
  tz,
  currency,
  submitLabel,
  back,
  formId,
  intercepted = false,
  costItems = [],
  categories = [],
}: {
  action: (fd: FormData) => Promise<void>;
  plan?: Plan;
  planPeople?: string[];
  people: Person[];
  defaults: { date: string | null; time: string | null; type: PlanType };
  tz: string;
  currency: string;
  submitLabel: string;
  back?: string;
  formId?: string;
  /** true when rendered inside the drawer: save closes the drawer instead of redirecting */
  intercepted?: boolean;
  costItems?: { label: string; amount: number; per_hour: boolean }[];
  categories?: { id: string; name: string }[];
}) {
  const t = useTranslations("plan");
  const router = useRouter();
  const [type, setType] = useState<PlanType>(plan?.type ?? defaults.type);
  const [visibility, setVisibility] = useState<Visibility>(plan?.visibility ?? "normal");
  const [hours, setHours] = useState(formatHours(plan?.duration_min ?? 60));
  const [cur, setCur] = useState(plan?.cost_currency ?? currency);
  // Existing plans from before itemised costs: show the old single amount as one item.
  const [items, setItems] = useState<Item[]>(
    costItems.length
      ? costItems.map((i) => ({ label: i.label, amount: String(i.amount), per_hour: i.per_hour }))
      : plan?.cost != null && plan.photographer_fee == null && plan.studio_fee == null
        ? [{ label: t("itemDefault"), amount: String(plan.cost), per_hour: false }]
        : [],
  );
  const [pFee, setPFee] = useState(plan?.photographer_fee != null ? String(plan.photographer_fee) : "");
  const [sFee, setSFee] = useState(plan?.studio_fee != null ? String(plan.studio_fee) : "");
  const [todoLines, setTodoLines] = useState<TodoLine[]>([]);
  const [selected, setSelected] = useState<string[]>(planPeople);

  const ownerOnly = visibility === "owner_only";
  const duration = hoursToMinutes(Number(hours));
  const badDuration = hours.trim() === "" || !Number.isFinite(duration) || Number(hours) < 0.5 || Number(hours) > 48;
  const isCosplay = type === "cosplay_photoshoot";
  const isWake = type === "wake_up"; // only records a time: no title/place/duration/cost needed
  const num = (v: string) => (v.trim() === "" || !Number.isFinite(Number(v)) || Number(v) < 0 ? null : Number(v));
  const cleanItems = items
    .filter((i) => num(i.amount) != null)
    .map((i) => ({ label: i.label.trim() || t("itemDefault"), amount: num(i.amount)!, per_hour: i.per_hour }));
  const total = planTotal({
    items: cleanItems,
    durationMin: Number.isFinite(duration) ? duration : 60,
    photographerFee: isCosplay ? num(pFee) : null,
    studioFee: isCosplay ? num(sFee) : null,
  });
  const patchItem = (i: number, patch: Partial<Item>) => setItems(items.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const patchTodo = (i: number, patch: Partial<TodoLine>) => setTodoLines(todoLines.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const cleanTodos = todoLines.filter((x) => x.title.trim() !== "").map((x) => ({ title: x.title.trim(), cat: x.cat }));

  const todoBlock = (
      <fieldset hidden={isWake} className="space-y-2">
        <legend className="label">{TASK_TODO_TYPES.includes(type) ? t("taskTodos") : t("planTodos")}</legend>
        <input type="hidden" name="new_todos" value={JSON.stringify(cleanTodos)} />
        {todoLines.map((x, i) => (
          <div key={i} className={`grid items-center gap-2 ${categories.length > 0 ? "grid-cols-[1fr_8rem_auto]" : "grid-cols-[1fr_auto]"}`}>
            <input className="input" maxLength={200} placeholder={t("planTodoPh")} value={x.title} onChange={(e) => patchTodo(i, { title: e.target.value })} />
            {categories.length > 0 ? (
              <select className="input" value={x.cat} onChange={(e) => patchTodo(i, { cat: e.target.value })} aria-label={t("todoCategory")}>
                <option value="b:auto">{t("uncategorized")}</option>
                {categories.map((c) => <option key={c.id} value={`c:${c.id}`}>{c.name}</option>)}
              </select>
            ) : <span />}
            <button type="button" className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-danger" aria-label={t("removeItem")} onClick={() => setTodoLines(todoLines.filter((_, k) => k !== i))}><X size={14} /></button>
          </div>
        ))}
        <button type="button" className="btn btn-sm" onClick={() => setTodoLines([...todoLines, { title: "", cat: "b:auto" }])}><Plus size={14} /> {t("addPlanTodo")}</button>
      </fieldset>
  );

  return (
    <form
      id={formId}
      action={async (fd) => {
        await action(fd);
        if (intercepted) router.back();
      }}
      className="space-y-5"
    >
      {(intercepted || back) && <input type="hidden" name="back" value={intercepted ? "close" : back} />}
      <fieldset>
        <legend className="label">{t("type")}</legend>
        <input type="hidden" name="type" value={type} />
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {SELECTABLE_TYPES.map((k) => {
            const Icon = PLAN_ICON[k];
            const c = ptVars(k);
            const on = type === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setType(k)}
                aria-pressed={on}
                className="flex flex-col items-center gap-1 rounded-[8px] border p-2 text-xs transition-colors"
                style={on ? { background: c.bg, color: c.fg, borderColor: c.dot } : { borderColor: "var(--border)" }}
              >
                <Icon size={18} />
                {t(`types.${k}`)}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div>
        <label className="label" htmlFor="title">{t("title")}</label>
        <input id="title" name="title" className="input" required={!isWake} maxLength={160} placeholder={isWake ? t("types.wake_up") : t("titlePh")} defaultValue={plan?.title} />
      </div>

      {isCosplay && (
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="label" htmlFor="character_name">{t("character")}</label>
            <input id="character_name" name="character_name" className="input" maxLength={120} defaultValue={plan?.character_name ?? ""} />
          </div>
          <div className="col-span-2">
            <label className="label" htmlFor="photographer_name">{t("photographer")}</label>
            <input id="photographer_name" name="photographer_name" className="input" maxLength={120} defaultValue={plan?.photographer_name ?? ""} />
          </div>
          <div>
            <label className="label" htmlFor="photographer_fee">{t("photographerFee")}</label>
            <input id="photographer_fee" name="photographer_fee" type="number" min="0" step="0.01" className="input" value={pFee} onChange={(e) => setPFee(e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="label" htmlFor="studio_name">{t("studioName")}</label>
            <input id="studio_name" name="studio_name" className="input" maxLength={120} defaultValue={plan?.studio_name ?? ""} />
          </div>
          <div>
            <label className="label" htmlFor="studio_fee">{t("studioFee")}</label>
            <input id="studio_fee" name="studio_fee" type="number" min="0" step="0.01" className="input" value={sFee} onChange={(e) => setSFee(e.target.value)} />
          </div>
        </div>
      )}

      <div hidden={isWake} className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="location_name">{t("location")}</label>
          <input id="location_name" name="location_name" className="input" maxLength={200} placeholder={t("locationPh")} defaultValue={plan?.location_name ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="location_address">{t("address")}</label>
          <input id="location_address" name="location_address" className="input" maxLength={300} defaultValue={plan?.location_address ?? ""} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="date">{t("date")}</label>
          <input id="date" name="date" type="date" className="input" defaultValue={defaults.date ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="time">{t("time")}</label>
          <input id="time" name="time" type="time" className="input" required={isWake} defaultValue={defaults.time ?? ""} />
        </div>
        <p className="col-span-2 -mt-1 text-xs text-muted">{t("scheduleHint")}</p>
        <div hidden={isWake}>
          <label className="label" htmlFor="duration_h">{t("duration")}</label>
          <input id="duration_h" type="number" min={0.5} max={48} step={0.5} className="input" required={!isWake} value={hours} onChange={(e) => setHours(e.target.value)} />
          <input type="hidden" name="duration_min" value={Number.isFinite(duration) ? duration : ""} />
        </div>
        <div hidden={isWake} className="col-span-2 flex flex-wrap items-center gap-2">
          {(type === "work" ? [4, 8] : [0.5, 1, 1.5, 2, 3, 4]).map((h) => (
            <button key={h} type="button" className={`chip ${Number(hours) === h ? "" : "!bg-surface-2 !text-muted"}`} onClick={() => setHours(String(h))}>{h}</button>
          ))}
          <span className="text-xs text-muted">{t("durationHint")} · {t("tzNote", { tz })}</span>
        </div>
        {badDuration && !isWake && <p className="col-span-2 text-xs text-danger">{t("timeError")}</p>}
      </div>

      {type === "crunch" && todoBlock}

      <div>
        <label className="label">{t("visibility")}</label>
        <select name="visibility" className="input" value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
          {VISIBILITIES.map((v) => <option key={v} value={v}>{t(`vis.${v}`)}</option>)}
        </select>
        <p className="mt-1 text-xs text-muted">{t(`visHint.${visibility}`)}</p>
      </div>

      <fieldset hidden={isWake} disabled={ownerOnly} className={ownerOnly ? "opacity-50" : ""}>
        <legend className="label">{t("people")}</legend>
        {people.length === 0 ? (
          <p className="text-xs text-muted">{t("noPeople")}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {people.map((p) => {
              const on = selected.includes(p.id);
              return (
                <label key={p.id} className={`chip cursor-pointer ${on ? "" : "!bg-surface-2 !text-muted"}`}>
                  <input
                    type="checkbox" name="person" value={p.id} className="sr-only" checked={on && !ownerOnly}
                    onChange={() => setSelected(on ? selected.filter((x) => x !== p.id) : [...selected, p.id])}
                  />
                  {p.name}
                </label>
              );
            })}
          </div>
        )}
      </fieldset>

      <fieldset hidden={isWake} className="space-y-3">
        <legend className="label">{t("cost")}</legend>
        <input type="hidden" name="cost_items" value={JSON.stringify(cleanItems)} />
        {items.map((it, i) => (
          <div key={i} className="grid grid-cols-[1fr_7rem_auto] items-center gap-2">
            <input className="input" maxLength={80} placeholder={t("itemLabelPh")} aria-label={t("itemLabel")} value={it.label} onChange={(e) => patchItem(i, { label: e.target.value })} />
            <input className="input" type="number" min="0" step="0.01" placeholder="0" aria-label={t("itemAmount")} value={it.amount} onChange={(e) => patchItem(i, { amount: e.target.value })} />
            <button type="button" className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-danger" aria-label={t("removeItem")} onClick={() => setItems(items.filter((_, k) => k !== i))}><X size={14} /></button>
            <label className="col-span-3 -mt-1 flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={it.per_hour} onChange={(e) => patchItem(i, { per_hour: e.target.checked })} />
              {t("perHour", { h: Number.isFinite(duration) ? formatHours(duration) : "?" })}
            </label>
          </div>
        ))}
        <button type="button" className="btn btn-sm" onClick={() => setItems([...items, { label: "", amount: "", per_hour: false }])}><Plus size={14} /> {t("addCostItem")}</button>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 rounded-[8px] bg-surface-2 px-3 py-2">
            <div className="text-xs text-muted">{t("total")}</div>
            <div className="text-base font-semibold tabular-nums">{total == null ? "—" : `${total.toLocaleString()} ${cur}`}</div>
            {isCosplay && <div className="text-xs text-muted">{t("totalIncludes")}</div>}
          </div>
          <div>
            <label className="label" htmlFor="cost_currency">{t("currency")}</label>
            <input id="cost_currency" name="cost_currency" className="input uppercase" maxLength={3} value={cur} onChange={(e) => setCur(e.target.value.toUpperCase())} />
          </div>
        </div>
        <UsdHint amount={total} currency={cur} />
        {cur.length === 3 && cur !== currency && (
          <div>
            <label className="label" htmlFor="fx_rate_to_trip">{t("fx")} — {t("fxHint", { cur, trip: currency })}</label>
            <input id="fx_rate_to_trip" name="fx_rate_to_trip" type="number" min="0" step="any" className="input" defaultValue={plan?.fx_rate_to_trip ?? ""} />
          </div>
        )}
      </fieldset>

      {type !== "crunch" && todoBlock}

      {type === "work" && (
        <label className="flex items-center gap-2 rounded-[8px] border border-border px-3 py-2">
          <input type="checkbox" name="has_meeting" defaultChecked={plan?.has_meeting ?? false} />
          <span>{t("hasMeeting")}</span>
        </label>
      )}

      <div hidden={isWake}>
        <label className="label" htmlFor="link">{t("link")}</label>
        <input id="link" name="link" type="url" className="input" placeholder="https://" defaultValue={plan?.link ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor="note">{t("note")}</label>
        <textarea id="note" name="note" rows={3} className="input h-auto py-2" defaultValue={plan?.note ?? ""} />
      </div>

      {!formId && <button type="submit" disabled={badDuration && !isWake} className="btn btn-primary">{submitLabel}</button>}
    </form>
  );
}
