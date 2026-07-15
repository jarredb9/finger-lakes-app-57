"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useMap } from "react-map-gl/mapbox";
import { Winery, GooglePlaceId } from "@/lib/types";
import { useWineryStore } from "@/lib/stores/wineryStore";
import { useWineryDataStore } from "@/lib/stores/wineryDataStore";
import { useMapStore } from "@/lib/stores/mapStore";
import { useTripStore } from "@/lib/stores/tripStore";
import { useUIStore } from "@/lib/stores/uiStore";
import { useWinerySearch } from "./use-winery-search";
import { useWineryFilter } from "./use-winery-filter";
import { getGoogleLibrary } from "@/lib/utils/google-maps-loader";
import { isCoordinateInBounds, getCoordinatesFromBounds } from "@/lib/utils/map-utils";

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
  const { current: mapInstance } = useMap();
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [places, setPlaces] = useState<any>(null);

  // Load Google Places library for any fallback SDK functionalities
  useEffect(() => {
    getGoogleLibrary("places").then((lib) => {
      if (lib) setPlaces(lib);
    });
  }, []);

  // --- Effects ---

  useEffect(() => {
    if (userId) {
      fetchWineryData(userId);
      fetchUpcomingTrips();
    }
  }, [userId, fetchWineryData, fetchUpcomingTrips]);

  useEffect(() => {
    if (mapInstance) {
      setMap(mapInstance);
    }
  }, [mapInstance, setMap]);

  useEffect(() => {
    if (map && selectedTrip?.wineries?.length) {
      let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
      selectedTrip.wineries.forEach((winery) => {
        if (winery.latitude < minLat) minLat = winery.latitude;
        if (winery.latitude > maxLat) maxLat = winery.latitude;
        if (winery.longitude < minLng) minLng = winery.longitude;
        if (winery.longitude > maxLng) maxLng = winery.longitude;
      });
      if (typeof map.fitBounds === "function") {
        map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 50, duration: 1000 });
      }
    }
  }, [map, selectedTrip]);

  // Debounced search on map movement
  useEffect(() => {
    if (!map) return;
    
    const handleMapMovement = () => {
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
        const currentZoom = typeof map.getZoom === "function" ? map.getZoom() : map.zoom;

        if (lastSearched) {
          const ne = currentBounds.getNorthEast();
          const sw = currentBounds.getSouthWest();
          const neLat = typeof ne.lat === "function" ? ne.lat() : ne.lat ?? ne[1];
          const neLng = typeof ne.lng === "function" ? ne.lng() : ne.lng ?? ne[0];
          const swLat = typeof sw.lat === "function" ? sw.lat() : sw.lat ?? sw[1];
          const swLng = typeof sw.lng === "function" ? sw.lng() : sw.lng ?? sw[0];

          const isContained = isCoordinateInBounds({ latitude: neLat, longitude: neLng }, lastSearched) && 
                              isCoordinateInBounds({ latitude: swLat, longitude: swLng }, lastSearched);
          
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
    };

    if (typeof map.on === "function") {
      map.on("moveend", handleMapMovement);
      // Trigger initial search/bounds population immediately upon map mount/availability
      handleMapMovement();
      return () => {
        map.off("moveend", handleMapMovement);
        if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
      };
    }
    return () => {};
  }, [map, executeSearch, setBounds]);

  const handleMapClick = useCallback(async (e: any) => {
    if (!places || !e.placeId) return;
    if (typeof e.stop === "function") e.stop();
    
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
    if (!map || typeof map.on !== "function") return;
    map.on("click", handleMapClick);
    return () => {
      map.off("click", handleMapClick);
    };
  }, [map, handleMapClick]);

  const handleOpenModal = useCallback(async (winery: Winery) => {
    openWineryModal(winery.id);
    ensureWineryDetails(winery.id);
  }, [openWineryModal, ensureWineryDetails]);

  const handlePlaceSelect = useCallback(async (winery: Winery, sdkPlace: any) => {
    if (!map) return;
    
    // Check if it is a winery (or vineyard, tasting room, etc.)
    const wineryTypes = ['winery', 'vineyard', 'food', 'establishment', 'point_of_interest'];
    const isWineryType = sdkPlace.types?.some((t: string) => wineryTypes.includes(t)) || 
         winery.name.toLowerCase().includes('winery') || 
         winery.name.toLowerCase().includes('vineyard') || 
         winery.name.toLowerCase().includes('cellar');

    if (isWineryType) {
      // 1. Center on winery
      if (typeof map.flyTo === "function") {
        map.flyTo({ center: [winery.longitude, winery.latitude], zoom: 16 });
      } else if (typeof map.setCenter === "function") {
        map.setCenter({ lat: winery.latitude, lng: winery.longitude });
        map.setZoom(16);
      }

      // 2. Save/upsert to store & database with full enriched fields
      const dbId = await useWineryDataStore.getState().upsertEnrichedWinery(winery);
      const wineryWithDbId = { ...winery, dbId };
      
      // 3. Open details modal with a small delay (150ms) to allow keyboard collapse and viewport stabilization
      setTimeout(() => {
        openWineryModal(winery.id);
        ensureWineryDetails(winery.id);
      }, 150);

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
        const coords = getCoordinatesFromBounds(sdkPlace.viewport);
        if (coords && typeof map.fitBounds === "function") {
          map.fitBounds([[coords.swLng, coords.swLat], [coords.neLng, coords.neLat]], { padding: 50 });
        }
      } else {
        if (typeof map.flyTo === "function") {
          map.flyTo({ center: [winery.longitude, winery.latitude], zoom: 13 });
        } else if (typeof map.setCenter === "function") {
          map.setCenter({ lat: winery.latitude, lng: winery.longitude });
          map.setZoom(13);
        }
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
