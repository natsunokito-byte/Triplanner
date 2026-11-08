import { EditPlanContent } from "@/components/plan-edit-content";

export default async function EditPlanDrawer({ params }: { params: Promise<{ id: string; planId: string }> }) {
  const { id, planId } = await params;
  return <EditPlanContent id={id} planId={planId} back={`/t/${id}`} intercepted />;
}
