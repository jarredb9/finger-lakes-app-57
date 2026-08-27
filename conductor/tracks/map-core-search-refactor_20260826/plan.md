# Implementation Plan: Map Core, Search Autocomplete & Controls Decoupling Refactor (Strict TDD & E2E Alignment)

## Phase 1: Search Autocomplete Decoupling & Pure Mappers (Strict TDD) [checkpoint: 6badd0a]
- [x] Task: (TDD Red) Write failing unit tests for Places SDK response normalizer [26c4eaa]
    - [x] Create `lib/utils/__tests__/places-mapper.test.ts`
    - [x] Test normalization of SDK place objects, formatted predictions, highlights, and fallback properties
    - [x] Test defensive coordinate resolution (handling both SDK `place.location.lat()` methods and mock/property-based `place.location.latitude`)
- [x] Task: (TDD Green) Implement pure Places SDK normalizer helper [cd7c825]
    - [x] Implement `mapSdkPlaceToV1Place(place, text)` in `lib/utils/places-mapper.ts`
    - [x] Verify `places-mapper.test.ts` passes
- [x] Task: (TDD Red) Write failing tests for combobox keyboard hook [e86c55f]
    - [x] Create `hooks/__tests__/use-combobox-keyboard.test.ts`
    - [x] Test ArrowUp, ArrowDown, Enter selection, Escape dismissal, and outside-click handling
- [x] Task: (TDD Green) Implement combobox keyboard hook [03da67e]
    - [x] Implement `hooks/use-combobox-keyboard.ts`
    - [x] Verify `use-combobox-keyboard.test.ts` passes
- [x] Task: (TDD Red) Write failing tests for Autocomplete Suggestions List [78ad2d3]
    - [x] Create `components/__tests__/PlaceAutocompleteSuggestionsList.test.tsx`
    - [x] Test rendering suggestions, active highlighting, empty state, and keyboard index selection
- [x] Task: (TDD Green) Implement PlaceAutocompleteSuggestionsList component [6475db7]
    - [x] Implement `components/PlaceAutocompleteSuggestionsList.tsx`
    - [x] Verify `PlaceAutocompleteSuggestionsList.test.tsx` passes
- [x] Task: Refactor and integrate PlaceAutocomplete component [f0fe4dd]
    - [x] Update `components/PlaceAutocomplete.tsx` to compose `places-mapper`, `useComboboxKeyboard`, and `PlaceAutocompleteSuggestionsList`
    - [x] Update existing `components/__tests__/PlaceAutocomplete.test.tsx` and ensure 100% pass rate
- [x] Task: Conductor - User Manual Verification 'Phase 1: Search Autocomplete Decoupling & Pure Mappers' (Protocol in workflow.md) [6badd0a]

## Phase 2: Map Controls & Search Bar Decomposition (Strict TDD) [checkpoint: 87f4483]
- [x] Task: (TDD Red) Write failing tests for MapSearchBar and MapFilterToggles [78b6d8f]
    - [x] Create `components/map/__tests__/map-search-bar.test.tsx`
    - [x] Create `components/map/__tests__/map-filter-toggles.test.tsx`
    - [x] Test search input debouncing, clear actions, filter toggling, and accessibility as pure presentational components
- [x] Task: (TDD Green) Implement MapSearchBar and MapFilterToggles components [e4bc76b]
    - [x] Implement `components/map/map-search-bar.tsx` (pure presentational)
    - [x] Implement `components/map/map-filter-toggles.tsx` (pure presentational)
    - [x] Verify unit tests pass
- [x] Task: Refactor MapControls component and store wiring [87fd1a0]
    - [x] Refactor `components/map/map-controls.tsx` as a container consuming `useWineryMapContext()` and `useTripStore` to compose new subcomponents and eliminate 11-prop drilling from `app-sidebar.tsx`
    - [x] Update `components/__tests__/map-controls.test.tsx` to reflect decoupled architecture
- [x] Task: Conductor - User Manual Verification 'Phase 2: Map Controls & Search Bar Decomposition' (Protocol in workflow.md) [87f4483]

## Phase 3: Map Symbology & Legend Decoupling (Strict TDD) [checkpoint: ae83fb6]
- [x] Task: (TDD Red) Write failing tests for MapLegendPopover [4b838ae]
    - [x] Create `components/map/__tests__/map-legend-popover.test.tsx`
    - [x] Test popover trigger, legend symbology items, and accessible tooltips
- [x] Task: (TDD Green) Implement MapLegendPopover component [91dd16e]
    - [x] Implement `components/map/map-legend-popover.tsx`
    - [x] Verify `map-legend-popover.test.tsx` passes
- [x] Task: Refactor AppSidebar to consume MapLegendPopover [853506c]
    - [x] Refactor `components/app-sidebar.tsx` to import and render `MapLegendPopover`
    - [x] Run sidebar unit tests to verify zero regressions
- [x] Task: Conductor - User Manual Verification 'Phase 3: Map Symbology & Legend Decoupling' (Protocol in workflow.md) [ae83fb6]

## Phase 4: Map Core, Adapters, Fallback & Panorama Lifecycle (Strict TDD)
- [x] Task: (TDD Red) Write failing unit tests for Mapbox layers and Google Map Adapter [f5a4786]
    - [x] Create `lib/maps/__tests__/mapbox-layers.test.ts`
    - [x] Create `lib/maps/__tests__/google-map-adapter.test.ts`
    - [x] Test `GoogleMapAdapter` methods including `openStreetView(lat, lng)` API contract
- [~] Task: (TDD Green) Implement Mapbox layers and Google Map Adapter
    - [ ] Implement `lib/maps/mapbox-layers.ts`
    - [ ] Implement `lib/maps/google-map-adapter.ts`
    - [ ] Verify layer and adapter unit tests pass
- [ ] Task: (TDD Red) Write failing tests for Street View hook and Google Map Fallback
    - [ ] Create `hooks/__tests__/use-street-view-panorama.test.ts`
    - [ ] Create `components/map/__tests__/google-map-fallback.test.tsx`
    - [ ] Test panorama visibility listeners, store synchronization, and fallback DOM stability
- [ ] Task: (TDD Green) Implement Street View hook and Google Map Fallback component
    - [ ] Implement `hooks/use-street-view-panorama.ts`
    - [ ] Implement `components/map/google-map-fallback.tsx`
    - [ ] Verify hook and fallback component unit tests pass
- [ ] Task: Refactor MapView into a lightweight container component
    - [ ] Refactor `components/map/MapView.tsx` (<200 LOC) integrating extracted layers, fallback, and panorama hook
    - [ ] Ensure `openStreetView` is bound to the Mapbox `mapRef` stored in `useMapStore` for modal consumer compatibility (`use-winery-modal-state.ts`)
    - [ ] Verify container presentational structure and DOM stability (`data-state="ready|loading|error"`)
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Map Core, Adapters, Fallback & Panorama Lifecycle' (Protocol in workflow.md)

## Phase 5: E2E Test Suite Alignment & Atomic Verification
- [ ] Task: Audit and update all affected Playwright E2E test suites
    - [ ] Update and verify `e2e/smoke.spec.ts` (Core map loading & search)
    - [ ] Update and verify `e2e/accessibility.spec.ts` (Map controls & autocomplete keyboard navigation)
    - [ ] Update and verify `e2e/responsive-layout.spec.ts` (Map search bar & filter toggles on mobile/tablet/desktop)
    - [ ] Update and verify `e2e/mobile-nav-drawer.spec.ts` (Sidebar legend popover interaction)
    - [ ] Update and verify `e2e/error-handling.spec.ts` & `e2e/pwa-offline.spec.ts` (Map container error and offline states)
- [ ] Task: Execute full containerized Playwright regression suite
    - [ ] Run `./scripts/run-e2e-container.sh chromium e2e/smoke.spec.ts`
    - [ ] Run `./scripts/run-e2e-container.sh chromium e2e/accessibility.spec.ts`
    - [ ] Run `./scripts/run-e2e-container.sh chromium e2e/responsive-layout.spec.ts`
    - [ ] Run full Jest unit suite `npm test` (>80% coverage on new modules)
- [ ] Task: Conductor - User Manual Verification 'Phase 5: E2E Test Suite Alignment & Atomic Verification' (Protocol in workflow.md)
