import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/app-header";
import { TripForm } from "@/components/trip-form";
import { createTrip } from "@/app/actions";

export default async function NewTrip() {
  const t = await getTranslations("trip");
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-10 space-y-6">
        <h1 className="text-xl font-semibold">{t("newTitle")}</h1>
        <div className="card p-5">
          <TripForm action={createTrip} submitLabel={t("create")} />
        </div>
      </main>
    </>
  );
}
