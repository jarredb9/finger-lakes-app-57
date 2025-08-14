import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { Suspense } from "react";
import dynamic from 'next/dynamic';

const WineryMap = dynamic(() => import('@/components/winery-map'), { ssr: false });

export default async function HomePage() {
  const user = await getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">Finger Lakes Winery Tracker</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-700">Welcome, {user.name}</span>
              <form action="/api/auth/logout" method="post">
                <button type="submit" className="text-sm text-gray-500 hover:text-gray-700">
                  Logout
                </button>
              </form>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Explore Finger Lakes Wineries</h2>
          <p className="text-gray-600">
            Discover and track your visits to the beautiful wineries of New York's Finger Lakes region.
          </p>
        </div>

        <Suspense fallback={<div className="h-96 bg-gray-100 rounded-lg animate-pulse" />}>
          <WineryMap userId={user.id} />
        </Suspense>
      </main>
    </div>
  );
}