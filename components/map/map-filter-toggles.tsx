import { Trip } from "@/lib/types";

export interface MapFilterTogglesProps {
  filter: string[];
  handleFilterChange: (value: string[]) => void;
  selectedTrip?: Trip | null;
  setSelectedTrip?: (trip: Trip | null) => void;
  upcomingTrips?: Trip[];
  handleTripSelect?: (tripId: string) => void;
  className?: string;
}

export function MapFilterToggles(_props: MapFilterTogglesProps) {
  return null;
}
