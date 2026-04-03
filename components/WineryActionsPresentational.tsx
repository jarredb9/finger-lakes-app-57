import { Winery } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Star, ListPlus, Check, Lock, Unlock, Edit } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface WineryActionsPresentationalProps {
  winery: Winery;
  onLogVisit: () => void;
  onToggleWishlist: () => void;
  onToggleFavorite: () => void;
  onToggleFavoritePrivacy: (e: React.MouseEvent) => void;
  onToggleWishlistPrivacy: (e: React.MouseEvent) => void;
}

export default function WineryActionsPresentational({ 
  winery, 
  onLogVisit, 
  onToggleWishlist, 
  onToggleFavorite, 
  onToggleFavoritePrivacy, 
  onToggleWishlistPrivacy 
}: WineryActionsPresentationalProps) {
  return (
    <TooltipProvider>
      <div className="flex items-center gap-2">
        <Button 
            size="sm" 
            variant="outline-solid" 
            onClick={onLogVisit}
            data-testid="log-visit-button"
        >
            <Edit className="mr-2 h-4 w-4" />
            Log Visit
        </Button>

        <div className="flex items-center -space-x-px">
            <Button 
                size="sm" 
                variant={winery.isFavorite ? "default" : "outline-solid"} 
                onClick={onToggleFavorite}
                className={winery.isFavorite ? "rounded-r-none" : ""}
                data-testid="favorite-button"
            >
                <Star className={`mr-2 h-4 w-4 ${winery.isFavorite ? "text-yellow-400 fill-yellow-400" : ""}`} />
                Favorite
            </Button>
            {winery.isFavorite && (
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button 
                            size="sm" 
                            variant="default" 
                            className="px-2 rounded-l-none border-l border-primary-foreground/20" 
                            onClick={onToggleFavoritePrivacy}
                            aria-label={winery.favoriteIsPrivate ? "Make favorite public" : "Make favorite private"}
                            data-testid="favorite-privacy-toggle"
                        >
                            {winery.favoriteIsPrivate ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5 opacity-70" />}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        {winery.favoriteIsPrivate ? "Private (Hidden from friends)" : "Public (Visible to friends)"}
                    </TooltipContent>
                </Tooltip>
            )}
        </div>

        <div className="flex items-center -space-x-px">
            <Button 
                size="sm" 
                variant={winery.onWishlist ? "secondary" : "outline-solid"} 
                onClick={onToggleWishlist} 
                disabled={winery.userVisited}
                className={winery.onWishlist ? "rounded-r-none" : ""}
                data-testid="wishlist-button"
            >
                {winery.onWishlist ? <Check className="mr-2 h-4 w-4" /> : <ListPlus className="mr-2 h-4 w-4" />}
                {winery.onWishlist ? "On List" : "Want to Go"}
            </Button>
            {winery.onWishlist && (
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button 
                            size="sm" 
                            variant="secondary" 
                            className="px-2 rounded-l-none border-l border-secondary-foreground/20" 
                            onClick={onToggleWishlistPrivacy}
                            aria-label={winery.wishlistIsPrivate ? "Make wishlist item public" : "Make wishlist item private"}
                            data-testid="wishlist-privacy-toggle"
                        >
                            {winery.wishlistIsPrivate ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5 opacity-70" />}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        {winery.wishlistIsPrivate ? "Private (Hidden from friends)" : "Public (Visible to friends)"}
                    </TooltipContent>
                </Tooltip>
            )}
        </div>
      </div>
    </TooltipProvider>
  );
}
