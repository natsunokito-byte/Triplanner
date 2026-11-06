"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { LocaleSwitcher } from "@/components/locale-switcher";

export default function LoginPage() {
  const t = useTranslations("login");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setState(error ? "error" : "sent");
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
        {state === "sent" && <p className="text-sm text-success">{t("sent")}</p>}
        {state === "error" && <p className="text-sm text-danger">{t("error")}</p>}
      </div>
    </main>
  );
}
