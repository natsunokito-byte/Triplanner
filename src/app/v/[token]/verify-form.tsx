"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { requestOtp, verifyOtp, type VerifyState } from "./actions";
import { SubmitButton } from "@/components/submit-button";

export function VerifyForm({ token }: { token: string }) {
  const t = useTranslations("viewer");
  const [req, reqAction] = useActionState(requestOtp.bind(null, token), { step: "email" } as VerifyState);
  const [ver, verAction] = useActionState(verifyOtp.bind(null, token), { step: "code" } as VerifyState);
  const codeStep = req.step === "code";
  const email = req.email ?? "";
  const err = codeStep ? ver.error : req.error;

  return (
    <div className="card mx-auto w-full max-w-sm space-y-4 p-6">
      <p className="text-muted">{codeStep ? t("codeSent", { email }) : t("emailHint")}</p>
      {!codeStep ? (
        <form action={reqAction} className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs text-muted">{t("email")}</span>
            <input name="email" type="email" required autoComplete="email" className="input" />
          </label>
          <SubmitButton className="w-full">{t("sendCode")}</SubmitButton>
        </form>
      ) : (
        <form action={verAction} className="space-y-3">
          <input type="hidden" name="email" value={email} />
          <label className="block space-y-1">
            <span className="text-xs text-muted">{t("code")}</span>
            <input name="code" inputMode="numeric" pattern="\d{6}" maxLength={6} required autoComplete="one-time-code" autoFocus className="input tabular-nums tracking-[0.4em] text-center text-lg" />
          </label>
          <SubmitButton className="w-full">{t("verify")}</SubmitButton>
        </form>
      )}
      {err && <p role="alert" className="text-xs text-danger">{t(`err.${err}`)}</p>}
    </div>
  );
}
