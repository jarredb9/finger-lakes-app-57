import { Suspense } from 'react';
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import Header from "@/components/header";
import FriendsManager from "@/components/friends-manager";
import { Loader2 } from "lucide-react";

export default async function FriendsPage() {
  const user = await getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Suspense fallback={
          <div className="flex justify-center items-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        }>
          <FriendsManager />
        </Suspense>
      </main>
    </div>
  );
}