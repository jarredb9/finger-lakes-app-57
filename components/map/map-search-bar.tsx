"use client";

import { FormEvent } from "react";
import { Search, Loader2, MapPin, AlertTriangle, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { PlaceAutocomplete } from "@/components/PlaceAutocomplete";
import { Winery } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface MapSearchBarProps {
  searchLocation?: string;
  setSearchLocation?: (value: string) => void;
  isSearching?: boolean;
  handleSearchSubmit?: (e: FormEvent) => void;
  handleManualSearchArea?: () => void;
  autoSearch?: boolean;
  setAutoSearch?: (value: boolean) => void;
  hitApiLimit?: boolean;
  handlePlaceSelect?: (winery: Winery, sdkPlace: google.maps.places.Place) => void;
  onClearSearch?: () => void;
  placeholder?: string;
  className?: string;
}

export function MapSearchBar({
  searchLocation = "",
  setSearchLocation,
  isSearching = false,
  handleSearchSubmit,
  handleManualSearchArea,
  autoSearch = false,
  setAutoSearch,
  hitApiLimit = false,
  handlePlaceSelect,
  onClearSearch,
  placeholder = "City or region...",
  className,
}: MapSearchBarProps) {
  const handleClear = () => {
    if (onClearSearch) {
      onClearSearch();
    } else if (setSearchLocation) {
      setSearchLocation("");
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      {/* Main Search Input: Autocomplete or Fallback Form */}
      {handlePlaceSelect ? (
        <PlaceAutocomplete
          placeholder={placeholder || "Search city, region, or winery..."}
          onPlaceSelect={handlePlaceSelect}
          className="w-full"
        />
      ) : (
        <form onSubmit={handleSearchSubmit} className="flex gap-2 relative">
          <div className="relative flex-1">
            <Input
              placeholder={placeholder}
              value={searchLocation}
              onChange={(e) => setSearchLocation?.(e.target.value)}
              className={cn("w-full min-h-[44px] px-3 py-2 text-sm", searchLocation ? "pr-9" : "")}
              aria-label="Search location"
            />
            {searchLocation && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClear}
                className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
          <Button
            type="submit"
            size="icon"
            className="min-h-[44px] min-w-[44px] h-11 w-11 shrink-0"
            disabled={isSearching}
            aria-label="Submit search"
          >
            {isSearching ? <Loader2 className="animate-spin w-4 h-4" /> : <Search className="w-4 h-4" />}
          </Button>
        </form>
      )}

      {/* Manual Area Search & Auto Search Toggle */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleManualSearchArea}
          disabled={isSearching}
          className="flex-1 min-h-[44px] px-3 py-2 text-xs"
        >
          <MapPin className="mr-2 w-3.5 h-3.5" /> Search This Area
        </Button>
        <div className="flex items-center gap-2 px-3 bg-muted/50 rounded-md border min-h-[44px]">
          <Switch
            id="auto-search"
            checked={autoSearch}
            onCheckedChange={setAutoSearch}
            className="scale-75"
            aria-label="Auto search"
          />
          <Label htmlFor="auto-search" className="text-[10px] font-medium cursor-pointer uppercase text-muted-foreground">
            Auto
          </Label>
        </div>
      </div>

      {/* API Limit Warning Alert */}
      {hitApiLimit && (
        <div
          role="alert"
          className="flex items-center gap-3 w-full rounded-lg border px-4 bg-yellow-50 border-yellow-200 text-yellow-800 py-2"
        >
          <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0" />
          <span className="text-xs leading-relaxed">Zoom in to see more results.</span>
        </div>
      )}
    </div>
  );
}
