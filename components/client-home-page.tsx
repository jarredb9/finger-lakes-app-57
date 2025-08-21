"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import dynamic from 'next/dynamic'
import { useAuth } from "@/components/auth-provider"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Wine, MapPin, Star, ListPlus, Loader2 } from "lucide-react"
import Header from "@/components/header"

const WineryMap = dynamic(() => import('@/components/winery-map'), { 
  ssr: false,
  loading: () => <div className="h-96 w-full lg:h-[600px] bg-gray-100 rounded-lg animate-pulse" />
});

interface UserStats {
    totalVisits: number;
    uniqueWineries: number;
    averageRating: string;
    wishlistCount: number;
    favoritesCount: number;
}

export default function ClientHomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<UserStats | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      const fetchStats = async () => {
        // In a real app, this would be an API call
        // For now, we simulate fetching, or you can create a new `/api/stats` endpoint
        const visitsResponse = await fetch('/api/visits');
        const visits = await visitsResponse.json();

        const wishlistResponse = await fetch('/api/wishlist');
        const wishlist = await wishlistResponse.json();

        const favoritesResponse = await fetch('/api/favorites');
        const favorites = await favoritesResponse.json();
        
        const totalVisits = visits.length;
        const uniqueWineries = new Set(visits.map((v: any) => v.wineries?.id)).size;
        const ratedVisits = visits.filter((v: any) => v.rating !== null);
        const averageRating = ratedVisits.length > 0
            ? (ratedVisits.reduce((acc: number, v: any) => acc + (v.rating || 0), 0) / ratedVisits.length).toFixed(1)
            : "0";
        const wishlistCount = wishlist.length;
        const favoritesCount = favorites.length;

        setStats({ totalVisits, uniqueWineries, averageRating, wishlistCount, favoritesCount });
      };
      fetchStats();
    }
  }, [user]);

  if (loading || !user) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Visits</CardTitle>
                        <Wine className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent><div className="text-2xl font-bold">{stats ? stats.totalVisits : <Loader2 className="h-6 w-6 animate-spin"/>}</div></CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Unique Wineries</CardTitle>
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent><div className="text-2xl font-bold">{stats ? stats.uniqueWineries : <Loader2 className="h-6 w-6 animate-spin"/>}</div></CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Average Rating</CardTitle>
                        <Star className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent><div className="text-2xl font-bold">{stats ? stats.averageRating : <Loader2 className="h-6 w-6 animate-spin"/>}</div></CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Favorites</CardTitle>
                        <Star className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent><div className="text-2xl font-bold">{stats ? stats.favoritesCount : <Loader2 className="h-6 w-6 animate-spin"/>}</div></CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Want to Go</CardTitle>
                        <ListPlus className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent><div className="text-2xl font-bold">{stats ? stats.wishlistCount : <Loader2 className="h-6 w-6 animate-spin"/>}</div></CardContent>
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