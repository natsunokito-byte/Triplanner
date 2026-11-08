import { EditPlanContent } from "@/components/plan-edit-content";
import { safeBack } from "@/lib/schedule";

export default async function EditPlan({ params, searchParams }: { params: Promise<{ id: string; planId: string }>; searchParams: Promise<{ back?: string }> }) {
  const { id, planId } = await params;
  const back = safeBack(id, (await searchParams).back, `/t/${id}`);
  return <EditPlanContent id={id} planId={planId} back={back} intercepted={false} />;
}
