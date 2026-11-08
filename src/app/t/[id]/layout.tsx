// `drawer` is a parallel-route slot: plan create/edit open over the current page as a right-hand drawer
// (intercepted route); a direct visit or refresh of /plans/... renders the full-page version instead.
export default function TripLayout({ children, drawer }: { children: React.ReactNode; drawer: React.ReactNode }) {
  return (
    <>
      {children}
      {drawer}
    </>
  );
}
