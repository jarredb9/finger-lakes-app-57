# Implementation Plan: Places API (New) Migration (Lazy Enrichment)

**EXECUTION STRATEGY:** This track follows a **Local-First** workflow. All database migrations, RPCs, and Edge Functions must be tested against the local Supabase container. Remote production updates are explicitly forbidden until the final task of Phase 5.

### Phase 0: Architectural Foundation (Cleanup & Setup) [checkpoint: 351a77b]
- [x] Task: Create Google Maps Constants (581d5b2)
    - [ ] Define `ESSENTIALS_FIELD_MASK` (places.id, places.displayName, places.location, places.viewport, places.types, places.formattedAddress, places.photos).
    - [ ] Define `ENRICHMENT_FIELD_MASK` (places.generativeSummary, places.neighborhoodSummary, places.editorialSummary, places.servesWine, places.allowsDogs, places.goodForChildren, places.outdoorSeating, places.reviews, places.parkingOptions, places.accessibilityOptions).
- [x] Task: Update Type Definitions for Enrichment & V1 (32bf99c)
    - [ ] Add `enrichment_tier` and `last_enriched_at` to `Winery` interface in `lib/types.ts`.
    - [ ] Define `GoogleV1Place` interface to map response fields (e.g., `displayName.text` to `name`).
- [x] Task: Implement Centralized EnrichmentService (TDD) (d2b91bd)
    - [ ] Create a shared utility for 30-day freshness checks (used by Wineries & Regions).
- [x] Task: Implement Winery Adapter Pattern (e822e3b)
    - [ ] Create `lib/utils/adapters/google-v1.ts` to handle the v1 structure.
    - [ ] **MANDATORY**: Explicitly normalize to `latitude`/`longitude` and strip legacy `lat`/`lng` keys.
    - [ ] **Data Mapping**: Map `displayName.text` -> `name`, `formattedAddress` -> `address`, and `camelCase` (API) to `snake_case` (DB).
    - [ ] **ID Normalization**: Ensure `WineryDbId` outputs are strictly `Number()`.
- [x] Task: Update standardizeWineryData (Cleanup) (5b020b3)
    - [ ] Update `lib/utils/winery.ts` to include v1 attributes (enrichment, summaries, boolean flags).
    - [ ] **Coordinate Standardization**: Refactor to enforce `latitude`/`longitude` and strip legacy keys for v1 sources.
    - [ ] **Validation**: Add unit test ensuring location is accessed as a property (`location.latitude`), not a function.

### Phase 1: Infrastructure & Data Schema
- [~] Task: Update Supabase schema for enriched winery attributes
    - [x] Create migration for `enrichment_tier`, `generative_summary` (jsonb), `allows_dogs`, `has_ev_charging`, etc.
    - [x] **Sync-Lock**: Add `last_action_timestamp` (timestamp) and `revision_id` (uuid) to the `wineries` table.
    - [x] **Security**: Ensure all new/updated tables have appropriate RLS policies.
    - [!] **PRODUCTION DEVIATION**: These changes were accidentally applied directly to production (project `jfsxclrdxmvftxacjuqf`). Task remains in progress until local migration file is created and committed to the repo for PR.
- [ ] Task: Implement/Update RPCs with Security Hardening
    - [ ] Update `bulk_upsert_wineries` to handle new v1 fields, normalized coordinates, and revision control.
    - [ ] **MANDATORY**: All RPCs MUST use `SECURITY DEFINER` and `SET search_path = public, auth`.
- [ ] Task: Update Mock Data & Versioned Mocking
    - [ ] Update `MockMapsManager` to support **Versioned Intercepts** (e.g., `mockPlacesV1()`).
    - [ ] Update E2E mocks with REST-style JSON from Places v1, ensuring `latitude`/`longitude` consistency.

### Phase 2: Server-Side API Migration & Dynamic Masking (TDD)
- [ ] Task: Implement `search-wineries` Edge Function
    - [ ] Implement **Dynamic Masking**: Essentials SKU by default; upgrade only for filtered searches.
    - [ ] **Normalization**: Ensure the function response explicitly normalizes to `latitude`/`longitude` and `snake_case` before returning to client.
    - [ ] Implement `locationBias` and `routingSummaries` in the mask.
    - [ ] Use `ctx.waitUntil` for background DB upsert.
    - [ ] **Resilience**: Ensure client-side call uses `invokeFunction`.
    - [ ] **Fallback Logic**: Gracefully handle partial data if enriched fields are missing.
- [ ] Task: Implement Lazy Enrichment Logic in `get-winery-details`
    - [ ] Use the `EnrichmentService` to check freshness before triggering detail fetch.
    - [ ] **Normalization**: Enforce `Number()` conversion for `WineryDbId` on return.

### Phase 3: Map Filtering Logic & Persistence (TDD)
- [ ] Task: Update Database RPCs for Attribute Filtering
    - [ ] Update `get_wineries_in_bounds` to support new boolean filters (Dogs, EV, etc.) and normalized coordinate inputs.
    - [ ] **Security**: Apply `SECURITY DEFINER` and `search_path` constraints.
- [ ] Task: Update Selective Data Persistence (Master Cache)
    - [ ] Update `wineryDataStore` to include new enriched attributes in the IndexedDB persistence layer.
    - [ ] **Encrypted Queue**: Integrate winery mutations (Favorites, Wishlist) with the `SyncService` for encrypted offline handling.
    - [ ] **Reconstitution Rule**: Store photos as **Base64 strings** in the offline queue/cache.
- [ ] Task: Implement Filter UI components
    - [ ] Update map filter UI to include 'Dog Friendly', 'Kid Friendly', 'Outdoor Seating', and 'EV Charging'.
    - [ ] **DOM Stability**: Ensure filters use the stable parent pattern and `data-state`.

### Phase 4: UI Enhancements & AI Integration (TDD)
- [ ] Task: Implement `PlaceAutocomplete` Component
    - [ ] Replace text input with **Places Autocomplete (New)**.
    - [ ] **Greedy Detail Fetch**: Implementation MUST terminate the `sessionToken` with a full details call using `ENRICHMENT_FIELD_MASK` to maximize session value.
    - [ ] **Session Management**: Implement `usePlacesAutocompleteSession` hook to manage `sessionToken`.
    - [ ] **Pattern**: Implement as a pure Presentational component with a Container wrapper.
- [ ] Task: Implement `WineryPhotoHero` & Card Thumbnails
    - [ ] Create hero image for `WineryDetails.tsx` and thumbnail for `WineryCardThumbnail.tsx`.
    - [ ] **Resilience**: Use `fileToBase64` / `base64ToFile` for WebKit compatibility.
- [ ] Task: Integrate AI Insights into Winery Details
    - [ ] Implement `generative_summary` as a high-prominence **AI Callout** with "Summarized with Gemini" disclosure.
    - [ ] **DOM Stability**: Use `data-state="loading|ready|error"` for the AI callout skeleton within the stable container.
- [ ] Task: Implement the Attribute Grid & Accessibility
    - [ ] Create icon grid (3-4 columns) in `WineryDetails.tsx` with ARIA labels and tooltips.
    - [ ] **Accessibility**: Ensure all new icons have semantic labels and ARIA support.
    - [ ] **DOM Stability**: Handle `data-state` for loading enriched attributes.
- [ ] Task: Implement Quota/Service Unavailable UI
    - [ ] Create a "Service Limited" view for when Places API quota is hit or enrichment fails.
    - [ ] **Mandate**: Ensure this view renders *inside* the stable parent container.
- [ ] Task: Refactor Map Search Trigger (Coordination)
    - [ ] Align with `search-upgrade_20260423` to utilize the `useMapSearchTrigger` hook for all search lifecycle events.

### Phase 5: Compliance & Attribution
- [ ] Task: Implement `GoogleAttribution` & `GeminiDisclosure` Components
    - [ ] Add attributions to `WineryDetails.tsx`, `WineryMap.tsx`, and AI callouts.
- [ ] Task: Performance & Engine Verification
    - [ ] Compare search latency and payload size between Essentials and Enriched results.
    - [ ] **MANDATORY**: Execute full E2E suite across **Chromium**, **Firefox**, and **WebKit** engines.
- [ ] Task: Final Production Migration & Verification
    - [ ] **PR Approval Required**: This task must only be performed after code review and merge.
    - [ ] Apply local migrations to production project (`jfsxclrdxmvftxacjuqf`).
    - [ ] Verify production RLS and RPC functionality via smoke tests.

## Phase: Review Fixes
- [x] Task: Apply review suggestions (bf522d9)
