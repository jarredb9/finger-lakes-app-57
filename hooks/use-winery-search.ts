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
    setBounds,
  } = useMapStore();
  const { bulkUpsertWineries } = useWineryDataStore();

  const { toast } = useToast();
  const places = useMapsLibrary("places");
  const geocoding = useMapsLibrary("geocoding");
  const [geocoder, setGeocoder] = useState<google.maps.Geocoder | null>(null);
  const searchFnRef = useRef<
    | ((
        locationText?: string,
        bounds?: google.maps.LatLngBounds | google.maps.LatLngBoundsLiteral
      ) => Promise<void>)
    | null
  >(null);

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
      setIsSearching(true);
      setSearchResults([]);

      let finalSearchBounds: google.maps.LatLngBounds;
      
      // Case 1: Text-based location search (e.g., "Geneva, NY")
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
              map?.setZoom(13); // Reasonable default zoom for a point
              // Create a small bounds around the point for the search context
              const point = geometry.location;
              const offset = 0.05; // Roughly 5km
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
            toast({
              variant: "destructive",
              description: "Could not find that location.",
            });
            setIsSearching(false);
            return;
          }
        } catch (error) {
          console.error("Geocoding failed:", error);
          setIsSearching(false);
          return;
        }
      } 
            // Case 2: Bounds-based search (current map view)
            else if (searchBounds) {
              finalSearchBounds = new google.maps.LatLngBounds(searchBounds);
            } else {
              setIsSearching(false);
              return;
            }
      
      // --- STALE-WHILE-REVALIDATE STRATEGY ---

      // 1. Show cached results immediately (Stale)
      const bounds = new google.maps.LatLngBounds(finalSearchBounds);
      const supabase = createClient();
      const { data: cachedWineries, error: rpcError } = await supabase.rpc('get_wineries_in_bounds', {
        min_lat: bounds.getSouthWest().lat(),
        min_lng: bounds.getSouthWest().lng(),
        max_lat: bounds.getNorthEast().lat(),
        max_lng: bounds.getNorthEast().lng(),
      });

      if (rpcError) {
        console.error("Error fetching cached wineries:", rpcError);
      }

      if (cachedWineries && cachedWineries.length > 0) {
        console.log(`✅ Displaying ${cachedWineries.length} cached wineries immediately.`);
        const wineries = cachedWineries.map((w: DbWinery) => standardizeWineryData(w)).filter(Boolean) as Winery[];
        setSearchResults(wineries);
      }
      
      // 2. Fetch fresh results in the background (Revalidate)
      console.log(`ℹ️ Fetching fresh data from Google API in the background...`);
      
      const combinedQuery = `winery OR vineyard OR "wine tasting room"`;
      const request = {
        textQuery: combinedQuery,
        fields: [
          "displayName",
          "location",
          "formattedAddress",
          "rating",
          "id", // This is the correct field for the place ID
        ],
        locationRestriction: finalSearchBounds,
      };

      try {
        const { places: foundPlaces } = await google.maps.places.Place.searchByText(request);
        console.log(`✅ Found ${foundPlaces.length} fresh places from Google.`);
        
        const wineries: Winery[] = foundPlaces.map((place: any) => {
          return {
              id: place.id! as GooglePlaceId,
              place_id: place.id! as GooglePlaceId, // Use the 'id' field here as well
              name: place.displayName || '',
              address: place.formattedAddress || '',
              lat: place.location?.lat() || 0,
              lng: place.location?.lng() || 0,
              rating: place.rating ?? undefined,
          };
        });

        // This will merge with existing results and save to DB
        if (wineries.length > 0) {
          bulkUpsertWineries(wineries);
        }
        
        // Update the search results with the full, fresh list
        setSearchResults(wineries);
        setHitApiLimit(foundPlaces.length === 20);

      } catch (error) {
        console.error(`Google Places search error:`, error);
      } finally {
        setIsSearching(false);
      }
    },
    [map, places, geocoder, toast, setIsSearching, setSearchResults, setHitApiLimit, bulkUpsertWineries]
  );
  
  // Keep a ref to the latest search function for the idle listener
  useEffect(() => {
    searchFnRef.current = executeSearch;
  });

  // Auto-search on map idle
  useEffect(() => {
    if (!map) return;
    const idleListener = map.addListener("idle", () => {
      const currentBounds = map.getBounds();
      if (currentBounds) {
        setBounds(currentBounds);
        if (autoSearch) {
          searchFnRef.current?.(undefined, currentBounds);
        }
      }
    });
    return () => {
      google.maps.event.removeListener(idleListener);
    };
  }, [map, autoSearch, setBounds]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchLocation.trim()) {
      executeSearch(searchLocation.trim());
    }
  };

  const handleManualSearchArea = () => {
    if (map) {
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
