"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { CalendarClock, MapPin } from "lucide-react";
import type { ProposalState } from "@/app/availability-actions";

export function ProposalRow({
  action, tripId, name, typeLabel, title, when, roughTime, location, note, created,
}: {
  action: (prev: ProposalState, fd: FormData) => Promise<ProposalState>;
  tripId: string; name: string; typeLabel: string; title: string; when: string | null; roughTime: string | null;
  location: string | null; note: string | null; created: string;
}) {
  const t = useTranslations("requests");
  const [state, formAction] = useActionState(action, {} as ProposalState);
  if (state.planId) {
    return (
      <div className="card flex flex-wrap items-center justify-between gap-2 p-4" role="status">
        <span>{t("proposalAccepted", { title })}</span>
        <Link href={`/t/${tripId}/plans/${state.planId}`} className="btn btn-sm">{t("openPlan")}</Link>
      </div>
    );
  }
  return (
    <form action={formAction} className="card space-y-2 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span><span className="font-semibold">{name}</span> <span className="text-xs text-muted">{t("proposes")}</span></span>
        <span className="text-xs tabular-nums text-muted">{created}</span>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold">{title}</h3>
        <span className="rounded-full bg-surface-2 px-2 text-xs">{typeLabel}</span>
      </div>
      {(when || roughTime) && <div className="flex items-center gap-1 text-sm text-muted"><CalendarClock size={14} /> {[when, roughTime].filter(Boolean).join(" · ")}</div>}
      {location && <div className="flex items-center gap-1 text-sm text-muted"><MapPin size={14} /> {location}</div>}
      {note && <p className="whitespace-pre-line rounded-md bg-surface-2 p-2 text-sm">{note}</p>}
      {state.error && <p role="alert" className="text-xs text-danger">{t(`err.${state.error}`)}</p>}
      <div className="flex gap-2 pt-1">
        <button name="decision" value="accept" className="btn btn-primary btn-sm">{t("acceptProposal")}</button>
        <button name="decision" value="decline" className="btn btn-sm">{t("decline")}</button>
      </div>
    </form>
  );
}
