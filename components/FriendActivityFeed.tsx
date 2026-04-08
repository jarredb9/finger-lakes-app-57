"use client";

import { useEffect } from "react";
import Image from "next/image";
import { useFriendStore } from "@/lib/stores/friendStore";
import { useVisitStore } from "@/lib/stores/visitStore";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Star, User } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";

export default function FriendActivityFeed() {
  const { friendActivityFeed = [], fetchFriendActivityFeed, isLoading } = useFriendStore();
  const lastActionTimestamp = useVisitStore(state => state.lastActionTimestamp);

  useEffect(() => {
    fetchFriendActivityFeed();
  }, [fetchFriendActivityFeed, lastActionTimestamp]);

  if (isLoading && (!friendActivityFeed || friendActivityFeed.length === 0)) {
    return (
      <div className="space-y-4" data-testid="friend-activity-feed" data-state="loading">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="overflow-hidden">
            <CardHeader className="p-4 pb-2 flex flex-row items-center gap-3 space-y-0">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-2 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-20 w-full rounded-md" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!friendActivityFeed || friendActivityFeed.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground bg-muted/30 rounded-lg border border-dashed" data-testid="friend-activity-feed" data-state="ready">
        <p>No recent activity from friends.</p>
        <p className="text-xs mt-1">Add more friends to see their winery visits here!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="friend-activity-feed" data-state={isLoading ? 'loading' : 'ready'}>
      <h3 className="font-semibold text-lg px-1">Friend Activity</h3>
      {friendActivityFeed.map((item, index) => (
        <Card key={`${item.activity_user_id}-${item.created_at}-${index}`} className="overflow-hidden hover:shadow-xs transition-shadow" data-testid="friend-activity-item">
          <CardHeader className="p-4 pb-2 flex flex-row items-start gap-3 space-y-0">
            <Link href={`/friends/${item.activity_user_id}`}>
              <Avatar className="h-10 w-10 border hover:opacity-80 transition-opacity">
                <AvatarImage asChild src={`https://api.dicebear.com/7.x/initials/svg?seed=${item.user_name}`}>
                  <Image 
                    src={`https://api.dicebear.com/7.x/initials/svg?seed=${item.user_name}`} 
                    alt={item.user_name}
                    width={40}
                    height={40}
                    unoptimized
                  />
                </AvatarImage>
                <AvatarFallback><User className="h-4 w-4" /></AvatarFallback>
              </Avatar>
            </Link>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <Link href={`/friends/${item.activity_user_id}`} className="hover:text-primary transition-colors">
                  <p className="text-sm font-medium leading-none truncate">
                    {item.user_name}
                  </p>
                </Link>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <span>visited</span>
                <span className="font-medium text-foreground">{item.winery_name}</span>
              </p>
            </div>
          </CardHeader>
          
          <CardContent className="p-4 pt-2 space-y-3">
            {item.visit_rating && item.visit_rating > 0 && (
              <div className="flex items-center">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={`w-4 h-4 ${i < (item.visit_rating || 0) ? "text-yellow-400 fill-yellow-400" : "text-gray-200"}`}
                  />
                ))}
              </div>
            )}
            
            {item.visit_review && (
              <div className="bg-muted/30 p-3 rounded-md text-sm italic text-muted-foreground relative">
                <span className="absolute top-1 left-2 text-2xl text-muted-foreground/20">&quot;</span>
                <p className="relative z-10 px-2">{item.visit_review}</p>
              </div>
            )}

            {item.visit_photos && item.visit_photos.length > 0 && (
               <div className="flex gap-2 overflow-x-auto pb-2 pt-1 scrollbar-hide">
                  {item.visit_photos.map((photo, i) => (
                    <div key={i} className="relative h-20 w-20 shrink-0 rounded-md overflow-hidden border bg-muted">
                      <Image 
                        src={photo} 
                        alt={`Visit photo ${i + 1}`}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                  ))}
               </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
