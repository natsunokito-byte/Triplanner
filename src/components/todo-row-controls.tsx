"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { CalendarDays, X } from "lucide-react";

type Act = (fd: FormData) => Promise<void>;

/** Category dropdown that saves itself on change (no separate Move button). */
export function TodoCategorySelect({ action, value, cats }: { action: Act; value: string; cats: { id: string; name: string }[] }) {
  const t = useTranslations("todos");
  return (
    <form action={action} className="flex items-center">
      <select
        name="cat" defaultValue={value} aria-label={t("category")}
        className="input !h-8 !w-auto cursor-pointer !border-0 !bg-transparent !px-1 !py-0 text-xs text-muted hover:text-text"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        <option value="b:none">{t("uncategorized")}</option>
        {cats.map((k) => <option key={k.id} value={`c:${k.id}`}>{k.name}</option>)}
      </select>
    </form>
  );
}

/** Calendar-icon date picker that sets / clears the due date and saves on change. */
export function TodoDuePicker({ action, value }: { action: Act; value: string | null }) {
  const t = useTranslations("todos");
  const ref = useRef<HTMLInputElement>(null);
  const open = () => {
    const el = ref.current;
    if (!el) return;
    if (typeof el.showPicker === "function") el.showPicker();
    else el.focus();
  };
  return (
    <form action={action} className="relative flex items-center gap-1">
      <input
        ref={ref} type="date" name="due" defaultValue={value ?? ""} tabIndex={-1} aria-hidden="true"
        className="pointer-events-none absolute left-0 top-full h-0 w-0 opacity-0"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      />
      <button
        type="button" onClick={open} aria-label={t("setDue")} title={t("setDue")}
        className={`flex h-8 items-center gap-1 rounded-md px-2 text-xs hover:bg-surface-2 ${value ? "text-text" : "text-muted"}`}
      >
        <CalendarDays size={14} />{value && <span className="tabular-nums">{value.slice(5).replace("-", "/")}</span>}
      </button>
      {value && (
        <button
          type="button" aria-label={t("clearDue")} title={t("clearDue")}
          className="flex h-8 w-6 items-center justify-center rounded-md text-muted hover:text-danger"
          onClick={() => { if (ref.current) { ref.current.value = ""; ref.current.form?.requestSubmit(); } }}
        >
          <X size={12} />
        </button>
      )}
    </form>
  );
}
