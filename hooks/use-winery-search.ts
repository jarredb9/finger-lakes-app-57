"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { useMapStore } from "@/lib/stores/mapStore";
import { useToast } from "@/hooks/use-toast";
import { Winery } from "@/lib/types";

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
      
                  const searchTerms = ["winery", "vineyard", "wine tasting room"];
                  const allFoundPlaces = new Map<string, google.maps.places.Place>();
                  let hitApiLimit = false;
            
                  // Parallelize search requests for better performance
                  await Promise.all(
                    searchTerms.map(async (term) => {
                      const request = {
                        textQuery: term,
                        fields: [
                          "displayName",
                          "location",
                          "formattedAddress",
                          "rating",
                          "id",
                          "websiteURI",
                          "nationalPhoneNumber",
                          "reviews",
                        ],
                        locationRestriction: finalSearchBounds,
                      };
            
                      try {
                        const { places: foundPlaces } = await google.maps.places.Place.searchByText(request);                  if (foundPlaces.length === 20) {
                    hitApiLimit = true;
                  }
                  foundPlaces.forEach((place) => {
                    if (place.id) {
                      allFoundPlaces.set(place.id, place);
                    }
                  });
                } catch (error) {
                  console.error(`Google Places search error for term "${term}":`, error);
                }
              })
            );
      
            const wineries: Winery[] = Array.from(allFoundPlaces.values()).map((place) => ({        id: place.id!,
        name: place.displayName!,
        address: place.formattedAddress!,
        lat: place.location!.lat(),
        lng: place.location!.lng(),
        rating: place.rating ?? undefined,
        website: place.websiteURI ?? undefined,
        phone: place.nationalPhoneNumber ?? undefined,
        reviews: place.reviews?.map((review) => ({
          author_name: review.authorAttribution?.displayName ?? "A reviewer",
          rating: review.rating ?? 0,
          relative_time_description: review.relativePublishTimeDescription ?? "",
          text: review.text ?? "",
          time: review.publishTime?.getTime() ?? 0,
          author_url: review.authorAttribution?.uri,
          language: review.textLanguageCode,
          profile_photo_url: review.authorAttribution?.photoURI,
        })) ?? undefined,
      }));

      setSearchResults(wineries);
      setIsSearching(false);
      setHitApiLimit(hitApiLimit);
    },
    [map, places, geocoder, toast, setIsSearching, setSearchResults, setHitApiLimit]
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
