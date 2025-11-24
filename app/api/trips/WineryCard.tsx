// components/WineryCard.tsx
import { Winery } from "@/lib/types";
import { MapPin } from "lucide-react";
import DailyHours from "./DailyHours";

interface WineryCardProps {
  winery: Winery;
  tripDate: Date;
  // You might have other props like onSelect, etc.
}

export default function WineryCard({ winery, tripDate }: WineryCardProps) {
  return (
    <div className="p-4 border rounded-lg shadow-sm bg-white">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-semibold text-lg">{winery.name}</h3>
          <div className="flex items-start text-sm text-gray-600 mt-1">
            <MapPin className="w-4 h-4 mr-2 mt-0.5 shrink-0" />
            <span>{winery.address}</span>
          </div>
          <DailyHours openingHours={winery.openingHours} tripDate={tripDate} />
        </div>
        {/* You might have other elements here like action buttons */}
      </div>
      {winery.notes && (
        <div className="mt-3 pt-3 border-t">
          <p className="text-sm text-gray-700 italic">{winery.notes}</p>
        </div>
      )}
    </div>
  );
}