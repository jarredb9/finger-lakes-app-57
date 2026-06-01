"use client";

import { useState, useEffect, useRef, KeyboardEvent } from "react";
import { Search, Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { usePlacesAutocompleteSession } from "@/hooks/use-places-autocomplete-session";
import { standardizeWineryData } from "@/lib/utils/winery";
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
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
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

  // Click outside listener to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectSuggestion = async (suggestion: google.maps.places.AutocompleteSuggestion) => {
    if (!suggestion.placePrediction) return;
    
    const text = suggestion.placePrediction.text?.text || "";
    setInputValue(text);
    setIsOpen(false);
    setIsFetchingDetails(true);

    try {
      const place = await fetchPlaceDetails(suggestion);
      if (place) {
        // Map SDK Place to GoogleV1Place shape
        const placeAny = place as any;
        const lat = place.location ? place.location.lat() : 0;
        const lng = place.location ? place.location.lng() : 0;

        const v1Place: any = {
          google_place_id: place.id,
          name: place.displayName || text,
          address: place.formattedAddress || "",
          latitude: lat,
          longitude: lng,
          phone: placeAny.nationalPhoneNumber || placeAny.internationalPhoneNumber || null,
          website: placeAny.websiteUri || null,
          google_rating: placeAny.rating || null,
          allows_dogs: placeAny.allowsDogs ?? null,
          serves_wine: placeAny.servesWine ?? null,
          good_for_children: placeAny.goodForChildren ?? null,
          outdoor_seating: placeAny.outdoorSeating ?? null,
          enrichment_tier: "enriched",
          last_enriched_at: new Date().toISOString(),
        };

        if (placeAny.generativeSummary?.overview?.text) {
          v1Place.generative_summary = { overview: { text: placeAny.generativeSummary.overview.text } };
        } else if (typeof placeAny.generativeSummary === "string") {
          v1Place.generative_summary = { overview: { text: placeAny.generativeSummary } };
        }

        if (placeAny.neighborhoodSummary?.overview?.text) {
          v1Place.neighborhood_summary = { overview: { text: placeAny.neighborhoodSummary.overview.text } };
        } else if (typeof placeAny.neighborhoodSummary === "string") {
          v1Place.neighborhood_summary = { overview: { text: placeAny.neighborhoodSummary } };
        }

        if (placeAny.editorialSummary?.overview?.text) {
          v1Place.editorial_summary = { overview: { text: placeAny.editorialSummary.overview.text } };
        } else if (typeof placeAny.editorialSummary === "string") {
          v1Place.editorial_summary = { overview: { text: placeAny.editorialSummary } };
        }

        if (placeAny.parkingOptions) {
          v1Place.parking_options = placeAny.parkingOptions;
          v1Place.has_ev_charging = placeAny.parkingOptions.hasEvChargingStations ?? null;
        }

        if (placeAny.accessibilityOptions) {
          v1Place.accessibility_flags = placeAny.accessibilityOptions;
        }

        if (placeAny.regularOpeningHours) {
          v1Place.opening_hours = placeAny.regularOpeningHours;
        }

        if (placeAny.reviews) {
          v1Place.reviews = placeAny.reviews;
        }

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

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveSuggestionIndex((prev) => 
        prev < suggestions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveSuggestionIndex((prev) => 
        prev > 0 ? prev - 1 : suggestions.length - 1
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeSuggestionIndex >= 0 && activeSuggestionIndex < suggestions.length) {
        handleSelectSuggestion(suggestions[activeSuggestionIndex]);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

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
          className="pr-10 pl-9 h-9 w-full rounded-md border border-input bg-background text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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

      {isOpen && suggestions.length > 0 && (
        <div 
          className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none animate-in fade-in-0 zoom-in-95 duration-100"
          data-testid="place-autocomplete-results"
        >
          {suggestions.map((suggestion, index) => {
            const prediction = suggestion.placePrediction;
            if (!prediction) return null;
            
            const isSelected = index === activeSuggestionIndex;
            const primaryText = prediction.mainText?.text || "";
            const secondaryText = prediction.secondaryText?.text || "";

            return (
              <button
                key={prediction.toPlace().id || index}
                type="button"
                onClick={() => handleSelectSuggestion(suggestion)}
                className={`w-full text-left px-3 py-2 rounded-sm text-sm transition-colors flex flex-col gap-0.5 ${
                  isSelected 
                    ? "bg-accent text-accent-foreground" 
                    : "hover:bg-muted/70 text-foreground"
                }`}
                data-testid={`autocomplete-option-${index}`}
              >
                <span className="font-medium text-foreground">{primaryText}</span>
                {secondaryText && (
                  <span className="text-xs text-muted-foreground">{secondaryText}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
