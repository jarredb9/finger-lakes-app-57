# Implementation Plan: Phase 3 Task 2 - Implement Selection Guard & `clearOnSelect` in `PlaceAutocomplete` (Green Phase)

**Track:** `initial-trip-creation-wineries_20261002` (Issue [#57](https://github.com/jarredb9/finger-lakes-app-57/issues/57))  
**Phase:** 3 (PlaceAutocomplete Selection UX & Re-Query Suppression)  
**Task:** 2 (Implement Selection Guard & `clearOnSelect` in `PlaceAutocomplete` - Green Phase)  
**Specification Reference:** [spec.md](./spec.md)  
**Track Plan Reference:** [plan.md](./plan.md)  

---

## 1. Objective & Seam-Bounded Architecture

### 1.1 Objective
Transition Phase 3 tests from RED to GREEN by implementing:
1. `clearOnSelect?: boolean` prop on `PlaceAutocomplete` (defaulting to `false`).
2. An internal selection guard ref (`isProgrammaticUpdateRef`) to suppress debounced `fetchSuggestions` re-queries and prevent re-opening the autocomplete dropdown upon programmatic value updates.
3. Deferred/conditional `inputValue` updates in `handleSelectSuggestion`:
   - If `clearOnSelect: true`, clear `inputValue` to `""` only upon successful place details resolution or test winery lookup.
   - If `clearOnSelect: false`, update `inputValue` to `text` upon successful resolution without triggering re-queries (preserving `MapSearchBar` behavior).
   - If place details resolution fails (catches an error), retain the user's typed search query in `inputValue` and ensure the dropdown remains closed.
4. Pass `clearOnSelect={true}` to `PlaceAutocomplete` in `TripForm` (`components/trip-form.tsx`).

### 1.2 Architectural Context & Seam Boundaries
1. **The Programmatic Re-Query Bug in `PlaceAutocomplete.tsx`:**
   - In un-refactored `PlaceAutocomplete.tsx`, `handleSelectSuggestion` eagerly invoked `setInputValue(text)`.
   - Because `inputValue` was updated to a string of length >= 3, the debouncing `useEffect` was scheduled for execution after 300ms, triggering `fetchSuggestions(text, options)` and `setIsOpen(true)`.
   - This caused the dropdown menu to abruptly re-open with suggestions matching the selected winery name.
   - **Fix:** Guard the debouncing `useEffect` with `isProgrammaticUpdateRef`. When a suggestion is selected, set `isProgrammaticUpdateRef.current = true` before updating `inputValue`. When the `useEffect` fires, it consumes the guard (`isProgrammaticUpdateRef.current = false`) and returns immediately without scheduling a timer or calling `fetchSuggestions`.
2. **Error Recovery & Retention Invariant:**
   - In un-refactored `PlaceAutocomplete.tsx`, `setInputValue(text)` was executed *before* `fetchPlaceDetails(suggestion)`. If detail fetching failed, the user's typed input had already been replaced with prediction text, destroying their typed query.
   - **Fix:** Do not assign `inputValue` prior to place details resolution. Only update `inputValue` inside the resolution success branch (`if (place && winery)` or local test winery hit). If resolution fails, the error is caught, `inputValue` retains the user's typed string, and `setIsOpen(false)` keeps the dropdown closed.
3. **TripForm Multi-Stop Selection UX:**
   - In `TripForm` (`components/trip-form.tsx`), users select multiple winery stops. Passing `clearOnSelect={true}` ensures the input is cleared immediately upon successful selection, leaving the field empty and ready for adding subsequent winery stops.

---

## 2. Invariants & Guardrails

1. **Backward Compatibility Invariant (`MapSearchBar`):**
   - `clearOnSelect` must default to `false`. Callers that do not pass `clearOnSelect` (e.g., `components/map/map-search-bar.tsx`) must retain the selected place name in the input without triggering debounced re-queries or re-opening the dropdown.
2. **Failure Recovery Invariant:**
   - If place details resolution rejects or throws an error:
     - `onPlaceSelect` must NOT be invoked.
     - `inputValue` must retain the user's exact typed query.
     - The suggestions dropdown must remain closed (`isOpen: false`, `suggestions: []`).
3. **Debounce Timing Invariant:**
   - Keyboard typing must continue to debounce queries by 300ms.
   - Programmatic selection must suppress re-querying across the entire debounce window (>= 350ms verification).
4. **Mobile Usability & Keyboard Dismissal Invariant:**
   - Retain `activeElement.blur()` in `handleSelectSuggestion` so mobile soft keyboards dismiss upon winery selection, keeping the new winery tags visible.
5. **Strict Scope Invariant:**
   - No modifications outside `components/PlaceAutocomplete.tsx` and `components/trip-form.tsx`.
   - Test suites in `components/__tests__/PlaceAutocomplete.test.tsx` and `components/__tests__/trip-form.test.tsx` are authoritative and must pass without modification.

---

## 3. Target Files & Exact Drop-in Specifications

### 3.1 Target File 1: `components/PlaceAutocomplete.tsx`
- **Path:** `components/PlaceAutocomplete.tsx`
- **Action:** Update interface, component props, add `isProgrammaticUpdateRef`, guard debounce `useEffect`, and defer/conditionalize `setInputValue` in `handleSelectSuggestion`.

#### Drop-in Replacement Chunks:

#### Chunk 1: Props Interface, Default Value & Selection Guard Ref
- **StartLine:** 13
- **EndLine:** 37
- **TargetContent:**
```typescript
interface PlaceAutocompleteProps {
  placeholder?: string;
  onPlaceSelect: (winery: Winery, sdkPlace?: google.maps.places.Place | null) => void;
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
```
- **ReplacementContent:**
```typescript
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
  placeholder = "Search locations...",
  onPlaceSelect,
  className = "",
  includedPrimaryTypes,
  locationBias,
  id = "place-autocomplete",
  clearOnSelect = false,
}: PlaceAutocompleteProps) {
  const [inputValue, setInputValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const isProgrammaticUpdateRef = useRef(false);
```

#### Chunk 2: Debounce Guard in `useEffect`
- **StartLine:** 45 (in updated file, around 47)
- **EndLine:** 55
- **TargetContent:**
```typescript
  // Debounce autocomplete query
  useEffect(() => {
    if (inputValue.trim().length < 3) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }
```
- **ReplacementContent:**
```typescript
  // Debounce autocomplete query
  useEffect(() => {
    if (isProgrammaticUpdateRef.current) {
      isProgrammaticUpdateRef.current = false;
      return;
    }

    if (inputValue.trim().length < 3) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }
```

#### Chunk 3: Deferred Value Update & Error Retention in `handleSelectSuggestion`
- **StartLine:** 76 (in updated file, around 82)
- **EndLine:** 114
- **TargetContent:**
```typescript
    const text = suggestion.placePrediction.text?.text || "";
    setInputValue(text);
    setIsOpen(false);
    setIsFetchingDetails(true);

    try {
      const placeId = suggestion.placePrediction.toPlace?.()?.id;
      if (placeId && (placeId.startsWith("test-") || placeId.startsWith("mock-"))) {
        const { useWineryStore } = await import("@/lib/stores/wineryStore");
        const localWinery = useWineryStore.getState().getWinery(placeId);
        if (localWinery) {
          onPlaceSelect(localWinery, null);
          return;
        }
      }

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
```
- **ReplacementContent:**
```typescript
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
```

---

### 3.2 Target File 2: `components/trip-form.tsx`
- **Path:** `components/trip-form.tsx`
- **Action:** Pass `clearOnSelect={true}` to `PlaceAutocomplete`.
- **Anchor Line:** Inside `<FormField name="wineries" ...>` at line 203.

#### Drop-in Replacement Chunk:
- **StartLine:** 201
- **EndLine:** 211
- **TargetContent:**
```typescript
                    <FormLabel className="font-semibold">Select Wineries (Optional):</FormLabel>
                    <FormControl>
                      <PlaceAutocomplete
                        placeholder="Search for a winery..."
                        onPlaceSelect={handleSelectWinery}
                        includedPrimaryTypes={["winery"]}
                        className="mt-2"
                        id="trip-form-winery-autocomplete"
                      />
                    </FormControl>
```
- **ReplacementContent:**
```typescript
                    <FormLabel className="font-semibold">Select Wineries (Optional):</FormLabel>
                    <FormControl>
                      <PlaceAutocomplete
                        placeholder="Search for a winery..."
                        onPlaceSelect={handleSelectWinery}
                        includedPrimaryTypes={["winery"]}
                        className="mt-2"
                        id="trip-form-winery-autocomplete"
                        clearOnSelect={true}
                      />
                    </FormControl>
```

---

## 4. Execution Verification Protocol

### 4.1 Prerequisites & Sandbox Requirements
Per repository operating rules in `AGENTS.md`:
- Jest tests must be executed via the container runner (`BypassSandbox: true`) because RHEL 8 glibc 2.28 is incompatible with Next.js 16 native SWC.

### 4.2 Exact Verification Commands

1. **Targeted Unit Test Verification (Green Phase):**
   ```bash
   ./scripts/run-jest-container.sh components/__tests__/PlaceAutocomplete.test.tsx components/__tests__/trip-form.test.tsx
   ```
   **Expected Outcome:**
   - `components/__tests__/PlaceAutocomplete.test.tsx`: All 9 tests pass (5 original tests + 4 Phase 3 tests).
   - `components/__tests__/trip-form.test.tsx`: All 7 tests pass (6 original tests + 1 Phase 3 test).
   - Zero test failures, zero unhandled errors.

2. **Map Search Bar Regression Verification:**
   ```bash
   ./scripts/run-jest-container.sh components/map/__tests__/map-search-bar.test.tsx
   ```
   **Expected Outcome:**
   - All tests in `map-search-bar.test.tsx` pass without regression.

3. **Combined Component Test Suite Verification:**
   ```bash
   ./scripts/run-jest-container.sh components/__tests__/PlaceAutocomplete.test.tsx components/__tests__/trip-form.test.tsx components/map/__tests__/map-search-bar.test.tsx
   ```
   **Expected Outcome:**
   - All test suites pass 100%.

---

## 5. Next Steps & Quality Gate

1. **User Approval Gate:**
   - Halt for explicit affirmative user approval via modal before modifying `components/PlaceAutocomplete.tsx` and `components/trip-form.tsx`.
2. **Execute Green Phase Modifications:**
   - Apply Chunk 1, Chunk 2, and Chunk 3 to `components/PlaceAutocomplete.tsx`.
   - Apply Chunk to `components/trip-form.tsx`.
3. **Execute Verification:**
   - Run `./scripts/run-jest-container.sh components/__tests__/PlaceAutocomplete.test.tsx components/__tests__/trip-form.test.tsx` and verify green status.
4. **Proceed to Phase 3 Task 3:**
   - Refactor & Scaffolding Cleanup.
