import { EditHotelContent } from "@/components/hotel-edit-content";

export default async function EditHotelDrawer({ params }: { params: Promise<{ id: string; hotelId: string }> }) {
  const { id, hotelId } = await params;
  return <EditHotelContent id={id} hotelId={hotelId} back={`/t/${id}`} intercepted />;
}
