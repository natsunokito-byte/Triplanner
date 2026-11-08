"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import type { DecideState } from "@/app/availability-actions";

export function ClaimRow({
  action, name, email, planTitle, when, message, knownPerson,
}: {
  action: (prev: DecideState, fd: FormData) => Promise<DecideState>;
  name: string; email: string; planTitle: string; when: string; message: string | null; knownPerson: boolean;
}) {
  const t = useTranslations("requests");
  const [state, formAction] = useActionState(action, {} as DecideState);
  return (
    <form action={formAction} className="card space-y-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="font-semibold">{name}</span> {email && <span className="text-xs text-muted">{email}</span>}
          {!knownPerson && <span className="ml-2 rounded-full bg-surface-2 px-2 text-[11px]">{t("newPerson")}</span>}
        </div>
        <span className="text-xs tabular-nums text-muted">{when}</span>
      </div>
      <div className="text-sm">{t("claimed", { plan: planTitle })}</div>
      {message && <p className="whitespace-pre-line rounded-md bg-surface-2 p-2 text-sm">{message}</p>}
      <textarea name="reply" className="input min-h-16 py-2" maxLength={1000} placeholder={t("replyPh")} />
      {email && <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" name="block" /> {t("block")}</label>}
      {state.error && <p role="alert" className="text-xs text-danger">{t(`err.${state.error}`)}</p>}
      <div className="flex gap-2">
        <button name="decision" value="accept" className="btn btn-primary btn-sm">{t("accept")}</button>
        <button name="decision" value="decline" className="btn btn-sm">{t("decline")}</button>
      </div>
    </form>
  );
}
