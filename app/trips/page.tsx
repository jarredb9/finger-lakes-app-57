"use client" // This page is now a client component to handle auth logic

import { Suspense } from 'react';
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import Header from "@/components/header";
import TripsClientPage from "./trips-client-page";
import { Loader2 } from "lucide-react";

export default function TripsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  if (loading) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      );
  }

  if (!user) {
    router.push("/login");
    return null; // Return null while redirecting
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Suspense fallback={
          <div className="flex justify-center items-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        }>
          <TripsClientPage />
        </Suspense>
      </main>
    </div>
  );
}