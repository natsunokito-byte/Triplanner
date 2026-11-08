"use client";

import { AutosaveForm } from "./autosave-form";

/** The single form behind the settings drawer's one Save button. Sections are passed in as children. */
export function SettingsForm({
  action, intercepted, back, formId, children,
}: {
  action: (fd: FormData) => Promise<void>;
  intercepted: boolean;
  back: string;
  formId: string;
  children: React.ReactNode;
}) {
  return (
    <AutosaveForm id={formId} className="space-y-6" action={action} intercepted={intercepted}>
      {(intercepted || back) && <input type="hidden" name="back" value={intercepted ? "close" : back} />}
      {children}
    </AutosaveForm>
  );
}
