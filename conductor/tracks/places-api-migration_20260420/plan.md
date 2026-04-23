# Implementation Plan: Places API (New) Migration (Lazy Enrichment)

### Phase 0: Architectural Foundation (Cleanup & Setup)
- [ ] Task: Create Google Maps Constants
    - [ ] Define `ESSENTIALS_FIELD_MASK` (places.id, places.displayName, places.location, places.viewport, places.types, places.formattedAddress, places.photos).
    - [ ] Define `ENRICHMENT_FIELD_MASK` (generativeSummary, neighborhoodSummary, editorialSummary, allowsDogs, goodForChildren, outdoorSeating, evChargeOptions, parkingOptions, accessibilityOptions).
- [ ] Task: Update Type Definitions for Enrichment & V1
    - [ ] Add `enrichment_tier` and `last_enriched_at` to `Winery` interface in `lib/types.ts`.
    - [ ] Define `GoogleV1Place` interface to map response fields (e.g., `displayName.text` to `name`).
- [ ] Task: Implement Centralized `EnrichmentService` (TDD)
    - [ ] Create a shared utility for 30-day freshness checks (used by Wineries & Regions).
- [ ] Task: Implement Winery Adapter Pattern
    - [ ] Create `lib/utils/adapters/google-v1.ts` to handle the v1 coordinate and naming structure.

### Phase 1: Infrastructure & Data Schema
- [ ] Task: Update Supabase schema for enriched winery attributes
    - [ ] Create migration for `enrichment_tier`, `generative_summary` (jsonb), `allows_dogs`, `has_ev_charging`, etc.
    - [ ] Update `bulk_upsert_wineries` RPC to handle new v1 fields.
- [ ] Task: Update Mock Data & Versioned Mocking
    - [ ] Update `MockMapsManager` to support **Versioned Intercepts** (e.g., `mockPlacesV1()`).
    - [ ] Update E2E mocks with REST-style JSON from Places v1.

### Phase 2: Server-Side API Migration & Dynamic Masking (TDD)
- [ ] Task: Implement `search-wineries` Edge Function
    - [ ] Implement **Dynamic Masking**: Essentials SKU by default; upgrade only for filtered searches.
    - [ ] Implement `locationBias` and `routingSummaries` in the mask.
    - [ ] Use `ctx.waitUntil` for background DB upsert.
- [ ] Task: Implement Lazy Enrichment Logic in `get-winery-details`
    - [ ] Use the `EnrichmentService` to check freshness before triggering detail fetch.

### Phase 3: Map Filtering Logic (TDD)
- [ ] Task: Update Database RPCs for Attribute Filtering
    - [ ] Update `get_wineries_in_bounds` to support new boolean filters (Dogs, EV, etc.).
- [ ] Task: Implement Filter UI components
    - [ ] Update map filter UI to include 'Dog Friendly', 'Kid Friendly', 'Outdoor Seating', and 'EV Charging'.

### Phase 4: UI Enhancements & AI Integration (TDD)
- [ ] Task: Implement `PlaceAutocomplete` Component
    - [ ] Replace text input with **Places Autocomplete (New)**.
- [ ] Task: Implement `WineryPhotoHero` & Card Thumbnails
    - [ ] Create hero image for `WineryDetails.tsx` and thumbnail for `WineryCardThumbnail.tsx`.
- [ ] Task: Integrate AI Insights into Winery Details
    - [ ] Implement `generative_summary` as a high-prominence **AI Callout** with "Summarized with Gemini" disclosure.
- [ ] Task: Implement the Attribute Grid & Accessibility
    - [ ] Create icon grid (3-4 columns) in `WineryDetails.tsx` with ARIA labels and tooltips.

### Phase 5: Compliance & Attribution
- [ ] Task: Implement `GoogleAttribution` & `GeminiDisclosure` Components
    - [ ] Add attributions to `WineryDetails.tsx`, `WineryMap.tsx`, and AI callouts.
- [ ] Task: Performance Benchmarking
    - [ ] Compare search latency and payload size between Essentials and Enriched results.
