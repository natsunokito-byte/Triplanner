import { NewPlanContent } from "@/components/plan-new-content";

export default async function NewPlanDrawer({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string; type?: string; undated?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  return <NewPlanContent id={id} sp={sp} back={`/t/${id}`} intercepted />;
}
