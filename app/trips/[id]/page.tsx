import { Suspense } from 'react';
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import Header from "@/components/header";
import { Loader2 } from "lucide-react";
import TripDetailClientPage from "./client-page";
import { AuthenticatedUser } from '@/lib/types';

export default async function TripDetailPage({ params }: { params: { id: string } }) {
  const user = await getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user as AuthenticatedUser} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Suspense fallback={
          <div className="flex justify-center items-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        }>
          <TripDetailClientPage tripId={params.id} />
        </Suspense>
      </main>
    </div>
  );
}