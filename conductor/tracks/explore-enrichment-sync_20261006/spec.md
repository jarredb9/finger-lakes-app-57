# Specification: ExploreTabContent Data Pipeline Desynchronization & Missing Winery Enrichment

## Overview
This track resolves data pipeline desynchronization and missing winery enrichment between the map canvas pins, the Explore tab sidebar ("Wineries in View"), Google Places v1 search, and the local Supabase database (GitHub Issue #44).

Currently, users experience:
1. "Wineries in View" showing 0 wineries despite multiple pins being visible on the map canvas after panning/zooming.
2. Favorited, visited, or wishlist badges missing from sidebar cards because search results and persistent winery records diverge.
3. Missing Google ratings and Vibe Tag indicators on initial map loading because the `get_map_markers` RPC omits these columns and the Google Places search essentials field mask omits `places.rating`.
4. Stale bounds and missing search trigger when panning away from the initial search area.

This track establishes a single source of truth in `wineryStore.persistentWineries`, enriches the database marker RPC and Places API field mask, ensures seamless two-way state propagation on user actions, and delivers responsive viewport search UX.

## Domain Glossary & Nomenclature (CONTEXT.md Alignment)
- **Winery**: A commercial establishment producing or offering wine tasting in the region. (Avoid: venue, place, location, vineyard).
- **Place**: An external location candidate retrieved from Google Places before or during catalog synchronization. (Avoid: venue, POI, spot).
- **Enrichment**: Cached, supplementary winery metadata retrieved from external services and refreshed periodically. (Avoid: augmentation, scraping).
- **Enrichment Tier**: Classification level: `basic`, `enriched`, or `full`.
- **Vibe Tag**: A descriptive ambiance or lifestyle amenity associated with a Winery (e.g., dog-friendly, scenic views, outdoor seating). (Avoid: feature, tag, label, amenity). In the database schema, specific Vibe Tags map to columns: `allows_dogs`, `good_for_children`, `outdoor_seating`, `has_ev_charging`.

## Development Methodology & Test Hygiene
- **Strict Test-Driven Development (TDD):** Every functional unit, store mutation, and hook modification must adhere strictly to the TDD cycle (Red -> Green -> Refactor): write failing tests verifying the expected behavior, implement minimal code to pass, and refactor cleanly.
- **Scaffolding Test Cleanup:** Any temporary scaffolding, throwaway spike mocks, or intermediate test fixtures introduced solely for migration bridging that provide no lasting regression testing value must be audited and cleanly removed at the conclusion of the track.

## Functional Requirements

### 1. Unified Authoritative Winery Caching & Sidebar Filtering
- **Single Source of Truth (`wineryStore.persistentWineries`):**
  - Ingest and merge search results from Google Places API or text searches into `wineryStore.persistentWineries` via `bulkUpsertWineries` and `standardizeWineryData`, ensuring user flags (`isFavorite`, `onWishlist`, `userVisited`, custom notes) and existing enrichment details are preserved.
  - In `hooks/use-winery-filter.ts`, eliminate the disjoint `searchResults.length > 0` branching in `listResultsInView`.
  - Sidebar results (`listResultsInView`) are **viewport-authoritative**: computed by filtering the unified collection of wineries (persisted + newly searched) by active map `bounds` and active filter criteria (categories + Vibe Tags).
  - Every winery pin visible within map bounds must appear in the "Wineries in View" list.
  - Text search moves/flies the map to the target location; the sidebar reflects all wineries visible within that active viewport.

### 2. Places API v1 Rating & Review Count Ingestion
- **Field Mask Enrichment:**
  - Update `ESSENTIALS_FIELD_MASK` in `supabase/functions/_shared/google-maps.ts` to include `places.rating` and `places.userRatingCount` (falls within Google Places Basic SKU, avoiding unexpected tier escalation).
  - Update and verify `normalizeGooglePlaceV1` in `supabase/functions/_shared/normalization.ts` maps `google_rating` and `user_rating_count`.
  - `standardizeWineryData` must map rating and review count from basic search payloads so winery cards display ratings immediately upon search.

### 3. Database Map Markers RPC Expansion (`get_map_markers`) & Vibe Tag Ingestion
- **Schema & Safe RPC Migration:**
  - PostgreSQL requires dropping an existing function when modifying its `RETURNS TABLE` signature. The migration must execute `DROP FUNCTION IF EXISTS public.get_map_markers(uuid);` and `CREATE OR REPLACE FUNCTION public.get_map_markers(p_user_id uuid DEFAULT auth.uid())` inside a single migration transaction.
  - Returns table columns:
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
    - `enrichment_tier text` (using `COALESCE(w.enrichment_tier, 'basic')::text`)
  - Update `MapMarkerRpc` interface in `lib/types.ts` and regenerate TypeScript types via `npm run db:gen-types`.
  - **Tri-State Vibe Tag Handling & Ghost Visit Invariant:**
    - `standardizeWineryData` in `lib/utils/winery.ts` must preserve strict tri-state `boolean | null` for `allows_dogs`, `good_for_children`, `outdoor_seating`, `has_ev_charging` (do not coerce `null` to `false`).
    - Attribute/Vibe Tag filters in `use-winery-filter.ts` strictly match `=== true` (un-enriched wineries with `null` are excluded until enriched).
    - Ghost Visit Prevention: if `user_visited === false`, clear the `visits` array in `standardizeWineryData`.
  - Update test fixtures and network mocks (`e2e/fixtures/handlers/favorites.handler.ts`) in Phase 2 to mirror the expanded RPC contract.

### 4. Reactive State Synchronization on User Actions
- **Instant UI Updates:**
  - When user actions occur (`toggleFavorite`, `toggleWishlist`, visit logged/deleted), changes update `wineryStore.persistentWineries` and immediately reflect across both map pins and sidebar cards without waiting for network re-fetch.
  - When `ensureWineryDetails` finishes lazy enrichment, the enriched record updates `wineryStore.persistentWineries`.
  - Single source of truth: no disconnected or diverging winery entity arrays in `mapStore`.

### 5. Viewport Search UX & Map Event Synchronization
- **Floating "Search this area" UX:**
  - Implement a dedicated `FloatingSearchAreaButton` component rendered at top-center of the map canvas in `components/WineryMap.tsx`.
  - Add Haversine distance utility `calculateDistanceKm(coord1, coord2)` in `lib/utils/map-utils.ts`.
  - Visibility condition: button appears when `autoSearch` is `false` and the distance between the current viewport center and `lastSearchedBounds` center exceeds 5 km.
  - Clicking "Search this area" triggers area search for current map bounds/center and hides the button.
  - Retain the existing manual button in `MapSearchBar` in the sidebar for accessibility.
- **Map Resize Synchronization:**
  - Add a map `resize` listener / `ResizeObserver` so sidebar expand/collapse recalculates viewport `bounds` and keeps "Wineries in View" in sync.

### 6. Test Hygiene & Scaffolding Cleanup
- Audit all unit, integration, and fixture additions.
- Permanently retain high-value regression tests.
- Remove temporary testing scaffolds, redundant mocks, or obsolete interim helper tests created during migration.

## Non-Functional Requirements
- **Performance:** Merging search results into persistent cache must be efficient (`O(N)` via Map lookup) and memoized to avoid unnecessary React re-renders or frame drops during map pan/zoom.
- **Backwards Compatibility:** Database migration runs safely inside a transaction following expand-and-contract principles.
- **Type Safety & Runtime Invariants:** Strict TypeScript types, normalization of relational IDs via `Number()`, coordinate validation via `standardizeWineryData`, tri-state Vibe Tag parsing, and ghost visit clearing.
- **Testing Standards:** Adhere strictly to Red-Green-Refactor TDD. Unit tests in Jest container runner (`./scripts/run-jest-container.sh`), Edge Function tests (`npm run test:functions`), and E2E in Playwright container runner.

## Acceptance Criteria
- [ ] Strict TDD workflow followed for all test-backed implementation steps.
- [ ] Panning or zooming the map dynamically updates the wineries listed in "Wineries in View" based on current viewport bounds.
- [ ] All wineries visible as pins on the map within bounds appear in the sidebar list.
- [ ] Favorited, wishlist, and visited wineries maintain their visual indicators (badges, star icons, border colors) in both map pins and sidebar cards.
- [ ] Newly searched wineries and database markers display star ratings and review counts without requiring opening the details modal.
- [ ] Vibe Tag filters (e.g., dog-friendly, outdoor seating) filter both markers and sidebar list accurately on initial load, matching strictly `=== true`.
- [ ] A floating "Search this area" button appears over the map canvas when viewport has panned >5 km from the last search center with `autoSearch` off, and clicking it updates the unified cache.
- [ ] Map resize (e.g., toggling the sidebar drawer) recalculates viewport bounds.
- [ ] Scaffolding test cleanup completed with no residual low-value or redundant test artifacts remaining.
- [ ] All test suites (unit, Edge function, E2E) pass cleanly.

## Out of Scope
- Redesigning the WineryModal layout or introducing new third-party map providers.
- Direct remote database mutations (all schema changes tested locally per critical guardrails).
