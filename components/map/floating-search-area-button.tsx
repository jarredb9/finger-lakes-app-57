"use client";

import { useMapStore, SerializableBounds } from "@/lib/stores/mapStore";
import { calculateDistanceKm } from "@/lib/utils/map-utils";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FloatingSearchAreaButtonProps {
  onClick?: () => void;
  autoSearch?: boolean;
  isSearching?: boolean;
  currentCenter?: { lat: number; lng: number };
  lastSearchedBounds?: SerializableBounds | null;
  className?: string;
}

export function FloatingSearchAreaButton({
  onClick,
  autoSearch: autoSearchProp,
  isSearching: isSearchingProp,
  currentCenter: currentCenterProp,
  lastSearchedBounds: lastSearchedBoundsProp,
  className,
}: FloatingSearchAreaButtonProps) {
  const storeAutoSearch = useMapStore((s) => s.autoSearch);
  const storeLastSearchedBounds = useMapStore((s) => s.lastSearchedBounds);
  const storeCenter = useMapStore((s) => s.center);
  const storeIsSearching = useMapStore((s) => s.isSearching);

  const resolvedAutoSearch = autoSearchProp ?? storeAutoSearch;
  const resolvedLastSearchedBounds =
    lastSearchedBoundsProp !== undefined
      ? lastSearchedBoundsProp
      : storeLastSearchedBounds;
  const resolvedCenter = currentCenterProp ?? storeCenter;
  const resolvedIsSearching = isSearchingProp ?? storeIsSearching;

  // Visibility conditions:
  // 1. Suppressed if autoSearch is true
  if (resolvedAutoSearch) {
    return null;
  }

  // 2. Suppressed if no previous search bounds exist or center is unknown
  if (!resolvedLastSearchedBounds || !resolvedCenter) {
    return null;
  }

  // 3. Compute distance between current viewport center and last searched bounds center
  const lastCenterLat =
    (resolvedLastSearchedBounds.north + resolvedLastSearchedBounds.south) / 2;
  const lastCenterLng =
    (resolvedLastSearchedBounds.east + resolvedLastSearchedBounds.west) / 2;

  const distanceKm = calculateDistanceKm(resolvedCenter, {
    lat: lastCenterLat,
    lng: lastCenterLng,
  });

  // 4. Suppressed if within 5 km threshold or distance calculation is invalid
  if (isNaN(distanceKm) || distanceKm <= 5) {
    return null;
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      data-testid="floating-search-area-button"
      disabled={resolvedIsSearching}
      onClick={onClick}
      className={cn(
        "absolute top-4 left-1/2 -translate-x-1/2 z-30 shadow-lg rounded-full px-4 py-2 bg-background/95 backdrop-blur-sm border text-xs font-medium hover:bg-accent transition-all duration-200 pointer-events-auto flex items-center gap-1.5",
        className
      )}
    >
      {resolvedIsSearching ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <MapPin className="h-3.5 w-3.5" />
      )}
      <span>Search this area</span>
    </Button>
  );
}

export default FloatingSearchAreaButton;
