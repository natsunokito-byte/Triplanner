"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SubmitButton } from "./submit-button";
import { CostFields } from "./fx";
import { dayDiff } from "@/lib/tz";
import type { Hotel } from "@/lib/types";

export function HotelForm({
  action,
  hotel,
  defaults,
  tz,
  currency,
  submitLabel,
}: {
  action: (fd: FormData) => Promise<void>;
  hotel?: { name: string; address: string | null; booking_status: Hotel["booking_status"]; cost: number | null; cost_currency: string | null; link: string | null; note: string | null };
  defaults: { check_in: string; check_out: string };
  tz: string;
  currency: string;
  submitLabel: string;
}) {
  const t = useTranslations("hotel");
  const [ci, setCi] = useState(defaults.check_in);
  const [co, setCo] = useState(defaults.check_out);
  const [status, setStatus] = useState<Hotel["booking_status"]>(hotel?.booking_status ?? "not_booked");

  const nights = ci && co ? dayDiff(ci.slice(0, 10), co.slice(0, 10)) : 0;
  const bad = !!ci && !!co && co <= ci;

  return (
    <form action={action} className="space-y-5">
      <div>
        <label className="label" htmlFor="name">{t("name")}</label>
        <input id="name" name="name" className="input" required maxLength={160} defaultValue={hotel?.name} />
      </div>
      <div>
        <label className="label" htmlFor="address">{t("address")}</label>
        <input id="address" name="address" className="input" maxLength={300} defaultValue={hotel?.address ?? ""} />
      </div>

      <fieldset>
        <legend className="label">{t("status")}</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["not_booked", "confirmed"] as const).map((v) => (
            <label key={v} className={`card flex cursor-pointer items-center gap-2 p-3 ${status === v ? "border-primary bg-primary-soft" : ""}`}>
              <input type="radio" name="booking_status" value={v} checked={status === v} onChange={() => setStatus(v)} />
              {v === "confirmed" ? t("confirmed") : t("notBooked")}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="check_in">{t("checkIn")}</label>
          <input id="check_in" name="check_in" type="datetime-local" className="input" required value={ci} onChange={(e) => setCi(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="check_out">{t("checkOut")}</label>
          <input id="check_out" name="check_out" type="datetime-local" className="input" required min={ci || undefined} value={co} onChange={(e) => setCo(e.target.value)} />
        </div>
        <p className="col-span-2 text-xs text-muted">
          {t("tzNote", { tz })}
          {!bad && nights > 0 && <> · <span className="font-medium text-text">{t("nights", { n: nights })}</span></>}
        </p>
        {bad && <p className="col-span-2 text-xs text-danger">{t("timeError")}</p>}
      </div>

      <CostFields amountName="cost" currencyName="cost_currency" defaultAmount={hotel?.cost ?? null} defaultCurrency={hotel?.cost_currency ?? currency} costLabel={t("cost")} currencyLabel={t("currency")} />

      <div>
        <label className="label" htmlFor="link">{t("link")}</label>
        <input id="link" name="link" type="url" className="input" placeholder="https://" defaultValue={hotel?.link ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor="note">{t("note")}</label>
        <textarea id="note" name="note" rows={3} className="input h-auto py-2" defaultValue={hotel?.note ?? ""} />
      </div>

      <SubmitButton className={bad ? "pointer-events-none opacity-50" : ""}>{submitLabel}</SubmitButton>
    </form>
  );
}
