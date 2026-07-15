"use client";

import { useState, useCallback, useEffect } from "react";
import { useMapStore } from "@/lib/stores/mapStore";
import { useWineryDataStore } from "@/lib/stores/wineryDataStore";
import { useToast } from "@/hooks/use-toast";
import { Winery } from "@/lib/types";
import { isE2E, shouldMockWineries } from "@/lib/stores/e2e-utils";
import { invokeFunction } from "@/lib/utils";
import { getGoogleLibrary } from "@/lib/utils/google-maps-loader";
import { isCoordinateInBounds, getCoordinatesFromBounds } from "@/lib/utils/map-utils";

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
  const [places, setPlaces] = useState<any>(null);
  const [geocoder, setGeocoder] = useState<any>(null);

  useEffect(() => {
    getGoogleLibrary("places").then((lib) => {
      if (lib) setPlaces(lib);
    });
    getGoogleLibrary("geocoding").then((lib) => {
      if (lib && typeof window !== "undefined" && window.google?.maps) {
        setGeocoder(new window.google.maps.Geocoder());
      }
    });
  }, []);

  const executeSearch = useCallback(
    async (
      locationText?: string,
      searchBounds?: any
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
          const { persistentWineries } = useWineryDataStore.getState();
          
          const localResults = persistentWineries.filter(w => 
            isCoordinateInBounds({ latitude: w.latitude, longitude: w.longitude }, searchBounds)
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

      let finalSearchBounds: any;
      
      if (locationText) {
        try {
          const { results } = await geocoder.geocode({ address: locationText });
          if (results && results.length > 0) {
            const geometry = results[0].geometry;
            if (geometry.viewport) {
              finalSearchBounds = geometry.viewport;
              const coords = getCoordinatesFromBounds(finalSearchBounds);
              if (coords && map) {
                if (typeof map.fitBounds === 'function') {
                  map.fitBounds([[coords.swLng, coords.swLat], [coords.neLng, coords.neLat]], { padding: 50 });
                }
              }
            } else if (geometry.location) {
              const point = geometry.location;
              if (map) {
                if (typeof map.setCenter === 'function') {
                  map.setCenter({ lat: point.lat(), lng: point.lng() });
                  map.setZoom(13);
                } else if (typeof map.flyTo === 'function') {
                  map.flyTo({ center: [point.lng(), point.lat()], zoom: 13 });
                }
              }
              const offset = 0.05;
              finalSearchBounds = {
                west: point.lng() - offset,
                south: point.lat() - offset,
                east: point.lng() + offset,
                north: point.lat() + offset
              };
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
        finalSearchBounds = searchBounds;
      } else {
        setIsSearching(false);
        return;
      }

      setLastSearchedBounds(finalSearchBounds);
      if (map) {
        const zoom = typeof map.getZoom === 'function' ? map.getZoom() : map.zoom;
        setLastSearchedZoom(zoom ?? null);
      }

      // E2E BYPASS FOR SEARCH
      if (isE2E() && shouldMockWineries()) {
        const { persistentWineries } = useWineryDataStore.getState();
        
        const localResults = persistentWineries.filter(w => 
          isCoordinateInBounds({ latitude: w.latitude, longitude: w.longitude }, finalSearchBounds)
        );

        setSearchResults(localResults);
        setIsSearching(false);
        return;
      }

      const activeFilters = useMapStore.getState().filter;
      const enrichmentFilters = ['allowsDogs', 'hasEvCharging', 'outdoorSeating', 'goodForChildren'];
      const useEnrichment = activeFilters.some(f => enrichmentFilters.includes(f));

      const coords = getCoordinatesFromBounds(finalSearchBounds);
      if (!coords) {
        setIsSearching(false);
        return;
      }
      const { swLat, swLng, neLat, neLng } = coords;

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
