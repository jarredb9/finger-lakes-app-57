# Track Plan: Core Mapbox Migration & Rendering (mapbox-core-migration_20260715)

## Phase 1: Dependencies and Foundation
- [ ] Task: Uninstall `@vis.gl/react-google-maps` and `@googlemaps/markerclusterer` from package dependencies.
- [ ] Task: Install `react-map-gl` and `mapbox-gl` as dependencies, and `@types/mapbox-gl` as devDependencies.
- [ ] Task: Install `@googlemaps/js-api-loader` to support client-side Google Places Autocomplete API calls.
- [ ] Task: Update environmental templates (`.env.local.example`) and configurations to include `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`.
- [ ] Task: Write failing unit tests for coordinate translation helpers (e.g., converting coordinate objects `{ latitude, longitude }` to Mapbox `[longitude, latitude]` arrays).
- [ ] Task: Implement coordinate translation helpers in `lib/utils/map-utils.ts` and verify unit tests pass.
- [ ] Task: Conductor - User Manual Verification 'Dependencies and Foundation' (Protocol in workflow.md)

## Phase 2: React Context, Hook & Store Refactoring
- [ ] Task: Refactor `lib/stores/mapStore.ts` to replace `google.maps.Map` and bounds types with Mapbox-compatible types.
- [ ] Task: Refactor `hooks/use-winery-map.ts` to manage Mapbox camera states, zoom thresholds, and viewport bounding boxes.
- [ ] Task: Refactor `hooks/use-winery-filter.ts` to support Mapbox bounds containment checks (replacing Google's `bounds.contains`).
- [ ] Task: Refactor `components/winery-map-context.tsx` to expose Mapbox-compatible event handlers, map instance refs, and bounds calculations.
- [ ] Task: Delete `components/google-maps-provider.tsx` and `components/generic-marker-clusterer.tsx`. Refactor `components/app-shell.tsx` to remove references to `GoogleMapsProvider`.
- [ ] Task: Ensure TypeScript types compile and existing codebases do not break.
- [ ] Task: Conductor - User Manual Verification 'React Context & Hook Refactoring' (Protocol in workflow.md)

## Phase 3: Component Rewrite & Style Switcher
- [ ] Task: Rewrite `components/WineryMap.tsx` and `components/map/MapView.tsx` to render the `react-map-gl` canvas.
- [ ] Task: Re-implement custom winery clustering using Mapbox's built-in source clustering.
- [ ] Task: Implement custom, high-fidelity cluster markers styled to match shadcn/ui (circular, showing count, color-coded by density/winery counts).
- [ ] Task: Implement the floating Style Switcher control on the map canvas allowing toggle between Outdoors and Streets styles.
- [ ] Task: Implement the floating Google attribution badge in the bottom-left corner of the map (retaining term compliance).
- [ ] Task: Conductor - User Manual Verification 'Component Rewrite & Style Switcher' (Protocol in workflow.md)
