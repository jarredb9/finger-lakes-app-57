"use client";

import { useState, useEffect, useCallback } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { ESSENTIALS_FIELD_MASK, ENRICHMENT_FIELD_MASK } from "@/lib/constants/google-maps";

export function usePlacesAutocompleteSession() {
  const places = useMapsLibrary("places");
  const [sessionToken, setSessionToken] = useState<google.maps.places.AutocompleteSessionToken | null>(null);
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);

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
    const fields = [
      ...ESSENTIALS_FIELD_MASK.map(f => f.replace("places.", "")),
      ...ENRICHMENT_FIELD_MASK.map(f => f.replace("places.", ""))
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
