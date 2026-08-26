"use client";

import { useState, useEffect, useRef } from "react";
import { Search, Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { usePlacesAutocompleteSession } from "@/hooks/use-places-autocomplete-session";
import { standardizeWineryData } from "@/lib/utils/winery";
import { mapSdkPlaceToV1Place } from "@/lib/utils/places-mapper";
import { useComboboxKeyboard } from "@/hooks/use-combobox-keyboard";
import { PlaceAutocompleteSuggestionsList } from "@/components/PlaceAutocompleteSuggestionsList";
import { Winery } from "@/lib/types";

interface PlaceAutocompleteProps {
  placeholder?: string;
  onPlaceSelect: (winery: Winery, sdkPlace: google.maps.places.Place) => void;
  className?: string;
  includedPrimaryTypes?: string[];
  locationBias?: google.maps.LatLngBounds | google.maps.LatLngBoundsLiteral;
  id?: string;
}

export function PlaceAutocomplete({
  placeholder = "Search locations...",
  onPlaceSelect,
  className = "",
  includedPrimaryTypes,
  locationBias,
  id = "place-autocomplete",
}: PlaceAutocompleteProps) {
  const [inputValue, setInputValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  const {
    suggestions,
    isLoading: isAutocompleteLoading,
    fetchSuggestions,
    fetchPlaceDetails,
    setSuggestions,
  } = usePlacesAutocompleteSession();

  // Debounce autocomplete query
  useEffect(() => {
    if (inputValue.trim().length < 3) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    const timer = setTimeout(() => {
      const options: Partial<google.maps.places.AutocompleteRequest> = {};
      if (includedPrimaryTypes) {
        options.includedPrimaryTypes = includedPrimaryTypes;
      }
      if (locationBias) {
        options.locationBias = locationBias;
      }
      fetchSuggestions(inputValue, options);
      setIsOpen(true);
    }, 300);

    return () => clearTimeout(timer);
  }, [inputValue, includedPrimaryTypes, locationBias, fetchSuggestions, setSuggestions]);

  const handleSelectSuggestion = async (
    suggestion: google.maps.places.AutocompleteSuggestion
  ) => {
    if (!suggestion.placePrediction) return;

    // Dismiss virtual keyboard on suggestion select
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    const text = suggestion.placePrediction.text?.text || "";
    setInputValue(text);
    setIsOpen(false);
    setIsFetchingDetails(true);

    try {
      const place = await fetchPlaceDetails(suggestion);
      if (place) {
        const v1Place = mapSdkPlaceToV1Place(place, text);
        const winery = standardizeWineryData(v1Place);
        if (winery) {
          onPlaceSelect(winery, place);
        }
      }
    } catch (error) {
      console.error("[PlaceAutocomplete] Selection failed:", error);
    } finally {
      setIsFetchingDetails(false);
      setSuggestions([]);
    }
  };

  const { activeIndex, handleKeyDown } = useComboboxKeyboard({
    items: suggestions,
    isOpen,
    onOpenChange: setIsOpen,
    onSelect: handleSelectSuggestion,
    containerRef,
  });

  const handleClear = () => {
    setInputValue("");
    setSuggestions([]);
    setIsOpen(false);
  };

  const showLoader = isAutocompleteLoading || isFetchingDetails;

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      <div className="relative flex items-center">
        <Input
          id={id}
          type="text"
          placeholder={placeholder}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => inputValue.length >= 3 && setIsOpen(true)}
          className="pr-10 pl-9 h-9 w-full rounded-md border border-input bg-background text-base sm:text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          autoComplete="off"
          data-testid="place-autocomplete-input"
        />
        <div className="absolute left-3 flex items-center pointer-events-none text-muted-foreground">
          {showLoader ? (
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
          ) : (
            <Search className="w-4 h-4" />
          )}
        </div>
        {inputValue && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 p-0.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Clear input"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <PlaceAutocompleteSuggestionsList
        suggestions={suggestions}
        isOpen={isOpen}
        activeIndex={activeIndex}
        onSelectSuggestion={handleSelectSuggestion}
      />
    </div>
  );
}
