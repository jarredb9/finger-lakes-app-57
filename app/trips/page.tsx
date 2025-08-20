import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import TripPlanner from "@/components/trip-planner";
import Header from "@/components/header";

export default async function TripsPage() {
  const user = await getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <TripPlanner />
      </main>
    </div>
  );
}