# Track Specification: Mapbox Offline Caching & Verification (mapbox-offline-testing_20260715)

## Overview
This track implements the second half of the Mapbox migration for the Winery Visit Planner. It focuses on offline resilience (Serwist caching for Mapbox styles, sprites, fonts, and tiles), E2E/unit test updates (intercepting API calls and mocking canvas/WebGL), and regenerating visual regression snapshots.

## Functional Requirements
1. **PWA Offline Map Caching**:
   - Update `app/sw.ts` to include runtime caching rules for Mapbox assets:
     - Match URLs matching `*.mapbox.com` or custom tiles.
     - Implement Cache-First/Stale-While-Revalidate strategies for:
       - Styles (`/styles/v1`)
       - Sprites (`/sprites/`)
       - Glyphs/Fonts (`/fonts/v1`)
       - Tiles (vector/raster tiles, `/v4/` or `/tiles/`)
     - Caching constraints: Max entries of 100, max age of 30 days, using `ExpirationPlugin`. Ensure cache quota cleanup is resilient to avoid quota exceeded errors on mobile.
2. **E2E/Unit Test Isolation**:
   - Update unit tests (Jest) to mock `react-map-gl` and the Mapbox context.
   - Update Playwright E2E tests to:
     - Intercept Mapbox API network requests (returning mocked style documents and minimal tile coordinates).
     - Mock the canvas context (`getContext('webgl')`) or inject mocks to stabilize WebGL initialization in headless environments (especially WebKit/Blink).
     - Ensure offline tests (e.g. `pwa-offline.spec.ts`) cover the Mapbox offline caching behavior and gracefully verify the "Offline: Map detail limited" banner works without map crashes.
3. **Visual Regression Snapshot Regeneration**:
   - Run snapshot updates within the Podman container to regenerate baseline visual screenshots (`dashboard-main.png`, `winery-modal.png`, etc.) under the new Mapbox layout.

## Out of Scope
- Migrating backend Google Places API usage (Google remains the single source of truth for searches/details).
- Modifying Postgres schema or stored procedures.

## Acceptance Criteria
1. Service worker successfully intercepts and caches Mapbox style assets, glyphs, sprites, and map tiles under offline conditions.
2. E2E tests run successfully in the Podman container across chromium, webkit, and mobile profiles without WebGL context failures.
3. The primary offline indicator ("Offline: Map detail limited") remains functional and displays correctly when the browser goes offline.
4. Visual regression testing baseline snapshots are regenerated and pass in the chromium environment.
