"use client";

import { useState, useCallback, useEffect } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { useMapStore } from "@/lib/stores/mapStore";
import { useWineryDataStore } from "@/lib/stores/wineryDataStore";
import { useToast } from "@/hooks/use-toast";
import { Winery, GooglePlaceId, DbWinery } from "@/lib/types";
import { createClient } from "@/utils/supabase/client";
import { standardizeWineryData } from "@/lib/utils/winery";

export function useWinerySearch() {
  const {
    map,
    setIsSearching,
    setSearchResults,
    setHitApiLimit,
    setLastSearchedBounds,
    setLastSearchedZoom,
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
            bounds.contains({ lat: w.lat, lng: w.lng })
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

      const bounds = new google.maps.LatLngBounds(finalSearchBounds);
      const supabase = createClient();
      const { data: cachedWineries } = await supabase.rpc('get_wineries_in_bounds', {
        min_lat: bounds.getSouthWest().lat(),
        min_lng: bounds.getSouthWest().lng(),
        max_lat: bounds.getNorthEast().lat(),
        max_lng: bounds.getNorthEast().lng(),
      });

      const { persistentWineries } = useWineryDataStore.getState();
      let preloadedWineries: Winery[] = [];

      if (cachedWineries && cachedWineries.length > 0) {
        preloadedWineries = cachedWineries.map((w: DbWinery) => {
           const existing = persistentWineries.find(pw => pw.id === w.google_place_id);
           return standardizeWineryData(w, existing);
        }).filter(Boolean) as Winery[];
        // NOTE: We do NOT set search results here to avoid UI blinking.
        // We will merge these with Google results later.
      }
      
      const combinedQuery = `winery OR vineyard OR "wine tasting room"`;
      const request = {
        textQuery: combinedQuery,
        fields: ["displayName", "location", "formattedAddress", "rating", "id"],
        locationRestriction: finalSearchBounds,
      };

      try {
        const { places: foundPlaces } = await google.maps.places.Place.searchByText(request);
        
        const wineriesFromGoogle: Winery[] = foundPlaces.map((place: any) => ({
              id: place.id! as GooglePlaceId,
              place_id: place.id! as GooglePlaceId,
              name: place.displayName || '',
              address: place.formattedAddress || '',
              lat: place.location?.lat() || 0,
              lng: place.location?.lng() || 0,
              rating: place.rating ?? undefined,
        }));

        if (wineriesFromGoogle.length > 0) {
          await bulkUpsertWineries(wineriesFromGoogle);
        }
        
        // Re-fetch latest state after upsert to ensure we have the merged data
        const updatedPersistentWineries = useWineryDataStore.getState().persistentWineries;
        const combinedResults = new Map();

        // 1. Add Preloaded (Cached) Wineries
        preloadedWineries.forEach(w => combinedResults.set(w.id, w));
        
        // 2. Add/Update with Google Results
        wineriesFromGoogle.forEach(w => {
            const richWinery = updatedPersistentWineries.find(pw => pw.id === w.id);
            if (richWinery) {
                combinedResults.set(w.id, richWinery);
            } else {
                combinedResults.set(w.id, w);
            }
        });

        setSearchResults(Array.from(combinedResults.values()));
        setHitApiLimit(foundPlaces.length === 20);

      } catch (error) {
        // Fallback: If Google search fails, at least show what we have in cache
        if (preloadedWineries.length > 0) {
            setSearchResults(preloadedWineries);
        }
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
    ]
  );

  return { executeSearch };
}
