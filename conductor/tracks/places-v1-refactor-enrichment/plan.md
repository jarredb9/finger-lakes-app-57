# Implementation Plan: Places API v1 Refactor & Enrichment

## Phase 0: Architectural & Schema Foundation
- [x] Task: Create Google Maps Constants (581d5b2)
    - [x] Define `ESSENTIALS_FIELD_MASK` (places.id, places.displayName, places.location, places.viewport, places.types, places.formattedAddress, places.photos).
    - [x] Define `ENRICHMENT_FIELD_MASK` (places.generativeSummary, places.neighborhoodSummary, places.editorialSummary, places.servesWine, places.allowsDogs, places.goodForChildren, places.outdoorSeating, places.reviews, places.parkingOptions, places.accessibilityOptions).
- [x] Task: Update Type Definitions for Enrichment & V1 (32bf99c)
    - [x] Add `enrichment_tier` and `last_enriched_at` to `Winery` interface in `lib/types.ts`.
    - [x] Define `GoogleV1Place` interface to map response fields (e.g., `displayName.text` to `name`).
- [x] Task: Implement Centralized EnrichmentService (TDD) (d2b91bd)
    - [x] Create a shared utility for 30-day freshness checks (used by Wineries & Regions).
- [x] Task: Implement Winery Adapter Pattern (e822e3b)
    - [x] Create `lib/utils/adapters/google-v1.ts` for v1 structure normalization.
    - [x] **MANDATORY**: Explicitly normalize to `latitude`/`longitude` and strip legacy `lat`/`lng` keys.
- [x] Task: Update standardizeWineryData (Cleanup) (5b020b3)
    - [x] Refactor to enforce `latitude`/`longitude` and strip legacy keys for v1 sources.
    - [x] **Validation**: Ensure location is accessed as a property (`location.latitude`), not a function.
- [x] Task: Create Enrichment Migration
    - [x] Add `enrichment_tier` (text), `last_enriched_at` (timestamptz), `generative_summary` (jsonb), `neighborhood_summary` (jsonb), `primary_photo_reference` (text), `photo_references` (jsonb).
    - [x] Add boolean flags: `allows_dogs`, `good_for_children`, `outdoor_seating`, `has_ev_charging`, `serves_wine`.
    - [x] Add logistics: `parking_options` (jsonb), `accessibility_flags` (jsonb).
    - [x] **Sync-Lock**: Add `last_action_timestamp` (timestamptz) and `revision_id` (uuid) to `wineries`.
- [x] Task: Update/Harden Database RPCs
    - [x] Update `bulk_upsert_wineries` and `get_wineries_in_bounds` to handle the new v1 enriched fields and revision control.
    - [x] **Mandate**: Apply `SECURITY DEFINER` and `SET search_path = public, auth`.
- [x] Task: Update Type Definitions (Database)
    - [x] Update `lib/database.types.ts` (via `gen types`) to reflect the new schema.

## Phase 1: DevSecOps & Migration Stability (IMMEDIATE PRIORITY)
- [x] Task: Implement Local "Pre-Push Safety Audit"
    - [x] Create `scripts/db-audit.sh` to run `db lint`, `gen types --local` check, and `db diff --linked` locally.
    - [x] Add `db:audit` script to `package.json`.
    - [x] Update `.husky/pre-commit` to include `npm run db:lint` for any staged files in `supabase/migrations/`.
- [x] Task: Implement "Gold Standard" CI Verification
    - [x] Update `.github/workflows/ci.yml` to include `supabase db diff --linked` and `supabase migration list`.
    - [x] Ensure the CI fails if any structural diff is detected (Zero-Drift Policy).
- [x] Task: Document Migration "Golden Rules"
    - [x] Create `docs/architecture/MIGRATION_GUIDE.md` detailing the squash-and-repair protocol and explaining how to use the local `db:audit` script.

## Phase 2: Edge Function Migration (Backend)
- [ ] Task: Implement `search-wineries` Edge Function
    - [ ] Implement V1 `searchByText` with **Dynamic Masking**.
    - [ ] **Normalization**: Ensure the response maps `displayName.text` to `name` and uses snake_case for DB fields.
    - [ ] **Coordinate Standardization**: Enforce property-based `latitude`/`longitude` mapping.
    - [ ] Implement `locationBias` and `routingSummaries` in the mask.
- [ ] Task: Implement `get-winery-details` Edge Function
    - [ ] Implement lazy enrichment logic (fetch from Google only if cache is >30 days old or tier is 'basic').
    - [ ] **Normalization**: Enforce `Number()` conversion for `WineryDbId` on return.

## Phase 3: Frontend Refactor & Resilience
- [ ] Task: Refactor `useWinerySearch` Hook
    - [ ] Replace direct Google SDK calls with `supabase.functions.invoke('search-wineries')`.
    - [ ] Wrap invocation with `invokeFunction` for PWA resilience.
    - [ ] **Coordination**: Align with `search-upgrade_20260423` to utilize the `useMapSearchTrigger` hook.
- [ ] Task: Implement Place Autocomplete (New)
    - [ ] Migrate `PlaceAutocomplete` component to use the new V1 Autocomplete.
    - [ ] **Session Management**: Implement `usePlacesAutocompleteSession` hook to manage `sessionToken`.
    - [ ] **Cost Optimization**: Ensure the session is terminated with a full `ENRICHMENT_FIELD_MASK` fetch.

## Phase 4: UI Enrichment & AI Insight
- [ ] Task: Implement `WineryPhotoHero` & Visuals
    - [ ] Update `WineryDetails.tsx` to display the primary hero photo and photo grid.
    - [ ] **WebKit Stability**: Ensure photos are stored as **Base64 strings** in the offline queue/cache.
- [ ] Task: Integrate AI Insights (Gemini)
    - [ ] Add the `generative_summary` AI Callout to winery details with "Summarized with Gemini" disclosure.
    - [ ] Use `data-state` pattern for skeleton/error states within the stable parent container.
- [ ] Task: Implement Quota Resilience & Logistics UI
    - [ ] Create a "Service Limited" view for when Places API quota is hit or enrichment fails.
    - [ ] Implement **Accordions** for "About the Area" and "Logistics & Accessibility" in `WineryDetails.tsx`.
- [ ] Task: Implement Filter UI Grid & Attribute Persistence
    - [ ] Update map filters to include 'Dog Friendly', 'Kid Friendly', 'Outdoor Seating', and 'EV Charging'.
    - [ ] Update `wineryDataStore` to include new enriched attributes in the IndexedDB layer.

## Phase 5: Compliance, Validation & Finalization
- [ ] Task: Implement Attribution Components
    - [ ] Add `GoogleAttribution` and `GeminiDisclosure` to relevant views.
- [ ] Task: Update Mocks & Intercepts
    - [ ] Update `MockMapsManager` to support **Versioned Intercepts** (e.g., `mockPlacesV1()`).
- [ ] Task: Cross-Browser E2E Verification
    - [ ] Run full test suite on **Chromium**, **Firefox**, and **WebKit**.
- [ ] Task: Final Production Migration & Verification
    - [ ] Apply local migrations to production project (`jfsxclrdxmvftxacjuqf`) ONLY after PR merge.
    - [ ] Verify production RLS and RPC functionality.

## Phase: Review Fixes
- [x] Task: Apply review suggestions (c5c4600)
