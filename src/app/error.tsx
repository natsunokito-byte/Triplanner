"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errors");
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <p className="text-muted">{t("body")}</p>
      <div className="flex gap-2">
        <button className="btn btn-primary" onClick={reset}>{t("retry")}</button>
        <Link href="/" className="btn">{t("home")}</Link>
      </div>
    </main>
  );
}
