import { Winery } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Star, MapPin } from "lucide-react";
import Image from "next/image";

interface WineryCardProps {
  winery: Winery;
  onClick?: () => void;
}

export default function WineryCard({ winery, onClick }: WineryCardProps) {
  return (
    <div
      data-testid="winery-card"
      className="group flex flex-row border rounded-lg overflow-hidden bg-card text-card-foreground shadow-sm hover:shadow-md cursor-pointer transition-all duration-200"
      onClick={onClick}
    >
      {/* Image Section */}
      <div className="relative w-1/3 min-w-[100px] bg-muted">
        <Image
          src="/placeholder.jpg" // Future: Use winery.featured_image
          alt={winery.name}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-500"
        />
        {/* Status Overlays */}
        <div className="absolute top-1 left-1 flex flex-col gap-1">
          {winery.userVisited && (
            <Badge variant="secondary" className="bg-emerald-500/90 text-white text-[10px] px-1 py-0 h-5">
              Visited
            </Badge>
          )}
          {winery.isFavorite && (
            <Badge variant="secondary" className="bg-pink-500/90 text-white text-[10px] px-1 py-0 h-5">
              Loved
            </Badge>
          )}
          {winery.onWishlist && !winery.userVisited && (
            <Badge variant="secondary" className="bg-blue-500/90 text-white text-[10px] px-1 py-0 h-5">
              Want
            </Badge>
          )}
        </div>
      </div>

      {/* Content Section */}
      <div className="flex flex-col flex-1 p-3 gap-1">
        <div className="flex justify-between items-start">
          <h3 className="font-semibold text-sm line-clamp-1 group-hover:text-primary transition-colors">
            {winery.name}
          </h3>
          {winery.rating && (
            <div className="flex items-center gap-0.5 text-xs text-amber-500 font-medium">
              <span>{winery.rating}</span>
              <Star className="w-3 h-3 fill-current" />
            </div>
          )}
        </div>

        <div className="flex items-start gap-1 text-xs text-muted-foreground">
          <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
          <span className="line-clamp-2">{winery.address}</span>
        </div>

        {/* Future: Cuisine/Type Tags */}
        <div className="mt-auto pt-2 flex gap-1 flex-wrap">
            {/* Example Tag */}
            {/* <Badge variant="outline" className="text-[10px] h-5">Tasting</Badge> */}
        </div>
      </div>
    </div>
  );
}
