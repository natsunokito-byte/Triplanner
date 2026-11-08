"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, MapPin, X } from "lucide-react";
import { SubmitButton } from "./submit-button";
import { allCurrencies, allTimezones, currencyForCountry } from "@/lib/geo";

type Suggestion = { placeId: string; text: string };
import type { Trip } from "@/lib/types";

export function TripForm({
  action,
  initial,
  submitLabel,
  bare = false,
}: {
  action?: (fd: FormData) => Promise<void>;
  initial?: Trip;
  submitLabel?: string;
  /** Render only the fields (no <form>, no submit button) so a parent form can own the save. */
  bare?: boolean;
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
  const [results, setResults] = useState<Suggestion[]>([]);
  const [searchErr, setSearchErr] = useState(false);
  const [session, setSession] = useState(() => crypto.randomUUID());
  const [loading, setLoading] = useState(false);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const h = setTimeout(async () => {
      ctrl.current?.abort();
      ctrl.current = new AbortController();
      setLoading(true);
      try {
        const res = await fetch(`/api/destination?${new URLSearchParams({ q, lang: locale === "en" ? "en" : "zh", s: session })}`, { signal: ctrl.current.signal });
        const json = await res.json();
        setSearchErr(!res.ok);
        setResults(res.ok ? (json.suggestions as Suggestion[]) : []);
      } catch {
        /* aborted or offline */
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(h);
  }, [q, locale, session]);

  function add(label: string) {
    if (label && !destinations.includes(label)) setDestinations([...destinations, label]);
    setQ("");
    setResults([]);
  }

  async function pick(sug: Suggestion) {
    setResults([]);
    setLoading(true);
    try {
      const res = await fetch(`/api/destination?${new URLSearchParams({ placeId: sug.placeId, lang: locale === "en" ? "en" : "zh", s: session })}`);
      const json = await res.json();
      if (!res.ok) { add(sug.text); return; }
      const p = json.place as { label: string; timezone: string; country_code: string };
      if (!destinations.includes(p.label) && destinations.length === 0 && !touched) {
        if (p.timezone) setTimezone(p.timezone);
        setCurrency(currencyForCountry(p.country_code));
        setAutoNote(p.label);
      }
      add(p.label);
    } catch {
      add(sug.text);
    } finally {
      setLoading(false);
      setSession(crypto.randomUUID()); // a new billing session per completed search
    }
  }

  const dateInvalid = !!start && !!end && end < start;

  const Wrap = bare ? "div" : "form";
  return (
    <Wrap {...(bare ? {} : { action })} className="space-y-5">
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
          <input
            id="dest" className="input" placeholder={t("destinationsPh")} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(q.trim()); } }}
          />
          {loading && <Loader2 size={14} className="absolute right-3 top-3 animate-spin text-muted" />}
          {q.trim().length >= 2 && (results.length > 0 || searchErr) && (
            <ul className="card absolute z-20 mt-1 w-full max-h-64 overflow-auto p-1" style={{ boxShadow: "var(--shadow-2)" }}>
              {results.map((p) => (
                <li key={p.placeId}>
                  <button type="button" className="w-full text-left rounded-md px-3 py-2 hover:bg-surface-2" onClick={() => pick(p)}>{p.text}</button>
                </li>
              ))}
              {searchErr && <li className="px-3 py-2 text-xs text-muted">{t("searchUnavailable")}</li>}
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

      {!bare && <SubmitButton className={dateInvalid ? "pointer-events-none opacity-50" : ""}>{submitLabel}</SubmitButton>}
    </Wrap>
  );
}
