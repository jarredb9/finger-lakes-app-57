import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import Header from "@/components/header";
import TripDetailClientPage from "./client-page";

export default async function TripDetailPage({ params }: { params: { id: string } }) {
  const user = await getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <TripDetailClientPage tripId={params.id} user={user} />
      </main>
    </div>
  );
}