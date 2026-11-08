"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { AUTOSAVE_EVENT, type AutosaveStatus } from "./autosave-form";

/**
 * Right-hand drawer. Used two ways:
 *  - intercepted (soft navigation over the current page): closing = router.back()
 *  - direct visit / refresh (the same URL as a full page): closing = go to `closeHref`
 * Cancel and Save live in the top-right of the drawer header; Save submits the form with id `formId`.
 */
export function DrawerShell({
  title, intercepted, closeHref, formId, submitLabel, onDelete, autosave = false, children,
}: {
  title: string; intercepted: boolean; closeHref: string; formId?: string; submitLabel?: string; /** edit drawers: save in the background as fields change */ autosave?: boolean; onDelete?: React.ReactNode; children: React.ReactNode;
}) {
  const router = useRouter();
  const t = useTranslations("common");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const autoBtn = useRef<HTMLButtonElement>(null);
  const dirtyRef = useRef(false);
  const closeRef = useRef<() => void>(() => {});
  useEffect(() => {
    const plainClose = () => (intercepted ? router.back() : router.push(closeHref));
    // With autosave on, closing with unsaved changes saves first (the save closes the drawer itself).
    closeRef.current = () => {
      const form = formId ? (document.getElementById(formId) as HTMLFormElement | null) : null;
      if (autosave && form && dirtyRef.current && form.checkValidity()) form.requestSubmit();
      else plainClose();
    };
  }, [intercepted, closeHref, router, autosave, formId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, []);

  // Autosave: watch the form's values; once they stop changing, submit in the background.
  useEffect(() => {
    if (!autosave || !formId) return;
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    const isDeferred = (k: string) => k === "new_todos" || k.startsWith("new:");
    const sig = () => JSON.stringify([...new FormData(form)].filter(([k, v]) => typeof v === "string" && k !== "autosave" && !isDeferred(k)));
    // Uncommitted rows (a typed new to-do / new person) are only saved by the explicit Save button.
    const hasDeferred = () => [...new FormData(form)].some(([k, v]) => typeof v === "string" && ((k === "new_todos" && v !== "[]" && v !== "") || (k === "new:name" && v.trim() !== "")));
    let saved = sig();
    let seen = saved;
    let inFlight: string | null = null;
    let failed: string | null = null;
    const tick = () => {
      const cur = sig();
      const dirty = cur !== saved || hasDeferred();
      dirtyRef.current = dirty;
      if (inFlight) return;
      if (cur === saved) { setStatus(hasDeferred() ? "dirty" : "saved"); seen = cur; return; }
      if (cur !== seen) { seen = cur; setStatus("dirty"); return; } // still changing
      if (cur === failed) return;
      if (!form.checkValidity()) { setStatus("dirty"); return; }
      inFlight = cur;
      form.requestSubmit(autoBtn.current);
    };
    const onStatus = (e: Event) => {
      const { state, auto } = (e as CustomEvent<{ state: AutosaveStatus; auto: boolean }>).detail;
      if (!auto) return;
      if (state === "saving") setStatus("saving");
      else if (state === "saved") { saved = inFlight ?? saved; inFlight = null; failed = null; tick(); }
      else { failed = inFlight ?? sig(); inFlight = null; setStatus("error"); }
    };
    form.addEventListener(AUTOSAVE_EVENT, onStatus);
    const timer = setInterval(tick, 800);
    return () => { form.removeEventListener(AUTOSAVE_EVENT, onStatus); clearInterval(timer); };
  }, [autosave, formId]);

  // Block double submits; re-enable if nothing happened (e.g. an error) after a few seconds.
  useEffect(() => {
    if (!formId) return;
    const form = document.getElementById(formId);
    if (!form) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onSubmit = (e: Event) => { if ((e as SubmitEvent).submitter?.getAttribute("name") === "autosave") return; setSaving(true); clearTimeout(timer); timer = setTimeout(() => setSaving(false), 8000); };
    form.addEventListener("submit", onSubmit);
    return () => { form.removeEventListener("submit", onSubmit); clearTimeout(timer); };
  }, [formId]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label={t("cancel")} tabIndex={-1} className="absolute inset-0 cursor-default bg-black/40" onClick={() => closeRef.current()} />
      <aside className="drawer-panel relative flex h-full w-full max-w-xl flex-col bg-bg shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold">{title}</h1>
            {autosave && (
              <p className={`text-xs ${status === "error" ? "text-danger" : "text-muted"}`} role="status">
                {t(status === "saved" ? "autoSaved" : status === "saving" ? "autoSaving" : status === "error" ? "autoFailed" : "autoUnsaved")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onDelete}
            <button type="button" className="btn btn-sm" onClick={() => closeRef.current()}>{autosave ? t("close") : t("cancel")}</button>
            {formId && autosave && <button ref={autoBtn} type="submit" form={formId} name="autosave" value="1" hidden aria-hidden tabIndex={-1} />}
            {formId && (
              <button type="submit" form={formId} disabled={saving || (autosave && (status === "saved" || status === "saving"))} className="btn btn-sm btn-primary">{submitLabel ?? t("save")}</button>
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

/** Trash icon for the drawer header (left of Cancel). Confirms, runs the server action, then closes the drawer. */
export function DrawerDeleteButton({
  action, intercepted, message, label,
}: { action: () => Promise<void>; intercepted: boolean; message: string; label: string }) {
  const router = useRouter();
  return (
    <form
      action={async () => {
        await action();
        if (intercepted) router.back();
      }}
      onSubmit={(e) => { if (!window.confirm(message)) e.preventDefault(); }}
    >
      <button type="submit" aria-label={label} title={label} className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted hover:border-danger hover:text-danger">
        <Trash2 size={15} />
      </button>
    </form>
  );
}
