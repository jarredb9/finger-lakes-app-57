// file: app/trips/past/page.tsx
import { Suspense } from 'react';
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import Header from "@/components/header";
import TripList from "@/components/trip-list";
import { Loader2 } from "lucide-react";
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default async function PastTripsPage() {
  const user = await getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">Past Trips</h1>
            <Button asChild variant="secondary">
                <Link href="/trips/upcoming">View Upcoming Trips</Link>
            </Button>
        </div>
        <Suspense fallback={
          <div className="flex justify-center items-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        }>
          <TripList type="past" />
        </Suspense>
      </main>
    </div>
  );
}