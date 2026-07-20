// components/WineryCommunityTab.tsx
import { useFriendStore } from "@/lib/stores/friendStore";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Star, Heart, Bookmark } from "lucide-react";
import { FriendPhoto } from "./friend-photo";
import { WineryDbId } from "@/lib/types";
import { useEffect } from "react";

interface WineryCommunityTabProps {
  wineryDbId: WineryDbId | null;
}

export default function WineryCommunityTab({ wineryDbId }: WineryCommunityTabProps) {
  const { friendsActivity = { favoritedBy: [], wishlistedBy: [] }, fetchFriendDataForWinery, friendsRatings = [] } = useFriendStore();

  useEffect(() => {
    if (wineryDbId) {
      fetchFriendDataForWinery(wineryDbId);
    }
  }, [wineryDbId, fetchFriendDataForWinery]);

  const favoritedBy = friendsActivity?.favoritedBy || [];
  const wishlistedBy = friendsActivity?.wishlistedBy || [];

  const hasActivity = favoritedBy.length > 0 || wishlistedBy.length > 0 || friendsRatings.length > 0;

  return (
    <div data-testid="community-tab" className="space-y-6">
      {/* Friend Activity (Avatars at top) */}
      {(favoritedBy.length > 0 || wishlistedBy.length > 0) && (
        <div className="space-y-3">
          {favoritedBy.length > 0 && (
            <div>
              <p className="font-semibold text-sm text-muted-foreground flex items-center gap-2">
                <Heart className="w-4 h-4 text-red-500 fill-red-500" />
                Favorited by:
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {favoritedBy.map((friend) => (
                  <div key={friend.id} className="flex items-center gap-2 bg-muted/50 py-1 px-2.5 rounded-full border shadow-xs">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={`https://i.pravatar.cc/150?u=${friend.email}`} />
                      <AvatarFallback>{friend.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <span className="text-xs font-medium pr-1">{friend.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {wishlistedBy.length > 0 && (
            <div>
              <p className="font-semibold text-sm text-muted-foreground flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-blue-500 fill-blue-500" />
                On wishlist for:
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {wishlistedBy.map((friend) => (
                  <div key={friend.id} className="flex items-center gap-2 bg-muted/50 py-1 px-2.5 rounded-full border shadow-xs">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={`https://i.pravatar.cc/150?u=${friend.email}`} />
                      <AvatarFallback>{friend.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <span className="text-xs font-medium pr-1">{friend.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Review Feed */}
      {friendsRatings.length > 0 && (
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Friend Reviews</h4>
          <div className="space-y-3">
            {friendsRatings.map((rating) => (
              <Card key={rating.user_id} className="border-border/50 bg-card">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={`https://i.pravatar.cc/150?u=${rating.user_id}`} />
                        <AvatarFallback>{rating.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <p className="font-semibold text-foreground text-sm">{rating.name}&apos;s Review</p>
                    </div>
                    <div className="flex items-center">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className={`w-4 h-4 ${i < rating.rating! ? "text-yellow-400 fill-yellow-400" : "text-muted"}`} />
                      ))}
                    </div>
                  </div>
                  {rating.user_review && (
                    <p className="text-sm text-foreground bg-muted/30 p-3 rounded-md border border-border/50">
                      {rating.user_review}
                    </p>
                  )}
                  {rating.photos && rating.photos.length > 0 && (
                    <div className="flex gap-2 mt-2">
                      {rating.photos.map((photo: string, index: number) => (
                        <div key={index} className="relative w-20 h-20 rounded-md overflow-hidden border border-border/50">
                          <FriendPhoto 
                            photoPath={photo} 
                            alt={`Friend photo ${index + 1}`} 
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {!hasActivity && (
        <p className="text-sm text-muted-foreground text-center py-6">No friend activity or reviews yet.</p>
      )}
    </div>
  );
}
