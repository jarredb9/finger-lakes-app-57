# Specification: Map Core, Search Autocomplete & Controls Decoupling Refactor

## Overview
This track executes a focused prerequisite refactoring slice on 4 core map and search components ([MapView.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/map/MapView.tsx), [PlaceAutocomplete.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/PlaceAutocomplete.tsx), [map-controls.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/map/map-controls.tsx), and [app-sidebar.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/app-sidebar.tsx)) directly in the critical path of upcoming Map Marker Enhancements and Search Capabilities (Issue #31).

## Scope & Target Components

### 1. Map Core & Marker Layers (`components/map/MapView.tsx`)
- Extract Mapbox layer definitions (`clusterLayer`, `clusterCountLayer`, `unclusteredPointLayer`) into [lib/maps/mapbox-layers.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/maps/mapbox-layers.ts).
- Extract Google Maps JS API adapter logic into [lib/maps/google-map-adapter.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/maps/google-map-adapter.ts).
- Extract Google Map Fallback marker rendering & interaction into [components/map/google-map-fallback.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/map/google-map-fallback.tsx).
- Extract Street View launcher into custom hook [hooks/use-street-view-panorama.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/hooks/use-street-view-panorama.ts).
  - **Street View Universal URL Architecture (Free & High Reliability):** Rather than loading heavy in-app WebGL panorama canvases (which incur $7/1k Dynamic Street View API charges, trigger 429 burst rate limits, and cause 502/black screens on rural coordinates without dedicated GPUs), Street View triggers Google Maps Universal URLs (`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint={lat},{lng}`). This opens directly in an external tab on Desktop or deep-links to the native Google Maps app on Mobile/Tablet with $0.00 API cost and full hardware acceleration.
  - **Street View Contract Preservation:** Preserve `map.openStreetView(lat, lng)` on the map instance registered in `useMapStore` (both Mapbox and `GoogleMapAdapter`) as required by consumers like `use-winery-modal-state.ts`.
- Reduce `MapView.tsx` to a clean container component orchestrating Mapbox / Fallback without god-component bloat, maintaining DOM stability (`data-state="ready|loading|error"`).

### 2. Search Autocomplete Engine (`components/PlaceAutocomplete.tsx`)
- Extract Google Places SDK response normalizer into a pure helper `mapSdkPlaceToV1Place(place, text)` in [lib/utils/places-mapper.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/utils/places-mapper.ts).
  - **Defensive Coordinate Standard:** Safely extract coordinates supporting both SDK `LatLng` methods (`place.location.lat()`) and object properties (`place.location.latitude`), outputting standardized `latitude` / `longitude` to pass into `standardizeWineryData` per `AGENTS.md` rules.
- Extract keyboard navigation (`handleKeyDown`) and click-outside listeners into custom hook [hooks/use-combobox-keyboard.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/hooks/use-combobox-keyboard.ts).
- Extract suggestions dropdown rendering into [components/PlaceAutocompleteSuggestionsList.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/PlaceAutocompleteSuggestionsList.tsx).

### 3. Map Search Bar & Filters (`components/map/map-controls.tsx`)
- Decompose into:
  - [components/map/map-search-bar.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/map/map-search-bar.tsx) (pure presentational search input, debouncing, clear button, manual area search button, auto toggle).
  - [components/map/map-filter-toggles.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/map/map-filter-toggles.tsx) (pure presentational category chips, attribute toggles, trip overlay selector).
- Keep subcomponents pure and presentational (props-driven) to allow straightforward unit testing without store mocks.
- Use `MapControls` as the container connecting to `useWineryMapContext()` / `useTripStore` to eliminate the 11-prop drilling from [components/app-sidebar.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/app-sidebar.tsx).

### 4. Map Symbology, Legend & AppSidebar Decomposition (`components/app-sidebar.tsx`, `components/app-shell.tsx`)
- Extract `MapLegendPopover` from [components/app-sidebar.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/app-sidebar.tsx) into [components/map/map-legend-popover.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/map/map-legend-popover.tsx).
- Extract shared user navigation menu into [components/nav/user-nav.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/nav/user-nav.tsx) (consumed by both `AppSidebar` desktop and `AppShell` mobile floating avatar), consolidating PWA install/update hooks and navigation links.
- Extract tab content subcomponents ([components/sidebar/explore-tab-content.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/sidebar/explore-tab-content.tsx) and [components/sidebar/history-tab-content.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/sidebar/history-tab-content.tsx)) to colocate `useWineryMapContext` and `useUIStore` state subscriptions, eliminating full sidebar re-renders during map viewport changes.
- Refactor `AppSidebar.tsx` into a lightweight layout and tab orchestrator (<80 LOC).

### 5. Mobile Navigation Bar Modular Decomposition (`components/app-shell.tsx`)
- Extract mobile bottom navigation bar from [components/app-shell.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/app-shell.tsx) into [components/layout/MobileNavBar.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/layout/MobileNavBar.tsx).
- Colocate `useFriendStore` badge count subscription within `MobileNavBar` to prevent `AppShell` root re-renders on realtime social updates.
- Complete 3-tier layout symmetry (`AppSidebar` for Desktop, `TabletFloatingDrawer` for Tablet, `MobileNavBar` + `InteractiveBottomSheet` for Mobile).

## Non-Functional Requirements & Coding Standards
- **Zero Regression:** All existing map navigation, marker selection, place search, fallback, and Street View modal actions must continue working seamlessly.
- **Container / Presentational Separation:** UI components remain focused on presentation; pure utilities and custom hooks encapsulate logic.
- **Coordinate Standardization:** Property-based access only (`location.latitude`, `location.longitude`) with legacy key stripping via `standardizeWineryData`.
- **DOM Stability:** Root map containers (`[data-testid="map-container"]`) must maintain uninterrupted DOM presence during loading and error states.
- **Atomic Verification & Strict TDD:** Pure mapper utilities and layer configurations must have dedicated unit tests (Red-Green-Refactor); end-to-end functionality validated via `./scripts/run-e2e-container.sh chromium ...`.

## Out of Scope
- Winery Modals & Drawers (`mobile-winery-drawer.tsx`, `desktop-winery-modal.tsx`, etc.).
- Trip Planner & Share Dialogs (`TripCardPresentational.tsx`, `TripShareDialog.tsx`, etc.).
- Social & Auth Views (`friends-manager.tsx`, `FriendProfile.tsx`, etc.).
- Database schema changes or remote Supabase mutations.

## Acceptance Criteria
- [ ] `MapView.tsx` LOC is reduced significantly (<200 LOC) and delegates layers, fallback, and panorama to extracted modules.
- [ ] `map.openStreetView(lat, lng)` remains properly bound on the map instance in `useMapStore` for both Mapbox and GoogleMapAdapter.
- [ ] `PlaceAutocomplete.tsx` delegates Places SDK normalization to `lib/utils/places-mapper.ts`, keyboard controls to `hooks/use-combobox-keyboard.ts`, and dropdown list to `PlaceAutocompleteSuggestionsList.tsx`.
- [ ] `places-mapper.ts` handles SDK method (`.lat()`) and property-based coordinates defensively, outputting valid objects for `standardizeWineryData`.
- [ ] `map-controls.tsx` is cleanly decomposed into presentational `MapSearchBar` and `MapFilterToggles`, eliminating 11-prop drilling from `app-sidebar.tsx`.
- [ ] `MapLegendPopover` is isolated in `components/map/map-legend-popover.tsx`.
- [ ] `AppSidebar.tsx` is decomposed into a lightweight tab orchestrator (<80 LOC), colocating map context in `ExploreTabContent` and history modal state in `HistoryTabContent`.
- [ ] `UserNav` is extracted into `components/nav/user-nav.tsx` and shared across `AppSidebar` and `AppShell`.
- [ ] `MobileNavBar.tsx` is extracted into `components/layout/MobileNavBar.tsx`, colocating friend request badge store subscriptions.
- [ ] Unit tests for `lib/utils/places-mapper.ts`, extracted hooks, and subcomponents pass with 100% success.
- [ ] Containerized Playwright E2E test suites (`smoke.spec.ts`, `accessibility.spec.ts`, `responsive-layout.spec.ts`) pass with 0 regressions.
