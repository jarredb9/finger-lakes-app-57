import { OpeningHours } from "@/lib/types";
import { Clock } from "lucide-react";
import { getDailyHoursForDate } from "@/lib/utils/opening-hours";

interface DailyHoursProps {
  openingHours: OpeningHours | null | undefined;
  tripDate: Date;
}

export default function DailyHours({ openingHours, tripDate }: DailyHoursProps) {
  const hours = getDailyHoursForDate(openingHours, tripDate);

  if (!hours) {
    return null;
  }

  // Don't show anything if hours are "Closed" or not available for that day
  if (hours.toLowerCase().includes('closed') || hours.trim() === '') {
    return null;
  }

  return (
    <div className="flex items-center text-xs text-gray-500 mt-1">
      <Clock className="w-3 h-3 mr-1.5" />
      <span>{hours}</span>
    </div>
  );
}