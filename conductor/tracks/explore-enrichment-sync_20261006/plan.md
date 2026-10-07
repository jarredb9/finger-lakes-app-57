# Implementation Plan: ExploreTabContent Data Pipeline Desynchronization & Missing Winery Enrichment

## Phase 1: Places API Field Mask & Edge Function Rating Ingestion
- [ ] Task: Expand Places API v1 essentials field mask and Edge Function response normalization (TDD)
    - [ ] Write failing Edge Function tests in `supabase/functions/search-wineries` verifying `places.rating` and `places.userRatingCount` ingestion
    - [ ] Add `places.rating` and `places.userRatingCount` to `ESSENTIALS_FIELD_MASK` in `supabase/functions/_shared/google-maps.ts`
    - [ ] Update and verify `normalizeGooglePlaceV1` in `supabase/functions/_shared/normalization.ts` maps rating and user rating count
    - [ ] Run Edge Function tests (`npm run test:functions`) to verify green status
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Places API Field Mask & Edge Function Rating Ingestion' (Protocol in workflow.md)

## Phase 2: Database Map Markers RPC Expansion, Type Synchronization & Fixture Hardening
- [ ] Task: Expand `get_map_markers` RPC with ratings, review count, and Vibe Tag columns (TDD)
    - [ ] Write failing database RPC integration tests in `lib/services/__tests__/db-optimization.integration.test.ts` checking returned ratings, review counts, and Vibe Tag fields
    - [ ] Author safe transaction migration `supabase/migrations/<timestamp>_enrich_map_markers_rpc.sql` executing `DROP FUNCTION IF EXISTS public.get_map_markers(uuid);` and `CREATE OR REPLACE FUNCTION public.get_map_markers` with expanded `RETURNS TABLE`
    - [ ] Run migration on local Supabase stack (`npm run db:start`) and verify integration tests pass
- [ ] Task: Synchronize TypeScript types, E2E fixtures, and `standardizeWineryData` (TDD)
    - [ ] Update `MapMarkerRpc` interface in `lib/types.ts` and regenerate types via `npm run db:gen-types`
    - [ ] Update E2E mock fixtures in `e2e/fixtures/handlers/favorites.handler.ts` to include expanded marker columns
    - [ ] Write failing unit tests in `lib/utils/__tests__/winery.test.ts` for tri-state Vibe Tag parsing (`boolean | null`), rating mapping, and ghost visit clearing
    - [ ] Update `standardizeWineryData` in `lib/utils/winery.ts` to preserve `null` for un-enriched Vibe Tags and enforce ghost visit prevention
    - [ ] Run unit tests to verify green status
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Database Map Markers RPC Expansion, Type Synchronization & Fixture Hardening' (Protocol in workflow.md)

## Phase 3: Authoritative Store Caching & Reactive User State Synchronization
- [ ] Task: Establish `wineryStore.persistentWineries` as single source of truth for search results (TDD)
    - [ ] Write failing unit tests in `lib/stores/__tests__/wineryStore.enrichment.test.ts` verifying incoming search results merge into `persistentWineries`
    - [ ] Update search ingestion in `wineryStore` / `useWinerySearch` to merge search results into `persistentWineries` via `bulkUpsertWineries` and `standardizeWineryData`, preserving user flags (`isFavorite`, `onWishlist`, `userVisited`)
    - [ ] Ensure `ensureWineryDetails` updates `persistentWineries` seamlessly
    - [ ] Run store tests to verify green status
- [ ] Task: Reactive propagation of favorite, wishlist, and visit actions (TDD)
    - [ ] Write failing unit tests verifying user state actions (`toggleFavorite`, `toggleWishlist`, visit logs) immediately update `persistentWineries` and propagate across map pins and sidebar
    - [ ] Verify state updates adhere to domain invariants and run unit tests to verify green status
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Authoritative Store Caching & Reactive User State Synchronization' (Protocol in workflow.md)

## Phase 4: Unified Sidebar List & Viewport Filtering
- [ ] Task: Refactor `useWineryFilter` to eliminate diverging `searchResults` branching (TDD)
    - [ ] Write failing unit tests in `hooks/__tests__/use-winery-filter.test.ts` verifying `listResultsInView` includes all cached wineries within viewport bounds even when searches have been performed
    - [ ] Write failing unit tests verifying user badges (`isFavorite`, `userVisited`, `onWishlist`) are preserved in `listResultsInView`
    - [ ] Refactor `listResultsInView` in `hooks/use-winery-filter.ts` to compute list from unified winery collection filtered by `bounds` and active criteria
    - [ ] Ensure Vibe Tag filters (`allowsDogs`, `goodForChildren`, etc.) strictly match `=== true` (excluding `null` / un-enriched records)
    - [ ] Run filter hook unit tests to verify green status
- [ ] Task: Synchronize card thumbnail indicators and Vibe Tag filtering (TDD)
    - [ ] Write failing component tests verifying `WineryCardThumbnail` renders ratings, review count, and status badges accurately
    - [ ] Ensure filter Vibe Tag toggles accurately filter both map pins and sidebar list on initial load
    - [ ] Run component tests to verify green status
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Unified Sidebar List & Viewport Filtering' (Protocol in workflow.md)

## Phase 5: Viewport Search UX & Map Event Sync
- [ ] Task: Implement Haversine distance utility and floating "Search this area" overlay (TDD)
    - [ ] Write failing unit tests for `calculateDistanceKm` in `lib/utils/__tests__/map-utils.test.ts`
    - [ ] Implement `calculateDistanceKm` in `lib/utils/map-utils.ts`
    - [ ] Create `FloatingSearchAreaButton` component and embed at top-center of the map canvas in `components/WineryMap.tsx`
    - [ ] Write failing tests for viewport distance tracking: display floating button when `autoSearch` is false and center distance > 5 km from `lastSearchedBounds`
    - [ ] Wire button click to trigger `handleManualSearchArea()` and dismiss button
    - [ ] Add map `resize` listener so sidebar expand/collapse recalculates viewport `bounds`
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
