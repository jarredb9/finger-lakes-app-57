# Track Specification: Core Mapbox Migration & Rendering (mapbox-core-migration_20260715)

## Overview
Migrate the primary map rendering engine from `@vis.gl/react-google-maps` to Mapbox GL JS (`react-map-gl` v8.0.0+ / `mapbox-gl`) to lower Map Load API costs, support offline tile strategies (to be implemented in Track 2), and modernise the UI canvas. We will retain Google Places API v1 on the backend (via Supabase Edge Functions) for search, details, and metadata enrichment.

## Functional Requirements
- **Dependency Upgrades**:
  - Uninstall `@vis.gl/react-google-maps` and `@googlemaps/markerclusterer`.
  - Install `react-map-gl` and `mapbox-gl` (supporting React 19 / Next.js 16).
  - Configure `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` in environmental files.
- **Context & Hook Refactoring**:
  - Rewrite `hooks/use-winery-map.ts` to manage Mapbox camera states, viewport bounding boxes, and zoom configurations.
  - Update `components/winery-map-context.tsx` to handle Mapbox refs and standardise bounds calculations.
  - Implement a translation layer to map coordinate schemas safely (converting DB `{ latitude, longitude }` objects to Mapbox `[longitude, latitude]` arrays).
- **Component Refactoring**:
  - Replace the map canvas in `components/WineryMap.tsx` and `components/map/MapView.tsx` with `<Map>` from `react-map-gl`.
  - Re-implement custom winery clustering using Mapbox's built-in source clustering features.
  - Render custom, high-fidelity cluster markers styled to match shadcn/ui (circular, showing count, color-coded by density/winery counts).
- **Style Switcher**:
  - Add a floating style toggle control on the map UI allowing the user to seamlessly switch between:
    - **Outdoors** (`mapbox://styles/mapbox/outdoors-v12`) - optimized for rural/scenic terrain.
    - **Streets** (`mapbox://styles/mapbox/streets-v12`) - optimized for town details and navigation.
- **Attribution & Compliance**:
  - Place a floating "Powered by Google" badge in the bottom-left corner of the map canvas to remain compliant with Google Places Terms of Service.

## Out of Scope
- Serwist PWA service worker caching configuration for Mapbox tiles (Track 2).
- Updating unit tests (Jest) and integration tests (Playwright) to intercept Mapbox API calls and mock canvas (Track 2).
- Visual regression snapshot regeneration (Track 2).
- Modifying database schemas or replacing Google Places API (retaining Google is mandatory).

## Acceptance Criteria
- The map canvas successfully renders Mapbox tiles and centers/pans to the Finger Lakes region.
- Winery markers are rendered on the map, and clicking a marker opens/focuses the winery details drawer/modal.
- Custom winery clustering works, displaying winery count per cluster, and updates dynamically on zoom.
- The map style toggle successfully changes map styles between Outdoors and Streets.
- A visible "Powered by Google" attribution badge is displayed in the bottom-left corner.
- Autocomplete searches and winery details continue loading rich Google Places data correctly.
