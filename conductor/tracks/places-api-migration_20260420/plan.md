# Implementation Plan: Places API (New) Migration (Lazy Enrichment)

### Phase 0: Architectural Foundation (Cleanup & Setup)
- [ ] Task: Create Google Maps Constants
    - [ ] Create `lib/constants/google-maps.ts`.
    - [ ] Define `ESSENTIALS_FIELD_MASK` (places.id, places.displayName, places.location, places.viewport, places.types, places.formattedAddress, places.photos).
    - [ ] Define `ENRICHMENT_FIELD_MASK` (generativeSummary, neighborhoodSummary, editorialSummary, allowsDogs, goodForChildren, outdoorSeating, evChargeOptions, parkingOptions, accessibilityOptions).
    - [ ] Define `ROUTING_CONFIG` defaults for distance/ETA calculation.
- [ ] Task: Update Type Definitions for Enrichment & V1
    - [ ] Add `enrichment_tier` ('basic' | 'enriched') and `last_enriched_at` (string) to the `Winery` interface.
    - [ ] Add new attributes (`generative_summary`, `neighborhood_summary`, `google_maps_type_label`, `allowsDogs`, `hasEvCharging`, `primary_photo_reference`, `photo_references`, `editorialSummary`, etc.) to the `Winery` interface in `lib/types.ts`.
    - [ ] Define `GoogleV1Place` interface to map response fields from the New Places API (using camelCase and nested structures like `displayName.text`).
- [ ] Task: Refactor Winery Service for Server/Mobile Compatibility
    - [ ] Refactor `lib/services/wineryService.ts` to accept a `SupabaseClient` instance as a parameter (injectable dependency).
    - [ ] Ensure the service is platform-agnostic (no `window` dependencies).
- [ ] Task: Implement Winery Adapter Pattern
    - [ ] Create `lib/utils/adapters/google-v1.ts` to handle the breaking JSON changes (e.g., mapping `displayName.text` to `name`, `weekdayDescriptions` to hours).
    - [ ] Refactor `lib/utils/winery.ts` to use this dedicated parser.
    - [ ] Replace complex type guards with a factory-style `WineryAdapter` that supports the new v1 coordinate structures.

### Phase 1: Infrastructure & Data Schema
- [ ] Task: Update Supabase schema for enriched winery attributes
    - [ ] Create migration for new columns: `enrichment_tier`, `last_enriched_at`, `generative_summary` (jsonb), `neighborhood_summary` (jsonb), `google_maps_type_label` (text), `primary_photo_reference` (text), `photo_references` (jsonb), `editorial_summary` (text), `allows_dogs`, `good_for_children`, `outdoor_seating`, `has_ev_charging`, `ev_charge_options` (jsonb), `parking_options` (jsonb), `accessibility_flags` (jsonb).
    - [ ] Update `ensure_winery` and `bulk_upsert_wineries` RPCs to handle the new v1 fields.
    - [ ] Apply migration to the **Local Supabase Stack** (`127.0.0.1:54321`).
    - [ ] Verify RLS and schema integrity using Tier 3 (Real Data) E2E tests locally.
    - [ ] Update `lib/database.types.ts` to reflect the new schema.
- [ ] Task: Update Mock Data & MockMapsManager
    - [ ] Update E2E mocks with the new REST-style JSON responses from Places API v1.
    - [ ] Update `MockMapsManager` in `e2e/utils.ts` to support the new v1 response structure and field-mask logic.

### Phase 2: Server-Side API Migration & Dynamic Masking (TDD)
- [ ] Task: Implement `search-wineries` Edge Function
    - [ ] Implement **Dynamic Masking**: Use Essentials mask by default; upgrade to Enterprise tier mask *only* if search filters (dog-friendly, etc.) are active.
    - [ ] Implement `locationBias` based on lat/lng coordinates.
    - [ ] Include `routingSummaries` in the mask (Pro SKU) and implement `routingParameters` injection using the current map center as origin.
    - [ ] Implement background DB upsert using `ctx.waitUntil` to ensure `bulk_upsert_wineries` call completes without blocking the search response.
- [ ] Task: Migrate `/api/wineries` search logic
    - [ ] Refactor the Next.js API route to delegate to the `search-wineries` Edge Function.
- [ ] Task: Implement Lazy Enrichment Logic in `get-winery-details`
    - [ ] Write failing test for the "Detail Fetch" trigger that checks `enrichment_tier` and `last_enriched_at` (30-day freshness).
    - [ ] Implement logic to fetch "Enterprise + Atmosphere" SKU data from Google only if enrichment is needed.
    - [ ] Update the winery record to 'enriched' with a fresh timestamp upon successful fetch.

### Phase 3: Map Filtering Logic (TDD)
- [ ] Task: Update Database RPCs for Attribute Filtering
    - [ ] Update `get_wineries_in_bounds` and `get_paginated_wineries` to support boolean filters for the new attributes.
- [ ] Task: Extend Map Store with new filters
    - [ ] Write failing test for filtering logic in `mapStore.ts`.
    - [ ] Implement state management for new attribute filters.
- [ ] Task: Implement Filter UI components
    - [ ] Write unit tests for new filter checkboxes/toggles.
    - [ ] Update map filter UI to include 'Dog Friendly', 'Kid Friendly', 'Outdoor Seating', and 'EV Charging'.

### Phase 4: UI Enhancements & AI Integration (TDD)
- [ ] Task: Implement `PlaceAutocomplete` Component
    - [ ] Replace the text input in `MapControls.tsx` with a modern Autocomplete (New) component for location discovery.
- [ ] Task: Implement `WineryPhotoHero` & Card Thumbnails
    - [ ] Create a hero image component for the top of `WineryDetails.tsx` using `GetPhotoMedia`.
    - [ ] Add a small image thumbnail to `WineryCardThumbnail.tsx` for visual "alive" state.
- [ ] Task: Integrate AI Insights into Winery Details
    - [ ] Write E2E test using store-state injection to verify summary visibility.
    - [ ] Implement `generative_summary` as a high-prominence **AI Callout** at the top of the details section.
    - [ ] Implement `editorial_summary` as a secondary, collapsible "Read More" section to manage vertical space.
    - [ ] Implement `neighborhood_summary` within a new **"About the Area"** accordion.
    - [ ] Add "Summarized with Gemini" disclosure and Gemini logo in a muted, right-aligned caption format within the callout.
- [ ] Task: Implement the Attribute Grid & Accessibility
    - [ ] Write unit tests for the **Attribute Grid** component (3-4 columns for icons like Dog-Friendly, EV Charging).
    - [ ] Implement the icon grid in both `winery-card-thumbnail.tsx` (Hero badge only) and `WineryDetails.tsx` (full icons).
    - [ ] Ensure all icons have descriptive `aria-label` and `Tooltip` support.
- [ ] Task: Refactor Logistics into Accordions
    - [ ] Create a **"Logistics & Accessibility"** accordion to house parking and accessibility flags.
    - [ ] Ensure the `TripPlannerSection` is collapsed by default on mobile unless a trip is active.
- [ ] Task: Refactor `WineryQnA.tsx` to use structured data
    - [ ] Update `WineryQnA` to check structured attributes first.
    - [ ] Display "Confirmed by Google" status for structured attributes.

### Phase 5: Compliance & Attribution
- [ ] Task: Implement `GoogleAttribution` & `GeminiDisclosure` Components
    - [ ] Create reusable components for "Powered by Google" and "Summarized with Gemini" (including the Gemini icon).
    - [ ] Add attributions to `WineryDetails.tsx`, `WineryMap.tsx`, and adjacent to all AI-generated summaries.
- [ ] Task: Verify Cache Freshness Logic
    - [ ] Write integration test ensuring data older than 30 days is automatically refreshed upon next access.
    - [ ] Verify that manual "Refresh" triggers update the `last_enriched_at` column.
- [ ] Task: Performance Benchmarking
    - [ ] Compare search latency and payload size between Essentials and Enriched search results.
    - [ ] Document findings in the track wrap-up.
