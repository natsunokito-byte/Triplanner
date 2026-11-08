import { EditHotelContent } from "@/components/hotel-edit-content";
import { safeBack } from "@/lib/schedule";

export default async function EditHotel({ params, searchParams }: { params: Promise<{ id: string; hotelId: string }>; searchParams: Promise<{ back?: string }> }) {
  const { id, hotelId } = await params;
  const back = safeBack(id, (await searchParams).back, `/t/${id}`);
  return <EditHotelContent id={id} hotelId={hotelId} back={back} intercepted={false} />;
}
