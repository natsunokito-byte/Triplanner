import { NewPlanContent } from "@/components/plan-new-content";
import { safeBack } from "@/lib/schedule";

// Direct visit / refresh: the same content as the drawer, shown as a full-screen panel.
export default async function NewPlan({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string; type?: string; undated?: string; back?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  return <NewPlanContent id={id} sp={sp} back={safeBack(id, sp.back, `/t/${id}`)} intercepted={false} />;
}
