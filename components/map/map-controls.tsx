"use client";

import { FormEvent } from "react";
import { useWineryMapContext } from "@/components/winery-map-context";
import { useTripStore } from "@/lib/stores/tripStore";
import { useShallow } from "zustand/react/shallow";
import { MapSearchBar } from "./map-search-bar";
import { MapFilterToggles } from "./map-filter-toggles";
import { Winery, Trip } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface MapControlsProps {
  searchLocation?: string;
  setSearchLocation?: (value: string) => void;
  isSearching?: boolean;
  handleSearchSubmit?: (e: FormEvent) => void;
  handleManualSearchArea?: () => void;
  autoSearch?: boolean;
  setAutoSearch?: (value: boolean) => void;
  hitApiLimit?: boolean;
  filter?: string[];
  handleFilterChange?: (value: string[]) => void;
  handlePlaceSelect?: (winery: Winery, sdkPlace: google.maps.places.Place) => void;
  selectedTrip?: Trip | null;
  setSelectedTrip?: (trip: Trip | null) => void;
  upcomingTrips?: Trip[];
  handleTripSelect?: (tripId: string) => void;
  className?: string;
}

export function MapControls(props: MapControlsProps = {}) {
  const contextValue = useWineryMapContext();
  const {
    upcomingTrips: storeUpcomingTrips,
    selectedTrip: storeSelectedTrip,
    setSelectedTrip: storeSetSelectedTrip,
    fetchTripById,
  } = useTripStore(
    useShallow((s) => ({
      upcomingTrips: s.upcomingTrips,
      selectedTrip: s.selectedTrip,
      setSelectedTrip: s.setSelectedTrip,
      fetchTripById: s.fetchTripById,
    }))
  );

  const searchLocation = props.searchLocation ?? contextValue.searchLocation ?? "";
  const setSearchLocation = props.setSearchLocation ?? contextValue.setSearchLocation;
  const isSearching = props.isSearching ?? contextValue.isSearching ?? false;
  const handleSearchSubmit = props.handleSearchSubmit ?? contextValue.handleSearchSubmit;
  const handleManualSearchArea = props.handleManualSearchArea ?? contextValue.handleManualSearchArea;
  const autoSearch = props.autoSearch ?? contextValue.autoSearch ?? false;
  const setAutoSearch = props.setAutoSearch ?? contextValue.setAutoSearch;
  const hitApiLimit = props.hitApiLimit ?? contextValue.hitApiLimit ?? false;
  const filter = props.filter ?? contextValue.filter ?? ["all"];
  const handleFilterChange = props.handleFilterChange ?? contextValue.handleFilterChange ?? (() => {});
  const handlePlaceSelect = props.handlePlaceSelect ?? contextValue.handlePlaceSelect;

  const upcomingTrips = props.upcomingTrips ?? storeUpcomingTrips ?? [];
  const selectedTrip = props.selectedTrip !== undefined ? props.selectedTrip : storeSelectedTrip;
  const setSelectedTrip = props.setSelectedTrip ?? storeSetSelectedTrip;

  const handleTripSelect = async (tripId: string) => {
    if (props.handleTripSelect) {
      props.handleTripSelect(tripId);
      return;
    }
    if (tripId === "none") {
      setSelectedTrip?.(null);
      return;
    }
    await fetchTripById(tripId);
    const updatedTrip = useTripStore.getState().trips.find((t) => t.id.toString() === tripId);
    if (updatedTrip) setSelectedTrip?.(updatedTrip);
  };

  return (
    <div className={cn("space-y-3", props.className)}>
      <MapSearchBar
        searchLocation={searchLocation}
        setSearchLocation={setSearchLocation}
        isSearching={isSearching}
        handleSearchSubmit={handleSearchSubmit}
        handleManualSearchArea={handleManualSearchArea}
        autoSearch={autoSearch}
        setAutoSearch={setAutoSearch}
        hitApiLimit={hitApiLimit}
        handlePlaceSelect={handlePlaceSelect}
      />
      <MapFilterToggles
        filter={filter}
        handleFilterChange={handleFilterChange}
        selectedTrip={selectedTrip}
        setSelectedTrip={setSelectedTrip}
        upcomingTrips={upcomingTrips}
        handleTripSelect={handleTripSelect}
      />
    </div>
  );
}
