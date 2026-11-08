"use client";

import Script from "next/script";
import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { SubmitButton } from "./submit-button";
import type { ClaimState } from "@/app/a/[token]/actions";

export function ClaimForm({ action }: { action: (prev: ClaimState, fd: FormData) => Promise<ClaimState> }) {
  const t = useTranslations("claim");
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(action, {} as ClaimState);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  if (state.done) return <p role="status" className="rounded-md bg-surface-2 p-3 text-sm text-success">{t("sent")}</p>;
  if (!open) return <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>{t("claim")}</button>;
  return (
    <form action={formAction} className="space-y-2 border-t border-border pt-3">
      <input name="name" className="input" required maxLength={80} placeholder={t("name")} aria-label={t("name")} autoComplete="name" />
      <input name="email" type="email" className="input" required maxLength={254} placeholder={t("email")} aria-label={t("email")} autoComplete="email" />
      <textarea name="message" rows={2} maxLength={1000} className="input h-auto py-2" placeholder={t("message")} aria-label={t("message")} />
      {siteKey && (
        <>
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="lazyOnload" />
          <div className="cf-turnstile" data-sitekey={siteKey} />
        </>
      )}
      {state.error && <p role="alert" className="text-xs text-danger">{t(`err.${state.error}`)}</p>}
      <div className="flex gap-2">
        <SubmitButton className="btn-sm">{t("submit")}</SubmitButton>
        <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>{t("cancel")}</button>
      </div>
      <p className="text-xs text-muted">{t("privacy")}</p>
    </form>
  );
}
