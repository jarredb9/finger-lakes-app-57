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
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
      
                  // --- READ FROM CACHE FIRST ---
      const bounds = new google.maps.LatLngBounds(finalSearchBounds);
      const minLat = bounds.getSouthWest().lat();
      const minLng = bounds.getSouthWest().lng();
      const maxLat = bounds.getNorthEast().lat();
      const maxLng = bounds.getNorthEast().lng();

      const supabase = createClient();
      const { data: cachedWineries, error: rpcError } = await supabase.rpc('get_wineries_in_bounds', {
        min_lat: minLat,
        min_lng: minLng,
        max_lat: maxLat,
        max_lng: maxLng,
      });

      if (rpcError) {
        console.error("Error fetching cached wineries:", rpcError);
      }

      // If we find a good number of wineries in our DB, just use them.
      // The threshold (e.g., 10) can be adjusted.
      if (cachedWineries && cachedWineries.length > 10) {
        console.log(`✅ Found ${cachedWineries.length} cached wineries in bounds. Skipping Google API call.`);
        const wineries = cachedWineries.map((w: DbWinery) => standardizeWineryData(w)).filter(Boolean) as Winery[];
        setSearchResults(wineries);
        setIsSearching(false);
        return;
      }
      
      console.log(`ℹ️ Only found ${cachedWineries?.length || 0} cached wineries. Proceeding with Google API search.`);
      // --- END READ FROM CACHE ---

      const combinedQuery = `winery OR vineyard OR "wine tasting room"`;
      const allFoundPlaces = new Map<string, google.maps.places.Place>();
      let hitApiLimit = false;

      const request = {
        textQuery: combinedQuery,
        fields: [
          "displayName",
          "location",
          "formattedAddress",
          "rating",
          "id",
        ],
        locationRestriction: finalSearchBounds,
      };

      try {
        console.log(`🔍 Executing single Google Search for: "${combinedQuery}"`);
        const { places: foundPlaces } = await google.maps.places.Place.searchByText(request);
        console.log(`✅ Found ${foundPlaces.length} places.`);
        
        if (foundPlaces.length === 20) {
          hitApiLimit = true;
        }
        
        foundPlaces.forEach((place) => {
          if (place.id) {
            allFoundPlaces.set(place.id, place);
          }
        });
      } catch (error) {
        console.error(`Google Places search error:`, error);
      }
      
      const wineries: Winery[] = Array.from(allFoundPlaces.values()).map((place: google.maps.places.Place) => {
          return {
              id: place.id! as GooglePlaceId, // Keep for map key
              place_id: place.id! as GooglePlaceId, // Explicitly pass for standardization
              name: place.displayName || '',
              address: place.formattedAddress || '',
              lat: place.location?.lat() || 0,
              lng: place.location?.lng() || 0,
              rating: place.rating ?? undefined,
          };
      });

      setSearchResults(wineries);
      // Don't await this, let it run in the background
      if (wineries.length > 0) {
        bulkUpsertWineries(wineries);
      }
      setIsSearching(false);
      setHitApiLimit(hitApiLimit);
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
