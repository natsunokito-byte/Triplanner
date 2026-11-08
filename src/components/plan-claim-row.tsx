"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import type { DecideState } from "@/app/availability-actions";

/** Compact pending-claim row on the plan page: add the person to the plan, or remove the request. */
export function PlanClaimRow({
  action, name, message,
}: {
  action: (prev: DecideState, fd: FormData) => Promise<DecideState>;
  name: string; message: string | null;
}) {
  const t = useTranslations("plan");
  const [state, formAction] = useActionState(action, {} as DecideState);
  return (
    <form action={formAction} className="space-y-2 rounded-md bg-surface-2 p-3">
      <div className="font-medium">{name}</div>
      {message && <p className="whitespace-pre-line text-sm text-muted">{message}</p>}
      {state.error && <p role="alert" className="text-xs text-danger">{t("claimErr")}</p>}
      <div className="flex gap-2">
        <button name="decision" value="accept" className="btn btn-primary btn-sm">{t("addClaimer", { name })}</button>
        <button name="decision" value="decline" className="btn btn-sm text-danger">{t("removeClaim")}</button>
      </div>
    </form>
  );
}
