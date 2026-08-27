import { Winery, Trip } from "@/lib/types";

export interface GoogleMapFallbackProps {
  discoveredWineries: Winery[];
  visitedWineries: Winery[];
  wishlistWineries: Winery[];
  favoriteWineries: Winery[];
  filter: string[];
  onMarkerClick: (winery: Winery) => void;
  selectedTrip?: Trip | null;
}

export function GoogleMapFallback(_props: GoogleMapFallbackProps) {
  return null;
}
