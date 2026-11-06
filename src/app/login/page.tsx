"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { LocaleSwitcher } from "@/components/locale-switcher";

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}

function LoginForm() {
  const t = useTranslations("login");
  const callbackError = useSearchParams().get("error");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState(false);
  const [sendError, setSendError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setSendError(error ? `${error.status ?? ""} ${error.message}`.trim() : "");
    setState(error ? "error" : "sent");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setVerifying(true); setCodeError(false);
    const { error } = await createClient().auth.verifyOtp({ email, token: code.trim(), type: "email" });
    setVerifying(false);
    if (error) { setCodeError(true); return; }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="card w-full max-w-sm p-6 space-y-4">
        <div className="flex items-start justify-between">
          <h1 className="text-xl font-semibold">{t("title")}</h1>
          <LocaleSwitcher />
        </div>
        <p className="text-muted">{t("subtitle")}</p>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="label" htmlFor="email">{t("email")}</label>
            <input id="email" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button className="btn btn-primary w-full" disabled={state === "sending"}>{t("send")}</button>
        </form>
        {callbackError && state !== "sent" && (
          <div role="alert" className="space-y-1 text-sm text-danger">
            <p>{t("callbackError")}</p>
            <p className="break-words text-xs text-muted">{callbackError}</p>
          </div>
        )}
        {state === "sent" && (
          <form onSubmit={verify} className="space-y-3 border-t border-border pt-4">
            <p className="text-sm text-success">{t("sent")}</p>
            <div>
              <label className="label" htmlFor="code">{t("code")}</label>
              <input id="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6,10}" maxLength={10} required
                className="input text-center text-lg tracking-[0.3em] tabular-nums" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
            </div>
            <button className="btn btn-primary w-full" disabled={verifying || code.length < 6}>{t("verify")}</button>
            {codeError && <p role="alert" className="text-sm text-danger">{t("codeError")}</p>}
          </form>
        )}
        {state === "error" && (
          <div role="alert" className="space-y-1 text-sm text-danger">
            <p>{t("error")}</p>
            {sendError && <p className="break-words text-xs text-muted">{sendError}</p>}
          </div>
        )}
      </div>
    </main>
  );
}
