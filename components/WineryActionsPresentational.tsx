// components/WineryActionsPresentational.tsx
import { Winery } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Star, ListPlus, Check, Lock, Unlock, Edit, Eye, Share2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface WineryActionsPresentationalProps {
  winery: Winery;
  onLogVisit: () => void;
  onStreetView: () => void;
  onToggleWishlist: () => void;
  onToggleFavorite: () => void;
  onToggleFavoritePrivacy: (e: React.MouseEvent) => void;
  onToggleWishlistPrivacy: (e: React.MouseEvent) => void;
}

export default function WineryActionsPresentational({ 
  winery, 
  onLogVisit, 
  onStreetView,
  onToggleWishlist, 
  onToggleFavorite, 
  onToggleFavoritePrivacy, 
  onToggleWishlistPrivacy 
}: WineryActionsPresentationalProps) {
  const { toast } = useToast();

  const handleShareClick = async () => {
    if (typeof navigator !== "undefined") {
      const url = `${window.location.origin}/winery/${winery.id}`;
      try {
        if (navigator.share) {
          await navigator.share({
            title: winery.name,
            text: `Check out ${winery.name} on Finger Lakes Winery Planner!`,
            url: url,
          });
        } else {
          await navigator.clipboard.writeText(url);
          toast({ description: "Link copied to clipboard!" });
        }
      } catch (err) {
        // Suppress abort errors
        if ((err as Error).name !== "AbortError") {
          await navigator.clipboard.writeText(url);
          toast({ description: "Link copied to clipboard!" });
        }
      }
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button 
        size="sm" 
        variant="outline-solid" 
        onClick={onLogVisit}
        data-testid="log-visit-button"
        className="transition-all duration-300 hover:scale-105 active:scale-98"
      >
        <Edit className="mr-2 h-4 w-4" />
        Log Visit
      </Button>

      <Button 
        size="sm" 
        variant="outline-solid" 
        onClick={onStreetView}
        data-testid="street-view-button"
        className="transition-all duration-300 hover:scale-105 active:scale-98"
      >
        <Eye className="mr-2 h-4 w-4" />
        Street View
      </Button>

      <Button 
        size="sm" 
        variant="outline-solid" 
        onClick={handleShareClick}
        data-testid="share-button"
        className="transition-all duration-300 hover:scale-105 active:scale-98"
      >
        <Share2 className="mr-2 h-4 w-4" />
        Share
      </Button>

      <div className="flex items-center -space-x-px">
        <Button 
          size="sm" 
          variant={winery.isFavorite ? "default" : "outline-solid"} 
          onClick={onToggleFavorite}
          className={`transition-all duration-300 hover:scale-105 active:scale-98 ${winery.isFavorite ? "rounded-r-none" : ""}`}
          data-testid="favorite-button"
        >
          <Star className={`mr-2 h-4 w-4 ${winery.isFavorite ? "text-yellow-400 fill-yellow-400" : ""}`} />
          Favorite
        </Button>
        {winery.isFavorite && (
          <Button 
            size="sm" 
            variant="default" 
            className="px-2 rounded-l-none border-l border-primary-foreground/20 transition-all duration-300 active:scale-98" 
            onClick={onToggleFavoritePrivacy}
            aria-label={winery.favoriteIsPrivate ? "Make favorite public" : "Make favorite private"}
            title={winery.favoriteIsPrivate ? "Private (Hidden from friends)" : "Public (Visible to friends)"}
            data-testid="favorite-privacy-toggle"
          >
            {winery.favoriteIsPrivate ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5 opacity-70" />}
          </Button>
        )}
      </div>

      <div className="flex items-center -space-x-px">
        <Button 
          size="sm" 
          variant={winery.onWishlist ? "secondary" : "outline-solid"} 
          onClick={onToggleWishlist} 
          disabled={winery.userVisited}
          className={`transition-all duration-300 hover:scale-105 active:scale-98 ${winery.onWishlist ? "rounded-r-none" : ""}`}
          data-testid="wishlist-button"
        >
          {winery.onWishlist ? <Check className="mr-2 h-4 w-4" /> : <ListPlus className="mr-2 h-4 w-4" />}
          {winery.onWishlist ? "On List" : "Want to Go"}
        </Button>
        {winery.onWishlist && (
          <Button 
            size="sm" 
            variant="secondary" 
            className="px-2 rounded-l-none border-l border-secondary-foreground/20 transition-all duration-300 active:scale-98" 
            onClick={onToggleWishlistPrivacy}
            aria-label={winery.wishlistIsPrivate ? "Make wishlist item public" : "Make wishlist item private"}
            title={winery.wishlistIsPrivate ? "Private (Hidden from friends)" : "Public (Visible to friends)"}
            data-testid="wishlist-privacy-toggle"
          >
            {winery.wishlistIsPrivate ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5 opacity-70" />}
          </Button>
        )}
      </div>
    </div>
  );
}
