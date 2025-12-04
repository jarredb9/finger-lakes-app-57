import { Suspense } from 'react';
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { Loader2 } from "lucide-react";
import TripDetailClientPage from "./client-page";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function TripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-3 flex items-center gap-2">
         <Link href="/" className="flex items-center text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Map
         </Link>
      </div>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Suspense fallback={
          <div className="flex justify-center items-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        }>
          <TripDetailClientPage tripId={id} />
        </Suspense>
      </main>
    </div>
  );
}