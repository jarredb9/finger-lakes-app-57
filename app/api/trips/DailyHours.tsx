// components/DailyHours.tsx
import { OpeningHours } from "@/lib/types";
import { Clock } from "lucide-react";

interface DailyHoursProps {
  openingHours: OpeningHours | null | undefined;
  tripDate: Date;
}

export default function DailyHours({ openingHours, tripDate }: DailyHoursProps) {
  if (!openingHours?.weekday_text) {
    return null;
  }

  // The Google Places API weekday_text array starts with Monday.
  // Date.getDay() returns 0 for Sunday, 1 for Monday, etc.
  const dayIndex = (tripDate.getDay() + 6) % 7;
  const line = openingHours.weekday_text[dayIndex];
  const hours = line.substring(line.indexOf(':') + 2);

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