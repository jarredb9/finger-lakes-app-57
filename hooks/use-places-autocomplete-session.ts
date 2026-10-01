"use client";

import { useState, useEffect, useCallback } from "react";
import { ESSENTIALS_FIELD_MASK, ENRICHMENT_FIELD_MASK } from "@/lib/constants/google-maps";
import { getGoogleLibrary } from "@/lib/utils/google-maps-loader";
import { useWineryStore } from "@/lib/stores/wineryStore";

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
    const trimmedInput = input.trim();
    if (!trimmedInput) {
      setSuggestions([]);
      return;
    }

    // In development or E2E mode, surface synthetic test fixtures from local catalog
    const isDev = process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_IS_E2E === "true";
    let syntheticSuggestions: google.maps.places.AutocompleteSuggestion[] = [];

    if (isDev) {
      const lower = trimmedInput.toLowerCase();
      const testMatches = useWineryStore
        .getState()
        .persistentWineries.filter((w) => {
          const isTest = w.id?.startsWith("test-") || w.id?.startsWith("mock-");
          if (!isTest) return false;
          return (
            w.name?.toLowerCase().includes(lower) ||
            w.address?.toLowerCase().includes(lower)
          );
        });

      syntheticSuggestions = testMatches.map((w) => ({
        placePrediction: {
          text: { text: w.name },
          mainText: { text: w.name },
          secondaryText: { text: w.address ? `🧪 ${w.address}` : "🧪 Local Test Fixture" },
          toPlace: () => ({ id: w.id } as any),
        },
      })) as unknown as google.maps.places.AutocompleteSuggestion[];
    }

    if (!places || !sessionToken) {
      setSuggestions(syntheticSuggestions);
      return;
    }

    setIsLoading(true);
    try {
      const request: google.maps.places.AutocompleteRequest = {
        input: trimmedInput,
        sessionToken,
        ...options,
      };

      const { suggestions: results } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
      setSuggestions([...syntheticSuggestions, ...(results || [])]);
    } catch (error) {
      console.error("[usePlacesAutocompleteSession] fetchAutocompleteSuggestions failed:", error);
      setSuggestions(syntheticSuggestions);
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
