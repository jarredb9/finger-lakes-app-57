# Track Plan: Core Mapbox Migration & Rendering (mapbox-core-migration_20260715)

## Phase 1: Dependencies and Foundation [checkpoint: 7cb364a]
- [x] Task: Uninstall `@vis.gl/react-google-maps` and `@googlemaps/markerclusterer` from package dependencies. (952ec7b)
- [x] Task: Install `react-map-gl` and `mapbox-gl` as dependencies, and `@types/mapbox-gl` as devDependencies. (952ec7b)
- [x] Task: Install `@googlemaps/js-api-loader` to support client-side Google Places Autocomplete API calls. (952ec7b)
- [x] Task: Update environmental templates (`.env.local.example`) and configurations to include `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`. (952ec7b)
- [x] Task: Write failing unit tests for coordinate translation helpers (e.g., converting coordinate objects `{ latitude, longitude }` to Mapbox `[longitude, latitude]` arrays). (952ec7b)
- [x] Task: Implement coordinate translation helpers in `lib/utils/map-utils.ts` and verify unit tests pass. (952ec7b)
- [x] Task: Conductor - User Manual Verification 'Dependencies and Foundation' (Protocol in workflow.md) (9fba07a)

## Phase 2: React Context, Hook & Store Refactoring [checkpoint: 126f6d9]
- [x] Task: Refactor `lib/stores/mapStore.ts` to replace `google.maps.Map` and bounds types with Mapbox-compatible types.
- [x] Task: Refactor `hooks/use-winery-map.ts` to manage Mapbox camera states, zoom thresholds, and viewport bounding boxes.
- [x] Task: Refactor `hooks/use-winery-filter.ts` to support Mapbox bounds containment checks (replacing Google's `bounds.contains`).
- [x] Task: Refactor `components/winery-map-context.tsx` to expose Mapbox-compatible event handlers, map instance refs, and bounds calculations.
- [x] Task: Delete `components/google-maps-provider.tsx` and `components/generic-marker-clusterer.tsx`. Refactor `components/app-shell.tsx` to remove references to `GoogleMapsProvider`.
- [x] Task: Ensure TypeScript types compile and existing codebases do not break.
- [x] Task: Implement integrated, full-screen immersive Google Street View action button inside Winery Modal with overlay hiding and state preservation.
- [x] Task: Conductor - User Manual Verification 'React Context & Hook Refactoring' (Protocol in workflow.md)

## Phase 3: Component Rewrite & Style Switcher
- [x] Task: Rewrite `components/WineryMap.tsx` and `components/map/MapView.tsx` to render the `react-map-gl` canvas. (c29e6c1)
- [x] Task: Re-implement custom winery clustering using Mapbox's built-in source clustering. (c29e6c1)
- [x] Task: Implement custom, high-fidelity cluster markers styled to match shadcn/ui (circular, showing count, color-coded by density/winery counts). (c29e6c1)
- [x] Task: Implement the floating Style Switcher control on the map canvas allowing toggle between Outdoors and Streets styles. (c29e6c1)
- [x] Task: Implement the floating Google attribution badge in the bottom-left corner of the map (retaining term compliance). (c29e6c1)
- [ ] Task: Conductor - User Manual Verification 'Component Rewrite & Style Switcher' (Protocol in workflow.md)

## Phase: Review Fixes
- [x] Task: Apply review suggestions (31562ea)
- [x] Task: Adjust mobile Google attribution badge positioning (947dc86)
