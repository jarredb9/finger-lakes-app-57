
// components/WineryDetails.tsx
import { useState } from "react";
import { Winery } from "@/lib/types";
import { Star, Phone, Globe, MapPin, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { Separator } from "./ui/separator";
import WineryQnA from "./WineryQnA";
import { isOpenNow } from "@/lib/utils/opening-hours";

interface WineryDetailsProps {
  winery: Winery;
}

export default function WineryDetails({ winery }: WineryDetailsProps) {
  const [showAllHours, setShowAllHours] = useState(false);

  const getTodaysHours = () => {
    if (!winery.openingHours?.weekday_text) {
      return null;
    }
    // The Google Places API weekday_text array starts with Monday.
    // Date.getDay() returns 0 for Sunday, 1 for Monday, etc.
    // We need to adjust for this.
    const todayIndex = (new Date().getDay() + 6) % 7;
    const todaysLine = winery.openingHours.weekday_text[todayIndex];
    // The line from Google is like "Monday: 9:00 AM – 5:00 PM". We just want the hours part.
    const hours = todaysLine.substring(todaysLine.indexOf(':') + 2);
    return hours;
  };
  
  const isOpen = isOpenNow(winery.openingHours);

  return (
    <div className="text-sm text-muted-foreground space-y-2 pt-2 !mt-2">
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
      {winery.openingHours && (
        <div className="flex items-start space-x-2">
          <Clock className="w-4 h-4 mt-1 shrink-0" />
          <div>
            <div className="flex items-center">
              <span
                className={`font-semibold mr-2 ${
                  isOpen ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {isOpen ? 'Open' : 'Closed'}
              </span>
              <span className="text-sm">{getTodaysHours()}</span>
              {winery.openingHours.weekday_text && (
                <button onClick={() => setShowAllHours(!showAllHours)} className="ml-2 p-1 rounded-full hover:bg-gray-100">
                  {showAllHours ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              )}
            </div>
            {showAllHours && winery.openingHours.weekday_text && (
              <div className="mt-2 text-sm space-y-1">
                {winery.openingHours.weekday_text.map((line, index) => (
                  <div key={index}>{line}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {winery.rating && (
        <div className="flex items-center space-x-2">
          <Star className="w-4 h-4 fill-yellow-400 text-yellow-400 shrink-0" />
          <span>{winery.rating}/5.0 (Google Reviews)</span>
        </div>
      )}

      {((winery.reviews && winery.reviews.length > 0) || winery.reservable !== undefined) && (
        <>
          <Separator className="!my-4" />
          <WineryQnA winery={winery} />
        </>
      )}
    </div>
  );
}
