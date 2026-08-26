# Implementation Plan: Map Core, Search Autocomplete & Controls Decoupling Refactor (Strict TDD & E2E Alignment)

## Phase 1: Search Autocomplete Decoupling & Pure Mappers (Strict TDD)
- [ ] Task: (TDD Red) Write failing unit tests for Places SDK response normalizer
    - [ ] Create `lib/utils/__tests__/places-mapper.test.ts`
    - [ ] Test normalization of SDK place objects, formatted predictions, highlights, and fallback properties
- [ ] Task: (TDD Green) Implement pure Places SDK normalizer helper
    - [ ] Implement `mapSdkPlaceToV1Place(place, text)` in `lib/utils/places-mapper.ts`
    - [ ] Verify `places-mapper.test.ts` passes
- [ ] Task: (TDD Red) Write failing tests for combobox keyboard hook
    - [ ] Create `hooks/__tests__/use-combobox-keyboard.test.ts`
    - [ ] Test ArrowUp, ArrowDown, Enter selection, Escape dismissal, and outside-click handling
- [ ] Task: (TDD Green) Implement combobox keyboard hook
    - [ ] Implement `hooks/use-combobox-keyboard.ts`
    - [ ] Verify `use-combobox-keyboard.test.ts` passes
- [ ] Task: (TDD Red) Write failing tests for Autocomplete Suggestions List
    - [ ] Create `components/__tests__/PlaceAutocompleteSuggestionsList.test.tsx`
    - [ ] Test rendering suggestions, active highlighting, empty state, and keyboard index selection
- [ ] Task: (TDD Green) Implement PlaceAutocompleteSuggestionsList component
    - [ ] Implement `components/PlaceAutocompleteSuggestionsList.tsx`
    - [ ] Verify `PlaceAutocompleteSuggestionsList.test.tsx` passes
- [ ] Task: Refactor and integrate PlaceAutocomplete component
    - [ ] Update `components/PlaceAutocomplete.tsx` to compose `places-mapper`, `useComboboxKeyboard`, and `PlaceAutocompleteSuggestionsList`
    - [ ] Update existing `components/__tests__/PlaceAutocomplete.test.tsx` and ensure 100% pass rate
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Search Autocomplete Decoupling & Pure Mappers' (Protocol in workflow.md)

## Phase 2: Map Controls & Search Bar Decomposition (Strict TDD)
- [ ] Task: (TDD Red) Write failing tests for MapSearchBar and MapFilterToggles
    - [ ] Create `components/map/__tests__/map-search-bar.test.tsx`
    - [ ] Create `components/map/__tests__/map-filter-toggles.test.tsx`
    - [ ] Test search input debouncing, clear actions, filter toggling, and accessibility
- [ ] Task: (TDD Green) Implement MapSearchBar and MapFilterToggles components
    - [ ] Implement `components/map/map-search-bar.tsx`
    - [ ] Implement `components/map/map-filter-toggles.tsx`
    - [ ] Verify unit tests pass
- [ ] Task: Refactor MapControls component and store wiring
    - [ ] Refactor `components/map/map-controls.tsx` to compose new subcomponents and eliminate 11-prop drilling
    - [ ] Update `components/__tests__/map-controls.test.tsx` to reflect decoupled architecture
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Map Controls & Search Bar Decomposition' (Protocol in workflow.md)

## Phase 3: Map Symbology & Legend Decoupling (Strict TDD)
- [ ] Task: (TDD Red) Write failing tests for MapLegendPopover
    - [ ] Create `components/map/__tests__/map-legend-popover.test.tsx`
    - [ ] Test popover trigger, legend symbology items, and accessible tooltips
- [ ] Task: (TDD Green) Implement MapLegendPopover component
    - [ ] Implement `components/map/map-legend-popover.tsx`
    - [ ] Verify `map-legend-popover.test.tsx` passes
- [ ] Task: Refactor AppSidebar to consume MapLegendPopover
    - [ ] Refactor `components/app-sidebar.tsx` to import and render `MapLegendPopover`
    - [ ] Run sidebar unit tests to verify zero regressions
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Map Symbology & Legend Decoupling' (Protocol in workflow.md)

## Phase 4: Map Core, Adapters, Fallback & Panorama Lifecycle (Strict TDD)
- [ ] Task: (TDD Red) Write failing unit tests for Mapbox layers and Google Map Adapter
    - [ ] Create `lib/maps/__tests__/mapbox-layers.test.ts`
    - [ ] Create `lib/maps/__tests__/google-map-adapter.test.ts`
- [ ] Task: (TDD Green) Implement Mapbox layers and Google Map Adapter
    - [ ] Implement `lib/maps/mapbox-layers.ts`
    - [ ] Implement `lib/maps/google-map-adapter.ts`
    - [ ] Verify layer and adapter unit tests pass
- [ ] Task: (TDD Red) Write failing tests for Street View hook and Google Map Fallback
    - [ ] Create `hooks/__tests__/use-street-view-panorama.test.ts`
    - [ ] Create `components/map/__tests__/google-map-fallback.test.tsx`
- [ ] Task: (TDD Green) Implement Street View hook and Google Map Fallback component
    - [ ] Implement `hooks/use-street-view-panorama.ts`
    - [ ] Implement `components/map/google-map-fallback.tsx`
    - [ ] Verify hook and fallback component unit tests pass
- [ ] Task: Refactor MapView into a lightweight container component
    - [ ] Refactor `components/map/MapView.tsx` (<200 LOC) integrating extracted layers, fallback, and panorama hook
    - [ ] Verify container presentational structure and DOM stability
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
