import { GoogleAttribution } from "./GoogleAttribution";

export interface PlaceAutocompleteSuggestionsListProps {
  suggestions: google.maps.places.AutocompleteSuggestion[];
  isOpen: boolean;
  activeIndex: number;
  onSelectSuggestion: (suggestion: google.maps.places.AutocompleteSuggestion) => void;
  className?: string;
}

export function PlaceAutocompleteSuggestionsList({
  suggestions,
  isOpen,
  activeIndex,
  onSelectSuggestion,
  className = "",
}: PlaceAutocompleteSuggestionsListProps) {
  if (!isOpen || suggestions.length === 0) {
    return null;
  }

  return (
    <div
      className={`absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none animate-in fade-in-0 zoom-in-95 duration-100 ${className}`}
      data-testid="place-autocomplete-results"
    >
      {suggestions.map((suggestion, index) => {
        const prediction = suggestion.placePrediction;
        if (!prediction) return null;

        const isSelected = index === activeIndex;
        const primaryText = prediction.mainText?.text || "";
        const secondaryText = prediction.secondaryText?.text || "";

        return (
          <button
            key={prediction.toPlace().id || index}
            type="button"
            onClick={() => onSelectSuggestion(suggestion)}
            className={`w-full text-left px-3 py-2 rounded-sm text-sm transition-colors flex flex-col gap-0.5 ${
              isSelected
                ? "bg-accent text-accent-foreground"
                : "hover:bg-muted/70 text-foreground"
            }`}
            data-testid={`autocomplete-option-${index}`}
          >
            <span className="font-medium text-foreground">{primaryText}</span>
            {secondaryText && (
              <span className="text-xs text-muted-foreground">
                {secondaryText}
              </span>
            )}
          </button>
        );
      })}
      <div className="px-3 py-1.5 border-t mt-1 bg-muted/20">
        <GoogleAttribution variant="powered-by" />
      </div>
    </div>
  );
}
