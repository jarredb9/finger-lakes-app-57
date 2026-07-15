# Track Plan: Mapbox Offline Caching & Verification (mapbox-offline-testing_20260715)

## Phase 1: PWA Service Worker Offline Mapbox Caching
- [ ] Task: Update `app/sw.ts` to cache Mapbox assets
    - [ ] Add runtime caching rules for Mapbox styles, sprites, and fonts.
    - [ ] Add runtime caching rules for Mapbox map tiles (vector and raster).
    - [ ] Integrate Mapbox cache namespaces into the quota cleaning logic in `app/sw.ts` to build resilience against QuotaExceededError.
- [ ] Task: Conductor - User Manual Verification 'PWA Service Worker Offline Mapbox Caching' (Protocol in workflow.md)

## Phase 2: E2E and Unit Test Mocking
- [ ] Task: Mock Mapbox/WebGL in unit tests (Jest)
    - [ ] Update Jest setup files to mock `react-map-gl` and the Mapbox context.
- [ ] Task: Mock Mapbox/WebGL and API endpoints in Playwright E2E tests
    - [ ] Update `e2e/utils.ts` and `e2e/helpers.ts` to intercept Mapbox API requests (styles, glyphs, sprites, tiles).
    - [ ] Add init scripts to mock the canvas context (`getContext('webgl')`) for headless environments.
    - [ ] Update the `waitForMapReady` helper in `e2e/helpers.ts` to be compatible with Mapbox bounds and state structures.
- [ ] Task: Verify offline E2E flow stability
    - [ ] Verify `e2e/pwa-offline.spec.ts` passes with offline routing.
- [ ] Task: Conductor - User Manual Verification 'E2E and Unit Test Mocking' (Protocol in workflow.md)

## Phase 3: Visual Regression Snapshot Regeneration
- [ ] Task: Regenerate visual baseline snapshots
    - [ ] Run Playwright snapshot update command inside the Podman container.
    - [ ] Confirm baseline snapshots are updated and match the new Mapbox UI layout.
- [ ] Task: Conductor - User Manual Verification 'Visual Regression Snapshot Regeneration' (Protocol in workflow.md)
