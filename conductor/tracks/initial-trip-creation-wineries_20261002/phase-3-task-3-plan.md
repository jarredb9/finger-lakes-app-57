# Implementation Plan: Phase 3 Task 3 - Refactor & Scaffolding Cleanup

**Track:** `initial-trip-creation-wineries_20261002` (Issue [#57](https://github.com/jarredb9/finger-lakes-app-57/issues/57))  
**Phase:** 3 (PlaceAutocomplete Selection UX & Re-Query Suppression)  
**Task:** 3 (Refactor & Scaffolding Cleanup)  
**Specification Reference:** [spec.md](./spec.md)  
**Track Plan Reference:** [plan.md](./plan.md)  

---

## 1. Objective & Seam-Bounded Architecture

### 1.1 Objective
Execute the Refactor & Scaffolding Cleanup task for Phase 3:
1. **Refactor `PlaceAutocomplete.tsx` for Clean Hook Separation & Accessibility:**
   - Extract place resolution logic (`resolveWineryFromSuggestion`) out of the component body into a pure, testable helper that handles synthetic test winery interception, Places SDK detail fetching, and v1 mapping/standardization.
   - Memoize handlers (`handleSelectSuggestion`, `handleClear`) with `useCallback` to ensure stable references across re-renders and clean integration with `useComboboxKeyboard`.
   - Implement W3C WAI-ARIA 1.2 Combobox accessibility semantics across `components/PlaceAutocomplete.tsx` and `components/PlaceAutocompleteSuggestionsList.tsx`:
     - `<Input>`: `role="combobox"`, `aria-autocomplete="list"`, `aria-expanded={isOpen}`, `aria-haspopup="listbox"`, dynamic `aria-controls`, `aria-activedescendant`, and accessible `aria-label`.
     - `PlaceAutocompleteSuggestionsList`: `role="listbox"`, `aria-label="Location suggestions"`, `id={`${id}-results`}`.
     - Option items: `role="option"`, `id={`${id}-option-${index}`}`, `aria-selected={isSelected}`.
2. **Audit & Clean Up Test Scaffolding Artifacts:**
   - In `components/__tests__/PlaceAutocomplete.test.tsx`, transition the suite title from ephemeral Red-Phase diagnostics (`(Issue #57 Red Phase)`) to durable behavioral specifications (`Invariants`), remove diagnostic `// RED PHASE CHECK:` comments, and add unit test coverage for the new ARIA combobox attributes and keyboard active descendant tracking.
   - In `components/__tests__/trip-form.test.tsx`, transition the suite title and remove ephemeral `// RED PHASE CHECK:` comments.
   - Perform a repository scaffolding audit verifying zero throwaway test files or leftover scratch artifacts exist.
3. **Execution Verification:**
   - Run containerized Jest suites (`./scripts/run-jest-container.sh components/__tests__/PlaceAutocomplete.test.tsx components/__tests__/PlaceAutocompleteSuggestionsList.test.tsx components/__tests__/trip-form.test.tsx components/map/__tests__/map-search-bar.test.tsx`) to verify 100% green status and zero regressions.
4. **Track Plan Updates:**
   - Update `conductor/tracks/initial-trip-creation-wineries_20261002/plan.md` to mark Phase 3 Task 3 complete.

### 1.2 Architectural Context & Seam Boundaries

1. **Resolution Logic vs UI State Seam (`components/PlaceAutocomplete.tsx`):**
   - In un-refactored `PlaceAutocomplete.tsx`, `handleSelectSuggestion` contained 50 lines of imperative procedural logic mixing virtual keyboard dismissal, dynamic store loading for test mocks (`import("@/lib/stores/wineryStore")`), Places SDK detail fetching, Places v1 mapping (`mapSdkPlaceToV1Place`), winery standardizing (`standardizeWineryData`), programmatic input guard management, and try/catch/finally state updates.
   - Extracting `resolveWineryFromSuggestion` as a standalone helper separates async resolution and catalog normalization from React component state management.
   - `handleSelectSuggestion` becomes a concise, readable callback managing UI state transitions (`isFetchingDetails`, `isOpen`, `inputValue`, `onPlaceSelect`).
2. **Combobox Accessibility Standard Seam (`PlaceAutocomplete` + `PlaceAutocompleteSuggestionsList`):**
   - The W3C WAI-ARIA 1.2 Combobox pattern requires the input element to have `role="combobox"` and explicitly control a listbox popup via `aria-controls` and `aria-expanded`.
   - When the user navigates suggestions using ArrowUp/ArrowDown, the focused item must be communicated to assistive technologies via `aria-activedescendant` on the input, pointing to the active option's DOM `id`, while each option button declares `role="option"` and `aria-selected`.
   - Passing `id` to `PlaceAutocompleteSuggestionsList` ensures deterministic DOM IDs for the listbox (`${id}-results`) and options (`${id}-option-${index}`).
3. **Test Scaffolding & Narrative Durability Seam:**
   - During Phase 3 Task 1 (Red Phase), test descriptions and code comments explicitly referenced `(Issue #57 Red Phase)` and `// RED PHASE CHECK:` to document failing expectations prior to implementation.
   - With the implementation verified in Task 2, these ephemeral markers are refactored into permanent behavioral regression invariants.

---

## 2. Invariants & Critical Guardrails

1. **Re-Query Suppression Invariant (Phase 3 Core Bugfix):**
   - The selection guard ref (`isProgrammaticUpdateRef`) must continue to prevent programmatic updates from re-opening the dropdown or firing debounced `fetchSuggestions` calls across the 300ms debounce window.
2. **Backward Compatibility Invariant (`MapSearchBar`):**
   - `clearOnSelect` must continue to default to `false`. When false, the selected winery name is retained in the input without re-opening the dropdown.
3. **Failure Recovery Invariant:**
   - If place details resolution fails, the user's typed search query must remain intact in `inputValue`, and the suggestions dropdown must remain closed.
4. **DOM Contract & Test ID Invariant:**
   - All existing `data-testid` attributes (`place-autocomplete-input`, `place-autocomplete-results`, `autocomplete-option-${index}`) must remain unchanged to ensure zero test regression across unit and E2E suites.
5. **Production Database Safety (`AGENTS.md` Guardrail 1):**
   - Strictly zero database mutations or migrations. This task is purely frontend component refactoring and test scaffolding cleanup.
6. **Modal Approval Invariant (`AGENTS.md` Section 2 & `conductor_antigravity.md`):**
   - The executor must halt and wait for explicit affirmative user approval via modal before modifying any repository files.

---

## 3. Target Files & Exact Drop-in Specifications

### 3.1 Target File: `components/PlaceAutocomplete.tsx`

**File Path:** `components/PlaceAutocomplete.tsx`

#### Chunk 1: Add `useCallback` to Imports and Extract `resolveWineryFromSuggestion`
- **Line Anchor:** Lines 3–23
- **Existing Content:**
```typescript
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
  onPlaceSelect: (winery: Winery, sdkPlace?: google.maps.places.Place | null) => void;
  className?: string;
  includedPrimaryTypes?: string[];
  locationBias?: google.maps.LatLngBounds | google.maps.LatLngBoundsLiteral;
  id?: string;
  clearOnSelect?: boolean;
}

export function PlaceAutocomplete({
```
- **Replacement Content:**
```typescript
import { useState, useEffect, useRef, useCallback } from "react";
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
  onPlaceSelect: (winery: Winery, sdkPlace?: google.maps.places.Place | null) => void;
  className?: string;
  includedPrimaryTypes?: string[];
  locationBias?: google.maps.LatLngBounds | google.maps.LatLngBoundsLiteral;
  id?: string;
  clearOnSelect?: boolean;
}

/**
 * Resolves an autocomplete suggestion to a standardized Winery and optional SDK Place.
 * Handles synthetic test fixtures and external Google Places API details resolution.
 */
async function resolveWineryFromSuggestion(
  suggestion: google.maps.places.AutocompleteSuggestion,
  fetchPlaceDetails: (s: google.maps.places.AutocompleteSuggestion) => Promise<google.maps.places.Place | null>
): Promise<{ winery: Winery; sdkPlace: google.maps.places.Place | null } | null> {
  const placeId = suggestion.placePrediction?.toPlace?.()?.id;
  if (placeId && (placeId.startsWith("test-") || placeId.startsWith("mock-"))) {
    const { useWineryStore } = await import("@/lib/stores/wineryStore");
    const localWinery = useWineryStore.getState().getWinery(placeId);
    if (localWinery) {
      return { winery: localWinery, sdkPlace: null };
    }
  }

  const place = await fetchPlaceDetails(suggestion);
  if (!place) return null;

  const text =
    suggestion.placePrediction?.text?.text ||
    suggestion.placePrediction?.mainText?.text ||
    "";
  const v1Place = mapSdkPlaceToV1Place(place, text);
  const winery = standardizeWineryData(v1Place);
  if (!winery) return null;

  return { winery, sdkPlace: place };
}

export function PlaceAutocomplete({
```

---

#### Chunk 2: Memoize `handleSelectSuggestion` & `handleClear` with `useCallback`
- **Line Anchor:** Lines 75–142
- **Existing Content:**
```typescript
  const handleSelectSuggestion = async (
    suggestion: google.maps.places.AutocompleteSuggestion
  ) => {
    if (!suggestion.placePrediction) return;

    // Dismiss virtual keyboard on suggestion select
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    const text =
      suggestion.placePrediction.text?.text ||
      suggestion.placePrediction.mainText?.text ||
      "";
    setIsOpen(false);
    setIsFetchingDetails(true);

    try {
      const placeId = suggestion.placePrediction.toPlace?.()?.id;
      if (placeId && (placeId.startsWith("test-") || placeId.startsWith("mock-"))) {
        const { useWineryStore } = await import("@/lib/stores/wineryStore");
        const localWinery = useWineryStore.getState().getWinery(placeId);
        if (localWinery) {
          const nextValue = clearOnSelect ? "" : text;
          if (inputValue !== nextValue) {
            isProgrammaticUpdateRef.current = true;
            setInputValue(nextValue);
          }
          onPlaceSelect(localWinery, null);
          return;
        }
      }

      const place = await fetchPlaceDetails(suggestion);
      if (place) {
        const v1Place = mapSdkPlaceToV1Place(place, text);
        const winery = standardizeWineryData(v1Place);
        if (winery) {
          const nextValue = clearOnSelect ? "" : text;
          if (inputValue !== nextValue) {
            isProgrammaticUpdateRef.current = true;
            setInputValue(nextValue);
          }
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
```
- **Replacement Content:**
```typescript
  const handleSelectSuggestion = useCallback(
    async (suggestion: google.maps.places.AutocompleteSuggestion) => {
      if (!suggestion.placePrediction) return;

      // Dismiss virtual keyboard on suggestion select
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      const text =
        suggestion.placePrediction.text?.text ||
        suggestion.placePrediction.mainText?.text ||
        "";
      setIsOpen(false);
      setIsFetchingDetails(true);

      try {
        const resolved = await resolveWineryFromSuggestion(suggestion, fetchPlaceDetails);
        if (resolved) {
          const nextValue = clearOnSelect ? "" : text;
          if (inputValue !== nextValue) {
            isProgrammaticUpdateRef.current = true;
            setInputValue(nextValue);
          }
          onPlaceSelect(resolved.winery, resolved.sdkPlace);
        }
      } catch (error) {
        console.error("[PlaceAutocomplete] Selection failed:", error);
      } finally {
        setIsFetchingDetails(false);
        setSuggestions([]);
      }
    },
    [clearOnSelect, fetchPlaceDetails, inputValue, onPlaceSelect, setSuggestions]
  );

  const { activeIndex, handleKeyDown } = useComboboxKeyboard({
    items: suggestions,
    isOpen,
    onOpenChange: setIsOpen,
    onSelect: handleSelectSuggestion,
    containerRef,
  });

  const handleClear = useCallback(() => {
    setInputValue("");
    setSuggestions([]);
    setIsOpen(false);
  }, [setSuggestions]);
```

---

#### Chunk 3: Add WAI-ARIA 1.2 Combobox Attributes to `<Input>` and Pass `id` to Suggestions List
- **Line Anchor:** Lines 145–186
- **Existing Content:**
```tsx
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
```
- **Replacement Content:**
```tsx
  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      <div className="relative flex items-center">
        <Input
          id={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-controls={isOpen && suggestions.length > 0 ? `${id}-results` : undefined}
          aria-activedescendant={
            isOpen && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined
          }
          aria-label={placeholder}
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
        id={id}
        suggestions={suggestions}
        isOpen={isOpen}
        activeIndex={activeIndex}
        onSelectSuggestion={handleSelectSuggestion}
      />
    </div>
  );
```

---

### 3.2 Target File: `components/PlaceAutocompleteSuggestionsList.tsx`

**File Path:** `components/PlaceAutocompleteSuggestionsList.tsx`

#### Chunk 1: Add `id` to Props and ARIA Listbox/Option Semantics
- **Line Anchor:** Lines 3–47
- **Existing Content:**
```typescript
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
```
- **Replacement Content:**
```typescript
export interface PlaceAutocompleteSuggestionsListProps {
  suggestions: google.maps.places.AutocompleteSuggestion[];
  isOpen: boolean;
  activeIndex: number;
  onSelectSuggestion: (suggestion: google.maps.places.AutocompleteSuggestion) => void;
  className?: string;
  id?: string;
}

export function PlaceAutocompleteSuggestionsList({
  suggestions,
  isOpen,
  activeIndex,
  onSelectSuggestion,
  className = "",
  id = "place-autocomplete",
}: PlaceAutocompleteSuggestionsListProps) {
  if (!isOpen || suggestions.length === 0) {
    return null;
  }

  return (
    <div
      id={`${id}-results`}
      role="listbox"
      aria-label="Location suggestions"
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
            id={`${id}-option-${index}`}
            role="option"
            aria-selected={isSelected}
            type="button"
            onClick={() => onSelectSuggestion(suggestion)}
            className={`w-full text-left px-3 py-2 rounded-sm text-sm transition-colors flex flex-col gap-0.5 ${
              isSelected
                ? "bg-accent text-accent-foreground"
                : "hover:bg-muted/70 text-foreground"
            }`}
            data-testid={`autocomplete-option-${index}`}
          >
```

---

### 3.3 Target File: `components/__tests__/PlaceAutocomplete.test.tsx`

**File Path:** `components/__tests__/PlaceAutocomplete.test.tsx`

#### Chunk 1: Transition Suite Title, Remove Red Phase Diagnostics & Add Accessibility Suite
- **Line Anchor:** Lines 240–513
- **Existing Content:**
```typescript
  describe("PlaceAutocomplete clearOnSelect & Re-Query Suppression (Issue #57 Red Phase)", () => {
    it("clears inputValue upon successful suggestion selection when clearOnSelect is true", async () => {
      const mockSdkPlace = {
        id: "place-1",
        displayName: "Mock Winery",
        formattedAddress: "123 mock address",
        location: {
          lat: () => 42.5,
          lng: () => -76.8,
        },
      };

      const mockSuggestions = [
        {
          placePrediction: {
            toPlace: () => mockSdkPlace,
            text: { text: "Mock Winery" },
            mainText: { text: "Mock Winery" },
            secondaryText: { text: "123 mock address" },
          },
        },
      ];

      const mockWineryObj = {
        id: "place-1",
        name: "Mock Winery",
        address: "123 mock address",
        latitude: 42.5,
        longitude: -76.8,
      };

      (usePlacesAutocompleteSession as jest.Mock).mockReturnValue({
        suggestions: mockSuggestions,
        isLoading: false,
        fetchSuggestions: mockFetchSuggestions,
        fetchPlaceDetails: mockFetchPlaceDetails.mockResolvedValue(mockSdkPlace),
        setSuggestions: mockSetSuggestions,
        refreshSessionToken: jest.fn(),
      });

      (standardizeWineryData as jest.Mock).mockReturnValue(mockWineryObj);

      render(
        <PlaceAutocomplete
          onPlaceSelect={mockOnPlaceSelect}
          {...({ clearOnSelect: true } as any)}
        />
      );

      const input = screen.getByTestId("place-autocomplete-input");
      fireEvent.change(input, { target: { value: "mock winery" } });

      await waitFor(() => {
        expect(screen.getByTestId("place-autocomplete-results")).toBeVisible();
      });

      const suggestionBtn = screen.getByTestId("autocomplete-option-0");
      fireEvent.click(suggestionBtn);

      await waitFor(() => {
        expect(mockOnPlaceSelect).toHaveBeenCalledWith(mockWineryObj, mockSdkPlace);
      });

      // RED PHASE CHECK: In current PlaceAutocomplete, handleSelectSuggestion calls setInputValue(text)
      // without checking clearOnSelect, so the input retains "Mock Winery".
      // Target behavior clears inputValue to "" on successful selection when clearOnSelect={true}.
      expect(input).toHaveValue("");
    });

    it("does not trigger debounced fetchSuggestions or re-open the dropdown upon programmatic selection value updates", async () => {
      const mockSdkPlace = {
        id: "place-1",
        displayName: "Mock Winery",
        formattedAddress: "123 mock address",
        location: {
          lat: () => 42.5,
          lng: () => -76.8,
        },
      };

      const mockSuggestions = [
        {
          placePrediction: {
            toPlace: () => mockSdkPlace,
            text: { text: "Mock Winery" },
            mainText: { text: "Mock Winery" },
            secondaryText: { text: "123 mock address" },
          },
        },
      ];

      (usePlacesAutocompleteSession as jest.Mock).mockReturnValue({
        suggestions: mockSuggestions,
        isLoading: false,
        fetchSuggestions: mockFetchSuggestions,
        fetchPlaceDetails: mockFetchPlaceDetails.mockResolvedValue(mockSdkPlace),
        setSuggestions: mockSetSuggestions,
        refreshSessionToken: jest.fn(),
      });

      (standardizeWineryData as jest.Mock).mockReturnValue({
        id: "place-1",
        name: "Mock Winery",
        address: "123 mock address",
        latitude: 42.5,
        longitude: -76.8,
      });

      render(<PlaceAutocomplete onPlaceSelect={mockOnPlaceSelect} />);

      const input = screen.getByTestId("place-autocomplete-input");
      fireEvent.change(input, { target: { value: "mock winery" } });

      await waitFor(() => {
        expect(screen.getByTestId("place-autocomplete-results")).toBeVisible();
      });

      // Clear mock calls from initial typing
      mockFetchSuggestions.mockClear();

      const suggestionBtn = screen.getByTestId("autocomplete-option-0");
      fireEvent.click(suggestionBtn);

      await waitFor(() => {
        expect(mockOnPlaceSelect).toHaveBeenCalled();
      });

      // Wait past the 300ms debounce interval to verify programmatic updates do not re-trigger fetchSuggestions
      await new Promise((resolve) => setTimeout(resolve, 350));

      // RED PHASE CHECK: In current PlaceAutocomplete, setInputValue(text) triggers the debounce useEffect,
      // which invokes fetchSuggestions("Mock Winery", ...) and sets isOpen=true after 300ms.
      // Target behavior uses an internal guard ref to suppress debounced re-queries on programmatic selection.
      expect(mockFetchSuggestions).not.toHaveBeenCalled();
      expect(screen.queryByTestId("place-autocomplete-results")).not.toBeInTheDocument();
    });

    it("retains the typed search string and keeps dropdown closed when place details resolution fails", async () => {
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      const mockSuggestions = [
        {
          placePrediction: {
            toPlace: () => ({ id: "place-fail" }),
            text: { text: "Failing Winery Prediction Full Name" },
            mainText: { text: "Failing Winery" },
            secondaryText: { text: "999 Error Rd" },
          },
        },
      ];

      (usePlacesAutocompleteSession as jest.Mock).mockReturnValue({
        suggestions: mockSuggestions,
        isLoading: false,
        fetchSuggestions: mockFetchSuggestions,
        fetchPlaceDetails: mockFetchPlaceDetails.mockRejectedValue(
          new Error("Places API fetch failure")
        ),
        setSuggestions: mockSetSuggestions,
        refreshSessionToken: jest.fn(),
      });

      render(
        <PlaceAutocomplete
          onPlaceSelect={mockOnPlaceSelect}
          {...({ clearOnSelect: true } as any)}
        />
      );

      const input = screen.getByTestId("place-autocomplete-input");
      fireEvent.change(input, { target: { value: "Keuka Spring" } });

      await waitFor(() => {
        expect(screen.getByTestId("place-autocomplete-results")).toBeVisible();
      });

      const suggestionBtn = screen.getByTestId("autocomplete-option-0");
      fireEvent.click(suggestionBtn);

      await waitFor(() => {
        expect(mockFetchPlaceDetails).toHaveBeenCalled();
      });

      // Wait past debounce interval
      await new Promise((resolve) => setTimeout(resolve, 350));

      // RED PHASE CHECK: In current PlaceAutocomplete, setInputValue(text) overwrites the input with prediction text
      // before details are fetched. On failure, the input retains prediction text instead of what the user typed.
      // Target behavior retains the user's typed search query ("Keuka Spring") and keeps dropdown closed.
      expect(mockOnPlaceSelect).not.toHaveBeenCalled();
      expect(input).toHaveValue("Keuka Spring");
      expect(screen.queryByTestId("place-autocomplete-results")).not.toBeInTheDocument();

      consoleErrorSpy.mockRestore();
    });

    it("retains the selected place text and keeps dropdown closed when clearOnSelect is false (MapSearchBar regression)", async () => {
      const mockSdkPlace = {
        id: "place-map-1",
        displayName: "Dr. Konstantin Frank",
        formattedAddress: "9749 Middle Rd, Hammondsport, NY",
        location: {
          lat: () => 42.55,
          lng: () => -77.18,
        },
      };

      const mockSuggestions = [
        {
          placePrediction: {
            toPlace: () => mockSdkPlace,
            text: { text: "Dr. Konstantin Frank Winery" },
            mainText: { text: "Dr. Konstantin Frank" },
            secondaryText: { text: "9749 Middle Rd, Hammondsport, NY" },
          },
        },
      ];

      const mockWineryObj = {
        id: "place-map-1",
        name: "Dr. Konstantin Frank Winery",
        address: "9749 Middle Rd, Hammondsport, NY",
        latitude: 42.55,
        longitude: -77.18,
      };

      (usePlacesAutocompleteSession as jest.Mock).mockReturnValue({
        suggestions: mockSuggestions,
        isLoading: false,
        fetchSuggestions: mockFetchSuggestions,
        fetchPlaceDetails: mockFetchPlaceDetails.mockResolvedValue(mockSdkPlace),
        setSuggestions: mockSetSuggestions,
        refreshSessionToken: jest.fn(),
      });

      (standardizeWineryData as jest.Mock).mockReturnValue(mockWineryObj);

      render(
        <PlaceAutocomplete
          onPlaceSelect={mockOnPlaceSelect}
          {...({ clearOnSelect: false } as any)}
        />
      );

      const input = screen.getByTestId("place-autocomplete-input");
      fireEvent.change(input, { target: { value: "Frank" } });

      await waitFor(() => {
        expect(screen.getByTestId("place-autocomplete-results")).toBeVisible();
      });

      mockFetchSuggestions.mockClear();

      const suggestionBtn = screen.getByTestId("autocomplete-option-0");
      fireEvent.click(suggestionBtn);

      await waitFor(() => {
        expect(mockOnPlaceSelect).toHaveBeenCalledWith(mockWineryObj, mockSdkPlace);
      });

      // Input must retain the selected place name
      expect(input).toHaveValue("Dr. Konstantin Frank Winery");

      // Wait past debounce interval
      await new Promise((resolve) => setTimeout(resolve, 350));

      // RED PHASE CHECK: In current PlaceAutocomplete, setting the input value to the selected name triggers
      // a re-query after 300ms. Target behavior suppresses re-querying when clearOnSelect is false.
      expect(mockFetchSuggestions).not.toHaveBeenCalled();
      expect(screen.queryByTestId("place-autocomplete-results")).not.toBeInTheDocument();
    });
  });
});
```
- **Replacement Content:**
```typescript
  describe("PlaceAutocomplete clearOnSelect & Re-Query Suppression Invariants", () => {
    it("clears inputValue upon successful suggestion selection when clearOnSelect is true", async () => {
      const mockSdkPlace = {
        id: "place-1",
        displayName: "Mock Winery",
        formattedAddress: "123 mock address",
        location: {
          lat: () => 42.5,
          lng: () => -76.8,
        },
      };

      const mockSuggestions = [
        {
          placePrediction: {
            toPlace: () => mockSdkPlace,
            text: { text: "Mock Winery" },
            mainText: { text: "Mock Winery" },
            secondaryText: { text: "123 mock address" },
          },
        },
      ];

      const mockWineryObj = {
        id: "place-1",
        name: "Mock Winery",
        address: "123 mock address",
        latitude: 42.5,
        longitude: -76.8,
      };

      (usePlacesAutocompleteSession as jest.Mock).mockReturnValue({
        suggestions: mockSuggestions,
        isLoading: false,
        fetchSuggestions: mockFetchSuggestions,
        fetchPlaceDetails: mockFetchPlaceDetails.mockResolvedValue(mockSdkPlace),
        setSuggestions: mockSetSuggestions,
        refreshSessionToken: jest.fn(),
      });

      (standardizeWineryData as jest.Mock).mockReturnValue(mockWineryObj);

      render(
        <PlaceAutocomplete
          onPlaceSelect={mockOnPlaceSelect}
          clearOnSelect={true}
        />
      );

      const input = screen.getByTestId("place-autocomplete-input");
      fireEvent.change(input, { target: { value: "mock winery" } });

      await waitFor(() => {
        expect(screen.getByTestId("place-autocomplete-results")).toBeVisible();
      });

      const suggestionBtn = screen.getByTestId("autocomplete-option-0");
      fireEvent.click(suggestionBtn);

      await waitFor(() => {
        expect(mockOnPlaceSelect).toHaveBeenCalledWith(mockWineryObj, mockSdkPlace);
      });

      expect(input).toHaveValue("");
    });

    it("does not trigger debounced fetchSuggestions or re-open the dropdown upon programmatic selection value updates", async () => {
      const mockSdkPlace = {
        id: "place-1",
        displayName: "Mock Winery",
        formattedAddress: "123 mock address",
        location: {
          lat: () => 42.5,
          lng: () => -76.8,
        },
      };

      const mockSuggestions = [
        {
          placePrediction: {
            toPlace: () => mockSdkPlace,
            text: { text: "Mock Winery" },
            mainText: { text: "Mock Winery" },
            secondaryText: { text: "123 mock address" },
          },
        },
      ];

      (usePlacesAutocompleteSession as jest.Mock).mockReturnValue({
        suggestions: mockSuggestions,
        isLoading: false,
        fetchSuggestions: mockFetchSuggestions,
        fetchPlaceDetails: mockFetchPlaceDetails.mockResolvedValue(mockSdkPlace),
        setSuggestions: mockSetSuggestions,
        refreshSessionToken: jest.fn(),
      });

      (standardizeWineryData as jest.Mock).mockReturnValue({
        id: "place-1",
        name: "Mock Winery",
        address: "123 mock address",
        latitude: 42.5,
        longitude: -76.8,
      });

      render(<PlaceAutocomplete onPlaceSelect={mockOnPlaceSelect} />);

      const input = screen.getByTestId("place-autocomplete-input");
      fireEvent.change(input, { target: { value: "mock winery" } });

      await waitFor(() => {
        expect(screen.getByTestId("place-autocomplete-results")).toBeVisible();
      });

      mockFetchSuggestions.mockClear();

      const suggestionBtn = screen.getByTestId("autocomplete-option-0");
      fireEvent.click(suggestionBtn);

      await waitFor(() => {
        expect(mockOnPlaceSelect).toHaveBeenCalled();
      });

      await new Promise((resolve) => setTimeout(resolve, 350));

      expect(mockFetchSuggestions).not.toHaveBeenCalled();
      expect(screen.queryByTestId("place-autocomplete-results")).not.toBeInTheDocument();
    });

    it("retains the typed search string and keeps dropdown closed when place details resolution fails", async () => {
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      const mockSuggestions = [
        {
          placePrediction: {
            toPlace: () => ({ id: "place-fail" }),
            text: { text: "Failing Winery Prediction Full Name" },
            mainText: { text: "Failing Winery" },
            secondaryText: { text: "999 Error Rd" },
          },
        },
      ];

      (usePlacesAutocompleteSession as jest.Mock).mockReturnValue({
        suggestions: mockSuggestions,
        isLoading: false,
        fetchSuggestions: mockFetchSuggestions,
        fetchPlaceDetails: mockFetchPlaceDetails.mockRejectedValue(
          new Error("Places API fetch failure")
        ),
        setSuggestions: mockSetSuggestions,
        refreshSessionToken: jest.fn(),
      });

      render(
        <PlaceAutocomplete
          onPlaceSelect={mockOnPlaceSelect}
          clearOnSelect={true}
        />
      );

      const input = screen.getByTestId("place-autocomplete-input");
      fireEvent.change(input, { target: { value: "Keuka Spring" } });

      await waitFor(() => {
        expect(screen.getByTestId("place-autocomplete-results")).toBeVisible();
      });

      const suggestionBtn = screen.getByTestId("autocomplete-option-0");
      fireEvent.click(suggestionBtn);

      await waitFor(() => {
        expect(mockFetchPlaceDetails).toHaveBeenCalled();
      });

      await new Promise((resolve) => setTimeout(resolve, 350));

      expect(mockOnPlaceSelect).not.toHaveBeenCalled();
      expect(input).toHaveValue("Keuka Spring");
      expect(screen.queryByTestId("place-autocomplete-results")).not.toBeInTheDocument();

      consoleErrorSpy.mockRestore();
    });

    it("retains the selected place text and keeps dropdown closed when clearOnSelect is false (MapSearchBar regression)", async () => {
      const mockSdkPlace = {
        id: "place-map-1",
        displayName: "Dr. Konstantin Frank",
        formattedAddress: "9749 Middle Rd, Hammondsport, NY",
        location: {
          lat: () => 42.55,
          lng: () => -77.18,
        },
      };

      const mockSuggestions = [
        {
          placePrediction: {
            toPlace: () => mockSdkPlace,
            text: { text: "Dr. Konstantin Frank Winery" },
            mainText: { text: "Dr. Konstantin Frank" },
            secondaryText: { text: "9749 Middle Rd, Hammondsport, NY" },
          },
        },
      ];

      const mockWineryObj = {
        id: "place-map-1",
        name: "Dr. Konstantin Frank Winery",
        address: "9749 Middle Rd, Hammondsport, NY",
        latitude: 42.55,
        longitude: -77.18,
      };

      (usePlacesAutocompleteSession as jest.Mock).mockReturnValue({
        suggestions: mockSuggestions,
        isLoading: false,
        fetchSuggestions: mockFetchSuggestions,
        fetchPlaceDetails: mockFetchPlaceDetails.mockResolvedValue(mockSdkPlace),
        setSuggestions: mockSetSuggestions,
        refreshSessionToken: jest.fn(),
      });

      (standardizeWineryData as jest.Mock).mockReturnValue(mockWineryObj);

      render(
        <PlaceAutocomplete
          onPlaceSelect={mockOnPlaceSelect}
          clearOnSelect={false}
        />
      );

      const input = screen.getByTestId("place-autocomplete-input");
      fireEvent.change(input, { target: { value: "Frank" } });

      await waitFor(() => {
        expect(screen.getByTestId("place-autocomplete-results")).toBeVisible();
      });

      mockFetchSuggestions.mockClear();

      const suggestionBtn = screen.getByTestId("autocomplete-option-0");
      fireEvent.click(suggestionBtn);

      await waitFor(() => {
        expect(mockOnPlaceSelect).toHaveBeenCalledWith(mockWineryObj, mockSdkPlace);
      });

      expect(input).toHaveValue("Dr. Konstantin Frank Winery");

      await new Promise((resolve) => setTimeout(resolve, 350));

      expect(mockFetchSuggestions).not.toHaveBeenCalled();
      expect(screen.queryByTestId("place-autocomplete-results")).not.toBeInTheDocument();
    });
  });

  describe("Accessibility & WAI-ARIA Combobox Attributes", () => {
    it("renders combobox attributes and controls suggestions listbox with option selection", async () => {
      const mockSdkPlace = {
        id: "place-aria-1",
        displayName: "Wagner Vineyards",
        formattedAddress: "9322 NY-414, Lodi, NY",
        location: { lat: () => 42.6, lng: () => -76.9 },
      };

      const mockSuggestions = [
        {
          placePrediction: {
            toPlace: () => mockSdkPlace,
            text: { text: "Wagner Vineyards" },
            mainText: { text: "Wagner Vineyards" },
            secondaryText: { text: "9322 NY-414, Lodi, NY" },
          },
        },
      ];

      (usePlacesAutocompleteSession as jest.Mock).mockReturnValue({
        suggestions: mockSuggestions,
        isLoading: false,
        fetchSuggestions: mockFetchSuggestions,
        fetchPlaceDetails: mockFetchPlaceDetails.mockResolvedValue(mockSdkPlace),
        setSuggestions: mockSetSuggestions,
        refreshSessionToken: jest.fn(),
      });

      render(<PlaceAutocomplete onPlaceSelect={mockOnPlaceSelect} id="custom-autocomplete" />);

      const input = screen.getByTestId("place-autocomplete-input");
      expect(input).toHaveAttribute("role", "combobox");
      expect(input).toHaveAttribute("aria-autocomplete", "list");
      expect(input).toHaveAttribute("aria-expanded", "false");
      expect(input).toHaveAttribute("aria-haspopup", "listbox");
      expect(input).not.toHaveAttribute("aria-controls");

      // Open autocomplete dropdown
      fireEvent.change(input, { target: { value: "Wagner" } });

      await waitFor(() => {
        expect(screen.getByTestId("place-autocomplete-results")).toBeVisible();
      });

      expect(input).toHaveAttribute("aria-expanded", "true");
      expect(input).toHaveAttribute("aria-controls", "custom-autocomplete-results");

      const resultsList = screen.getByTestId("place-autocomplete-results");
      expect(resultsList).toHaveAttribute("role", "listbox");
      expect(resultsList).toHaveAttribute("id", "custom-autocomplete-results");
      expect(resultsList).toHaveAttribute("aria-label", "Location suggestions");

      const option0 = screen.getByTestId("autocomplete-option-0");
      expect(option0).toHaveAttribute("role", "option");
      expect(option0).toHaveAttribute("id", "custom-autocomplete-option-0");
      expect(option0).toHaveAttribute("aria-selected", "false");

      // Navigate down via keyboard
      fireEvent.keyDown(input, { key: "ArrowDown" });

      expect(input).toHaveAttribute("aria-activedescendant", "custom-autocomplete-option-0");
      expect(option0).toHaveAttribute("aria-selected", "true");
    });
  });
});
```

---

### 3.4 Target File: `components/__tests__/trip-form.test.tsx`

**File Path:** `components/__tests__/trip-form.test.tsx`

#### Chunk 1: Transition Suite Title & Remove Red Phase Comments
- **Line Anchor:** Lines 229–250
- **Existing Content:**
```typescript
  describe('PlaceAutocomplete clearOnSelect UX in TripForm (Red Phase Assertions)', () => {
    it('configures PlaceAutocomplete with clearOnSelect={true} and clears search input on winery selection', async () => {
      render(<TripForm user={mockUser} initialDate={new Date('2026-10-15T12:00:00')} />);

      const autocompleteContainer = screen.getByTestId('mock-place-autocomplete-container');
      // RED PHASE CHECK: In current TripForm, PlaceAutocomplete is rendered without clearOnSelect prop.
      // Target behavior passes clearOnSelect={true}.
      expect(autocompleteContainer).toHaveAttribute('data-clear-on-select', 'true');

      const input = screen.getByTestId('place-autocomplete-input');
      fireEvent.change(input, { target: { value: 'Keuka' } });
      expect(input).toHaveValue('Keuka');

      const winerySelectButton = screen.getByTestId('trip-form-winery-autocomplete');
      fireEvent.click(winerySelectButton);

      expect(screen.getByTestId('selected-winery-google-place-winery-123')).toBeInTheDocument();
      // RED PHASE CHECK: Because clearOnSelect is undefined in current TripForm, the input is not cleared.
      expect(input).toHaveValue('');
    });
  });
```
- **Replacement Content:**
```typescript
  describe('PlaceAutocomplete clearOnSelect UX in TripForm', () => {
    it('configures PlaceAutocomplete with clearOnSelect={true} and clears search input on winery selection', async () => {
      render(<TripForm user={mockUser} initialDate={new Date('2026-10-15T12:00:00')} />);

      const autocompleteContainer = screen.getByTestId('mock-place-autocomplete-container');
      expect(autocompleteContainer).toHaveAttribute('data-clear-on-select', 'true');

      const input = screen.getByTestId('place-autocomplete-input');
      fireEvent.change(input, { target: { value: 'Keuka' } });
      expect(input).toHaveValue('Keuka');

      const winerySelectButton = screen.getByTestId('trip-form-winery-autocomplete');
      fireEvent.click(winerySelectButton);

      expect(screen.getByTestId('selected-winery-google-place-winery-123')).toBeInTheDocument();
      expect(input).toHaveValue('');
    });
  });
```

---

### 3.5 Target File: `conductor/tracks/initial-trip-creation-wineries_20261002/plan.md`

**File Path:** `conductor/tracks/initial-trip-creation-wineries_20261002/plan.md`

#### Line Anchor Context:
Lines 52–54 in `conductor/tracks/initial-trip-creation-wineries_20261002/plan.md`:
```markdown
- [ ] Task: Refactor & Scaffolding Cleanup
    - [ ] Refactor `PlaceAutocomplete.tsx` for clean hook separation and accessibility.
    - [ ] Perform scaffolding audit: ensure zero temporary or throwaway test files exist.
```

#### Exact Drop-in Code Chunk:
```markdown
- [x] Task: Refactor & Scaffolding Cleanup [commit: <commit_sha>]
    - [x] Refactor `PlaceAutocomplete.tsx` for clean hook separation and accessibility.
    - [x] Perform scaffolding audit: ensure zero temporary or throwaway test files exist.
```

---

## 4. Execution Verification Protocol

### 4.1 Prerequisites & Sandbox Requirements
Per repository operating rules in `AGENTS.md`:
- Jest tests must be executed via the container runner (`BypassSandbox: true`) because RHEL 8 glibc 2.28 is incompatible with Next.js 16 native SWC.

### 4.2 Exact Verification Commands

1. **Targeted Unit & Regression Test Verification:**
   ```bash
   ./scripts/run-jest-container.sh components/__tests__/PlaceAutocomplete.test.tsx components/__tests__/PlaceAutocompleteSuggestionsList.test.tsx components/__tests__/trip-form.test.tsx components/map/__tests__/map-search-bar.test.tsx
   ```
   **Expected Outcome:**
   - `components/__tests__/PlaceAutocomplete.test.tsx`: All 10 tests pass (5 original tests + 4 Phase 3 invariant tests + 1 accessibility test).
   - `components/__tests__/PlaceAutocompleteSuggestionsList.test.tsx`: All 5 tests pass.
   - `components/__tests__/trip-form.test.tsx`: All 7 tests pass.
   - `components/map/__tests__/map-search-bar.test.tsx`: All 8 tests pass.
   - Total: 30 passing tests. Zero test failures, zero regressions.

2. **Scaffolding Audit Verification:**
   ```bash
   git status --ignored
   ```
   **Expected Outcome:**
   - Zero untracked or leftover temporary test files in `components/__tests__/` or repository root.

---

## 5. Next Steps & Quality Gate

1. **User Approval Gate:**
   - Halt for explicit affirmative user approval via modal before modifying any files.
2. **Execute Refactoring & Test Updates:**
   - Apply Chunks 1, 2, and 3 to `components/PlaceAutocomplete.tsx`.
   - Apply Chunk 1 to `components/PlaceAutocompleteSuggestionsList.tsx`.
   - Apply Chunk 1 to `components/__tests__/PlaceAutocomplete.test.tsx`.
   - Apply Chunk 1 to `components/__tests__/trip-form.test.tsx`.
3. **Execute Verification:**
   - Run `./scripts/run-jest-container.sh components/__tests__/PlaceAutocomplete.test.tsx components/__tests__/PlaceAutocompleteSuggestionsList.test.tsx components/__tests__/trip-form.test.tsx components/map/__tests__/map-search-bar.test.tsx`.
4. **Commit & Update Plan:**
   - Commit refactored code and updated test suites.
   - Update `conductor/tracks/initial-trip-creation-wineries_20261002/plan.md`.
