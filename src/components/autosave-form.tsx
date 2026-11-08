"use client";

import { useRouter } from "next/navigation";
import { startTransition } from "react";

export const AUTOSAVE_EVENT = "autosave-status";
export type AutosaveStatus = "saving" | "saved" | "error";

/**
 * <form> that runs a server action itself (no React form reset, so fields keep what the user typed).
 * A submit whose submitter has name="autosave" is a background save: the drawer stays open.
 * Any other submit is the explicit Save: it saves, then closes the drawer.
 */
export function AutosaveForm({
  id, action, intercepted, blocked = false, className, children,
}: {
  id?: string;
  action: (fd: FormData) => Promise<unknown>;
  intercepted: boolean;
  /** true = client-side validation says "do not save" (shown as a failed save) */
  blocked?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <form
      id={id}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const submitter = (e.nativeEvent as SubmitEvent).submitter;
        const fd = new FormData(form, submitter);
        const auto = fd.get("autosave") === "1";
        const emit = (state: AutosaveStatus) => form.dispatchEvent(new CustomEvent(AUTOSAVE_EVENT, { detail: { state, auto } }));
        if (blocked) { emit("error"); return; }
        startTransition(async () => {
          emit("saving");
          try {
            await action(fd);
            emit("saved");
            if (!auto && intercepted) router.back();
          } catch (err) {
            emit("error");
            if (!auto) throw err;
          }
        });
      }}
    >
      {children}
    </form>
  );
}
