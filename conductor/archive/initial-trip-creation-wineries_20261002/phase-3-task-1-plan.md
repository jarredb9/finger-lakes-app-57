# Implementation Plan: Phase 3 Task 1 - Write Failing Tests for `clearOnSelect` and Programmatic Re-Query Suppression (Red Phase)

**Track:** `initial-trip-creation-wineries_20261002` (Issue [#57](https://github.com/jarredb9/finger-lakes-app-57/issues/57))  
**Phase:** 3 (PlaceAutocomplete Selection UX & Re-Query Suppression)  
**Task:** 1 (Write Failing Tests for `clearOnSelect` and Programmatic Re-Query Suppression)  
**Specification Reference:** [spec.md](./spec.md)  
**Track Plan Reference:** [plan.md](./plan.md)  

---

## 1. Objective & Seam-Bounded Architecture

### 1.1 Objective
Establish failing unit tests (TDD Red Phase) in `components/__tests__/PlaceAutocomplete.test.tsx` and `components/__tests__/trip-form.test.tsx` that assert:
1. `clearOnSelect: true` clears `inputValue` upon successful suggestion selection and detail resolution.
2. Programmatic value updates do not trigger debounced `fetchSuggestions` re-queries or re-open the suggestions dropdown.
3. If place details resolution fails, the input field retains the user's typed search query and the dropdown remains closed.
4. Default `clearOnSelect: false` retains the selected place string without triggering debounced re-queries or re-opening the dropdown (preserving `MapSearchBar` behavior).
5. `TripForm` passes `clearOnSelect={true}` to `PlaceAutocomplete` and clears the search input when a winery is selected.

### 1.2 Architectural Context & Seam Boundaries
1. **The Programmatic Re-Query Bug (`components/PlaceAutocomplete.tsx`):**
   - In current `PlaceAutocomplete.tsx`, `handleSelectSuggestion` sets `setInputValue(text)`.
   - Because `inputValue` state changes to the selected prediction string (length >= 3), the 300ms debouncing `useEffect` fires, invoking `fetchSuggestions(text, options)` and setting `setIsOpen(true)`.
   - This causes the autocomplete dropdown to unexpectedly re-open with suggestions matching the winery that was just selected.
   - **Target Architecture (Phase 3 Task 2):** Introduce an internal selection guard ref (`isSelectingRef` or programmatic guard) that distinguishes user keyboard typing from programmatic assignments, suppressing debounced re-queries and keeping `isOpen: false`.
2. **The `clearOnSelect` UX Contract:**
   - In `TripForm` (`components/trip-form.tsx`), a user selecting a winery expects the input to clear immediately so they can search and select subsequent wineries without manually erasing the text.
   - Currently, `PlaceAutocomplete` has no `clearOnSelect` prop, and unconditionally leaves the prediction text in the input.
   - If place details resolution fails (e.g., Places API error), the typed query must be retained rather than cleared or overwritten, allowing the user to retry without retyping.
   - In `MapSearchBar` (`components/map/map-search-bar.tsx`), `clearOnSelect` defaults to `false`, retaining the selected place name without re-opening the dropdown.
3. **The Red-Phase Strategy:**
   - Add unit tests in `components/__tests__/PlaceAutocomplete.test.tsx` that exercise the component with mock Places sessions, asserting the expected behaviors that will fail against current un-refactored code.
   - Update `PlaceAutocomplete` mock in `components/__tests__/trip-form.test.tsx` to reflect the `clearOnSelect` contract and add a test verifying that `TripForm` configures `clearOnSelect={true}` and clears the search input upon winery selection.
   - Execute the containerized test runner (`./scripts/run-jest-container.sh components/__tests__/PlaceAutocomplete.test.tsx components/__tests__/trip-form.test.tsx`) to verify deterministic test failures prior to any implementation in Task 2.

---

## 2. Invariants & Guardrails

1. **Existing Test Parity Invariant:**
   - All 5 existing test cases in `components/__tests__/PlaceAutocomplete.test.tsx` and all 6 existing test cases in `components/__tests__/trip-form.test.tsx` must continue to pass without regression.
2. **Debounce Timing Invariant:**
   - Debounce window is 300ms. Tests asserting re-query suppression must wait >= 350ms to verify that no delayed re-query is fired.
3. **Backward Compatibility Invariant:**
   - `clearOnSelect` defaults to `false`. Omitting the prop must preserve the selected text in the input (as required by `MapSearchBar`).
4. **Failure Recovery Invariant:**
   - If place details resolution throws or rejects, `onPlaceSelect` must not be invoked, the user's typed search query must remain intact in the input, and the dropdown must remain closed.
5. **No Production Code Changes Invariant:**
   - In Task 1 (Red Phase), strictly NO changes may be made to `components/PlaceAutocomplete.tsx` or `components/trip-form.tsx`. Only test files are modified.

---

## 3. Target Files & Exact Drop-in Specifications

### 3.1 Target File 1: `components/__tests__/PlaceAutocomplete.test.tsx`
- **Path:** `components/__tests__/PlaceAutocomplete.test.tsx`
- **Action:** Append a new test suite inside `describe("PlaceAutocomplete", ...)` right before the final closing brace at line 240.
- **Anchor Line:** Immediately after line 239 (`expect(mockFetchPlaceDetails).not.toHaveBeenCalled();\n  });`) and before line 240 (`});`).

#### Replacement Chunk:
**StartLine:** 239  
**EndLine:** 241  
**TargetContent:**
```typescript
    expect(mockFetchPlaceDetails).not.toHaveBeenCalled();
  });
});
```
**ReplacementContent:**
```typescript
    expect(mockFetchPlaceDetails).not.toHaveBeenCalled();
  });

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

---

### 3.2 Target File 2: `components/__tests__/trip-form.test.tsx`
- **Path:** `components/__tests__/trip-form.test.tsx`
- **Action 1:** Update `PlaceAutocomplete` mock to track `clearOnSelect` and render a controlled search input.
- **Anchor 1:** Lines 17-51.
- **Action 2:** Append a new describe block for `clearOnSelect` validation before the final closing brace at line 204.
- **Anchor 2:** Line 203-205.

#### Replacement Chunk 1 (PlaceAutocomplete Mock Update):
**StartLine:** 17  
**EndLine:** 52  
**TargetContent:**
```typescript
// Mock PlaceAutocomplete to allow multi-winery selection simulation
jest.mock('../PlaceAutocomplete', () => ({
  PlaceAutocomplete: ({ onPlaceSelect }: any) => (
    <div data-testid="mock-place-autocomplete-container">
      <button
        data-testid="trip-form-winery-autocomplete"
        type="button"
        onClick={() =>
          onPlaceSelect({
            id: 'google-place-winery-123',
            name: 'Keuka Spring Vineyards',
            address: '243 Route 54, Penn Yan, NY',
            location: { latitude: 42.63, longitude: -77.12 },
          })
        }
      >
        Select Keuka Spring Vineyards
      </button>
      <button
        data-testid="mock-select-winery-2"
        type="button"
        onClick={() =>
          onPlaceSelect({
            id: 'google-place-winery-456',
            name: 'Dr. Konstantin Frank',
            address: '9749 Middle Rd, Hammondsport, NY',
            location: { latitude: 42.55, longitude: -77.18 },
          })
        }
      >
        Select Dr. Konstantin Frank
      </button>
    </div>
  ),
}));
```
**ReplacementContent:**
```typescript
// Mock PlaceAutocomplete to allow multi-winery selection simulation and clearOnSelect validation
jest.mock('../PlaceAutocomplete', () => {
  const React = require('react');
  return {
    PlaceAutocomplete: ({ onPlaceSelect, clearOnSelect, id }: any) => {
      const [mockInputValue, setMockInputValue] = React.useState('');
      return (
        <div
          data-testid="mock-place-autocomplete-container"
          data-clear-on-select={String(clearOnSelect)}
        >
          <input
            data-testid="place-autocomplete-input"
            value={mockInputValue}
            onChange={(e: any) => setMockInputValue(e.target.value)}
          />
          <button
            data-testid="trip-form-winery-autocomplete"
            type="button"
            onClick={() => {
              onPlaceSelect({
                id: 'google-place-winery-123',
                name: 'Keuka Spring Vineyards',
                address: '243 Route 54, Penn Yan, NY',
                location: { latitude: 42.63, longitude: -77.12 },
              });
              if (clearOnSelect) {
                setMockInputValue('');
              } else {
                setMockInputValue('Keuka Spring Vineyards');
              }
            }}
          >
            Select Keuka Spring Vineyards
          </button>
          <button
            data-testid="mock-select-winery-2"
            type="button"
            onClick={() => {
              onPlaceSelect({
                id: 'google-place-winery-456',
                name: 'Dr. Konstantin Frank',
                address: '9749 Middle Rd, Hammondsport, NY',
                location: { latitude: 42.55, longitude: -77.18 },
              });
              if (clearOnSelect) {
                setMockInputValue('');
              } else {
                setMockInputValue('Dr. Konstantin Frank');
              }
            }}
          >
            Select Dr. Konstantin Frank
          </button>
        </div>
      );
    },
  };
});
```

#### Replacement Chunk 2 (TripForm clearOnSelect Assertion Suite):
**StartLine:** 202  
**EndLine:** 205  
**TargetContent:**
```typescript
      expect(mockOnClose).toHaveBeenCalled();
    });
  });
});
```
**ReplacementContent:**
```typescript
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

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
});
```

---

## 4. Red-Phase Failure Verification Rationale

When executed against the current un-refactored codebase:

1. **`PlaceAutocomplete.test.tsx` - Failing Test 1 (`clears inputValue upon successful suggestion selection when clearOnSelect is true`):**
   - **Failure Point:** `expect(input).toHaveValue("")`.
   - **Root Cause:** Current `components/PlaceAutocomplete.tsx` line 78 calls `setInputValue(text)` unconditionally and has no logic to check `clearOnSelect` or clear the input upon successful place resolution.
   - **Expected Failure:** `Expected: "", Received: "Mock Winery"`.

2. **`PlaceAutocomplete.test.tsx` - Failing Test 2 (`does not trigger debounced fetchSuggestions or re-open the dropdown upon programmatic selection value updates`):**
   - **Failure Point:** `expect(mockFetchSuggestions).not.toHaveBeenCalled()`.
   - **Root Cause:** Current `components/PlaceAutocomplete.tsx` line 78 sets `inputValue` to the prediction string. Because `inputValue` changes and has length >= 3, the debouncing `useEffect` (lines 45-65) schedules a timer that calls `fetchSuggestions("Mock Winery", options)` and `setIsOpen(true)` after 300ms.
   - **Expected Failure:** `Expected number of calls: 0, Received number of calls: 1`.

3. **`PlaceAutocomplete.test.tsx` - Failing Test 3 (`retains the typed search string and keeps dropdown closed when place details resolution fails`):**
   - **Failure Point:** `expect(input).toHaveValue("Keuka Spring")`.
   - **Root Cause:** Current `components/PlaceAutocomplete.tsx` line 78 calls `setInputValue(text)` before entering the `try / catch` block. When `fetchPlaceDetails` rejects, the catch block logs the error and leaves the input holding the suggestion string `"Failing Winery Prediction Full Name"` instead of restoring/retaining `"Keuka Spring"`. In addition, after 300ms, the dropdown re-opens.
   - **Expected Failure:** `Expected: "Keuka Spring", Received: "Failing Winery Prediction Full Name"`.

4. **`PlaceAutocomplete.test.tsx` - Failing Test 4 (`retains the selected place text and keeps dropdown closed when clearOnSelect is false`):**
   - **Failure Point:** `expect(mockFetchSuggestions).not.toHaveBeenCalled()`.
   - **Root Cause:** In the default `clearOnSelect: false` mode (as in `MapSearchBar`), setting `inputValue` to the selected place string triggers the 300ms debouncing re-query, calling `fetchSuggestions` and setting `isOpen: true`.
   - **Expected Failure:** `Expected number of calls: 0, Received number of calls: 1`.

5. **`trip-form.test.tsx` - Failing Test 1 (`configures PlaceAutocomplete with clearOnSelect={true} and clears search input on winery selection`):**
   - **Failure Point:** `expect(autocompleteContainer).toHaveAttribute('data-clear-on-select', 'true')`.
   - **Root Cause:** Current `components/trip-form.tsx` line 203 renders `<PlaceAutocomplete>` without the `clearOnSelect` prop, evaluating to `undefined`.
   - **Expected Failure:** `Expected: "true", Received: "undefined"`.

6. **Existing Test Preservation:**
   - All 5 existing tests in `PlaceAutocomplete.test.tsx` remain unaltered and will continue to pass.
   - All 6 existing tests in `trip-form.test.tsx` interact strictly with the mock buttons (`trip-form-winery-autocomplete`, `mock-select-winery-2`) and submit flows; the updated mock maintains identical button IDs and click signatures, so all 6 existing tests will pass.

---

## 5. Execution Verification Protocol

### Exact Test Runner Command
Per repository standards in `AGENTS.md`, Jest unit tests run containerized via Podman using the container runner script:

```bash
./scripts/run-jest-container.sh components/__tests__/PlaceAutocomplete.test.tsx components/__tests__/trip-form.test.tsx
```

> [!IMPORTANT]
> - Running this container runner requires `BypassSandbox: true` (due to host Podman socket requirements).
> - Expected outcome during Task 1 (Red Phase) verification:
>   - `components/__tests__/PlaceAutocomplete.test.tsx`: Exactly 4 tests fail (`PlaceAutocomplete clearOnSelect & Re-Query Suppression`), 5 tests pass.
>   - `components/__tests__/trip-form.test.tsx`: Exactly 1 test fails (`PlaceAutocomplete clearOnSelect UX in TripForm`), 6 tests pass.
>   - Total: 5 failing tests, 11 passing tests. Zero syntax or compilation errors.

---

## 6. Gating & Approval
No source code files (`components/PlaceAutocomplete.tsx` or `components/trip-form.tsx`) or test files have been modified yet. Under Conductor guidelines and project rules, proceeding to apply the test changes and execute the Red Phase container runner requires explicit user approval.
