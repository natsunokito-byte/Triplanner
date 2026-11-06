"use client";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { Languages } from "lucide-react";
import { setLocale } from "@/app/actions";

export function LocaleSwitcher() {
  const locale = useLocale();
  const t = useTranslations("common");
  const [pending, start] = useTransition();
  return (
    <button
      className="btn btn-sm"
      aria-label={t("language")}
      disabled={pending}
      onClick={() => start(() => setLocale(locale === "en" ? "zh-TW" : "en"))}
    >
      <Languages size={14} /> {locale === "en" ? "繁中" : "EN"}
    </button>
  );
}
