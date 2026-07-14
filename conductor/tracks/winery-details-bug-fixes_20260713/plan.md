# Implementation Plan: Winery Details Cache Pollution and Review Count Fixes

## Phase 1: Test Scaffolding & Verification Setup (Red Phase) [checkpoint: e790253]
- [x] Task: Local Database & Schema Verification
    - [x] Run database check `npm run db:status` and verify that migration `20260605170000_add_user_rating_count_to_rpcs.sql` is active.
    - [x] Verify database schema types locally using `npm run db:check-types:local`.
- [x] Task: Write Failing Tests (Red Phase) [f936838]
    - [x] Create a new unit test in `lib/stores/__tests__/wineryDataStore.test.ts` checking that `bulkUpsertWineries` and `upsertWinery` do not overwrite existing enriched fields (phone, website, openingHours, reviews, rating, userRatingCount, enrichment_tier) with basic marker fields or null values.
    - [x] Write a new Playwright E2E test in `e2e/winery-cache-pollution.spec.ts` (or add to `e2e/winery-ui-integrity.spec.ts`) that clicks a winery to enrich it, closes the modal, pans/updates the map (hydrating basic markers), and reopens the modal, asserting that all details remain intact.
    - [x] Verify both tests fail as expected (Red Phase).
- [x] Task: Conductor - User Manual Verification 'Phase 1: Test Scaffolding & Verification Setup' (Protocol in workflow.md)

## Phase 2: Core Merging & Data Preservation Logic (Green Phase)
- [x] Task: Implement Merge Guards in Standardization Utility [61d1ff1]
    - [x] Edit `standardizeWineryData` in `lib/utils/winery.ts` to reject overwriting non-null/non-undefined properties (phone, website, openingHours, reviews, rating, userRatingCount) with basic marker properties or nulls unless the incoming source tier is `'enriched'` or `'full'`.
    - [x] Ensure that `enrichment_tier` is not downgraded from `'enriched'` or `'full'` to `'basic'`.
- [x] Task: Standardize Store Updates [61d1ff1]
    - [x] Refactor `bulkUpsertWineries` in `lib/stores/wineryDataStore.ts` to map incoming items using `standardizeWineryData(item, current[idx])` rather than `{ ...current[idx], ...item }`.
    - [x] Refactor `upsertWinery` in `lib/stores/wineryDataStore.ts` to pass the updated object through `standardizeWineryData(winery, exists)` to ensure consistent normalization.
- [x] Task: Verify Implementation (Green Phase) [61d1ff1]
    - [x] Run the store unit tests via Jest and ensure they pass.
    - [x] Run the Playwright E2E test and ensure it passes.
    - [x] Run complete E2E test suite locally using `./scripts/run-e2e-container.sh chromium` to verify no regressions.
- [x] Task: Conductor - User Manual Verification 'Phase 2: Core Merging & Data Preservation Logic' (Protocol in workflow.md)

## Phase 3: Edge Function Sync & Production Prep
- [ ] Task: Edge Function Local Verification
    - [ ] Verify that `supabase/functions/get-winery-details/index.ts` is fetching `userRatingCount` in the field mask and normalizing it correctly using local Deno tests: `npm run test:functions`.
- [ ] Task: Update Deployment Documentation
    - [ ] Add explicit deployment steps in the track context or README for deploying the `get-winery-details` Edge Function.
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Edge Function & Production Prep' (Protocol in workflow.md)
