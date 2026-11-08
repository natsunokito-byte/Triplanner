import { NewHotelContent } from "@/components/hotel-new-content";

export default async function NewHotelDrawer({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <NewHotelContent id={id} back={`/t/${id}`} intercepted />;
}
