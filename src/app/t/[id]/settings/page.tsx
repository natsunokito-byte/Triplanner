import { SettingsContent } from "@/components/settings-content";
import { safeBack } from "@/lib/schedule";

export default async function SettingsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ back?: string }> }) {
  const { id } = await params;
  const back = safeBack(id, (await searchParams).back, `/t/${id}`);
  return <SettingsContent id={id} back={back} intercepted={false} />;
}
