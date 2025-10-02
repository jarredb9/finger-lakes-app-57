
// components/WineryDetails.tsx
import { Winery } from "@/lib/types";
import { Star, Phone, Globe, MapPin, Clock } from "lucide-react";
import { DialogDescription } from "@/components/ui/dialog";

interface WineryDetailsProps {
  winery: Winery;
}

export default function WineryDetails({ winery }: WineryDetailsProps) {
  return (
    <DialogDescription className="space-y-2 pt-2 !mt-2">
      <div className="flex items-start space-x-2">
        <MapPin className="w-4 h-4 mt-1 shrink-0" />
        <span>{winery.address}</span>
      </div>
      {winery.phone && (
        <div className="flex items-center space-x-2">
          <Phone className="w-4 h-4 shrink-0" />
          <span>{winery.phone}</span>
        </div>
      )}
      {winery.website && (
        <div className="flex items-center space-x-2">
          <Globe className="w-4 h-4 shrink-0" />
          <a href={winery.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate">
            Visit Website
          </a>
        </div>
      )}
      {winery.openingHours?.weekday_text && (
        <div className="flex items-start space-x-2">
          <Clock className="w-4 h-4 mt-1 shrink-0" />
          <div>
            {winery.openingHours.weekday_text.map((line: string, index: number) => (
              <div key={index}>{line}</div>
            ))}
          </div>
        </div>
      )}
      {winery.rating && (
        <div className="flex items-center space-x-2">
          <Star className="w-4 h-4 fill-yellow-400 text-yellow-400 shrink-0" />
          <span>{winery.rating}/5.0 (Google Reviews)</span>
        </div>
      )}
    </DialogDescription>
  );
}
