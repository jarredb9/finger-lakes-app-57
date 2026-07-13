# Specification: Winery Details Cache Pollution and Review Count Fixes

## 1. Overview
This track resolves two core issues related to winery details displaying incorrect or missing fields:
1. **Cache Pollution / State Race Condition:** When basic map markers or search results are fetched and stored in `WineryDataStore` after a winery's full details have been enriched, the basic/null fields from the search overwrite the previously cached enriched data. This causes the details modal to display "Unknown" for hours, phone, and rating and skip subsequent network requests because the tier incorrectly remains cached as "enriched" or is downgraded but has polluted fields.
2. **Missing Review Count (`userRatingCount`) in Production:** While `userRatingCount` displays in development, it is missing/null in production. This indicates the production version of the `get-winery-details` edge function lacks the latest `ENRICHMENT_FIELD_MASK` or is not fully synced with database schema migrations.

## 2. Functional Requirements
### 2.1 State Race Condition & Cache Integrity
- **Deep Merge & Protection:** Update the `standardizeWineryData` helper in `lib/utils/winery.ts` to enforce a merge guard. If the existing cached winery is already `'enriched'` or `'full'`, it must NOT allow basic marker data to overwrite populated details (like `phone`, `website`, `openingHours`, `reviews`, `rating`, `userRatingCount`) with `null`/`undefined`.
- **Standardized Store Upserts:** 
  - Update `bulkUpsertWineries` in `lib/stores/wineryDataStore.ts` to map incoming records through `standardizeWineryData` against their current cached counterparts instead of performing a raw shallow merge (`{ ...current[idx], ...w }`).
  - Update `upsertWinery` in `lib/stores/wineryDataStore.ts` to ensure data normalization is consistently applied.

### 2.2 Schema & Edge Function Sync
- **Local Verification:** Verify that migration `20260605170000_add_user_rating_count_to_rpcs.sql` is fully applied to the local database and that the `user_rating_count` column exists.
- **Edge Function Verification:** Confirm that the local `get-winery-details` Edge Function includes the `userRatingCount` in the `ENRICHMENT_FIELD_MASK` and maps it correctly in `normalizeGooglePlaceV1`.
- **Deployment Documentation:** Document the required deployment steps for updating the remote Edge Function.

### 2.3 E2E and Unit Testing
- **Playwright Test:** Write a specific E2E test in `e2e/winery-cache-pollution.spec.ts` (or add to `e2e/winery-ui-integrity.spec.ts`) that clicks a winery to enrich it, closes the modal, pans/updates the map (hydrating basic markers), and reopens the modal, asserting that all details remain intact.
- **Deno Edge Function Test:** Verify that edge function unit tests pass.

## 3. Non-Functional Requirements
- **Performance:** Retain the cache-first optimization in `ensureWineryDetails` so that network requests to Google Places are not duplicated if full details are already cached.
- **PWA Integrity:** Ensure that the merged data works offline and adheres to the offline schema.

## 4. Acceptance Criteria
- [ ] No regression in existing winery filters, lists, or map marker rendering.
- [ ] Passing the new E2E test verifying details remain populated after map panning.
- [ ] Verification that `userRatingCount` displays next to rating in the details modal in the local integration test environment.
- [ ] All unit, integration, and E2E tests pass.

## 5. Out of Scope
- Modifying the visual layout or design of `WineryModal` or `WineryDetails` (only the fields' data population is in scope).
- Executing remote migrations or edge function deployments on production (`jfsxclrdxmvftxacjuqf`) directly during development.
