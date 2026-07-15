"use client";

import { useState, useEffect, useCallback } from "react";
import { ESSENTIALS_FIELD_MASK, ENRICHMENT_FIELD_MASK } from "@/lib/constants/google-maps";
import { getGoogleLibrary } from "@/lib/utils/google-maps-loader";

export function usePlacesAutocompleteSession() {
  const [places, setPlaces] = useState<any>(null);
  const [sessionToken, setSessionToken] = useState<any>(null);
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    getGoogleLibrary("places").then((lib) => {
      if (lib) setPlaces(lib);
    });
  }, []);

  // Initialize/Refresh token
  const refreshSessionToken = useCallback(() => {
    if (places) {
      const token = new places.AutocompleteSessionToken();
      setSessionToken(token);
    }
  }, [places]);

  useEffect(() => {
    if (places && !sessionToken) {
      refreshSessionToken();
    }
  }, [places, sessionToken, refreshSessionToken]);

  const fetchSuggestions = useCallback(async (input: string, options?: Partial<google.maps.places.AutocompleteRequest>) => {
    if (!places || !input.trim() || !sessionToken) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);
    try {
      const request: google.maps.places.AutocompleteRequest = {
        input,
        sessionToken,
        ...options,
      };

      const { suggestions: results } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
      setSuggestions(results || []);
    } catch (error) {
      console.error("[usePlacesAutocompleteSession] fetchAutocompleteSuggestions failed:", error);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  }, [places, sessionToken]);

  const fetchPlaceDetails = useCallback(async (suggestion: google.maps.places.AutocompleteSuggestion) => {
    if (!places || !suggestion.placePrediction) {
      return null;
    }

    const place = suggestion.placePrediction.toPlace();
    
    // Map Web Service field names to Maps JS API field names
    // Many are identical after removing 'places.', but some booleans differ (is/has prefix)
    const fieldMapping: Record<string, string> = {
      'goodForChildren': 'isGoodForChildren',
      'outdoorSeating': 'hasOutdoorSeating',
      'reservable': 'isReservable',
      'wifi': 'hasWiFi',
    };

    const fields = [
      ...ESSENTIALS_FIELD_MASK.map(f => {
        const name = f.replace("places.", "");
        return fieldMapping[name] || name;
      }),
      ...ENRICHMENT_FIELD_MASK.map(f => {
        const name = f.replace("places.", "");
        return fieldMapping[name] || name;
      })
    ];

    try {
      await place.fetchFields({ fields });
      // After successfully fetching fields, the session is completed.
      // Generate a new token for the next session.
      refreshSessionToken();
      return place;
    } catch (error) {
      console.error("[usePlacesAutocompleteSession] fetchFields failed:", error);
      // Generate new token anyway to start fresh
      refreshSessionToken();
      return null;
    }
  }, [places, refreshSessionToken]);

  return {
    sessionToken,
    suggestions,
    isLoading,
    fetchSuggestions,
    fetchPlaceDetails,
    refreshSessionToken,
    setSuggestions,
  };
}
