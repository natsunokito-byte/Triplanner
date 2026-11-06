"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Sparkles } from "lucide-react";
import { SubmitButton } from "./submit-button";
import { CostFields } from "./fx";
import { PlacePicker, type PlaceValue } from "./place-picker";
import { GOOGLE_MODE, METHODS, METHOD_ICON, PAYMENTS, type Method, type Payment } from "@/lib/commute";
import { localToUtc } from "@/lib/tz";
import type { Commute } from "@/lib/types";

export function CommuteForm({
  action, commute, fromPlanId, toPlanId, defaults, tz, currency, submitLabel,
}: {
  action: (fd: FormData) => Promise<void>;
  commute?: Commute;
  fromPlanId: string | null;
  toPlanId: string | null;
  defaults: { origin: PlaceValue; dest: PlaceValue; start: string; method: Method; duration: number };
  tz: string;
  currency: string;
  submitLabel: string;
}) {
  const t = useTranslations("commute");
  const [origin, setOrigin] = useState<PlaceValue>(defaults.origin);
  const [dest, setDest] = useState<PlaceValue>(defaults.dest);
  const [method, setMethod] = useState<Method>(defaults.method);
  const [payment, setPayment] = useState<Payment | "">(commute?.payment ?? "");
  const [start, setStart] = useState(defaults.start);
  const [duration, setDuration] = useState<number>(defaults.duration);
  const [distance, setDistance] = useState<number | null>(commute?.distance_m ?? null);
  const [source, setSource] = useState<"manual" | "google">(commute?.duration_source ?? "manual");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const canEstimate = !!GOOGLE_MODE[method];

  async function estimate() {
    setMsg(null);
    if (!canEstimate) return setMsg({ kind: "err", text: t("manualOnly") });
    if ((!origin.label && !origin.placeId) || (!dest.label && !dest.placeId)) return setMsg({ kind: "err", text: t("needPlaces") });
    setBusy(true);
    try {
      const res = await fetch("/api/commute/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: origin.placeId ? { placeId: origin.placeId } : { address: origin.label },
          destination: dest.placeId ? { placeId: dest.placeId } : { address: dest.label },
          method,
          departureTime: start ? localToUtc(start, tz).toISOString() : undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const key = json.error === "not_configured" ? "errNotConfigured" : json.error === "no_route" ? "errNoRoute" : json.error === "rate_limited" ? "errRate" : "errGeneric";
        return setMsg({ kind: "err", text: t(key) });
      }
      setDuration(json.duration_min);
      setDistance(json.distance_m ?? null);
      setSource("google");
      setMsg({ kind: "ok", text: t("estimated", { min: json.duration_min, km: json.distance_m ? (json.distance_m / 1000).toFixed(1) : "–" }) });
    } catch {
      setMsg({ kind: "err", text: t("errGeneric") });
    } finally {
      setBusy(false);
    }
  }

  const badDuration = !Number.isFinite(duration) || duration < 0;

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="from_plan_id" value={fromPlanId ?? ""} />
      <input type="hidden" name="to_plan_id" value={toPlanId ?? ""} />
      <input type="hidden" name="distance_m" value={distance ?? ""} />
      <input type="hidden" name="duration_source" value={source} />

      <PlacePicker name="origin" label={t("origin")} placeholder={t("originPh")} value={origin} onChange={setOrigin} />
      <PlacePicker name="dest" label={t("dest")} placeholder={t("destPh")} value={dest} onChange={setDest} />

      <fieldset>
        <legend className="label">{t("method")}</legend>
        <input type="hidden" name="method" value={method} />
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {METHODS.map((m) => {
            const Icon = METHOD_ICON[m];
            const on = method === m;
            return (
              <button
                key={m} type="button" aria-pressed={on} onClick={() => setMethod(m)}
                className={`flex flex-col items-center gap-1 rounded-[8px] border p-2 text-xs transition-colors ${on ? "border-primary bg-primary-soft text-primary" : "border-border"}`}
              >
                <Icon size={18} /> {t(`methods.${m}`)}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="start">{t("start")}</label>
          <input id="start" name="start" type="datetime-local" className="input" required value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="duration_min">{t("duration")}</label>
          <input
            id="duration_min" name="duration_min" type="number" min={0} max={2880} step={1} className="input" required
            value={Number.isNaN(duration) ? "" : duration}
            onChange={(e) => { setDuration(e.target.valueAsNumber); setSource("manual"); setDistance(null); }}
          />
        </div>
        <div className="col-span-2 flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-sm" onClick={estimate} disabled={busy}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {busy ? t("estimating") : t("estimate")}
          </button>
          {source === "google" && !msg && <span className="text-xs text-muted">{t("googleSrc")}</span>}
          {msg && <span className={`text-xs ${msg.kind === "ok" ? "text-success" : "text-danger"}`}>{msg.text}</span>}
        </div>
        <p className="col-span-2 text-xs text-muted">{t("tzNote", { tz })}</p>
      </div>

      <CostFields amountName="cost" currencyName="cost_currency" defaultAmount={commute?.cost ?? null} defaultCurrency={commute?.cost_currency ?? currency} costLabel={t("cost")} currencyLabel={t("currency")} />

      <div>
        <label className="label" htmlFor="payment">{t("payment")}</label>
        <select id="payment" name="payment" className="input" value={payment} onChange={(e) => setPayment(e.target.value as Payment | "")}>
          <option value="">{t("paymentNone")}</option>
          {PAYMENTS.map((p) => <option key={p} value={p}>{t(`payments.${p}`)}</option>)}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="note">{t("note")}</label>
        <textarea id="note" name="note" rows={2} className="input h-auto py-2" defaultValue={commute?.note ?? ""} />
      </div>

      <SubmitButton className={badDuration ? "pointer-events-none opacity-50" : ""}>{submitLabel}</SubmitButton>
    </form>
  );
}
