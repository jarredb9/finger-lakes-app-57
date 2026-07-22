// components/WineryActionsPresentational.tsx
import { Winery } from "@/lib/types";
import { Star, ListPlus, Check, Lock, Unlock, Eye, Share2, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface WineryActionsPresentationalProps {
  winery: Winery;
  onLogVisit: () => void;
  onStreetView: () => void;
  onToggleWishlist: () => void;
  onToggleFavorite: () => void;
  onToggleFavoritePrivacy: (e: React.MouseEvent) => void;
  onToggleWishlistPrivacy: (e: React.MouseEvent) => void;
  showLogVisit?: boolean;
}

export default function WineryActionsPresentational({ 
  winery, 
  onLogVisit, 
  onStreetView,
  onToggleWishlist, 
  onToggleFavorite, 
  onToggleFavoritePrivacy, 
  onToggleWishlistPrivacy,
  showLogVisit = true
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
    <div className="space-y-3 mt-2">
      <div className="grid grid-cols-4 gap-2 md:gap-3">
        {/* Favorite Tile */}
        <div className="relative">
          <button 
            onClick={onToggleFavorite}
            data-testid="favorite-button"
            className={`p-2.5 flex flex-col items-center justify-center gap-1.5 w-full min-h-[68px] rounded-xl border border-border/50 bg-muted/30 hover:bg-muted/50 transition-all duration-300 hover:scale-105 active:scale-95 ${
              winery.isFavorite 
                ? "bg-primary/10 border-primary/30 text-primary shadow-xs font-semibold" 
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Star className={`h-4 w-4 ${winery.isFavorite ? "fill-primary text-primary" : ""}`} />
            <span className="text-[10px] md:text-xs leading-none font-medium">Favorite</span>
          </button>
          {winery.isFavorite && (
            <button
              onClick={onToggleFavoritePrivacy}
              aria-label={winery.favoriteIsPrivate ? "Make favorite public" : "Make favorite private"}
              title={winery.favoriteIsPrivate ? "Private (Hidden from friends)" : "Public (Visible to friends)"}
              data-testid="favorite-privacy-toggle"
              className="absolute -top-2 -right-2 p-1.5 rounded-full bg-background border border-border shadow-xs transition-all duration-300 hover:scale-110 active:scale-95 z-10"
            >
              {winery.favoriteIsPrivate ? <Lock className="h-3 w-3 text-muted-foreground" /> : <Unlock className="h-3 w-3 text-muted-foreground opacity-70" />}
            </button>
          )}
        </div>

        {/* Wishlist Tile */}
        <div className="relative">
          <button 
            onClick={onToggleWishlist}
            disabled={winery.userVisited}
            data-testid="wishlist-button"
            className={`p-2.5 flex flex-col items-center justify-center gap-1.5 w-full min-h-[68px] rounded-xl border border-border/50 bg-muted/30 hover:bg-muted/50 transition-all duration-300 hover:scale-105 active:scale-95 ${
              winery.onWishlist 
                ? "bg-secondary/10 border-secondary/30 text-secondary-foreground shadow-xs font-semibold" 
                : "text-muted-foreground hover:text-foreground"
            } ${winery.userVisited ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {winery.onWishlist ? <Check className="h-4 w-4" /> : <ListPlus className="h-4 w-4" />}
            <span className="text-[10px] md:text-xs leading-none font-medium">{winery.onWishlist ? "On List" : "Wishlist"}</span>
          </button>
          {winery.onWishlist && (
            <button
              onClick={onToggleWishlistPrivacy}
              aria-label={winery.wishlistIsPrivate ? "Make wishlist item public" : "Make wishlist item private"}
              title={winery.wishlistIsPrivate ? "Private (Hidden from friends)" : "Public (Visible to friends)"}
              data-testid="wishlist-privacy-toggle"
              className="absolute -top-2 -right-2 p-1.5 rounded-full bg-background border border-border shadow-xs transition-all duration-300 hover:scale-110 active:scale-95 z-10"
            >
              {winery.wishlistIsPrivate ? <Lock className="h-3 w-3 text-muted-foreground" /> : <Unlock className="h-3 w-3 text-muted-foreground opacity-70" />}
            </button>
          )}
        </div>

        {/* Street View Tile */}
        <button 
          onClick={onStreetView}
          data-testid="street-view-button"
          className="p-2.5 flex flex-col items-center justify-center gap-1.5 w-full min-h-[68px] rounded-xl border border-border/50 bg-muted/30 hover:bg-muted/50 transition-all duration-300 hover:scale-105 active:scale-95 text-muted-foreground hover:text-foreground"
        >
          <Eye className="h-4 w-4" />
          <span className="text-[10px] md:text-xs leading-none font-medium text-center">Street View</span>
        </button>

        {/* Share Tile */}
        <button 
          onClick={handleShareClick}
          data-testid="share-button"
          className="p-2.5 flex flex-col items-center justify-center gap-1.5 w-full min-h-[68px] rounded-xl border border-border/50 bg-muted/30 hover:bg-muted/50 transition-all duration-300 hover:scale-105 active:scale-95 text-muted-foreground hover:text-foreground"
        >
          <Share2 className="h-4 w-4" />
          <span className="text-[10px] md:text-xs leading-none font-medium">Share</span>
        </button>
      </div>

      {showLogVisit && (
        <button
          onClick={onLogVisit}
          data-testid="log-visit-button"
          className="w-full flex items-center justify-center gap-2 h-11 md:h-12 py-2 px-4 rounded-xl border border-primary/20 bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-300 font-semibold text-sm md:text-base shadow-sm hover:shadow-md active:scale-98 cursor-pointer"
        >
          <Pencil className="h-4 w-4 md:h-5 md:w-5" />
          <span>Log Visit</span>
        </button>
      )}
    </div>
  );
}
