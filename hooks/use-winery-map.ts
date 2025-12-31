"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
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
    isSearching,
    searchLocation,
    setSearchLocation,
    autoSearch,
    setAutoSearch,
    setBounds,
  } = useMapStore();

  const { error } = useWineryDataStore();
  const { fetchWineryData, ensureWineryDetails, getWineries } = useWineryStore();
  const { openWineryModal } = useUIStore();
  const { fetchUpcomingTrips, selectedTrip } = useTripStore();
  const { executeSearch } = useWinerySearch();
  const { mapWineries, listResultsInView, filter, handleFilterChange } = useWineryFilter();

  const [proposedWinery, setProposedWinery] = useState<Winery | null>(null);
  const googleMapInstance = useMap();
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // --- Effects ---

  useEffect(() => {
    if (userId) {
      fetchWineryData(userId);
      fetchUpcomingTrips();
    }
  }, [userId, fetchWineryData, fetchUpcomingTrips]);

  useEffect(() => {
    if (googleMapInstance) {
      setMap(googleMapInstance);
    }
  }, [googleMapInstance, setMap]);

  useEffect(() => {
    if (map && selectedTrip?.wineries?.length) {
      const bounds = new google.maps.LatLngBounds();
      selectedTrip.wineries.forEach((winery) => {
        bounds.extend({ lat: winery.lat, lng: winery.lng });
      });
      map.fitBounds(bounds);
    }
  }, [map, selectedTrip]);

  // Debounced search on map idle
  useEffect(() => {
    if (!map) return;
    const idleListener = map.addListener("idle", () => {
      const currentBounds = map.getBounds();
      if (currentBounds) {
        setBounds(currentBounds);
      }

      if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
      
      debounceTimeoutRef.current = setTimeout(() => {
        if (!useMapStore.getState().autoSearch) return;
        
        if (!currentBounds) return;

        const lastSearched = useMapStore.getState().lastSearchedBounds;
        const hitApiLimit = useMapStore.getState().hitApiLimit;
        
        if (lastSearched) {
          const isContained = lastSearched.contains(currentBounds.getNorthEast()) && 
                              lastSearched.contains(currentBounds.getSouthWest());
          
          // If we are fully contained in the last search area AND we didn't hit the API limit,
          // we can assume we already have all the results for this area.
          if (isContained && !hitApiLimit) {
            return;
          }
        }
        
        executeSearch(undefined, currentBounds);

      }, 750);
    });
    return () => {
      idleListener.remove();
      if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
    };
  }, [map, executeSearch, setBounds]);

  const places = useMapsLibrary("places");

  const handleMapClick = useCallback(async (e: google.maps.IconMouseEvent) => {
    if (!places || !e.placeId) return;
    e.stop();
    
    const isKnown = getWineries().some((w) => w.id === e.placeId);
    if (isKnown) return;

    try {
      const placeDetails = new places.Place({ id: e.placeId });
      await placeDetails.fetchFields({ fields: ["displayName", "formattedAddress", "location"] });
      if (!placeDetails.location) return;

      const newWinery: Winery = {
        id: e.placeId as GooglePlaceId,
        name: placeDetails.displayName || "Unnamed Location",
        address: placeDetails.formattedAddress || "N/A",
        lat: placeDetails.location.lat(),
        lng: placeDetails.location.lng(),
      };
      setProposedWinery(newWinery);
    } catch (err) {
      console.error("Error fetching place details on click:", err);
    }
  }, [places, getWineries]);

  useEffect(() => {
    if (!map) return;
    const clickListener = map.addListener("click", handleMapClick);
    return () => clickListener.remove();
  }, [map, handleMapClick]);

  const handleOpenModal = useCallback(async (winery: Winery) => {
    openWineryModal(winery.id);
    ensureWineryDetails(winery.id);
  }, [openWineryModal, ensureWineryDetails]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchLocation.trim()) {
      useMapStore.getState().setLastSearchedBounds(null);
      executeSearch(searchLocation.trim());
    }
  };

  const handleManualSearchArea = () => {
    if (map) {
      useMapStore.getState().setLastSearchedBounds(null);
      executeSearch(undefined, map.getBounds());
    }
  };

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
    error, mapWineries, listResultsInView, isSearching, hitApiLimit,
    searchLocation, autoSearch, filter, handleFilterChange, handleOpenModal,
    proposedWinery, selectedTrip, setSearchLocation, setAutoSearch, setProposedWinery,
    handleSearchSubmit, handleManualSearchArea
  ]);
}
