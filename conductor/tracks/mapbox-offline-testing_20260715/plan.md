# Track Plan: Mapbox Offline Caching & Verification (mapbox-offline-testing_20260715)

## Phase 1: PWA Service Worker Offline Mapbox Caching [checkpoint: 702e477]
- [x] Task: Update `app/sw.ts` to cache Mapbox assets (d93ef79)
    - [x] Add runtime caching rules for Mapbox styles, sprites, and fonts.
    - [x] Add runtime caching rules for Mapbox map tiles (vector and raster).
    - [x] Integrate Mapbox cache namespaces into the quota cleaning logic in `app/sw.ts` to build resilience against QuotaExceededError.
- [x] Task: Update cache names in `lib/utils/quota.ts` to include Mapbox tile cache identifiers so they can be cleaned under storage pressure. (d93ef79)
- [x] Task: Conductor - User Manual Verification 'PWA Service Worker Offline Mapbox Caching' (Protocol in workflow.md)

## Phase 2: E2E and Unit Test Mocking
- [ ] Task: Mock Mapbox/WebGL in unit tests (Jest)
    - [ ] Update Jest setup files to mock `react-map-gl` and the Mapbox context.
    - [ ] Refactor unit tests mock hooks (e.g. `use-winery-search.test.ts`, `use-places-autocomplete-session.test.ts`) that previously mocked `@vis.gl/react-google-maps` features.
- [ ] Task: Mock Mapbox/WebGL and API endpoints in Playwright E2E tests
    - [ ] Update `e2e/utils.ts` and `e2e/helpers.ts` to intercept Mapbox API requests (styles, glyphs, sprites, tiles).
    - [ ] Add init scripts to mock the canvas context (`getContext('webgl')`) for headless environments.
    - [ ] Update the `waitForMapReady` helper in `e2e/helpers.ts` and all store bounds mock injectors (e.g. `setBounds`) to match the new Mapbox serializable bounds/states.
- [ ] Task: Verify offline E2E flow stability
    - [ ] Verify `e2e/pwa-offline.spec.ts` passes with offline routing.
- [ ] Task: Conductor - User Manual Verification 'E2E and Unit Test Mocking' (Protocol in workflow.md)

## Phase 3: Visual Regression Snapshot Regeneration
- [ ] Task: Regenerate visual baseline snapshots
    - [ ] Run Playwright snapshot update command inside the Podman container.
    - [ ] Confirm baseline snapshots are updated and match the new Mapbox UI layout.
- [ ] Task: Conductor - User Manual Verification 'Visual Regression Snapshot Regeneration' (Protocol in workflow.md)
