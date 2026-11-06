"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { Loader2, MapPin } from "lucide-react";

type Suggestion = { placeId: string; text: string };
export type PlaceValue = { label: string; placeId: string };

// Google Places Autocomplete (New) straight from the browser with the referrer-restricted browser key.
// Without NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY it degrades to a plain text field (address text is still usable by Routes).
export function PlacePicker({
  name, label, placeholder, value, onChange,
}: {
  name: "origin" | "dest";
  label: string;
  placeholder: string;
  value: PlaceValue;
  onChange: (v: PlaceValue) => void;
}) {
  const locale = useLocale();
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
  const [items, setItems] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const ctrl = useRef<AbortController | null>(null);
  const q = value.label;

  useEffect(() => {
    if (!key || !open || q.trim().length < 3) return;
    const h = setTimeout(async () => {
      ctrl.current?.abort();
      ctrl.current = new AbortController();
      setLoading(true);
      try {
        const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
          body: JSON.stringify({ input: q, languageCode: locale === "en" ? "en" : "zh-TW" }),
          signal: ctrl.current.signal,
        });
        const json = await res.json();
        setItems(
          ((json.suggestions ?? []) as { placePrediction?: { placeId: string; text: { text: string } } }[])
            .filter((s) => s.placePrediction)
            .map((s) => ({ placeId: s.placePrediction!.placeId, text: s.placePrediction!.text.text })),
        );
      } catch {
        /* aborted / offline */
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(h);
  }, [q, key, open, locale]);

  return (
    <div className="relative">
      <label className="label" htmlFor={`${name}_label`}>{label}</label>
      <input
        id={`${name}_label`}
        name={`${name}_label`}
        className="input"
        placeholder={placeholder}
        autoComplete="off"
        maxLength={300}
        value={value.label}
        onChange={(e) => { onChange({ label: e.target.value, placeId: "" }); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      <input type="hidden" name={`${name}_place_id`} value={value.placeId} />
      {loading && <Loader2 size={14} className="absolute right-3 top-9 animate-spin text-muted" />}
      {open && q.trim().length >= 3 && items.length > 0 && (
        <ul className="card absolute z-20 mt-1 w-full max-h-64 overflow-auto p-1" style={{ boxShadow: "var(--shadow-2)" }}>
          {items.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                className="flex w-full items-start gap-2 rounded-md px-3 py-2 text-left hover:bg-surface-2"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onChange({ label: s.text, placeId: s.placeId }); setItems([]); setOpen(false); }}
              >
                <MapPin size={14} className="mt-0.5 shrink-0 text-muted" /> {s.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
