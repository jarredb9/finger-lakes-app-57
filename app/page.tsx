import { redirect } from "next/navigation"
import { getUser } from "@/lib/auth"
import { Suspense } from "react"
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Wine, MapPin, Star } from "lucide-react"
import { createClient } from "@/utils/supabase/server"

const WineryMap = dynamic(() => import('@/components/winery-map'), { 
  ssr: false,
  loading: () => <div className="h-96 w-full lg:h-[600px] bg-gray-100 rounded-lg animate-pulse" />
});

// Helper function to fetch user stats
async function getUserStats(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('visits')
    .select('id, rating, wineries(id)')
    .eq('user_id', userId);

  if (error) {
    console.error("Error fetching user stats:", error);
    return { totalVisits: 0, uniqueWineries: 0, averageRating: 0 };
  }

  const totalVisits = data.length;
  const uniqueWineries = new Set(data.map(v => v.wineries?.id)).size;
  const ratedVisits = data.filter(v => v.rating !== null);
  const averageRating = ratedVisits.length > 0
    ? (ratedVisits.reduce((acc, v) => acc + (v.rating || 0), 0) / ratedVisits.length).toFixed(1)
    : 0;

  return { totalVisits, uniqueWineries, averageRating };
}

export default async function HomePage() {
  const user = await getUser()

  if (!user) {
    redirect("/login")
  }

  const stats = await getUserStats(user.id);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white/80 backdrop-blur-lg sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Image src="/placeholder-logo.png" alt="Finger Lakes Winery Tracker" width={32} height={32} />
              <h1 className="text-xl font-bold text-gray-900 ml-3">FLX Wine Tracker</h1>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-800">Welcome, {user.name}</p>
              </div>
              <form action="/api/auth/logout" method="post">
                <button type="submit" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
                  Logout
                </button>
              </form>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* User Stats Section */}
        <div className="mb-8">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Visits</CardTitle>
                        <Wine className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totalVisits}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Unique Wineries</CardTitle>
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.uniqueWineries}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Average Rating</CardTitle>
                        <Star className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.averageRating}</div>
                    </CardContent>
                </Card>
            </div>
        </div>
        
        <Suspense fallback={<div className="h-96 bg-gray-100 rounded-lg animate-pulse" />}>
          <WineryMap userId={user.id} />
        </Suspense>
      </main>
    </div>
  )
}