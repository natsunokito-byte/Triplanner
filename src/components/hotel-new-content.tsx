import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { DrawerShell } from "@/components/drawer-shell";
import { HotelForm } from "@/components/hotel-form";
import { createClient } from "@/lib/supabase/server";
import { createHotel } from "@/app/actions";
import type { Trip } from "@/lib/types";

export async function NewHotelContent({ id, back, intercepted }: { id: string; back: string; intercepted: boolean }) {
  const t = await getTranslations("hotel");
  const supabase = await createClient();
  const { data } = await supabase.from("trips").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const trip = data as Trip;
  return (
    <DrawerShell title={t("newTitle")} intercepted={intercepted} closeHref={back} formId="hotel-form" submitLabel={t("create")}>
      <HotelForm
        formId="hotel-form"
        intercepted={intercepted}
        back={back}
        action={createHotel.bind(null, id)}
        tz={trip.timezone}
        currency={trip.currency}
        defaults={{ check_in: `${trip.start_date}T15:00`, check_out: `${trip.end_date}T11:00` }}
        submitLabel={t("create")}
      />
    </DrawerShell>
  );
}
