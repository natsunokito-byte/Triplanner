"use client";

import Script from "next/script";
import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Lightbulb, X } from "lucide-react";
import { SubmitButton } from "./submit-button";
import type { ClaimState } from "@/app/a/[token]/actions";

type TS = { render: (el: HTMLElement, o: { sitekey: string }) => string; reset: (id?: string) => void };
const ts = () => (window as unknown as { turnstile?: TS }).turnstile;

/** "Propose a plan" button + modal form on the public claim page. */
export function ProposeModal({
  action, types,
}: {
  action: (prev: ClaimState, fd: FormData) => Promise<ClaimState>;
  types: { value: string; label: string }[];
}) {
  const t = useTranslations("claim");
  const ref = useRef<HTMLDialogElement>(null);
  const [state, formAction] = useActionState(action, {} as ClaimState);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const boxRef = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [ready, setReady] = useState(false);

  // Render explicitly once the modal is open and visible (implicit render inside a hidden <dialog> yields no token).
  useEffect(() => {
    if (!siteKey || !opened || !ready || !boxRef.current || widget.current) return;
    const api = ts();
    if (api) widget.current = api.render(boxRef.current, { sitekey: siteKey });
  });
  // A token is single-use: get a fresh one after every submit attempt that failed.
  useEffect(() => {
    if (state.error && widget.current) ts()?.reset(widget.current);
  }, [state]);

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => { setOpened(true); ref.current?.showModal(); }}>
        <Lightbulb size={16} /> {t("propose")}
      </button>
      <dialog
        ref={ref}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-0 text-text backdrop:bg-black/40"
        onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="font-semibold">{t("proposeTitle")}</h2>
          <button type="button" className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-surface-2" aria-label={t("cancel")} onClick={() => ref.current?.close()}><X size={16} /></button>
        </div>
        {state.done ? (
          <div className="space-y-4 px-5 py-6">
            <p role="status" className="text-success">{t("proposeSent")}</p>
            <button type="button" className="btn" onClick={() => ref.current?.close()}>{t("close")}</button>
          </div>
        ) : (
          <form action={formAction} className="space-y-3 px-5 py-4">
            <div>
              <label className="label" htmlFor="pp-name">{t("name")}</label>
              <input id="pp-name" name="name" className="input" required maxLength={80} autoComplete="name" />
            </div>
            <div>
              <label className="label" htmlFor="pp-type">{t("proposeType")}</label>
              <select id="pp-type" name="type" className="input" required defaultValue={types[0]?.value}>
                {types.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="pp-title">{t("proposeIdea")}</label>
              <input id="pp-title" name="title" className="input" required maxLength={200} placeholder={t("proposeIdeaPh")} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="pp-date">{t("proposeDate")}</label>
                <input id="pp-date" name="rough_date" type="date" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="pp-time">{t("proposeTime")}</label>
                <input id="pp-time" name="rough_time" className="input" maxLength={80} placeholder={t("proposeTimePh")} />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="pp-loc">{t("proposePlace")}</label>
              <input id="pp-loc" name="rough_location" className="input" maxLength={200} placeholder={t("proposePlacePh")} />
            </div>
            <div>
              <label className="label" htmlFor="pp-note">{t("proposeNote")}</label>
              <textarea id="pp-note" name="note" rows={2} maxLength={1000} className="input h-auto py-2" />
            </div>
            {siteKey && (
              <>
                {opened && <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={() => setReady(true)} />}
                <div ref={boxRef} />
              </>
            )}
            {state.error && <p role="alert" className="text-xs text-danger">{t(`err.${state.error}`)}</p>}
            <div className="flex gap-2 pt-1">
              <SubmitButton>{t("submit")}</SubmitButton>
              <button type="button" className="btn" onClick={() => ref.current?.close()}>{t("cancel")}</button>
            </div>
            <p className="text-xs text-muted">{t("privacy")}</p>
          </form>
        )}
      </dialog>
    </>
  );
}
