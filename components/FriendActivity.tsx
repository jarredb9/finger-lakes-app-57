
// components/FriendActivity.tsx
import { useEffect } from "react";
import { useFriendStore } from "@/lib/stores/friendStore";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users, Heart, Bookmark } from "lucide-react";
import { Separator } from "./ui/separator";
import { WineryDbId } from "@/lib/types";

interface Friend {
  id: string;
  name: string;
  email: string;
}

interface FriendActivityProps {
  wineryDbId: WineryDbId;
}

export default function FriendActivity({ wineryDbId }: FriendActivityProps) {
  const { friendsActivity, fetchFriendDataForWinery } = useFriendStore();

  useEffect(() => {
    if (wineryDbId) {
      fetchFriendDataForWinery(wineryDbId);
    }
  }, [wineryDbId, fetchFriendDataForWinery]);

  if (friendsActivity.favoritedBy.length === 0 && friendsActivity.wishlistedBy.length === 0) {
    return null;
  }

  return (
    <>
      <div className="space-y-3">
        <h3 className="text-lg font-semibold flex items-center space-x-2 text-gray-800">
          <Users className="w-5 h-5" />
          <span>Friend Activity</span>
        </h3>
        <Card className="bg-gray-50 border-gray-200">
          <CardContent className="p-4 space-y-3">
            {friendsActivity.favoritedBy.length > 0 && (
              <div>
                <p className="font-semibold text-sm text-gray-700 flex items-center gap-2">
                  <Heart className="w-4 h-4 text-red-500 fill-red-500" />
                  Favorited by:
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {friendsActivity.favoritedBy.map((friend: Friend) => (
                    <div key={friend.id} className="flex items-center gap-2 bg-white py-1 px-2 rounded-full border shadow-sm">
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
            {friendsActivity.wishlistedBy.length > 0 && (
              <div className={friendsActivity.favoritedBy.length > 0 ? "mt-3" : ""}>
                <p className="font-semibold text-sm text-gray-700 flex items-center gap-2">
                  <Bookmark className="w-4 h-4 text-blue-500 fill-blue-500" />
                  On wishlist for:
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {friendsActivity.wishlistedBy.map((friend: Friend) => (
                    <div key={friend.id} className="flex items-center gap-2 bg-white py-1 px-2 rounded-full border shadow-sm">
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
          </CardContent>
        </Card>
      </div>
      <Separator className="my-4" />
    </>
  );
}
