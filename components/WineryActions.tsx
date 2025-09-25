
// components/WineryActions.tsx
import { Winery } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Star, ListPlus, Loader2, Check } from "lucide-react";
import { useWineryStore } from "@/lib/stores/wineryStore";
import { useToast } from "@/hooks/use-toast";
import { shallow } from "zustand/shallow";

interface WineryActionsProps {
  winery: Winery;
}

export default function WineryActions({ winery }: WineryActionsProps) {
  const { toast } = useToast();
  const { toggleWishlist, toggleFavorite, isTogglingWishlist, isTogglingFavorite } = useWineryStore(
    (state) => ({
      toggleWishlist: state.toggleWishlist,
      toggleFavorite: state.toggleFavorite,
      isTogglingWishlist: state.isTogglingWishlist,
      isTogglingFavorite: state.isTogglingFavorite,
    }),
    shallow
  );

  const handleWishlistToggle = async () => {
    try {
      await toggleWishlist(winery, winery.onWishlist);
    } catch (error) {
      toast({ variant: "destructive", description: "Failed to update wishlist." });
    }
  };

  const handleFavoriteToggle = async () => {
    try {
      await toggleFavorite(winery, winery.isFavorite);
    } catch (error) {
      toast({ variant: "destructive", description: "Failed to update favorites." });
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant={winery.isFavorite ? "default" : "outline"} onClick={handleFavoriteToggle} disabled={isTogglingFavorite}>
        {isTogglingFavorite ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Star className={`mr-2 h-4 w-4 ${winery.isFavorite ? "text-yellow-400 fill-yellow-400" : ""}`} />}
        Favorite
      </Button>
      <Button size="sm" variant={winery.onWishlist ? "secondary" : "outline"} onClick={handleWishlistToggle} disabled={isTogglingWishlist || winery.userVisited}>
        {isTogglingWishlist ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : winery.onWishlist ? <Check className="mr-2 h-4 w-4" /> : <ListPlus className="mr-2 h-4 w-4" />}
        {winery.onWishlist ? "On List" : "Want to Go"}
      </Button>
    </div>
  );
}
