"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarClock, MapPin } from "lucide-react";
import { ClaimForm } from "./claim-form";
import { submitClaim } from "@/app/a/[token]/actions";

export type ClaimItem = { id: string; title: string; type: string; typeLabel: string; when: string; duration: string; location: string | null; proposal: string | null };

/** Public list of open plans (already sorted by time on the server) with a category filter. */
export function ClaimList({ token, items }: { token: string; items: ClaimItem[] }) {
  const t = useTranslations("claim");
  const [type, setType] = useState<string>("all");
  const types = [...new Map(items.map((i) => [i.type, i.typeLabel])).entries()];
  const shown = type === "all" ? items : items.filter((i) => i.type === type);
  const chip = (active: boolean) => `btn btn-sm ${active ? "btn-primary" : ""}`;

  return (
    <div className="space-y-4">
      {types.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("filter")}>
          <button type="button" className={chip(type === "all")} onClick={() => setType("all")}>{t("all")}</button>
          {types.map(([k, label]) => (
            <button key={k} type="button" className={chip(type === k)} onClick={() => setType(k)}>{label}</button>
          ))}
        </div>
      )}
      {shown.length === 0 && <p className="card p-6 text-center text-muted">{t("none")}</p>}
      {shown.map((p) => (
        <section key={p.id} className="card space-y-2 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">{p.title}</h2>
            <span className="rounded-full bg-surface-2 px-2 text-xs">{p.typeLabel}</span>
          </div>
          <div className="flex items-center gap-1 text-sm text-muted"><CalendarClock size={14} /> {p.when}{p.duration ? ` · ${p.duration}` : ""}</div>
          {p.location && <div className="flex items-center gap-1 text-sm text-muted"><MapPin size={14} /> {p.location}</div>}
          {p.proposal && <p className="whitespace-pre-line rounded-md bg-surface-2 p-2 text-sm">{p.proposal}</p>}
          <ClaimForm action={submitClaim.bind(null, token, p.id)} />
        </section>
      ))}
    </div>
  );
}
