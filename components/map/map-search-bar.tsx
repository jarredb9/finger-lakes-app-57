import { FormEvent } from "react";
import { Winery } from "@/lib/types";

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
  className?: string;
}

export function MapSearchBar(_props: MapSearchBarProps) {
  return null;
}
