"use client";

import { useActionState, useMemo, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2 } from "lucide-react";
import { SubmitButton } from "./submit-button";
import { maxDurationMin, startOptions, type FreeSlot, type Interval } from "@/lib/availability";
import { REQUEST_TYPES } from "@/lib/plan-types";
import type { RequestState } from "@/app/v/[token]/actions";

export type DayWindow = Interval & { day: string };
type Action = (prev: RequestState, fd: FormData) => Promise<RequestState>;

const noop = () => () => {};
const localTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function FreeTime({
  tz, windows, slots, action, defaultName = "", verifiedEmail, gate,
}: {
  tz: string; windows: DayWindow[]; slots: FreeSlot[]; action: Action;
  defaultName?: string; verifiedEmail?: string; gate?: React.ReactNode;
}) {
  const t = useTranslations("free");
  const tp = useTranslations("plan");
  const locale = useLocale();
  const viewerTz = useSyncExternalStore(noop, localTz, () => null);
  const [state, formAction] = useActionState(action, {} as RequestState);
  const [selIdx, setSelIdx] = useState<number | null>(null);
  const [start, setStart] = useState<number | null>(null);
  const [duration, setDuration] = useState(60);

  const fmtT = useMemo(() => (ms: number, zone: string) => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: zone }).format(ms), [locale]);
  const fmtD = useMemo(() => new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric", weekday: "short", timeZone: "UTC" }), [locale]);
  const showLocal = viewerTz && viewerTz !== tz;
  const range = (a: number, b: number) => `${fmtT(a, tz)}–${fmtT(b, tz)}`;
  const rangeLocal = (a: number, b: number) => (showLocal ? ` (${fmtT(a, viewerTz!)}–${fmtT(b, viewerTz!)} ${viewerTz})` : "");

  const sel = selIdx != null ? slots[selIdx] : null;
  const starts = sel ? startOptions(sel) : [];
  const effStart = start != null && sel && starts.includes(start) ? start : starts[0] ?? null;
  const maxDur = sel && effStart != null ? maxDurationMin(sel, effStart) : 30;
  const durations = Array.from({ length: Math.max(1, maxDur / 30) }, (_, i) => (i + 1) * 30);
  const effDur = Math.min(duration, maxDur) || 30;

  if (state.done) {
    return (
      <div className="card flex items-center gap-3 p-6" role="status">
        <CheckCircle2 className="text-success" /> <p>{t("sent")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">{t("hint", { tz })}</p>
      {windows.map((w) => {
        const daySlots = slots.map((s, i) => ({ s, i })).filter((x) => x.s.day === w.day);
        const span = w.end - w.start;
        return (
          <div key={w.day} className="card space-y-2 p-3">
            <div className="flex items-baseline justify-between">
              <span className="font-semibold">{fmtD.format(new Date(`${w.day}T00:00:00Z`))}</span>
              <span className="text-xs text-muted tabular-nums">{range(w.start, w.end)}</span>
            </div>
            <div className="relative h-5 overflow-hidden rounded-md bg-surface-2" aria-hidden>
              {daySlots.map(({ s, i }) => (
                <div key={i} className={`absolute inset-y-0 ${i === selIdx ? "bg-primary" : "bg-success/70"}`} style={{ left: `${((s.start - w.start) / span) * 100}%`, width: `${((s.end - s.start) / span) * 100}%` }} />
              ))}
            </div>
            {daySlots.length === 0 ? (
              <p className="text-xs text-muted">{t("noFree")}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {daySlots.map(({ s, i }) => (
                  <button
                    key={i} type="button" aria-pressed={i === selIdx}
                    onClick={() => { setSelIdx(i); setStart(null); }}
                    className={`btn btn-sm tabular-nums ${i === selIdx ? "btn-primary" : ""}`}
                  >
                    {range(s.start, s.end)}{rangeLocal(s.start, s.end)}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {sel && effStart != null && (
        gate ?? (
          <form action={formAction} className="card space-y-3 p-4">
            <h2 className="font-semibold">{t("requestTitle")}</h2>
            {verifiedEmail && <p className="text-xs text-muted">{t("as", { email: verifiedEmail })}</p>}
            <input type="hidden" name="start" value={effStart} />
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-xs text-muted">{t("startAt")}</span>
                <select className="input" value={effStart} onChange={(e) => setStart(Number(e.target.value))}>
                  {starts.map((m) => <option key={m} value={m}>{fmtT(m, tz)}</option>)}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted">{t("duration")}</span>
                <select name="duration" className="input" value={effDur} onChange={(e) => setDuration(Number(e.target.value))}>
                  {durations.map((m) => <option key={m} value={m}>{m >= 60 ? `${m / 60} h` : `${m} min`}</option>)}
                </select>
              </label>
            </div>
            {showLocal && <p className="text-xs text-muted tabular-nums">{rangeLocal(effStart, effStart + effDur * 60000).trim()}</p>}
            <label className="block space-y-1">
              <span className="text-xs text-muted">{t("type")}</span>
              <select name="type" className="input" defaultValue="hangout">
                {REQUEST_TYPES.map((k) => <option key={k} value={k}>{tp(`types.${k}`)}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-muted">{t("name")}</span>
              <input name="name" className="input" required maxLength={80} defaultValue={defaultName} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-muted">{t("location")}</span>
              <input name="location" className="input" maxLength={200} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-muted">{t("message")}</span>
              <textarea name="message" className="input min-h-20 py-2" maxLength={1000} />
            </label>
            {state.error && <p role="alert" className="text-xs text-danger">{t(`err.${state.error}`)}</p>}
            <SubmitButton>{t("submit")}</SubmitButton>
          </form>
        )
      )}
      {!sel && slots.length > 0 && <p className="text-center text-xs text-muted">{t("pick")}</p>}
    </div>
  );
}
