import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Trash2 } from "lucide-react";
import { DrawerShell } from "@/components/drawer-shell";
import { SettingsForm } from "@/components/settings-form";
import { TripForm } from "@/components/trip-form";
import { ConfirmButton } from "@/components/confirm-button";
import { CopyButton } from "@/components/copy-button";
import { SubmitButton } from "@/components/submit-button";
import { createClient } from "@/lib/supabase/server";
import { addBlock, deleteBlock, regenerateAvailabilityToken, unblockEmail } from "@/app/availability-actions";
import { utcToLocal } from "@/lib/tz";
import { deletePerson, deleteTrip, regenerateShareToken, saveSettings } from "@/app/actions";
import type { Person, Trip } from "@/lib/types";

export async function SettingsContent({ id, back, intercepted }: { id: string; back: string; intercepted: boolean }) {
  const t = await getTranslations("trip");
  const s = await getTranslations("share");
  const p = await getTranslations("people");
  const c = await getTranslations("common");
  const a = await getTranslations("share.avail");
  const supabase = await createClient();
  const [{ data: tripRow }, { data: peopleRows }] = await Promise.all([
    supabase.from("trips").select("*").eq("id", id).maybeSingle(),
    supabase.from("people").select("*").eq("trip_id", id).order("is_me", { ascending: false }).order("name"),
  ]);
  if (!tripRow) notFound();
  const trip = tripRow as Trip;
  const people = (peopleRows ?? []) as Person[];
  const av = tripRow as unknown as {
    availability_enabled: boolean; availability_public: boolean; availability_token: string; avail_day_start: string; avail_day_end: string;
    avail_buffer_min: number; avail_min_notice_hours: number; availability_blocked_emails: string[];
  };
  const { data: blockRows } = await supabase.from("availability_blocks").select("*").eq("trip_id", id).order("start_at");
  const availLink = `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/a/${av.availability_token}`;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const link = `${site}/v/${trip.share_token}`;

  const langSel = (name: string, def: string) => (
    <select name={name} className="input" defaultValue={def}><option value="zh-TW">繁中</option><option value="en">EN</option></select>
  );

  return (
    <DrawerShell title={t("settingsTitle")} intercepted={intercepted} closeHref={back} formId="settings-form" submitLabel={c("save")}>
      <SettingsForm action={saveSettings.bind(null, id)} intercepted={intercepted} back={back} formId="settings-form">
        <section className="card p-5">
          <TripForm bare initial={trip} />
        </section>

        <section className="card p-5 space-y-3">
          <h2 className="font-semibold">{a("title")}</h2>
          <label className="flex items-center gap-2"><input type="checkbox" name="availability_enabled" defaultChecked={av.availability_enabled} /> {a("enabled")}</label>
          <label className="flex items-start gap-2"><input type="checkbox" name="availability_public" defaultChecked={av.availability_public} className="mt-1" /> {a("public")}</label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="space-y-1"><span className="text-xs text-muted">{a("dayStart")}</span><input type="time" name="avail_day_start" className="input" defaultValue={av.avail_day_start.slice(0, 5)} required /></label>
            <label className="space-y-1"><span className="text-xs text-muted">{a("dayEnd")}</span><input type="time" name="avail_day_end" className="input" defaultValue={av.avail_day_end.slice(0, 5)} required /></label>
            <label className="space-y-1"><span className="text-xs text-muted">{a("buffer")}</span><input type="number" name="avail_buffer_min" min={0} max={240} step={5} className="input" defaultValue={av.avail_buffer_min} /></label>
            <label className="space-y-1"><span className="text-xs text-muted">{a("notice")}</span><input type="number" name="avail_min_notice_hours" min={0} max={336} className="input" defaultValue={av.avail_min_notice_hours} /></label>
          </div>
          <p className="text-xs text-muted">{a("hint")}</p>
        </section>

        <section className="card p-5 space-y-3">
          <h2 className="font-semibold">{s("title")}</h2>
          <label className="flex items-center gap-2"><input type="checkbox" name="share_enabled" defaultChecked={trip.share_enabled} /> {s("enabled")}</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="viewers_see_costs" defaultChecked={trip.viewers_see_costs} /> {s("seeCosts")}</label>
          <p className="text-xs text-muted">{s("hint")}</p>
        </section>

        <section className="card p-5 space-y-4">
          <h2 className="font-semibold">{p("title")}</h2>
          <p className="text-xs text-muted">{p("hint")}</p>
          <ul className="space-y-3">
            {people.map((person) => (
              <li key={person.id} className="grid grid-cols-12 items-end gap-2">
                <input type="hidden" name="person_ids" value={person.id} />
                <div className="col-span-12 sm:col-span-4">
                  <label className="label">{p("name")}{person.is_me && ` (${p("me")})`}</label>
                  <input name={`p:${person.id}:name`} className="input" defaultValue={person.name} required />
                </div>
                <div className="col-span-12 sm:col-span-5">
                  <label className="label">{p("email")}</label>
                  <input name={`p:${person.id}:email`} type="email" className="input" defaultValue={person.email ?? ""} />
                </div>
                <div className="col-span-6 sm:col-span-3">
                  <label className="label">{p("locale")}</label>
                  {langSel(`p:${person.id}:locale`, person.locale)}
                </div>
                <label className="col-span-6 flex h-10 items-center gap-2 text-xs sm:col-span-9">
                  <input type="checkbox" name={`p:${person.id}:can_view_all`} defaultChecked={person.can_view_all} /> {p("viewAll")}
                </label>
                <div className="col-span-6 flex justify-end sm:col-span-3">
                  {!person.is_me && (
                    <button formAction={deletePerson.bind(null, id, person.id)} formNoValidate className="btn btn-sm btn-danger" aria-label={c("delete")}>
                      <Trash2 size={14} /> {c("delete")}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-12 items-end gap-2 border-t border-border pt-4">
            <h3 className="col-span-12 text-sm font-medium">{p("addTitle")}</h3>
            <div className="col-span-12 sm:col-span-4"><input name="new:name" className="input" placeholder={p("name")} /></div>
            <div className="col-span-12 sm:col-span-5"><input name="new:email" type="email" className="input" placeholder={p("email")} /></div>
            <div className="col-span-6 sm:col-span-3">{langSel("new:locale", "zh-TW")}</div>
            <label className="col-span-12 flex h-10 items-center gap-2 text-xs"><input type="checkbox" name="new:can_view_all" /> {p("viewAll")}</label>
          </div>
        </section>
      </SettingsForm>

      <p className="text-xs text-muted">{t("instantHint")}</p>

      <section className="card p-5 space-y-4">
        <h2 className="font-semibold">{a("title")} · {a("link")}</h2>
        {av.availability_enabled && av.availability_public ? (
          <div className="flex items-center gap-2"><input readOnly className="input" value={availLink} /><CopyButton text={availLink} /></div>
        ) : (
          <p className="text-xs text-muted">{a("publicOff")}</p>
        )}
        <form action={regenerateAvailabilityToken.bind(null, id)}><button className="btn btn-sm">{a("regenerate")}</button></form>

        <div className="space-y-2 border-t border-border pt-4">
          <h3 className="font-medium">{a("blocks")}</h3>
          {(blockRows ?? []).length === 0 && <p className="text-xs text-muted">{a("noBlocks")}</p>}
          <ul className="space-y-1">
            {(blockRows ?? []).map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="tabular-nums">{utcToLocal(b.start_at, trip.timezone).replace("T", " ")} → {utcToLocal(b.end_at, trip.timezone).replace("T", " ")}{b.note ? ` · ${b.note}` : ""}</span>
                <form action={deleteBlock.bind(null, id, b.id)}><button className="btn btn-sm" aria-label="delete"><Trash2 size={14} /></button></form>
              </li>
            ))}
          </ul>
          <form action={addBlock.bind(null, id)} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <input type="datetime-local" name="start" className="input" required aria-label={a("blockStart")} />
            <input type="datetime-local" name="end" className="input" required aria-label={a("blockEnd")} />
            <input name="note" className="input" maxLength={200} placeholder={a("blockNote")} />
            <SubmitButton className="btn-sm">{a("addBlock")}</SubmitButton>
          </form>
        </div>

        {av.availability_blocked_emails.length > 0 && (
          <div className="space-y-1 border-t border-border pt-4">
            <h3 className="font-medium">{a("blockedEmails")}</h3>
            {av.availability_blocked_emails.map((e) => (
              <form key={e} action={unblockEmail.bind(null, id, e)} className="flex items-center justify-between text-sm">
                <span>{e}</span><button className="btn btn-sm">{a("unblock")}</button>
              </form>
            ))}
          </div>
        )}
      </section>

      <section className="card p-5 space-y-4">
        <h2 className="font-semibold">{s("title")} · {s("link")}</h2>
        <div className="flex items-center gap-2">
          <input readOnly className="input" value={link} />
          <CopyButton text={link} />
        </div>
        <form action={regenerateShareToken.bind(null, id)} className="flex items-center gap-3">
          <button className="btn btn-sm">{s("regenerate")}</button>
          <span className="text-xs text-muted">{s("regenerateHint")}</span>
        </form>
      </section>

      <section className="card border-danger/40 p-5 space-y-3">
        <h2 className="font-semibold text-danger">{t("danger")}</h2>
        <form action={deleteTrip.bind(null, id)}>
          <ConfirmButton className="btn-danger" message={t("deleteConfirm")}>{t("deleteTrip")}</ConfirmButton>
        </form>
      </section>
    </DrawerShell>
  );
}
