import { Clock } from "lucide-react";
import { Winery } from "@/lib/types";

export interface WineryTripBadgeProps {
  winery: Winery | null;
  onTripBadgeClick?: (tripId: number) => void;
}

export function WineryTripBadge({
  winery,
  onTripBadgeClick = () => {},
}: WineryTripBadgeProps) {
  if (!winery?.trip_name || !winery?.trip_date || !winery?.trip_id) {
    return null;
  }

  return (
    <div
      data-testid="trip-badge"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onTripBadgeClick(winery.trip_id!);
        }
      }}
      className="inline-flex items-center self-start rounded-full border border-border/50 px-2.5 py-0.5 text-xs font-semibold bg-[#f17e3a] hover:bg-[#f17e3a]/90 text-white cursor-pointer transition-all duration-300 hover:scale-105 active:scale-95 shadow-sm"
      onClick={() => onTripBadgeClick(winery.trip_id!)}
    >
      <Clock className="w-3 h-3 mr-1" />
      On Trip: {winery.trip_name}
    </div>
  );
}

export default WineryTripBadge;
