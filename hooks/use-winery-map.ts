"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useMap } from "react-map-gl/mapbox";
import { Winery } from "@/lib/types";
import { useWineryStore } from "@/lib/stores/wineryStore";
import { useVisitStore } from "@/lib/stores/visitStore";
import { useMapStore } from "@/lib/stores/mapStore";
import { useTripStore } from "@/lib/stores/tripStore";
import { useUIStore } from "@/lib/stores/uiStore";
import { useWinerySearch } from "./use-winery-search";
import { useWineryFilter } from "./use-winery-filter";
import { getGoogleLibrary } from "@/lib/utils/google-maps-loader";
import { isCoordinateInBounds, getCoordinatesFromBounds } from "@/lib/utils/map-utils";
import { standardizeWineryData } from "@/lib/utils/winery";

export function useWineryMap(userId: string) {
  const {
    hitApiLimit,
    isSearching,
    searchLocation,
    setSearchLocation,
    autoSearch,
    setAutoSearch,
    setBounds,
    error: mapError,
  } = useMapStore();

  const { error: dataError, isLoading: dataLoading } = useWineryStore();
  const { error: tripError, fetchUpcomingTrips, selectedTrip, isLoading: tripLoading } = useTripStore();
  const isLoading = dataLoading || isSearching || tripLoading;
  const error = dataError || mapError || tripError;
  const { fetchWineryData, ensureWineryDetails, getWineries } = useWineryStore();
  const { openWineryModal } = useUIStore();
  const { executeSearch } = useWinerySearch();
  const executeSearchRef = useRef(executeSearch);
  useEffect(() => {
    executeSearchRef.current = executeSearch;
  }, [executeSearch]);
  const { mapWineries, listResultsInView, filter, handleFilterChange } = useWineryFilter();

  const [proposedWinery, setProposedWinery] = useState<Winery | null>(null);
  const maps = useMap();
  const mapInstance = maps?.current || (maps as Record<string, any>)?.default || (maps ? Object.values(maps)[0] : undefined);
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
      useVisitStore.getState().fetchVisits(1, true);
    }
  }, [userId, fetchWineryData, fetchUpcomingTrips]);

  useEffect(() => {
    if (mapInstance && selectedTrip?.wineries?.length) {
      let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
      selectedTrip.wineries.forEach((winery) => {
        if (winery.latitude < minLat) minLat = winery.latitude;
        if (winery.latitude > maxLat) maxLat = winery.latitude;
        if (winery.longitude < minLng) minLng = winery.longitude;
        if (winery.longitude > maxLng) maxLng = winery.longitude;
      });
      if (typeof mapInstance.fitBounds === "function") {
        mapInstance.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 50, duration: 1000 });
      }
    }
  }, [mapInstance, selectedTrip]);

  // Debounced search on map movement
  useEffect(() => {
    if (!mapInstance) return;
    
    const handleMapMovement = () => {
      try {
        const currentBounds = typeof mapInstance.getBounds === "function" ? mapInstance.getBounds() : null;
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
          const currentZoom = typeof mapInstance.getZoom === "function" ? mapInstance.getZoom() : (mapInstance as any).zoom;

          if (lastSearched) {
            const coords = getCoordinatesFromBounds(currentBounds);
            if (coords) {
              const isContained = isCoordinateInBounds({ latitude: coords.neLat, longitude: coords.neLng }, lastSearched) && 
                                  isCoordinateInBounds({ latitude: coords.swLat, longitude: coords.swLng }, lastSearched);
              
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
          }
          
          executeSearchRef.current(undefined, currentBounds);

        }, 750);
      } catch (err) {
        console.error("Error during map movement handler:", err);
      }
    };

    if (typeof mapInstance.on === "function") {
      mapInstance.on("moveend", handleMapMovement);
      mapInstance.on("load", handleMapMovement);
      // Trigger initial search/bounds population immediately upon map mount/availability
      handleMapMovement();
      return () => {
        mapInstance.off("moveend", handleMapMovement);
        mapInstance.off("load", handleMapMovement);
        if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
      };
    }
    return () => {};
  }, [mapInstance, setBounds]);

  const handleMapClick = useCallback(async (e: any) => {
    if (!places || !e.placeId) return;
    if (typeof e.stop === "function") e.stop();
    
    const isKnown = getWineries().some((w) => w.id === e.placeId);
    if (isKnown) return;

    try {
      const placeDetails = new places.Place({ id: e.placeId });
      await placeDetails.fetchFields({ fields: ["displayName", "formattedAddress", "location"] });
      if (!placeDetails.location) return;

      const newWinery = standardizeWineryData({
        id: e.placeId,
        displayName: placeDetails.displayName || "Unnamed Location",
        formattedAddress: placeDetails.formattedAddress || "N/A",
        location: placeDetails.location,
      });

      if (newWinery) {
        setProposedWinery(newWinery);
      }
    } catch (err) {
      console.error("Error fetching place details on click:", err);
    }
  }, [places, getWineries]);

  useEffect(() => {
    if (!mapInstance || typeof mapInstance.on !== "function") return;
    mapInstance.on("click", handleMapClick);
    return () => {
      mapInstance.off("click", handleMapClick);
    };
  }, [mapInstance, handleMapClick]);

  const handleOpenModal = useCallback(async (winery: Winery) => {
    if (winery) {
      useWineryStore.getState().upsertWinery(winery);
      openWineryModal(winery.id);
      ensureWineryDetails(winery.id);
    }
  }, [openWineryModal, ensureWineryDetails]);

  const handlePlaceSelect = useCallback(async (winery: Winery, sdkPlace: any) => {
    // Check if it is a region/city/locality
    const isRegionOrLocality = sdkPlace?.types?.some((t: string) =>
      ['locality', 'sublocality', 'administrative_area_level_1', 'administrative_area_level_2', 'postal_code', 'neighborhood'].includes(t)
    );

    if (!isRegionOrLocality) {
      // 1. Immediately store winery and open details modal without waiting on remote DB
      useWineryStore.getState().upsertWinery(winery);
      openWineryModal(winery.id);

      // 2. Add to search results so it displays on the map immediately
      const { setSearchResults, searchResults: currentResults } = useMapStore.getState();
      if (!currentResults.some(w => w.id === winery.id)) {
        setSearchResults([winery, ...currentResults]);
      }

      // 3. Center on winery if map is available
      if (mapInstance) {
        if (typeof mapInstance.flyTo === "function") {
          mapInstance.flyTo({ center: [winery.longitude, winery.latitude], zoom: 16 });
        } else if (typeof (mapInstance as any).setCenter === "function") {
          (mapInstance as any).setCenter({ lat: winery.latitude, lng: winery.longitude });
          (mapInstance as any).setZoom(16);
        }
      }

      // 4. Fetch enriched details in the background and update search results once ready
      ensureWineryDetails(winery.id).then((enriched) => {
        if (enriched) {
          const state = useMapStore.getState();
          state.setSearchResults(state.searchResults.map(w => w.id === winery.id ? enriched : w));
        }
      }).catch((err) => {
        console.error("Failed to fetch winery details:", err);
      });
    } else {
      // It's a region/city/locality
      setSearchLocation(winery.name);
      
      if (sdkPlace.viewport) {
        const coords = getCoordinatesFromBounds(sdkPlace.viewport);
        if (coords && mapInstance && typeof mapInstance.fitBounds === "function") {
          mapInstance.fitBounds([[coords.swLng, coords.swLat], [coords.neLng, coords.neLat]], { padding: 50 });
        }
      } else if (mapInstance) {
        if (typeof mapInstance.flyTo === "function") {
          mapInstance.flyTo({ center: [winery.longitude, winery.latitude], zoom: 13 });
        } else if (typeof (mapInstance as any).setCenter === "function") {
          (mapInstance as any).setCenter({ lat: winery.latitude, lng: winery.longitude });
          (mapInstance as any).setZoom(13);
        }
      }
      
      // Clear last search bounds to force a search in the new area
      useMapStore.getState().setLastSearchedBounds(null);
      // Execute text search for wineries in this new area
      if (mapInstance && typeof mapInstance.getBounds === "function") {
        executeSearch(undefined, mapInstance.getBounds() || undefined);
      } else {
        executeSearch(winery.name);
      }
    }
  }, [mapInstance, openWineryModal, ensureWineryDetails, setSearchLocation, executeSearch]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchLocation.trim()) {
      useMapStore.getState().setLastSearchedBounds(null);
      executeSearch(searchLocation.trim());
    }
  };

  const handleManualSearchArea = () => {
    if (mapInstance) {
      useMapStore.getState().setLastSearchedBounds(null);
      executeSearch(undefined, mapInstance.getBounds());
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
