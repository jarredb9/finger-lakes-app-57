# Specification: Map Core, Search Autocomplete & Controls Decoupling Refactor

## Overview
This track executes a focused prerequisite refactoring slice on 4 core map and search components ([MapView.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/map/MapView.tsx), [PlaceAutocomplete.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/PlaceAutocomplete.tsx), [map-controls.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/map/map-controls.tsx), and [app-sidebar.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/app-sidebar.tsx)) directly in the critical path of upcoming Map Marker Enhancements and Search Capabilities (Issue #31).

## Scope & Target Components

### 1. Map Core & Marker Layers (`components/map/MapView.tsx`)
- Extract Mapbox layer definitions (`clusterLayer`, `clusterCountLayer`, `unclusteredPointLayer`) into [lib/maps/mapbox-layers.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/maps/mapbox-layers.ts).
- Extract Google Maps JS API adapter logic into [lib/maps/google-map-adapter.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/maps/google-map-adapter.ts).
- Extract Google Map Fallback marker rendering & interaction into [components/map/google-map-fallback.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/map/google-map-fallback.tsx).
- Extract Street View Panorama lifecycle into custom hook [hooks/use-street-view-panorama.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/hooks/use-street-view-panorama.ts).
- Reduce `MapView.tsx` to a clean container component orchestrating Mapbox / Fallback without god-component bloat.

### 2. Search Autocomplete Engine (`components/PlaceAutocomplete.tsx`)
- Extract Google Places SDK response normalizer into a pure helper `mapSdkPlaceToV1Place(place, text)` in [lib/utils/places-mapper.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/utils/places-mapper.ts).
- Extract keyboard navigation (`handleKeyDown`) and click-outside listeners into custom hook [hooks/use-combobox-keyboard.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/hooks/use-combobox-keyboard.ts).
- Extract suggestions dropdown rendering into [components/PlaceAutocompleteSuggestionsList.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/PlaceAutocompleteSuggestionsList.tsx).

### 3. Map Search Bar & Filters (`components/map/map-controls.tsx`)
- Decompose into [components/map/map-search-bar.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/map/map-search-bar.tsx) (search input, debouncing, clear button) and [components/map/map-filter-toggles.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/map/map-filter-toggles.tsx) (category chips, attribute toggles).
- Eliminate excessive prop drilling by reading/updating state via Zustand stores (`useMapStore`, `useUIStore`) where appropriate while maintaining presentational purity where needed.

### 4. Map Symbology & Legend (`components/app-sidebar.tsx`)
- Extract `MapLegendPopover` from [components/app-sidebar.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/app-sidebar.tsx) into [components/map/map-legend-popover.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/map/map-legend-popover.tsx).
- Decouple marker symbology from sidebar layout logic.

## Non-Functional Requirements & Coding Standards
- **Zero Regression:** All existing map navigation, marker selection, place search, and fallback behaviors must continue working seamlessly.
- **Container / Presentational Separation:** UI components remain focused on presentation; pure utilities and custom hooks encapsulate logic.
- **Atomic Verification & Strict TDD:** Pure mapper utilities and layer configurations must have dedicated unit tests (Red-Green-Refactor); end-to-end functionality validated via `./scripts/run-e2e-container.sh chromium ...`.

## Out of Scope
- Winery Modals & Drawers (`mobile-winery-drawer.tsx`, `desktop-winery-modal.tsx`, etc.).
- Trip Planner & Share Dialogs (`TripCardPresentational.tsx`, `TripShareDialog.tsx`, etc.).
- Social & Auth Views (`friends-manager.tsx`, `FriendProfile.tsx`, etc.).
- Database schema changes or remote Supabase mutations.

## Acceptance Criteria
- [ ] `MapView.tsx` LOC is reduced significantly (<200 LOC) and delegates layers, fallback, and panorama to extracted modules.
- [ ] `PlaceAutocomplete.tsx` delegates Places SDK normalization to `lib/utils/places-mapper.ts`, keyboard controls to `hooks/use-combobox-keyboard.ts`, and dropdown list to `PlaceAutocompleteSuggestionsList.tsx`.
- [ ] `map-controls.tsx` is cleanly decomposed into `MapSearchBar` and `MapFilterToggles`.
- [ ] `MapLegendPopover` is isolated in `components/map/map-legend-popover.tsx`.
- [ ] Unit tests for `lib/utils/places-mapper.ts` and extracted utilities pass.
- [ ] Containerized Playwright E2E test suites pass with 0 regressions.
