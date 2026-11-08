import { EditCommuteContent } from "@/components/commute-edit-content";

export default async function EditCommuteDrawer({ params }: { params: Promise<{ id: string; commuteId: string }> }) {
  const { id, commuteId } = await params;
  return <EditCommuteContent id={id} commuteId={commuteId} back={`/t/${id}`} intercepted />;
}
