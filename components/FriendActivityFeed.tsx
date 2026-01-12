"use client";

import { useEffect } from "react";
import { useFriendStore } from "@/lib/stores/friendStore";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Star, User } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

export default function FriendActivityFeed() {
  const { friendActivityFeed, fetchFriendActivityFeed, isLoading } = useFriendStore();

  useEffect(() => {
    fetchFriendActivityFeed();
  }, [fetchFriendActivityFeed]);

  if (isLoading && friendActivityFeed.length === 0) {
    return (
      <div className="space-y-4">
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

  if (friendActivityFeed.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground bg-muted/30 rounded-lg border border-dashed">
        <p>No recent activity from friends.</p>
        <p className="text-xs mt-1">Add more friends to see their winery visits here!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-lg px-1">Friend Activity</h3>
      {friendActivityFeed.map((item, index) => (
        <Card key={`${item.user_id}-${item.created_at}-${index}`} className="overflow-hidden hover:shadow-sm transition-shadow">
          <CardHeader className="p-4 pb-2 flex flex-row items-start gap-3 space-y-0">
            <Avatar className="h-10 w-10 border">
              <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${item.user_name}`} />
              <AvatarFallback><User className="h-4 w-4" /></AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium leading-none truncate">
                  {item.user_name}
                </p>
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
                  {/* Since photos might be private paths, we ideally need signed URLs. 
                      Displaying placeholders or indicating photos exist for now. 
                      In a real implementation, we'd sign these URLs. */}
                  <div className="flex items-center justify-center bg-muted h-16 w-16 rounded-md shrink-0">
                     <span className="text-xs text-muted-foreground">{item.visit_photos.length} photos</span>
                  </div>
               </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
