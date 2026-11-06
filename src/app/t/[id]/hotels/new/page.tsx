import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { HotelForm } from "@/components/hotel-form";
import { createClient } from "@/lib/supabase/server";
import { createHotel } from "@/app/actions";
import type { Trip } from "@/lib/types";

export default async function NewHotel({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("hotel");
  const c = await getTranslations("common");
  const supabase = await createClient();
  const { data } = await supabase.from("trips").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const trip = data as Trip;
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-8 space-y-6">
        <Link href={`/t/${id}`} className="inline-flex items-center gap-1 text-muted hover:text-text"><ArrowLeft size={14} /> {c("back")}</Link>
        <h1 className="text-xl font-semibold">{t("newTitle")}</h1>
        <div className="card p-5">
          <HotelForm
            action={createHotel.bind(null, id)}
            tz={trip.timezone}
            currency={trip.currency}
            defaults={{ check_in: `${trip.start_date}T15:00`, check_out: `${trip.end_date}T11:00` }}
            submitLabel={t("create")}
          />
        </div>
      </main>
    </>
  );
}
