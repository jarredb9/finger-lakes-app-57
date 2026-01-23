// components/WineryActions.tsx
import { Winery } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Star, ListPlus, Check } from "lucide-react";
import { useWineryStore } from "@/lib/stores/wineryStore";
import { useToast } from "@/hooks/use-toast";
import { shallow } from "zustand/shallow";

interface WineryActionsProps {
  winery: Winery;
}

export default function WineryActions({ winery }: WineryActionsProps) {
  const { toast } = useToast();
  const { toggleWishlist, toggleFavorite } = useWineryStore(
    (state) => ({
      toggleWishlist: state.toggleWishlist,
      toggleFavorite: state.toggleFavorite,
    }),
    shallow
  );

  const handleWishlistToggle = async () => {
    try {
      await toggleWishlist(winery, winery.onWishlist || false);
    } catch (error) {
      toast({ variant: "destructive", description: "Failed to update wishlist." });
    }
  };

  const handleFavoriteToggle = async () => {
    try {
      await toggleFavorite(winery, winery.isFavorite || false);
    } catch (error) {
      toast({ variant: "destructive", description: "Failed to update favorites." });
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant={winery.isFavorite ? "default" : "outline-solid"} onClick={handleFavoriteToggle}>
        <Star className={`mr-2 h-4 w-4 ${winery.isFavorite ? "text-yellow-400 fill-yellow-400" : ""}`} />
        Favorite
      </Button>
      <Button size="sm" variant={winery.onWishlist ? "secondary" : "outline-solid"} onClick={handleWishlistToggle} disabled={winery.userVisited}>
        {winery.onWishlist ? <Check className="mr-2 h-4 w-4" /> : <ListPlus className="mr-2 h-4 w-4" />}
        {winery.onWishlist ? "On List" : "Want to Go"}
      </Button>
    </div>
  );
}