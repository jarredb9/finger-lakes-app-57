# Specification: ExploreTabContent Data Pipeline Desynchronization & Missing Winery Enrichment

## Overview
This track resolves data pipeline desynchronization and missing winery enrichment between the map canvas pins, the Explore tab sidebar ("Wineries in View"), Google Places v1 search, and the local Supabase database (GitHub Issue #44).

Currently, users experience:
1. "Wineries in View" showing 0 wineries despite multiple pins being visible on the map canvas after panning/zooming.
2. Favorited, visited, or wishlist badges missing from sidebar cards because search results and persistent winery records diverge.
3. Missing Google ratings and amenity indicators on initial map loading because the `get_map_markers` RPC omits these columns and the Google Places search essentials field mask omits `places.rating`.
4. Stale bounds and missing search trigger when panning away from the initial search area.

This track establishes a single source of truth in `wineryStore.persistentWineries`, enriches the database marker RPC and Places API field mask, ensures seamless two-way state propagation on user actions, and delivers responsive viewport search UX.

## Development Methodology & Test Hygiene
- **Strict Test-Driven Development (TDD):** Every functional unit, store mutation, and hook modification must adhere strictly to the TDD cycle (Red -> Green -> Refactor): write failing tests verifying the expected behavior, implement minimal code to pass, and refactor cleanly.
- **Scaffolding Test Cleanup:** Any temporary scaffolding, throwaway spike mocks, or intermediate test fixtures introduced solely for migration bridging that provide no lasting regression testing value must be audited and cleanly removed at the conclusion of the track.

## Functional Requirements

### 1. Unified Authoritative Winery Caching & Sidebar Filtering
- **Single Source of Truth (`wineryStore.persistentWineries`):**
  - Ingest and merge search results from Google Places API or text searches into `wineryStore.persistentWineries` via `standardizeWineryData`, ensuring user flags (`isFavorite`, `onWishlist`, `userVisited`, custom notes) and existing enrichment details are preserved.
  - In `hooks/use-winery-filter.ts`, eliminate the disjoint `searchResults.length > 0` branching in `listResultsInView`.
  - Sidebar results (`listResultsInView`) must be computed by filtering the unified collection of wineries (persisted + newly searched) by active map `bounds` and active filter criteria (categories + attributes).
  - Every winery pin visible within map bounds must be eligible to appear in the "Wineries in View" list.

### 2. Places API v1 Rating & Review Count Ingestion
- **Field Mask Enrichment:**
  - Update `ESSENTIALS_FIELD_MASK` in `supabase/functions/_shared/google-maps.ts` to include `places.rating` and `places.userRatingCount`.
  - Ensure Edge Function responses and `normalizeGooglePlaceV1` map ratings and rating counts to standard fields.
  - `standardizeWineryData` must map rating and review count from basic search payloads so winery cards display ratings immediately upon search.

### 3. Database Map Markers RPC Expansion (`get_map_markers`)
- **Schema & RPC Migration:**
  - Create an expand-and-contract database migration updating `public.get_map_markers(p_user_id uuid)` with `RETURNS TABLE`:
    - `id integer`
    - `google_place_id text`
    - `name text`
    - `latitude numeric`
    - `longitude numeric`
    - `is_favorite boolean`
    - `on_wishlist boolean`
    - `user_visited boolean`
    - `is_favorite_private boolean`
    - `on_wishlist_private boolean`
    - `google_rating numeric`
    - `user_rating_count integer`
    - `allows_dogs boolean`
    - `good_for_children boolean`
    - `outdoor_seating boolean`
    - `has_ev_charging boolean`
    - `enrichment_tier text`
  - Update `MapMarkerRpc` interface in `lib/types.ts` and regenerate TypeScript types via `npm run db:gen-types`.
  - Ensure `standardizeWineryData` populates ratings and amenity flags on startup from marker RPC output without requiring full winery enrichment modal open.

### 4. Reactive State Synchronization on User Actions
- **Instant UI Updates:**
  - When user actions occur (`toggleFavorite`, `toggleWishlist`, visit logged/deleted), changes update `wineryStore.persistentWineries` and immediately reflect across both map pins and sidebar cards without waiting for network re-fetch.
  - When `ensureWineryDetails` finishes lazy enrichment, the enriched record updates `wineryStore.persistentWineries`.
  - Preserve single-source-of-truth invariants so no secondary disconnected arrays exist in `mapStore`.

### 5. Viewport Search UX & Map Event Synchronization
- **"Search this area" UX:**
  - When `autoSearch` is disabled (or when panning significantly outside previous search bounds), display a prominent floating "Search this area" button over the map.
  - Clicking "Search this area" triggers area search for current map bounds/center.
  - Map `resize` events (e.g. sidebar expand/collapse, window resize) must update map store `bounds` so sidebar list stays in sync with current viewport dimensions.

### 6. Test Hygiene & Scaffolding Cleanup
- Audit all unit, integration, and fixture additions.
- Permanently retain high-value regression tests.
- Remove temporary testing scaffolds, redundant mocks, or obsolete interim helper tests created during migration.

## Non-Functional Requirements
- **Performance:** Merging search results into persistent cache must be efficient (`O(N)` via Map lookup) and memoized to avoid unnecessary React re-renders or frame drops during map pan/zoom.
- **Backwards Compatibility:** Database migration follows the expand-and-contract pattern.
- **Type Safety & Runtime Invariants:** Strict TypeScript types, normalization of relational IDs via `Number()`, and coordinate validation via `standardizeWineryData`.
- **Testing Standards:** Adhere strictly to Red-Green-Refactor TDD. Unit tests in Jest container runner (`./scripts/run-jest-container.sh`), Edge Function tests (`npm run test:functions`), and E2E in Playwright container runner.

## Acceptance Criteria
- [ ] Strict TDD workflow followed for all test-backed implementation steps.
- [ ] Panning or zooming the map dynamically updates the wineries listed in "Wineries in View" based on current viewport bounds.
- [ ] All wineries visible as pins on the map within bounds appear in the sidebar list.
- [ ] Favorited, wishlist, and visited wineries maintain their visual indicators (badges, star icons, border colors) in both map pins and sidebar cards.
- [ ] Newly searched wineries and database markers display star ratings and review counts without requiring opening the details modal.
- [ ] Attribute filters (e.g., dog-friendly, outdoor seating) filter both markers and sidebar list accurately on initial load.
- [ ] A "Search this area" button appears when viewport has panned away from the last search center, and searching updates the unified cache.
- [ ] Map resize (e.g., toggling the sidebar drawer) recalculates viewport bounds.
- [ ] Scaffolding test cleanup completed with no residual low-value or redundant test artifacts remaining.
- [ ] All test suites pass cleanly.

## Out of Scope
- Redesigning the WineryModal layout or introducing new third-party map providers.
- Direct remote database mutations (all schema changes tested locally per critical guardrails).
