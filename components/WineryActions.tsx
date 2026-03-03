// components/WineryActions.tsx
import { Winery } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Star, ListPlus, Check, Lock, Unlock } from "lucide-react";
import { useWineryStore } from "@/lib/stores/wineryStore";
import { useToast } from "@/hooks/use-toast";
import { shallow } from "zustand/shallow";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface WineryActionsProps {
  winery: Winery;
}

export default function WineryActions({ winery }: WineryActionsProps) {
  const { toast } = useToast();
  const { toggleWishlist, toggleFavorite, toggleFavoritePrivacy, toggleWishlistPrivacy } = useWineryStore(
    (state) => ({
      toggleWishlist: state.toggleWishlist,
      toggleFavorite: state.toggleFavorite,
      toggleFavoritePrivacy: state.toggleFavoritePrivacy,
      toggleWishlistPrivacy: state.toggleWishlistPrivacy,
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

  const handleToggleFavoritePrivacy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
        await toggleFavoritePrivacy(winery.id);
        toast({ description: winery.favoriteIsPrivate ? "Favorite is now public." : "Favorite is now private." });
    } catch (error) {
        toast({ variant: "destructive", description: "Failed to update favorite privacy." });
    }
  };

  const handleToggleWishlistPrivacy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
        await toggleWishlistPrivacy(winery.id);
        toast({ description: winery.wishlistIsPrivate ? "Wishlist item is now public." : "Wishlist item is now private." });
    } catch (error) {
        toast({ variant: "destructive", description: "Failed to update wishlist privacy." });
    }
  };

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2">
        <div className="flex items-center -space-x-px">
            <Button 
                size="sm" 
                variant={winery.isFavorite ? "default" : "outline-solid"} 
                onClick={handleFavoriteToggle}
                className={winery.isFavorite ? "rounded-r-none" : ""}
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
                            onClick={handleToggleFavoritePrivacy}
                            aria-label={winery.favoriteIsPrivate ? "Make favorite public" : "Make favorite private"}
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
                onClick={handleWishlistToggle} 
                disabled={winery.userVisited}
                className={winery.onWishlist ? "rounded-r-none" : ""}
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
                            onClick={handleToggleWishlistPrivacy}
                            aria-label={winery.wishlistIsPrivate ? "Make wishlist item public" : "Make wishlist item private"}
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
