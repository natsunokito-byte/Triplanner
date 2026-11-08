"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { AlarmClock } from "lucide-react";
import { clearWakeUp, setWakeUp } from "@/app/actions";

/** "Wake-up time" chip in a day column; opens a small pop-up that only collects a time. */
export function WakeUpButton({
  tripId, date, current,
}: { tripId: string; date: string; current: { id: string; time: string } | null }) {
  const t = useTranslations("plan");
  const c = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState(current?.time ?? "07:00");
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const run = (fn: () => Promise<void>) => {
    setFailed(false);
    start(async () => {
      try { await fn(); setOpen(false); } catch { setFailed(true); }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => { setTime(current?.time ?? "07:00"); setOpen(true); }}
        className={`flex w-fit items-center gap-1 rounded-full px-3 py-1 text-xs ${current ? "bg-[var(--pt-wake-bg)] text-[var(--pt-wake-fg)]" : "border border-dashed border-border text-muted hover:text-text"}`}
      >
        <AlarmClock size={12} /> {current ? `${t("wakeUp")} ${current.time}` : `+ ${t("wakeUp")}`}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={t("wakeUp")}>
          <button type="button" tabIndex={-1} aria-label={c("cancel")} className="absolute inset-0 cursor-default bg-black/40" onClick={() => setOpen(false)} />
          <div className="card relative w-full max-w-xs space-y-3 p-5 shadow-2xl">
            <h2 className="flex items-center gap-2 font-semibold"><AlarmClock size={16} /> {t("wakeUp")} · {date}</h2>
            <input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} autoFocus aria-label={t("wakeUp")} />
            {failed && <p role="alert" className="text-xs text-danger">{t("saveFailed")}</p>}
            <div className="flex items-center justify-between gap-2">
              {current ? (
                <button type="button" className="btn btn-sm text-danger" disabled={pending} onClick={() => run(() => clearWakeUp(tripId, current.id))}>{t("wakeClear")}</button>
              ) : <span />}
              <div className="flex gap-2">
                <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>{c("cancel")}</button>
                <button type="button" className="btn btn-sm btn-primary" disabled={pending || !time} onClick={() => run(() => setWakeUp(tripId, date, time))}>{c("save")}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
