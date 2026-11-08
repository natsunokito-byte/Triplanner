import { SettingsContent } from "@/components/settings-content";

export default async function SettingsDrawer({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SettingsContent id={id} back={`/t/${id}`} intercepted />;
}
