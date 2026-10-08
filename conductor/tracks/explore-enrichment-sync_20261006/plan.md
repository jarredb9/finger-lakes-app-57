# Implementation Plan: ExploreTabContent Data Pipeline Desynchronization & Missing Winery Enrichment

## Phase 1: Places API Field Mask & Edge Function Rating Ingestion [checkpoint: 5f82b66]
- [x] Task: Expand Places API v1 essentials field mask and Edge Function response normalization (TDD) [commit: fb0ebb97]
    - [x] Write failing Edge Function tests in `supabase/functions/search-wineries` verifying `places.rating` and `places.userRatingCount` ingestion
    - [x] Add `places.rating` and `places.userRatingCount` to `ESSENTIALS_FIELD_MASK` in `supabase/functions/_shared/google-maps.ts`
    - [x] Update and verify `normalizeGooglePlaceV1` in `supabase/functions/_shared/normalization.ts` maps rating and user rating count
    - [x] Run Edge Function tests (`npm run test:functions`) to verify green status
- [x] Task: Conductor - User Manual Verification 'Phase 1: Places API Field Mask & Edge Function Rating Ingestion' (Protocol in workflow.md)

## Phase 2: Database Map Markers RPC Expansion, Type Synchronization & Fixture Hardening [checkpoint: be59c97]
- [x] Task: Expand `get_map_markers` RPC with ratings, review count, and Vibe Tag columns (TDD) [commit: 3ccf775e]
    - [x] Write failing database RPC integration tests in `lib/services/__tests__/db-optimization.integration.test.ts` checking returned ratings, review counts, and Vibe Tag fields
    - [x] Author safe transaction migration `supabase/migrations/<timestamp>_enrich_map_markers_rpc.sql` executing `DROP FUNCTION IF EXISTS public.get_map_markers(uuid);` and `CREATE OR REPLACE FUNCTION public.get_map_markers` with expanded `RETURNS TABLE`
    - [x] Run migration on local Supabase stack (`npm run db:start`) and verify integration tests pass
- [x] Task: Write failing unit tests for tri-state Vibe Tag parsing, rating mapping, and ghost visit clearing (TDD Red phase) [commit: 81a2a126]
    - [x] Update `MapMarkerRpc` interface in `lib/types.ts` and add `db:gen-types` script
    - [x] Write failing unit tests in `lib/utils/__tests__/winery.test.ts` for tri-state Vibe Tag parsing (`boolean | null`), rating mapping, and ghost visit clearing
    - [x] Verify tests fail with expected assertions (Red phase)
- [x] Task: Implement tri-state Vibe Tag preservation, rating mapping, and ghost visit prevention (TDD Green phase) [commit: 59821567]
    - [x] Implement `parseTriStateBoolean` and update `standardizeWineryData` in `lib/utils/winery.ts` to preserve `null` and enforce ghost visit prevention
    - [x] Update mock fixtures in `lib/test-utils/fixtures.ts`, `e2e/fixtures/utils/mock-wineries.ts`, and `e2e/fixtures/handlers/favorites.handler.ts`
    - [x] Run unit tests (`./scripts/run-jest-container.sh lib/utils/__tests__/winery.test.ts`) and typecheck (`npm run type-check`) to verify green status
- [x] Task: Conductor - User Manual Verification 'Phase 2: Database Map Markers RPC Expansion, Type Synchronization & Fixture Hardening' (Protocol in workflow.md)

## Phase 3: Authoritative Store Caching & Reactive User State Synchronization [checkpoint: 6022e933]
- [x] Task: Write failing unit tests for persistentWineries search merging and cache hydration (TDD Red phase) [commit: 60174b81c285b4f082d73183c7f86f47f635066d]
    - [x] Add unit tests in `lib/stores/__tests__/wineryStore.enrichment.test.ts` verifying incoming search results merge into `persistentWineries`
    - [x] Add unit tests verifying `ensureWineryDetails` updates `persistentWineries` seamlessly
    - [x] Confirm tests fail (Red phase)
- [x] Task: Implement persistentWineries search merging and cache hydration in wineryStore (TDD Green phase) [commit: 7b0f93b9]
    - [x] Update search ingestion in `wineryStore` / `useWinerySearch` to merge search results into `persistentWineries` via `bulkUpsertWineries` and `standardizeWineryData`, preserving user flags (`isFavorite`, `onWishlist`, `userVisited`)
    - [x] Ensure `ensureWineryDetails` updates `persistentWineries` seamlessly
    - [x] Run store tests to verify green status
- [x] Task: Write failing unit tests for reactive propagation of favorite, wishlist, and visit actions (TDD Red phase) [commit: b3626865]
    - [x] Add unit tests verifying user state actions (`toggleFavorite`, `toggleWishlist`, visit logs) immediately update `persistentWineries` and propagate across map pins and sidebar
    - [x] Confirm tests fail (Red phase)
- [x] Task: Implement reactive propagation of user actions across persistentWineries (TDD Green phase) [commit: 062b0717]
    - [x] Update user state action reducers/mutations to propagate updates across `persistentWineries`
    - [x] Verify state updates adhere to domain invariants and run store tests to verify green status
- [x] Task: Conductor - User Manual Verification 'Phase 3: Authoritative Store Caching & Reactive User State Synchronization' (Protocol in workflow.md) [commit: 6022e933]

## Phase 4: Unified Sidebar List & Viewport Filtering [checkpoint: b7dee990]
- [x] Task: Write failing unit tests for useWineryFilter viewport list unification and Vibe Tag filtering (TDD Red phase) [commit: c6ce230d]
    - [x] Add unit tests in `hooks/__tests__/use-winery-filter.test.ts` verifying `listResultsInView` includes all cached wineries within viewport bounds even when searches have been performed
    - [x] Add unit tests verifying user badges (`isFavorite`, `userVisited`, `onWishlist`) are preserved in `listResultsInView`
    - [x] Add unit tests verifying Vibe Tag filters strictly match `=== true` (excluding `null` / un-enriched records)
    - [x] Confirm tests fail (Red phase)
- [x] Task: Refactor useWineryFilter to eliminate diverging searchResults branching (TDD Green phase) [commit: 40f901a5]
    - [x] Refactor `listResultsInView` in `hooks/use-winery-filter.ts` to compute list from unified winery collection filtered by `bounds` and active criteria
    - [x] Ensure Vibe Tag filters (`allowsDogs`, `goodForChildren`, etc.) strictly match `=== true` (excluding `null` / un-enriched records)
    - [x] Run filter hook unit tests to verify green status
- [x] Task: Write failing component tests for WineryCardThumbnail badges and Vibe Tag filtering (TDD Red phase) [commit: a45c6b1c]
    - [x] Add failing component tests in `components/__tests__/winery-card-thumbnail.test.tsx` verifying card thumbnail renders ratings, review count, and status badges accurately
    - [x] Add component tests verifying filter Vibe Tag toggles filter both map pins and sidebar list
    - [x] Confirm tests fail (Red phase)
- [x] Task: Implement WineryCardThumbnail badges and synchronize Vibe Tag filtering (TDD Green phase) [commit: 299581c3]
    - [x] Update `WineryCardThumbnail` to render ratings, review counts, and status badges
    - [x] Ensure filter Vibe Tag toggles accurately filter both map pins and sidebar list on initial load
    - [x] Run component tests to verify green status
- [x] Task: Conductor - User Manual Verification 'Phase 4: Unified Sidebar List & Viewport Filtering' (Protocol in workflow.md) [commit: b7dee990]

## Phase 5: Viewport Search UX & Map Event Sync [checkpoint: 6f732d7b]
- [x] Task: Write failing unit tests for Haversine distance and FloatingSearchAreaButton (TDD Red phase) [commit: 131dfaf6]
    - [x] Write failing unit tests for `calculateDistanceKm` in `lib/utils/__tests__/map-utils.test.ts`
    - [x] Write failing tests for viewport distance tracking: display floating button when `autoSearch` is false and center distance > 5 km from `lastSearchedBounds`
    - [x] Confirm tests fail (Red phase)
- [x] Task: Write failing E2E tests for viewport panning and FloatingSearchAreaButton overlay (TDD Red phase) [commit: 78db39e4]
    - [x] Create `e2e/map-viewport.spec.ts` asserting "Search this area" button flow in real browser
    - [x] Assert button is suppressed initially and within 5 km of last search
    - [x] Assert button appears upon panning viewport center >5 km away with `autoSearch: false`
    - [x] Assert clicking button initiates area search and dismisses button
    - [x] Confirm E2E test fails against current stub implementation (Red phase)
- [x] Task: Implement Haversine distance utility and FloatingSearchAreaButton overlay (TDD Green phase) [commit: 80168697]
    - [x] Implement `calculateDistanceKm` in `lib/utils/map-utils.ts`
    - [x] Create `FloatingSearchAreaButton` component and embed at top-center of the map canvas in `components/WineryMap.tsx`
    - [x] Wire button click to trigger `handleManualSearchArea()` and dismiss button
    - [x] Add map `resize` listener so sidebar expand/collapse recalculates viewport `bounds`
    - [x] Run unit and E2E tests to verify green status
- [x] Task: Conductor - User Manual Verification 'Phase 5: Viewport Search UX & Map Event Sync' (Protocol in workflow.md) [commit: 6f732d7b]

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

## Phase: Review Fixes
- [x] Task: Apply review suggestions ba2f5f3
- [x] Task: Apply review suggestions e9475e21

