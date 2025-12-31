"use client";

import { useState, useCallback, useEffect, useRef } from "react";
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
    isSearching,
    setIsSearching,
    setSearchResults,
    setHitApiLimit,
    searchLocation,
    setSearchLocation,
    autoSearch,
    setAutoSearch,
    setLastSearchedBounds,
  } = useMapStore();
  const { bulkUpsertWineries } = useWineryDataStore();

  const { toast } = useToast();
  const places = useMapsLibrary("places");
  const geocoding = useMapsLibrary("geocoding");
  const [geocoder, setGeocoder] = useState<google.maps.Geocoder | null>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
          console.error("Geocoding failed:", error);
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

      const bounds = new google.maps.LatLngBounds(finalSearchBounds);
      const supabase = createClient();
      const { data: cachedWineries, error: rpcError } = await supabase.rpc('get_wineries_in_bounds', {
        min_lat: bounds.getSouthWest().lat(),
        min_lng: bounds.getSouthWest().lng(),
        max_lat: bounds.getNorthEast().lat(),
        max_lng: bounds.getNorthEast().lng(),
      });

      if (rpcError) console.error("Error fetching cached wineries:", rpcError);

      if (cachedWineries && cachedWineries.length > 0) {
        console.log(`✅ Displaying ${cachedWineries.length} cached wineries immediately.`);
        const wineries = cachedWineries.map((w: DbWinery) => standardizeWineryData(w)).filter(Boolean) as Winery[];
        setSearchResults(wineries);
      }
      
      console.log(`ℹ️ Fetching fresh data from Google API in the background...`);
      
      const combinedQuery = `winery OR vineyard OR "wine tasting room"`;
      const request = {
        textQuery: combinedQuery,
        fields: ["displayName", "location", "formattedAddress", "rating", "id"],
        locationRestriction: finalSearchBounds,
      };

      try {
        const { places: foundPlaces } = await google.maps.places.Place.searchByText(request);
        console.log(`✅ Found ${foundPlaces.length} fresh places from Google.`);
        
        const wineries: Winery[] = foundPlaces.map((place: any) => ({
              id: place.id! as GooglePlaceId,
              place_id: place.id! as GooglePlaceId,
              name: place.displayName || '',
              address: place.formattedAddress || '',
              lat: place.location?.lat() || 0,
              lng: place.location?.lng() || 0,
              rating: place.rating ?? undefined,
        }));

        // This will merge with existing results and save to DB
        if (wineries.length > 0) {
          bulkUpsertWineries(wineries);
        }
        
        // Merge cached results with new results
        const existingResults = useMapStore.getState().searchResults;
        const combinedResults = new Map();
        existingResults.forEach(w => combinedResults.set(w.id, w));
        wineries.forEach(w => combinedResults.set(w.id, w));

        setSearchResults(Array.from(combinedResults.values()));
        setHitApiLimit(foundPlaces.length === 20);

      } catch (error) {
        console.error(`Google Places search error:`, error);
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
    ]
  );
  
  useEffect(() => {
    if (!map) return;

    const idleListener = map.addListener("idle", () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      
      debounceTimeoutRef.current = setTimeout(() => {
        if (!autoSearch) return;
        
        const currentBounds = map.getBounds();
        if (!currentBounds) return;

        const lastSearched = useMapStore.getState().lastSearchedBounds;

        if (lastSearched && lastSearched.contains(currentBounds.getCenter())) {
          console.log("🗺️ Map center is still within last search area, skipping search.");
          return;
        }

        console.log("🗺️ New area detected, executing search.");
        executeSearch(undefined, currentBounds);

      }, 750);
    });

    return () => {
      google.maps.event.removeListener(idleListener);
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [map, autoSearch, executeSearch]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchLocation.trim()) {
      setLastSearchedBounds(null); 
      executeSearch(searchLocation.trim());
    }
  };

  const handleManualSearchArea = () => {
    if (map) {
      setLastSearchedBounds(null); 
      executeSearch(undefined, map.getBounds());
    }
  };

  return {
    isSearching,
    searchLocation,
    setSearchLocation,
    autoSearch,
    setAutoSearch,
    handleSearchSubmit,
    handleManualSearchArea,
    placesLibrary: places,
    geocodingLibrary: geocoding,
  };
}