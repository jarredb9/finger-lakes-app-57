"use client";

import { useEffect } from "react";
import { useFriendStore } from "@/lib/stores/friendStore";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User, MapPin, Calendar, Bookmark, Heart, AlertCircle } from "lucide-react";
import Image from "next/image";
import { Skeleton } from "@/components/ui/skeleton";
import VisitCardHistory from "./VisitCardHistory";
import { Button } from "./ui/button";
import { useRouter } from "next/navigation";

interface FriendProfileProps {
  friendId: string;
}

export default function FriendProfile({ friendId }: FriendProfileProps) {
  const { selectedFriendProfile = null, isLoading, fetchFriendProfile, error } = useFriendStore();
  const router = useRouter();

  useEffect(() => {
    fetchFriendProfile(friendId);
  }, [friendId, fetchFriendProfile]);

  if (isLoading && !selectedFriendProfile) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="flex flex-col items-center space-y-4 pt-4">
          <Skeleton className="h-24 w-24 rounded-full" />
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
        <div className="space-y-4 pt-4">
          <Skeleton className="h-8 w-32" />
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/20 bg-destructive/5 mt-8">
        <CardContent className="pt-6 flex flex-col items-center text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <div className="space-y-2">
            <h3 className="font-semibold text-lg">Unable to load profile</h3>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
          <Button onClick={() => router.back()} variant="outline">Go Back</Button>
        </CardContent>
      </Card>
    );
  }

  if (!selectedFriendProfile || !selectedFriendProfile.profile) return null;

  const { profile, visits = [], stats = { visit_count: 0, wishlist_count: 0, favorite_count: 0 } } = selectedFriendProfile;

  return (
    <div className="space-y-6 pb-12">
      {/* Profile Header */}
      <div className="flex flex-col items-center text-center space-y-4 pt-4">
        <Avatar className="h-24 w-24 border-2 border-primary/10 shadow-sm">
          <AvatarImage asChild src={`https://api.dicebear.com/7.x/initials/svg?seed=${profile.name || profile.email}`}>
            <Image 
              src={`https://api.dicebear.com/7.x/initials/svg?seed=${profile.name || profile.email}`} 
              alt={profile.name || "User"}
              width={96}
              height={96}
              unoptimized
            />
          </AvatarImage>
          <AvatarFallback><User className="h-12 w-12" /></AvatarFallback>
        </Avatar>
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight">{profile.name || "User"}</h2>
          <p className="text-muted-foreground text-sm">{profile.email}</p>
          <div className="flex items-center justify-center gap-2 mt-2">
            {profile.privacy_level === 'public' && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Public Profile</span>
            )}
            {profile.privacy_level === 'friends_only' && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">Friends Only</span>
            )}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="text-center p-3 shadow-none border-muted/60">
          <div className="flex flex-col items-center">
            <MapPin className="h-4 w-4 text-primary mb-1" />
            <span className="text-lg font-bold">{stats.visit_count}</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Visits</span>
          </div>
        </Card>
        <Card className="text-center p-3 shadow-none border-muted/60">
          <div className="flex flex-col items-center">
            <Bookmark className="h-4 w-4 text-blue-500 mb-1" />
            <span className="text-lg font-bold">{stats.wishlist_count}</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Wishlist</span>
          </div>
        </Card>
        <Card className="text-center p-3 shadow-none border-muted/60">
          <div className="flex flex-col items-center">
            <Heart className="h-4 w-4 text-red-500 mb-1" />
            <span className="text-lg font-bold">{stats.favorite_count}</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Favorites</span>
          </div>
        </Card>
      </div>

      {/* Visit History Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            Recent Visits
          </h3>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
            {Array.isArray(visits) ? visits.length : 0} Visible
          </span>
        </div>

        {Array.isArray(visits) && visits.length > 0 ? (
          <div className="space-y-4">
            <VisitCardHistory 
              visits={visits} 
              isFriendVisit={true} 
              showWineryName={true}
            />
          </div>
        ) : (
          <div className="text-center py-12 bg-muted/20 rounded-xl border-2 border-dashed border-muted">
            <p className="text-muted-foreground italic text-sm">No public visits logged yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
