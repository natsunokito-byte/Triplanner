"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SubmitButton } from "./submit-button";
import { UsdHint } from "./fx";
import { PLAN_ICON, PLAN_TYPES, VISIBILITIES, ptVars, type PlanType, type Visibility } from "@/lib/plan-types";
import type { Person, Plan } from "@/lib/types";

export function PlanForm({
  action,
  plan,
  planPeople = [],
  people,
  defaults,
  tz,
  currency,
  submitLabel,
}: {
  action: (fd: FormData) => Promise<void>;
  plan?: Plan;
  planPeople?: string[];
  people: Person[];
  defaults: { start: string; type: PlanType };
  tz: string;
  currency: string;
  submitLabel: string;
}) {
  const t = useTranslations("plan");
  const [type, setType] = useState<PlanType>(plan?.type ?? defaults.type);
  const [visibility, setVisibility] = useState<Visibility>(plan?.visibility ?? "normal");
  const [duration, setDuration] = useState(plan?.duration_min ?? 60);
  const [cur, setCur] = useState(plan?.cost_currency ?? currency);
  const [costAmt, setCostAmt] = useState(plan?.cost != null ? String(plan.cost) : "");
  const [selected, setSelected] = useState<string[]>(planPeople);

  const ownerOnly = visibility === "owner_only";
  const badDuration = !Number.isFinite(duration) || duration < 30;

  return (
    <form action={action} className="space-y-5">
      <fieldset>
        <legend className="label">{t("type")}</legend>
        <input type="hidden" name="type" value={type} />
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {PLAN_TYPES.map((k) => {
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
        <input id="title" name="title" className="input" required maxLength={160} placeholder={t("titlePh")} defaultValue={plan?.title} />
      </div>

      {type === "cosplay_photoshoot" && (
        <div>
          <label className="label" htmlFor="character_name">{t("character")}</label>
          <input id="character_name" name="character_name" className="input" maxLength={120} defaultValue={plan?.character_name ?? ""} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
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
          <label className="label" htmlFor="start">{t("start")}</label>
          <input id="start" name="start" type="datetime-local" className="input" required defaultValue={defaults.start} />
        </div>
        <div>
          <label className="label" htmlFor="duration_min">{t("duration")}</label>
          <input
            id="duration_min" name="duration_min" type="number" min={30} max={2880} step={5} className="input" required
            value={Number.isNaN(duration) ? "" : duration} onChange={(e) => setDuration(e.target.valueAsNumber)}
          />
        </div>
        <div className="col-span-2 flex flex-wrap items-center gap-2">
          {[30, 60, 90, 120, 180].map((m) => (
            <button key={m} type="button" className={`chip ${duration === m ? "" : "!bg-surface-2 !text-muted"}`} onClick={() => setDuration(m)}>{m}</button>
          ))}
          <span className="text-xs text-muted">{t("durationHint")} · {t("tzNote", { tz })}</span>
        </div>
        {badDuration && <p className="col-span-2 text-xs text-danger">{t("timeError")}</p>}
      </div>

      <div>
        <label className="label">{t("visibility")}</label>
        <select name="visibility" className="input" value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
          {VISIBILITIES.map((v) => <option key={v} value={v}>{t(`vis.${v}`)}</option>)}
        </select>
        <p className="mt-1 text-xs text-muted">{t(`visHint.${visibility}`)}</p>
      </div>

      <fieldset disabled={ownerOnly} className={ownerOnly ? "opacity-50" : ""}>
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

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label className="label" htmlFor="cost">{t("cost")}</label>
          <input id="cost" name="cost" type="number" min="0" step="0.01" className="input" value={costAmt} onChange={(e) => setCostAmt(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="cost_currency">{t("currency")}</label>
          <input id="cost_currency" name="cost_currency" className="input uppercase" maxLength={3} value={cur} onChange={(e) => setCur(e.target.value.toUpperCase())} />
        </div>
        <div className="col-span-3 -mt-2"><UsdHint amount={costAmt === "" ? null : Number(costAmt)} currency={cur} /></div>
        {cur.length === 3 && cur !== currency && (
          <div className="col-span-3">
            <label className="label" htmlFor="fx_rate_to_trip">{t("fx")} — {t("fxHint", { cur, trip: currency })}</label>
            <input id="fx_rate_to_trip" name="fx_rate_to_trip" type="number" min="0" step="any" className="input" defaultValue={plan?.fx_rate_to_trip ?? ""} />
          </div>
        )}
      </div>

      <div>
        <label className="label" htmlFor="link">{t("link")}</label>
        <input id="link" name="link" type="url" className="input" placeholder="https://" defaultValue={plan?.link ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor="note">{t("note")}</label>
        <textarea id="note" name="note" rows={3} className="input h-auto py-2" defaultValue={plan?.note ?? ""} />
      </div>

      <SubmitButton className={badDuration ? "pointer-events-none opacity-50" : ""}>{submitLabel}</SubmitButton>
    </form>
  );
}
