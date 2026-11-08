import { NewHotelContent } from "@/components/hotel-new-content";
import { safeBack } from "@/lib/schedule";

export default async function NewHotel({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ back?: string }> }) {
  const { id } = await params;
  const back = safeBack(id, (await searchParams).back, `/t/${id}`);
  return <NewHotelContent id={id} back={back} intercepted={false} />;
}
