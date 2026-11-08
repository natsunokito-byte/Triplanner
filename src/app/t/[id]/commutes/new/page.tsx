import { NewCommuteContent } from "@/components/commute-new-content";
import { safeBack } from "@/lib/schedule";

export default async function NewCommute({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string; back?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  return <NewCommuteContent id={id} sp={sp} back={safeBack(id, sp.back, `/t/${id}`)} intercepted={false} />;
}
