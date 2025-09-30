// components/FriendRatings.tsx
import { useFriendStore } from "@/lib/stores/friendStore";
import { Card, CardContent } from "@/components/ui/card";
import { Star, Users } from "lucide-react";
import { Separator } from "./ui/separator";
import { FriendRating } from "@/lib/types";

export default function FriendRatings() {
  const { friendsRatings } = useFriendStore();

  if (friendsRatings.length === 0) {
    return null;
  }

  return (
    <>
      <div className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center space-x-2 text-gray-800">
          <Users className="w-5 h-5" />
          <span>{"Friends' Ratings"}</span>
        </h3>
        <div className="space-y-3">
          {friendsRatings.map((rating: FriendRating) => (
            <Card key={rating.user_id} className="bg-blue-50 border-blue-200">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-blue-800">{rating.name}</p>
                  <div className="flex items-center">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className={`w-5 h-5 ${i < rating.rating! ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`} />
                    ))}
                  </div>
                </div>
                {rating.user_review && <p className="text-sm text-blue-700 bg-white p-3 rounded-md border">{rating.user_review}</p>}
                {rating.photos && rating.photos.length > 0 && (
                  <div className="flex gap-2 mt-2">
                    {rating.photos.map((photo: string, index: number) => {
                      return <img key={index} src={photo} alt={`Friend photo ${index + 1}`} className="w-20 h-20 rounded-md object-cover" />;
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      <Separator className="my-4" />
    </>
  );
}