import { NewCommuteContent } from "@/components/commute-new-content";

export default async function NewCommuteDrawer({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const { id } = await params;
  return <NewCommuteContent id={id} sp={await searchParams} back={`/t/${id}`} intercepted />;
}
