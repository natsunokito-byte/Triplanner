"use client";

import Script from "next/script";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { SubmitButton } from "./submit-button";
import type { VerifyState } from "@/app/v/[token]/actions";

type A = (prev: VerifyState, fd: FormData) => Promise<VerifyState>;

export function RequestVerifyForm({ requestAction, verifyAction }: { requestAction: A; verifyAction: A }) {
  const t = useTranslations("viewer");
  const tf = useTranslations("free");
  const [req, reqAction] = useActionState(requestAction, { step: "email" } as VerifyState);
  const [ver, verAction] = useActionState(verifyAction, { step: "code" } as VerifyState);
  const codeStep = req.step === "code";
  const email = req.email ?? "";
  const err = codeStep ? ver.error : req.error;
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  return (
    <div className="card space-y-3 p-4">
      <h2 className="font-semibold">{tf("verifyTitle")}</h2>
      <p className="text-muted">{codeStep ? t("codeSent", { email }) : tf("verifyHint")}</p>
      {!codeStep ? (
        <form action={reqAction} className="space-y-3">
          <input name="email" type="email" required autoComplete="email" className="input" aria-label={t("email")} placeholder={t("email")} />
          {siteKey && (
            <>
              <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="lazyOnload" />
              <div className="cf-turnstile" data-sitekey={siteKey} />
            </>
          )}
          <SubmitButton className="w-full">{t("sendCode")}</SubmitButton>
        </form>
      ) : (
        <form action={verAction} className="space-y-3">
          <input type="hidden" name="email" value={email} />
          <input name="code" inputMode="numeric" pattern="\d{6}" maxLength={6} required autoComplete="one-time-code" aria-label={t("code")}
            className="input tabular-nums tracking-[0.4em] text-center text-lg" />
          <SubmitButton className="w-full">{t("verify")}</SubmitButton>
        </form>
      )}
      {err && <p role="alert" className="text-xs text-danger">{t(`err.${err}`)}</p>}
    </div>
  );
}
