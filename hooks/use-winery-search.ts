"use client";

import { useState, useCallback, useEffect } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { useMapStore } from "@/lib/stores/mapStore";
import { useWineryDataStore } from "@/lib/stores/wineryDataStore";
import { useToast } from "@/hooks/use-toast";
import { Winery } from "@/lib/types";
import { isE2E, shouldMockWineries } from "@/lib/stores/e2e-utils";
import { invokeFunction } from "@/lib/utils";

export function useWinerySearch() {
  const {
    map,
    setIsSearching,
    setSearchResults,
    setHitApiLimit,
    setLastSearchedBounds,
    setLastSearchedZoom,
    setError,
  } = useMapStore();
  const { bulkUpsertWineries } = useWineryDataStore();
  const { toast } = useToast();
  const places = useMapsLibrary("places");
  const geocoding = useMapsLibrary("geocoding");
  const [geocoder, setGeocoder] = useState<google.maps.Geocoder | null>(null);

  useEffect(() => {
    if (geocoding && !geocoder) {
      setGeocoder(new google.maps.Geocoder());
    }
  }, [geocoding, geocoder]);

  const executeSearch = useCallback(
    async (
      locationText?: string,
      searchBounds?: google.maps.LatLngBounds | google.maps.LatLngBoundsLiteral
    ) => {
      
      // OFFLINE HANDLING
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        if (locationText) {
          toast({ variant: "destructive", description: "Online connection required for text search." });
          setIsSearching(false);
          return;
        }

        if (searchBounds) {
          setIsSearching(true);
          const bounds = new google.maps.LatLngBounds(searchBounds);
          const { persistentWineries } = useWineryDataStore.getState();
          
          const localResults = persistentWineries.filter(w => 
            bounds.contains({ lat: w.latitude, lng: w.longitude })
          );

          setSearchResults(localResults);
          toast({ description: `Offline: Found ${localResults.length} cached wineries in this area.` });
          setIsSearching(false);
          return;
        }
      }

      if (!places || !geocoder) return;
      if (useMapStore.getState().isSearching) return;

      setIsSearching(true);
      setError(null);
      
      if (locationText) {
        setSearchResults([]);
      }

      let finalSearchBounds: google.maps.LatLngBounds;
      
      if (locationText) {
        try {
          const { results } = await geocoder.geocode({ address: locationText });
          if (results && results.length > 0) {
            const geometry = results[0].geometry;
            if (geometry.viewport) {
              finalSearchBounds = geometry.viewport;
              map?.fitBounds(finalSearchBounds);
            } else if (geometry.location) {
              map?.setCenter(geometry.location);
              map?.setZoom(13);
              const point = geometry.location;
              const offset = 0.05;
              finalSearchBounds = new google.maps.LatLngBounds(
                { lat: point.lat() - offset, lng: point.lng() - offset },
                { lat: point.lat() + offset, lng: point.lng() + offset }
              );
            } else {
               toast({ variant: "destructive", description: "Location geometry missing." });
               setIsSearching(false);
               return;
            }
          } else {
            toast({ variant: "destructive", description: "Could not find that location." });
            setIsSearching(false);
            return;
          }
        } catch (error) {
          setIsSearching(false);
          return;
        }
      } else if (searchBounds) {
        finalSearchBounds = new google.maps.LatLngBounds(searchBounds);
      } else {
        setIsSearching(false);
        return;
      }

      setLastSearchedBounds(finalSearchBounds);
      if (map) {
        setLastSearchedZoom(map.getZoom() ?? null);
      }

      // E2E BYPASS FOR SEARCH
      if (isE2E() && shouldMockWineries()) {
        const bounds = new google.maps.LatLngBounds(finalSearchBounds);
        const { persistentWineries } = useWineryDataStore.getState();
        
        const localResults = persistentWineries.filter(w => 
          bounds.contains({ lat: w.latitude, lng: w.longitude })
        );

        setSearchResults(localResults);
        setIsSearching(false);
        return;
      }

      const bounds = new google.maps.LatLngBounds(finalSearchBounds);
      const activeFilters = useMapStore.getState().filter;
      const enrichmentFilters = ['dog-friendly', 'ev-charging', 'outdoor-seating', 'children-friendly', 'has-wine'];
      const useEnrichment = activeFilters.some(f => enrichmentFilters.includes(f));

      // Extract raw coordinates safely to handle both real bounds and mocks
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      
      // Handle both LatLng objects (with lat()/lng() methods) and plain objects
      const swLat = typeof sw.lat === 'function' ? sw.lat() : (sw as any).lat ?? (sw as any).south;
      const swLng = typeof sw.lng === 'function' ? sw.lng() : (sw as any).lng ?? (sw as any).west;
      const neLat = typeof ne.lat === 'function' ? ne.lat() : (ne as any).lat ?? (ne as any).north;
      const neLng = typeof ne.lng === 'function' ? ne.lng() : (ne as any).lng ?? (ne as any).east;

      const combinedQuery = `winery OR vineyard OR "wine tasting room"`;
      
      try {
        const { data: wineries, error: functionError } = await invokeFunction<Winery[]>('search-wineries', {
          body: {
            query: combinedQuery,
            locationRestriction: {
              north: neLat,
              south: swLat,
              east: neLng,
              west: swLng,
            },
            useEnrichment
          }
        });

        if (functionError || !wineries) {
          throw new Error(functionError?.message || "Search failed");
        }

        if (wineries.length > 0) {
          await bulkUpsertWineries(wineries);
        }
        
        setSearchResults(wineries);
        setHitApiLimit(wineries.length >= 20);

      } catch (error) {
        console.error("Search error:", error);
        setError("Failed to find wineries in this area. Please check your connection and try again.");
      } finally {
        setIsSearching(false);
      }
    },
    [
      map, 
      places, 
      geocoder, 
      toast,
      setIsSearching, 
      setSearchResults, 
      bulkUpsertWineries, 
      setHitApiLimit,
      setLastSearchedBounds,
      setLastSearchedZoom,
      setError,
    ]
  );

  return { executeSearch };
}
