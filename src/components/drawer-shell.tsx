"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

/**
 * Right-hand drawer. Used two ways:
 *  - intercepted (soft navigation over the current page): closing = router.back()
 *  - direct visit / refresh (the same URL as a full page): closing = go to `closeHref`
 * Cancel and Save live in the top-right of the drawer header; Save submits the form with id `formId`.
 */
export function DrawerShell({
  title, intercepted, closeHref, formId, submitLabel, children,
}: {
  title: string; intercepted: boolean; closeHref: string; formId?: string; submitLabel?: string; children: React.ReactNode;
}) {
  const router = useRouter();
  const t = useTranslations("common");
  const [saving, setSaving] = useState(false);
  const closeRef = useRef<() => void>(() => {});
  useEffect(() => {
    closeRef.current = () => (intercepted ? router.back() : router.push(closeHref));
  }, [intercepted, closeHref, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, []);

  // Block double submits; re-enable if nothing happened (e.g. an error) after a few seconds.
  useEffect(() => {
    if (!formId) return;
    const form = document.getElementById(formId);
    if (!form) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onSubmit = () => { setSaving(true); clearTimeout(timer); timer = setTimeout(() => setSaving(false), 8000); };
    form.addEventListener("submit", onSubmit);
    return () => { form.removeEventListener("submit", onSubmit); clearTimeout(timer); };
  }, [formId]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label={t("cancel")} tabIndex={-1} className="absolute inset-0 cursor-default bg-black/40" onClick={() => closeRef.current()} />
      <aside className="drawer-panel relative flex h-full w-full max-w-xl flex-col bg-bg shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
          <h1 className="text-lg font-semibold">{title}</h1>
          <div className="flex gap-2">
            <button type="button" className="btn btn-sm" onClick={() => closeRef.current()}>{t("cancel")}</button>
            {formId && (
              <button type="submit" form={formId} disabled={saving} className="btn btn-sm btn-primary">{submitLabel ?? t("save")}</button>
            )}
          </div>
        </header>
        <div className="flex-1 space-y-6 overflow-y-auto px-4 py-5">{children}</div>
      </aside>
    </div>
  );
}

/** A small form that runs a server action and, inside the drawer, closes it afterwards (e.g. delete). */
export function DrawerActionForm({
  action, intercepted, children,
}: { action: () => Promise<void>; intercepted: boolean; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <form
      action={async () => {
        await action();
        if (intercepted) router.back();
      }}
    >
      {children}
    </form>
  );
}
