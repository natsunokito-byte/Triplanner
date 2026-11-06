import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MapPin, Plus, ArrowRight } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { createClient } from "@/lib/supabase/server";
import type { Trip } from "@/lib/types";

const nightsBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

export default async function Welcome() {
  const t = await getTranslations("welcome");
  const supabase = await createClient();
  const { data } = await supabase
    .from("trips")
    .select("*")
    .order("last_opened_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  const trips = (data ?? []) as Trip[];
  const last = trips[0];

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 space-y-10">
        <section className="text-center space-y-6">
          <h1 className="text-[40px] font-semibold leading-tight">{t("title")}</h1>
          <div className="flex flex-wrap justify-center gap-3">
            {last && (
              <Link href={`/t/${last.id}`} className="btn btn-primary h-12 px-6 text-base">
                {t("openLast")}：{last.title} <ArrowRight size={16} />
              </Link>
            )}
            <Link href="/trips/new" className={last ? "btn h-12 px-6 text-base" : "btn btn-primary h-12 px-6 text-base"}>
              <Plus size={16} /> {t("createNew")}
            </Link>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">{t("yourTrips")}</h2>
          {trips.length === 0 ? (
            <p className="card p-6 text-center text-muted">{t("empty")}</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {trips.map((trip) => (
                <li key={trip.id}>
                  <Link href={`/t/${trip.id}`} className="card block p-4 hover:border-primary transition-colors">
                    <div className="font-semibold">{trip.title}</div>
                    <div className="text-xs text-muted mt-1">
                      {trip.start_date} → {trip.end_date} · {t("nights", { n: nightsBetween(trip.start_date, trip.end_date) })}
                    </div>
                    {trip.destinations.length > 0 && (
                      <div className="mt-2 flex items-center gap-1 text-xs text-muted">
                        <MapPin size={12} /> {trip.destinations.join(" · ")}
                      </div>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
