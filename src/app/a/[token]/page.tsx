import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/app-header";
import { FreeTime } from "@/components/free-time";
import { RequestVerifyForm } from "@/components/request-verify-form";
import { createAdminClient } from "@/lib/supabase/admin";
import { dayWindow } from "@/lib/availability";
import { TRIP_AVAIL_COLS, loadFreeSlots, type AvailTrip } from "@/lib/request-core";
import { eachDay } from "@/lib/tz";
import { requestCookieName, requestScope, verifySession } from "@/lib/viewer-session";
import { requestRequesterOtp, signOutRequester, submitPublicRequest, verifyRequesterOtp } from "./actions";

export const dynamic = "force-dynamic";

/** Public free/busy page. Shows ONLY free windows — no plan titles, places, people, or reasons for being busy. */
export default async function AvailabilityPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations("free");
  const tv = await getTranslations("viewer");
  const admin = createAdminClient();
  if (!admin) return (<><AppHeader signedIn={false} /><main className="mx-auto max-w-lg p-8 text-muted">{tv("configMissing")}</main></>);

  const { data } = await admin.from("trips").select(TRIP_AVAIL_COLS).eq("availability_token", token).eq("availability_enabled", true).eq("availability_public", true).maybeSingle();
  if (!data) notFound();
  const trip = data as unknown as AvailTrip;

  const secret = process.env.VIEWER_COOKIE_SECRET;
  const session = secret && secret.length >= 32 ? verifySession(secret, (await cookies()).get(requestCookieName(token))?.value, requestScope(trip.id)) : null;

  const slots = await loadFreeSlots(admin, trip);
  const windows = eachDay(trip.start_date, trip.end_date).map((day) => ({ day, ...dayWindow(trip.timezone, day, trip.avail_day_start, trip.avail_day_end) }));

  return (
    <>
      <AppHeader signedIn={false} />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-5 px-4 py-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[28px] font-semibold leading-tight">{t("title", { trip: trip.title })}</h1>
            <p className="text-muted">{t("subtitle")}</p>
          </div>
          {session && <form action={signOutRequester.bind(null, token)}><button className="btn btn-sm">{tv("signOut")}</button></form>}
        </div>
        <FreeTime
          tz={trip.timezone} windows={windows} slots={slots}
          action={submitPublicRequest.bind(null, token)}
          verifiedEmail={session?.e}
          gate={session ? undefined : <RequestVerifyForm requestAction={requestRequesterOtp.bind(null, token)} verifyAction={verifyRequesterOtp.bind(null, token)} />}
        />
      </main>
    </>
  );
}
