export interface PlaceAutocompleteSuggestionsListProps {
  suggestions: google.maps.places.AutocompleteSuggestion[];
  isOpen: boolean;
  activeIndex: number;
  onSelectSuggestion: (suggestion: google.maps.places.AutocompleteSuggestion) => void;
  className?: string;
}

export function PlaceAutocompleteSuggestionsList(
  _props: PlaceAutocompleteSuggestionsListProps
) {
  return null;
}
