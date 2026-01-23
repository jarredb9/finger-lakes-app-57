import { Winery } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Star, MapPin, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { isOpenNow } from "@/lib/utils/opening-hours";

interface WineryCardProps {
  winery: Winery;
  onClick?: () => void;
}

export default function WineryCardThumbnail({ winery, onClick }: WineryCardProps) {
  // Determine status color for the left border indicator
  let statusColor = "bg-muted"; // Default gray
  if (winery.isFavorite) statusColor = "bg-amber-500";
  else if (winery.userVisited) statusColor = "bg-emerald-500";
  else if (winery.onWishlist) statusColor = "bg-purple-500";

  // Check opening status if data available
  const isOpen = winery.openingHours ? isOpenNow(winery.openingHours) : null;

  return (
    <div
      data-testid="winery-card"
      className="group relative flex flex-col border rounded-lg bg-card text-card-foreground shadow-xs hover:shadow-md cursor-pointer transition-all duration-200 overflow-hidden"
      onClick={onClick}
    >
      {/* Left Status Indicator Strip */}
      <div className={cn("absolute left-0 top-0 bottom-0 w-1", statusColor)} />

      <div className="flex flex-col p-3 pl-4 gap-1.5">
        <div className="flex justify-between items-start gap-2">
          <h3 className="font-semibold text-sm line-clamp-1 group-hover:text-primary transition-colors">
            {winery.name}
          </h3>
          {winery.rating && (
            <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
              <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
              <span>{winery.rating}</span>
            </div>
          )}
        </div>

        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
          <span className="line-clamp-1">{winery.address}</span>
        </div>

        <div className="flex gap-2 mt-1 items-center flex-wrap">
          {/* Status Badges - Text Only for high density */}
          {winery.isFavorite && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 bg-amber-100 text-amber-800 hover:bg-amber-100">
              Favorite
            </Badge>
          )}
          {winery.userVisited && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
              Visited
            </Badge>
          )}
          {winery.onWishlist && !winery.userVisited && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 bg-purple-100 text-purple-800 hover:bg-purple-100">
              Want to Go
            </Badge>
          )}

          {/* Open/Closed Badge */}
          {isOpen !== null && (
            <Badge 
              variant="outline" 
              className={cn(
                "text-[10px] px-1.5 py-0 h-5 flex items-center gap-1 border-none",
                isOpen ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
              )}
            >
              <Clock className="w-2.5 h-2.5" />
              {isOpen ? "Open" : "Closed"}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
