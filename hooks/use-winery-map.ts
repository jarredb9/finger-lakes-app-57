"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import { useToast } from "@/hooks/use-toast";
import { Winery, GooglePlaceId } from "@/lib/types";
import { useWineryStore } from "@/lib/stores/wineryStore";
import { useWineryDataStore } from "@/lib/stores/wineryDataStore";
import { useMapStore } from "@/lib/stores/mapStore";
import { useTripStore } from "@/lib/stores/tripStore";
import { useUIStore } from "@/lib/stores/uiStore";
import { useWinerySearch } from "./use-winery-search";
import { useWineryFilter } from "./use-winery-filter";

export function useWineryMap(userId: string) {
  const {
    setMap,
    map,
    hitApiLimit,
    searchResults: listResultsInView, // Directly use searchResults for the list
  } = useMapStore();

  const { error } = useWineryDataStore();

  const {
    fetchWineryData,
    ensureWineryDetails,
    getWineries,
  } = useWineryStore();

  const { openWineryModal } = useUIStore();
  const { fetchUpcomingTrips, selectedTrip } = useTripStore();
  const { toast } = useToast();

  // Import sub-hooks
  const {
    isSearching,
    searchLocation,
    setSearchLocation,
    autoSearch,
    setAutoSearch,
    handleSearchSubmit,
    handleManualSearchArea,
    placesLibrary,
    geocodingLibrary,
  } = useWinerySearch();

  const {
    mapWineries,
    filter,
    handleFilterChange,
  } = useWineryFilter();

  const [proposedWinery, setProposedWinery] = useState<Winery | null>(null);
  const googleMapInstance = useMap();

  // Data Fetching Initialization
  useEffect(() => {
    if (userId) {
      fetchWineryData(userId);
      fetchUpcomingTrips();
    }
  }, [userId, fetchWineryData, fetchUpcomingTrips]);

  // Map Instance syncing
  useEffect(() => {
    if (googleMapInstance) {
      setMap(googleMapInstance);
    }
  }, [googleMapInstance, setMap]);

  // Fit bounds to trip if selected
  useEffect(() => {
    if (
      map &&
      selectedTrip &&
      selectedTrip.wineries &&
      selectedTrip.wineries.length > 0
    ) {
      const bounds = new google.maps.LatLngBounds();
      selectedTrip.wineries.forEach((winery) => {
        bounds.extend({ lat: winery.lat, lng: winery.lng });
      });
      map.fitBounds(bounds);
    }
  }, [map, selectedTrip]);

  // Map Click Interaction (Fetch details for non-persistent places)
  const handleMapClick = useCallback(
    async (e: google.maps.IconMouseEvent) => {
      if (!placesLibrary || !geocodingLibrary || !e.latLng || !e.placeId) return;
      e.stop();
      
      const isKnown = getWineries().some((w) => w.id === e.placeId);
      if (isKnown) return;

      try {
        const placeDetails = new placesLibrary.Place({ id: e.placeId });
        await placeDetails.fetchFields({
          fields: [
            "displayName",
            "formattedAddress",
            "location",
          ],
        });

        if (!placeDetails.location) {
          toast({
            variant: "destructive",
            description: "Could not get details for this location.",
          });
          return;
        }

        const newWinery: Winery = {
          id: e.placeId as GooglePlaceId,
          name: placeDetails.displayName || "Unnamed Location",
          address: placeDetails.formattedAddress || "N/A",
          lat: placeDetails.location.lat(),
          lng: placeDetails.location.lng(),
        };
        setProposedWinery(newWinery);
      } catch (error) {
        console.error("Error fetching place details on click:", error);
        toast({
          variant: "destructive",
          description: "An error occurred while fetching location details.",
        });
      }
    },
    [placesLibrary, geocodingLibrary, toast, getWineries]
  );

  useEffect(() => {
    if (!map) return;
    const clickListener = map.addListener("click", handleMapClick);
    return () => {
      clickListener.remove();
    };
  }, [map, handleMapClick]);

  const handleOpenModal = useCallback(
    async (winery: Winery) => {
      // Open modal immediately with lightweight data
      openWineryModal(winery.id);
      // Fetch full details in the background
      ensureWineryDetails(winery.id);
    },
    [openWineryModal, ensureWineryDetails]
  );

  return useMemo(() => ({
    error,
    mapWineries,
    listResultsInView,
    isSearching,
    hitApiLimit,
    searchLocation,
    setSearchLocation,
    autoSearch,
    setAutoSearch,
    filter,
    handleSearchSubmit,
    handleManualSearchArea,
    handleFilterChange,
    handleOpenModal,
    proposedWinery,
    setProposedWinery,
    selectedTrip,
  }), [
    error,
    mapWineries,
    listResultsInView,
    isSearching,
    hitApiLimit,
    searchLocation,
    autoSearch,
    filter,
    handleSearchSubmit,
    handleManualSearchArea,
    handleFilterChange,
    handleOpenModal,
    proposedWinery,
    selectedTrip,
    setSearchLocation, 
    setAutoSearch,
    setProposedWinery
  ]);
}