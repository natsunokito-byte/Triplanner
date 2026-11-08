import { EditCommuteContent } from "@/components/commute-edit-content";
import { safeBack } from "@/lib/schedule";

export default async function EditCommute({ params, searchParams }: { params: Promise<{ id: string; commuteId: string }>; searchParams: Promise<{ back?: string }> }) {
  const { id, commuteId } = await params;
  const back = safeBack(id, (await searchParams).back, `/t/${id}`);
  return <EditCommuteContent id={id} commuteId={commuteId} back={back} intercepted={false} />;
}
