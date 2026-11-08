"use client";

import { useRouter } from "next/navigation";

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
  const router = useRouter();
  return (
    <form
      id={formId}
      className="space-y-6"
      action={async (fd) => {
        await action(fd);
        if (intercepted) router.back();
      }}
    >
      {(intercepted || back) && <input type="hidden" name="back" value={intercepted ? "close" : back} />}
      {children}
    </form>
  );
}
