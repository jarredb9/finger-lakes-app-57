import { redirect } from "next/navigation"
import { getUser } from "@/lib/auth"
import { Suspense } from "react"
import dynamic from 'next/dynamic'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Wine, MapPin, Star, ListPlus } from "lucide-react"
import { createClient } from "@/utils/supabase/server"
import Header from "@/components/header"

const WineryMap = dynamic(() => import('@/components/winery-map'), { 
  ssr: false,
  loading: () => <div className="h-96 w-full lg:h-[600px] bg-gray-100 rounded-lg animate-pulse" />
});

async function getUserStats(userId: string) {
  const supabase = await createClient();
  
  const { data: visits, error: visitsError } = await supabase
    .from('visits')
    .select('id, rating, wineries(id)')
    .eq('user_id', userId);

  const { data: wishlist, error: wishlistError } = await supabase
    .from('wishlist')
    .select('id')
    .eq('user_id', userId);

  const { data: favorites, error: favoritesError } = await supabase
    .from('favorites')
    .select('id')
    .eq('user_id', userId);

  if (visitsError || wishlistError || favoritesError) {
    console.error("Error fetching stats:", visitsError, wishlistError, favoritesError);
    return { totalVisits: 0, uniqueWineries: 0, averageRating: 0, wishlistCount: 0, favoritesCount: 0 };
  }

  const totalVisits = visits.length;
  const uniqueWineries = new Set(visits.map(v => v.wineries?.id)).size;
  const ratedVisits = visits.filter(v => v.rating !== null);
  const averageRating = ratedVisits.length > 0
    ? (ratedVisits.reduce((acc, v) => acc + (v.rating || 0), 0) / ratedVisits.length).toFixed(1)
    : "0";
  const wishlistCount = wishlist.length;
  const favoritesCount = favorites.length;

  return { totalVisits, uniqueWineries, averageRating, wishlistCount, favoritesCount };
}

export default async function HomePage() {
  const user = await getUser()

  if (!user) {
    redirect("/login")
  }

  const stats = await getUserStats(user.id);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Visits</CardTitle>
                        <Wine className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent><div className="text-2xl font-bold">{stats.totalVisits}</div></CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Unique Wineries</CardTitle>
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent><div className="text-2xl font-bold">{stats.uniqueWineries}</div></CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Average Rating</CardTitle>
                        <Star className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent><div className="text-2xl font-bold">{stats.averageRating}</div></CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Favorites</CardTitle>
                        <Star className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent><div className="text-2xl font-bold">{stats.favoritesCount}</div></CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Want to Go</CardTitle>
                        <ListPlus className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent><div className="text-2xl font-bold">{stats.wishlistCount}</div></CardContent>
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