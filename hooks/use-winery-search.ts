"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { useMapStore } from "@/lib/stores/mapStore";
import { useWineryDataStore } from "@/lib/stores/wineryDataStore";
import { useToast } from "@/hooks/use-toast";
import { Winery, GooglePlaceId } from "@/lib/types";

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
          const lat = typeof place.location?.lat === 'function' 
              ? place.location.lat() 
              : (place.location as any)?.latitude || 0;
          const lng = typeof place.location?.lng === 'function' 
              ? place.location.lng() 
              : (place.location as any)?.longitude || 0;
          const name = typeof place.displayName === 'string' 
              ? place.displayName 
              : (place.displayName as any)?.text || '';
          
          return {
              id: place.id! as GooglePlaceId,
              name,
              address: place.formattedAddress || '',
              lat,
              lng,
              rating: place.rating ?? undefined,
              website: undefined,
              phone: undefined,
              reviews: undefined,
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
