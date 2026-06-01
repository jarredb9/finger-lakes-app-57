# Implementation Plan: Places API v1 Refactor & Enrichment

## Phase 0: Database & Schema Foundation
- [ ] Task: Create Enrichment Migration
    - [ ] Add `enrichment_tier` (text), `last_enriched_at` (timestamptz), `generative_summary` (jsonb), `neighborhood_summary` (jsonb), `primary_photo_reference` (text), `photo_references` (jsonb).
    - [ ] Add boolean flags: `allows_dogs`, `good_for_children`, `outdoor_seating`, `has_ev_charging`, `serves_wine`.
    - [ ] Add logistics: `parking_options` (jsonb), `accessibility_flags` (jsonb).
    - [ ] **Sync-Lock**: Add `last_action_timestamp` (timestamptz) and `revision_id` (uuid) to `wineries`.
- [ ] Task: Update/Harden Database RPCs
    - [ ] Refactor `bulk_upsert_wineries` to handle the new v1 enriched fields and revision control.
    - [ ] **Mandate**: Apply `SECURITY DEFINER` and `SET search_path = public, auth`.
- [ ] Task: Update Type Definitions
    - [ ] Update `lib/types.ts` and `lib/database.types.ts` (via `gen types`) to reflect the new schema.

## Phase 1: Edge Function Migration (Backend)
- [ ] Task: Implement `search-wineries` Edge Function
    - [ ] Implement V1 `searchByText` with **Dynamic Masking**.
    - [ ] **Normalization**: Ensure the response maps `displayName.text` to `name` and uses snake_case for DB fields.
    - [ ] **Coordinate Standardization**: Enforce property-based `latitude`/`longitude` mapping.
- [ ] Task: Implement `get-winery-details` Edge Function
    - [ ] Implement lazy enrichment logic (fetch from Google only if cache is >30 days old or tier is 'basic').

## Phase 2: Frontend Refactor & Resilience
- [ ] Task: Refactor `useWinerySearch` Hook
    - [ ] Replace direct Google SDK calls with `supabase.functions.invoke('search-wineries')`.
    - [ ] Wrap invocation with `invokeFunction` for PWA resilience.
    - [ ] **Cleanup**: Remove legacy coordinate conversion logic (`.lat()`, `.lng()`).
- [ ] Task: Implement Place Autocomplete (New)
    - [ ] Migrate `PlaceAutocomplete` component to use the new V1 Autocomplete with Session Tokens.
    - [ ] **Cost Optimization**: Ensure the session is terminated with a full `ENRICHMENT_FIELD_MASK` fetch.

## Phase 3: UI Enrichment & AI Insight
- [ ] Task: Implement `WineryPhotoHero` & Visuals
    - [ ] Update `WineryDetails.tsx` to display the primary hero photo and photo grid.
    - [ ] **WebKit Stability**: Ensure photos are reconstituted correctly from Base64 when offline.
- [ ] Task: Integrate AI Insights (Gemini)
    - [ ] Add the `generative_summary` AI Callout to winery details.
    - [ ] Use `data-state` pattern for skeleton/error states within the stable parent container.
- [ ] Task: Implement Filter UI Grid
    - [ ] Update map filters to utilize the new boolean attributes from the database.

## Phase 5: DevSecOps & Migration Stability
- [ ] Task: Enable Automated Migration Safety Checks
    - [ ] Update `.github/workflows/ci.yml` to uncomment and configure the `Migration Safety Check`.
    - [ ] Add `supabase db lint` step to the CI `build` job.
- [ ] Task: Implement Database Type Verification
    - [ ] Add a step to CI to run `supabase gen types --local` and compare against `lib/database.types.ts`. The build MUST fail if types are stale.
- [ ] Task: Document Migration "Golden Rules"
    - [ ] Create `docs/architecture/MIGRATION_GUIDE.md` detailing the squash-and-repair protocol to prevent future production desyncs.
- [ ] Task: Production-Ready Migration Verification
    - [ ] Add a `dry-run` push step to the `deploy` job in CI to double-check sync state immediately before the final `supabase db push`.

## Phase 6: Validation & Compliance
- [ ] Task: Update Mocks & Intercepts
    - [ ] Update `MockMapsManager` and E2E mocks to reflect the V1 JSON structure and Edge Function responses.
- [ ] Task: Cross-Browser E2E Verification
    - [ ] Run full test suite on **Chromium**, **Firefox**, and **WebKit**.
