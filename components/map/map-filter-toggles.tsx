"use client";

import { Clock, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trip } from "@/lib/types";
import { cn, formatDateLocal } from "@/lib/utils";

const CATEGORY_KEYS = ["all", "visited", "favorites", "wantToGo", "notVisited"];
const ATTRIBUTE_KEYS = ["allowsDogs", "goodForChildren", "outdoorSeating", "hasEvCharging"];

export interface MapFilterTogglesProps {
  filter: string[];
  handleFilterChange: (value: string[]) => void;
  selectedTrip?: Trip | null;
  setSelectedTrip?: (trip: Trip | null) => void;
  upcomingTrips?: Trip[];
  handleTripSelect?: (tripId: string) => void;
  className?: string;
}

export function MapFilterToggles({
  filter,
  handleFilterChange,
  selectedTrip,
  setSelectedTrip,
  upcomingTrips = [],
  handleTripSelect,
  className,
}: MapFilterTogglesProps) {
  const categoryFilters = filter.filter((f) => CATEGORY_KEYS.includes(f));
  const attributeFilters = filter.filter((f) => ATTRIBUTE_KEYS.includes(f));

  const onCategoryChange = (vals: string[]) => {
    const nonCategoryFilters = filter.filter((f) => !CATEGORY_KEYS.includes(f));
    handleFilterChange([...vals, ...nonCategoryFilters]);
  };

  const onAttributeChange = (vals: string[]) => {
    const nonAttributeFilters = filter.filter((f) => !ATTRIBUTE_KEYS.includes(f));
    handleFilterChange([...nonAttributeFilters, ...vals]);
  };

  const onTripValueChange = (tripId: string) => {
    if (handleTripSelect) {
      handleTripSelect(tripId);
    } else if (tripId === "none" && setSelectedTrip) {
      setSelectedTrip(null);
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      {/* Category Filter Chips */}
      <div className="space-y-1">
        <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
          Filter Wineries
        </span>
        {selectedTrip ? (
          <div className="flex items-center">
            <Badge
              className="bg-[#f17e3a] hover:bg-[#f17e3a] cursor-pointer min-h-[44px] px-3 py-2 text-white"
              onClick={() => setSelectedTrip?.(null)}
            >
              Viewing: {selectedTrip.name} <XCircle className="w-3 h-3 ml-1" />
            </Badge>
          </div>
        ) : (
          <ToggleGroup
            type="multiple"
            value={categoryFilters}
            onValueChange={onCategoryChange}
            className="justify-start flex-wrap gap-1.5"
            size="sm"
          >
            <ToggleGroupItem value="all" className="text-xs min-h-[44px] px-3 py-2">
              All
            </ToggleGroupItem>
            <ToggleGroupItem value="visited" className="text-xs min-h-[44px] px-3 py-2">
              Visited
            </ToggleGroupItem>
            <ToggleGroupItem value="favorites" className="text-xs min-h-[44px] px-3 py-2">
              Favorites
            </ToggleGroupItem>
            <ToggleGroupItem value="wantToGo" className="text-xs min-h-[44px] px-3 py-2">
              Want
            </ToggleGroupItem>
            <ToggleGroupItem value="notVisited" className="text-xs min-h-[44px] px-3 py-2">
              New
            </ToggleGroupItem>
          </ToggleGroup>
        )}
      </div>

      {/* Attribute Toggles */}
      <div className="space-y-1.5 pt-1 border-t border-muted/30">
        <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider block">
          Attributes
        </span>
        <ToggleGroup
          type="multiple"
          value={attributeFilters}
          onValueChange={onAttributeChange}
          className="justify-start flex-wrap gap-1.5"
          size="sm"
        >
          <ToggleGroupItem
            value="allowsDogs"
            className="text-xs min-h-[44px] px-3 py-2 rounded-full border border-muted-foreground/20 data-[state=on]:bg-primary/10 data-[state=on]:text-primary data-[state=on]:border-primary/30 transition-all duration-200"
          >
            🐾 Dog Friendly
          </ToggleGroupItem>
          <ToggleGroupItem
            value="goodForChildren"
            className="text-xs min-h-[44px] px-3 py-2 rounded-full border border-muted-foreground/20 data-[state=on]:bg-primary/10 data-[state=on]:text-primary data-[state=on]:border-primary/30 transition-all duration-200"
          >
            👶 Kid Friendly
          </ToggleGroupItem>
          <ToggleGroupItem
            value="outdoorSeating"
            className="text-xs min-h-[44px] px-3 py-2 rounded-full border border-muted-foreground/20 data-[state=on]:bg-primary/10 data-[state=on]:text-primary data-[state=on]:border-primary/30 transition-all duration-200"
          >
            ☀️ Outdoor Seating
          </ToggleGroupItem>
          <ToggleGroupItem
            value="hasEvCharging"
            className="text-xs min-h-[44px] px-3 py-2 rounded-full border border-muted-foreground/20 data-[state=on]:bg-primary/10 data-[state=on]:text-primary data-[state=on]:border-primary/30 transition-all duration-200"
          >
            ⚡ EV Charging
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Trip Overlay Selector */}
      <div className="space-y-1 pt-1">
        <div className="flex items-center gap-2">
          <Clock className="w-3 h-3 text-muted-foreground" />
          <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
            Trip Overlay
          </span>
        </div>
        <Select value={selectedTrip?.id?.toString() || "none"} onValueChange={onTripValueChange}>
          <SelectTrigger className="w-full min-h-[44px] px-3 py-2 text-xs">
            <SelectValue placeholder="Show a trip..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {upcomingTrips
              .filter((trip) => !!trip.id)
              .map((trip) => (
                <SelectItem key={trip.id} value={trip.id.toString()}>
                  {trip.name} ({formatDateLocal(new Date(trip.trip_date + "T00:00:00"))})
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
