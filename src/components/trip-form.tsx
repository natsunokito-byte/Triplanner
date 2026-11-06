"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, MapPin, X } from "lucide-react";
import { SubmitButton } from "./submit-button";
import { allCurrencies, allTimezones, currencyForCountry, searchPlaces, type Place } from "@/lib/geo";
import type { Trip } from "@/lib/types";

export function TripForm({
  action,
  initial,
  submitLabel,
}: {
  action: (fd: FormData) => Promise<void>;
  initial?: Trip;
  submitLabel: string;
}) {
  const t = useTranslations("trip");
  const tf = useTranslations("fx");
  const locale = useLocale();
  const editing = !!initial;

  const [start, setStart] = useState(initial?.start_date ?? "");
  const [end, setEnd] = useState(initial?.end_date ?? "");
  const [destinations, setDestinations] = useState<string[]>(initial?.destinations ?? []);
  const [timezone, setTimezone] = useState(initial?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [currency, setCurrency] = useState(initial?.currency ?? "USD");
  const [touched, setTouched] = useState(editing); // once the user edits tz/currency by hand, stop auto-filling
  const [autoNote, setAutoNote] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const h = setTimeout(async () => {
      ctrl.current?.abort();
      ctrl.current = new AbortController();
      setLoading(true);
      try {
        setResults(await searchPlaces(q, locale === "en" ? "en" : "zh", ctrl.current.signal));
      } catch {
        /* aborted or offline */
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(h);
  }, [q, locale]);

  function pick(p: Place) {
    if (!destinations.includes(p.label)) {
      if (destinations.length === 0 && !touched) {
        setTimezone(p.timezone);
        setCurrency(currencyForCountry(p.country_code));
        setAutoNote(p.label);
      }
      setDestinations([...destinations, p.label]);
    }
    setQ("");
    setResults([]);
  }

  const dateInvalid = !!start && !!end && end < start;

  return (
    <form action={action} className="space-y-5">
      <div>
        <label className="label" htmlFor="title">{t("name")}</label>
        <input id="title" name="title" className="input" required maxLength={120} placeholder={t("namePh")} defaultValue={initial?.title} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="start_date">{t("start")}</label>
          <input id="start_date" name="start_date" type="date" className="input" required value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="end_date">{t("end")}</label>
          <input id="end_date" name="end_date" type="date" className="input" required min={start || undefined} value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        {dateInvalid && <p className="col-span-2 text-xs text-danger">{t("dateError")}</p>}
      </div>

      <div>
        <label className="label" htmlFor="dest">{t("destinations")}</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {destinations.map((d, i) => (
            <span key={d} className="chip">
              <MapPin size={12} /> {d}
              <button type="button" aria-label="remove" onClick={() => setDestinations(destinations.filter((_, j) => j !== i))}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <div className="relative">
          <input id="dest" className="input" placeholder={t("destinationsPh")} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
          {loading && <Loader2 size={14} className="absolute right-3 top-3 animate-spin text-muted" />}
          {q.trim().length >= 2 && results.length > 0 && (
            <ul className="card absolute z-20 mt-1 w-full max-h-64 overflow-auto p-1" style={{ boxShadow: "var(--shadow-2)" }}>
              {results.map((p) => (
                <li key={p.id}>
                  <button type="button" className="w-full text-left rounded-md px-3 py-2 hover:bg-surface-2" onClick={() => pick(p)}>
                    {p.label} <span className="text-xs text-muted">· {p.timezone}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="mt-1 text-xs text-muted">{t("destinationsHint")}</p>
        <input type="hidden" name="destinations" value={JSON.stringify(destinations)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="timezone">{t("timezone")}</label>
          <input id="timezone" name="timezone" list="tz-list" className="input" required value={timezone} onChange={(e) => { setTimezone(e.target.value); setTouched(true); setAutoNote(null); }} />
          <datalist id="tz-list">{allTimezones().map((z) => <option key={z} value={z} />)}</datalist>
        </div>
        <div>
          <label className="label" htmlFor="currency">{t("currency")}</label>
          <input id="currency" name="currency" list="cur-list" className="input uppercase" required maxLength={3} minLength={3} value={currency} onChange={(e) => { setCurrency(e.target.value.toUpperCase()); setTouched(true); setAutoNote(null); }} />
          <datalist id="cur-list">{allCurrencies().map((c) => <option key={c} value={c} />)}</datalist>
        </div>
        {autoNote && <p className="col-span-2 text-xs text-primary">{t("autoFilled", { place: autoNote })}</p>}
      </div>

      {editing && currency !== "USD" && (
        <div>
          <label className="label" htmlFor="usd_rate_override">{tf("rateOverride")}</label>
          <input id="usd_rate_override" name="usd_rate_override" type="number" min="0" step="any" className="input" defaultValue={initial?.usd_rate_override ?? ""} />
          <p className="mt-1 text-xs text-muted">{tf("rateOverrideHint", { cur: currency })}</p>
        </div>
      )}

      <div>
        <label className="label" htmlFor="invite_locale">{t("inviteLocale")}</label>
        <select id="invite_locale" name="invite_locale" className="input" defaultValue={initial?.invite_locale ?? locale}>
          <option value="zh-TW">繁體中文</option>
          <option value="en">English</option>
        </select>
      </div>

      <SubmitButton className={dateInvalid ? "pointer-events-none opacity-50" : ""}>{submitLabel}</SubmitButton>
    </form>
  );
}
