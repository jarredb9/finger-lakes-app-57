/// <reference types="@types/google.maps" />
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
    error: mapError,
  } = useMapStore();

  const { error: dataError, isLoading: dataLoading } = useWineryDataStore();
  const { error: tripError, fetchUpcomingTrips, selectedTrip, isLoading: tripLoading } = useTripStore();
  const isLoading = dataLoading || isSearching || tripLoading;
  const error = dataError || mapError || tripError;
  const { fetchWineryData, ensureWineryDetails, getWineries } = useWineryStore();
  const { openWineryModal } = useUIStore();
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
        bounds.extend({ lat: winery.latitude, lng: winery.longitude });
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
        const state = useMapStore.getState();
        const hasSearched = !!state.lastSearchedBounds;

        // Trigger search if autoSearch is on OR if this is the first search (initial load)
        if (!state.autoSearch && hasSearched) return;
        
        if (!currentBounds) return;

        const lastSearched = state.lastSearchedBounds;
        const lastSearchedZoom = state.lastSearchedZoom;
        const hitApiLimit = state.hitApiLimit;
        const currentZoom = map.getZoom();

        if (lastSearched) {
          const isContained = lastSearched.contains(currentBounds.getNorthEast()) && 
                              lastSearched.contains(currentBounds.getSouthWest());
          
          // If we are fully contained in the last search area AND we didn't hit the API limit,
          // we normally skip. HOWEVER, if we zoomed in AT ALL, we should search again
          // because Google Places hides results at lower zoom levels.
          if (isContained && !hitApiLimit) {
            if (currentZoom && lastSearchedZoom && (currentZoom > lastSearchedZoom)) {
                 // Force search: Zoomed in.
            } else {
                 return;
            }
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
        latitude: placeDetails.location.lat(),
        longitude: placeDetails.location.lng(),
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

  const handlePlaceSelect = useCallback(async (winery: Winery, sdkPlace: google.maps.places.Place) => {
    if (!map) return;
    
    // Check if it is a winery (or vineyard, tasting room, etc.)
    const wineryTypes = ['winery', 'vineyard', 'food', 'establishment', 'point_of_interest'];
    const isWineryType = sdkPlace.types?.some((t: string) => wineryTypes.includes(t)) || 
         winery.name.toLowerCase().includes('winery') || 
         winery.name.toLowerCase().includes('vineyard') || 
         winery.name.toLowerCase().includes('cellar');

    if (isWineryType) {
      // 1. Center on winery
      map.setCenter({ lat: winery.latitude, lng: winery.longitude });
      map.setZoom(16);

      // 2. Save/upsert to store & database with full enriched fields
      const dbId = await useWineryDataStore.getState().upsertEnrichedWinery(winery);
      const wineryWithDbId = { ...winery, dbId };
      
      // 3. Open details modal
      openWineryModal(winery.id);
      ensureWineryDetails(winery.id);

      // 4. Add to search results so it displays on the map immediately
      const { setSearchResults } = useMapStore.getState();
      const currentResults = useMapStore.getState().searchResults;
      if (!currentResults.some(w => w.id === winery.id)) {
        setSearchResults([wineryWithDbId, ...currentResults]);
      }
    } else {
      // It's a region/city/locality
      setSearchLocation(winery.name);
      
      if (sdkPlace.viewport) {
        map.fitBounds(sdkPlace.viewport);
      } else {
        map.setCenter({ lat: winery.latitude, lng: winery.longitude });
        map.setZoom(13);
      }
      
      // Clear last search bounds to force a search in the new area
      useMapStore.getState().setLastSearchedBounds(null);
      // Execute text search for wineries in this new area
      executeSearch(undefined, map.getBounds() || undefined);
    }
  }, [map, openWineryModal, ensureWineryDetails, setSearchLocation, executeSearch]);

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
    isLoading,
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
    handlePlaceSelect,
  }), [
    error, isLoading, mapWineries, listResultsInView, isSearching, hitApiLimit,
    searchLocation, autoSearch, filter, handleFilterChange, handleOpenModal,
    proposedWinery, selectedTrip, setSearchLocation, setAutoSearch, setProposedWinery,
    handleSearchSubmit, handleManualSearchArea, handlePlaceSelect
  ]);
}
