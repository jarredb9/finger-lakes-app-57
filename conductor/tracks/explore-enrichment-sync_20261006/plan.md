# Implementation Plan: ExploreTabContent Data Pipeline Desynchronization & Missing Winery Enrichment

## Phase 1: Places API Field Mask & Edge Function Rating Ingestion
- [ ] Task: Expand Places API v1 essentials field mask and Edge Function response normalization (TDD)
    - [ ] Write failing Edge Function unit/integration tests for `search-wineries` verifying `places.rating` and `places.userRatingCount` ingestion
    - [ ] Add `places.rating` and `places.userRatingCount` to `ESSENTIALS_FIELD_MASK` in `supabase/functions/_shared/google-maps.ts`
    - [ ] Update `normalizeGooglePlaceV1` in `supabase/functions/_shared/places-v1.ts` to map rating and user rating count
    - [ ] Run Edge Function tests (`npm run test:functions`) to verify green status
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Places API Field Mask & Edge Function Rating Ingestion' (Protocol in workflow.md)

## Phase 2: Database Map Markers RPC Expansion & Type Synchronization
- [ ] Task: Expand `get_map_markers` RPC with ratings, review count, and amenity columns (TDD)
    - [ ] Write failing database RPC integration tests in `lib/services/__tests__/db-optimization.integration.test.ts` checking returned ratings and amenity fields
    - [ ] Author expand-and-contract migration `supabase/migrations/<timestamp>_enrich_map_markers_rpc.sql` updating `public.get_map_markers` `RETURNS TABLE`
    - [ ] Run migration on local Supabase stack (`npm run db:start`) and verify tests pass
- [ ] Task: Synchronize TypeScript types and `standardizeWineryData` for marker records (TDD)
    - [ ] Update `MapMarkerRpc` interface in `lib/types.ts` and regenerate types via `npm run db:gen-types`
    - [ ] Write failing unit tests in `lib/utils/__tests__/winery.test.ts` for rating and amenity mapping from marker records
    - [ ] Update `standardizeWineryData` in `lib/utils/winery.ts` to extract ratings, review count, and amenities from `MapMarkerRpc`
    - [ ] Run unit tests to verify green status
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Database Map Markers RPC Expansion & Type Synchronization' (Protocol in workflow.md)

## Phase 3: Authoritative Store Caching & Reactive User State Synchronization
- [ ] Task: Establish `wineryStore.persistentWineries` as single source of truth for search results (TDD)
    - [ ] Write failing unit tests in `lib/stores/__tests__/wineryStore.enrichment.test.ts` verifying incoming search results merge into `persistentWineries`
    - [ ] Update search ingestion in `wineryStore` / search handlers to merge search results into `persistentWineries` via `standardizeWineryData`, preserving user flags (`isFavorite`, `onWishlist`, `userVisited`)
    - [ ] Ensure `ensureWineryDetails` updates `persistentWineries` seamlessly
    - [ ] Run store tests to verify green status
- [ ] Task: Reactive propagation of favorite, wishlist, and visit actions (TDD)
    - [ ] Write failing unit tests verifying user state actions (`toggleFavorite`, `toggleWishlist`, visit logs) immediately update `persistentWineries` and propagate across map pins and sidebar
    - [ ] Verify state updates adhere to domain invariants and run unit tests to verify green status
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Authoritative Store Caching & Reactive User State Synchronization' (Protocol in workflow.md)

## Phase 4: Unified Sidebar List & Viewport Filtering
- [ ] Task: Refactor `useWineryFilter` to eliminate diverging `searchResults` branching (TDD)
    - [ ] Write failing unit tests in `hooks/__tests__/use-winery-filter.test.ts` verifying `listResultsInView` includes all cached wineries within viewport bounds even when `searchResults` is populated
    - [ ] Write failing unit tests verifying user badges (`isFavorite`, `userVisited`, `onWishlist`) are preserved in `listResultsInView`
    - [ ] Refactor `listResultsInView` in `hooks/use-winery-filter.ts` to compute list from unified winery collection filtered by `bounds` and active criteria
    - [ ] Run filter hook unit tests to verify green status
- [ ] Task: Synchronize card thumbnail indicators and attribute filtering (TDD)
    - [ ] Write failing component tests verifying `WineryCardThumbnail` renders ratings, review count, and status badges accurately
    - [ ] Ensure filter attribute toggles (dog-friendly, outdoor seating, etc.) accurately filter both map pins and sidebar list on initial load
    - [ ] Run component tests to verify green status
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Unified Sidebar List & Viewport Filtering' (Protocol in workflow.md)

## Phase 5: Viewport Search UX & Map Event Sync
- [ ] Task: Implement "Search this area" floating control and map viewport sync (TDD)
    - [ ] Write failing tests for viewport distance tracking and "Search this area" trigger
    - [ ] Implement floating "Search this area" button when panning significantly away from previous search bounds (when `autoSearch` is false)
    - [ ] Wire button click to trigger area search for current bounds/center and merge into unified cache
    - [ ] Add map `resize` listener so sidebar open/close recalculates viewport `bounds`
    - [ ] Run unit tests to verify green status
- [ ] Task: Conductor - User Manual Verification 'Phase 5: Viewport Search UX & Map Event Sync' (Protocol in workflow.md)

## Phase 6: Test Suite Hardening, Scaffolding Cleanup & End-to-End Verification
- [ ] Task: Audit and cleanup temporary test scaffolding
    - [ ] Audit all test files and fixtures created during this track
    - [ ] Remove any throwaway intermediate scaffolds, redundant fixtures, or obsolete tests
    - [ ] Confirm all permanent regression tests are clean, robust, and well-documented
- [ ] Task: Full regression test execution across unit, integration, and E2E suites
    - [ ] Run full unit and integration test suite via container runner (`./scripts/run-jest-container.sh`)
    - [ ] Run Edge Function tests (`npm run test:functions`)
    - [ ] Run targeted Playwright E2E verification (`./scripts/run-e2e-container.sh webkit e2e/map-viewport.spec.ts` or relevant specs)
- [ ] Task: Conductor - User Manual Verification 'Phase 6: Test Suite Hardening, Scaffolding Cleanup & End-to-End Verification' (Protocol in workflow.md)
