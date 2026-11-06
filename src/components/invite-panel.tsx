"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { CopyButton } from "./copy-button";
import { buildInviteText, type InviteLocale, type InvitePlan } from "@/lib/invite";

export function InvitePanel({
  plan, tz, tripTitle, defaultLocale, icsUrl, recipients,
}: { plan: InvitePlan; tz: string; tripTitle: string; defaultLocale: InviteLocale; icsUrl: string; recipients: string[] }) {
  const t = useTranslations("invite");
  const [locale, setLocale] = useState<InviteLocale>(defaultLocale);
  const [who, setWho] = useState("");
  const text = buildInviteText(plan, tz, locale, { recipient: who || undefined, tripTitle });
  return (
    <section className="card space-y-3 p-5">
      <h2 className="font-semibold">{t("title")}</h2>
      <div className="flex flex-wrap gap-3">
        <label className="space-y-1">
          <span className="block text-xs text-muted">{t("language")}</span>
          <select className="input" value={locale} onChange={(e) => setLocale(e.target.value as InviteLocale)}>
            <option value="zh-TW">繁體中文</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-muted">{t("to")}</span>
          <select className="input" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">{t("everyone")}</option>
            {recipients.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
      <textarea readOnly className="input min-h-36 w-full whitespace-pre-wrap" value={text} aria-label={t("title")} />
      <div className="flex flex-wrap items-center gap-2">
        <CopyButton text={text} />
        <a href={icsUrl} className="btn btn-sm"><Download size={14} /> {t("ics")}</a>
        <CopyButton text={icsUrl} />
        <span className="text-xs text-muted">{t("icsLinkHint")}</span>
      </div>
    </section>
  );
}
