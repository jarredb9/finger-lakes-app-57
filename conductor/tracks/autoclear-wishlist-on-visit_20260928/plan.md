# Implementation Plan: Auto-Clear Wishlist on Visit Logging (Issue #54 / ADR-0001)

## Phase 1: Database Migration & RPC Hardening (TDD) [checkpoint: 605e963]
- [x] Task: Write failing integration tests for database RPC wishlist auto-deletion (dc0443d)
    - [x] Add integration test cases in `lib/services/__tests__/supabase-rpc.integration.test.ts` asserting that calling `log_visit` deletes existing wishlist entry for the user and winery
    - [x] Add test cases verifying that logging a second visit to an already cleared winery succeeds safely
    - [x] Add test cases verifying that deleting a visit (`delete_visit`) does not restore the winery to `public.wishlist`
    - [x] Confirm integration tests fail against the current un-migrated database schema (Red phase)
- [x] Task: Create database migration updating `log_visit` RPC and historical data cleanup (4198eee)
    - [x] Create a new migration file in `supabase/migrations/`
    - [x] Add `DELETE FROM public.wishlist WHERE user_id = auth.uid() AND winery_id = v_winery_id;` inside `public.log_visit` initial insert transaction
    - [x] Add one-time retrospective data migration cleanup query for existing visited wineries in wishlists
    - [x] Apply migration locally via `npm run db:start` (Green phase)
- [x] Task: Verify database integration tests pass and types are updated (4909fdd)
    - [x] Re-run `supabase-rpc.integration.test.ts` to confirm Green status
    - [x] Run `npm run db:gen-types` to ensure schema types are in sync
- [x] Task: Conductor - User Manual Verification 'Phase 1: Database Migration & RPC Hardening' (Protocol in workflow.md)

## Phase 2: Standardizer Bugfix & Store State Reactivity (TDD) [checkpoint: 752e296]
- [x] Task: Write failing unit tests for `standardizeWineryData` boolean overwriting (12999c3)
    - [x] Add test cases in `lib/utils/__tests__/winery.test.ts` verifying that explicit `false` values for `on_wishlist`, `wishlistIsPrivate`, `is_favorite`, and `favoriteIsPrivate` properly overwrite existing `true` values
    - [x] Test both snake_case and camelCase input representations
    - [x] Run tests to confirm failure due to the `|| existing` falsy fallback bug (Red phase)
- [x] Task: Fix boolean precedence in `standardizeWineryData` (5db4fce)
    - [x] Update `lib/utils/winery.ts` to cleanly evaluate `rawBoolean !== undefined ? rawBoolean : (existing ?? false)` for all 4 flags
    - [x] Re-run `winery.test.ts` to confirm Green status (Green phase)
- [x] Task: Write failing unit tests for wineryStore, ID matching, and optimistic rollback (246f9d0)
    - [x] Add unit tests in `lib/stores/__tests__/wineryStore.test.ts` verifying that `addVisitToWinery` updates `onWishlist: false`, `wishlistIsPrivate: false`, and `userVisited: true`, matching by both Place ID and DB ID
    - [x] Add unit tests in `lib/stores/__tests__/visitStore.domainInvariants.test.ts` verifying optimistic visit creation clears wishlist flags, and unrecoverable errors perform targeted rollback of `{ userVisited, onWishlist, wishlistIsPrivate }`
    - [x] Run tests to confirm failure (Red phase)
- [x] Task: Implement client state updates in wineryStore and visitMutationHelpers (d2e9e39)
    - [x] Update `addVisitToWinery` in `lib/stores/wineryStore.ts` with dual Place ID and DB ID matching and wishlist clearing
    - [x] Update `saveVisitHelper` in `lib/stores/slices/visitMutationHelpers.ts` to snapshot `{ userVisited, onWishlist, wishlistIsPrivate }` and restore via `updateWinery` on fatal catch
    - [x] Re-run tests to confirm Green status (Green phase)
- [x] Task: Conductor - User Manual Verification 'Phase 2: Standardizer Bugfix & Store State Reactivity' (Protocol in workflow.md)

## Phase 3: UI Presentation & Return-Visit Wishlisting (TDD) [checkpoint: 2dfbd3f]
- [x] Task: Write failing unit tests for card thumbnail badge coexistence and modal action re-wishlisting (765073c)
    - [x] Update unit tests in `components/__tests__/winery-card-thumbnail.test.tsx` verifying both 'Visited' and 'Want to Go' badges render when `userVisited: true` and `onWishlist: true`, while the status dot maintains emerald priority
    - [x] Create unit tests in `components/__tests__/WineryActionsPresentational.test.tsx` verifying that the Wishlist button is enabled and clickable when `winery.userVisited: true`, fires `onToggleWishlist`, and displays privacy controls when active
    - [x] Run tests to confirm failure against current UI restrictions (Red phase)
- [x] Task: Update UI presentation and action components (c0f94b9)
    - [x] Update `components/winery-card-thumbnail.tsx` condition to display 'Want to Go' badge without suppressing on `userVisited`
    - [x] Update `components/WineryActionsPresentational.tsx` to remove `disabled={winery.userVisited}` and opacity lock on the Wishlist button
    - [x] Re-run component unit tests to confirm Green status (Green phase)
- [x] Task: Conductor - User Manual Verification 'Phase 3: UI Presentation & Return-Visit Wishlisting' (Protocol in workflow.md)

## Phase 4: Offline Sync Queue Replay & Edge Case Invariants (TDD) [checkpoint: a0890ae]
- [x] Task: Write failing tests for SyncService log_visit queue processing and store revalidation (767b40b)
    - [x] Add unit tests in `lib/services/__tests__/syncService.test.ts` asserting that `useWineryStore.getState().fetchWineryData(userId)` is called when `log_visit` is processed
    - [x] Test offline replay idempotency and error resilience
    - [x] Run tests to confirm failure (Red phase)
- [x] Task: Implement store revalidation and queue replay resilience in SyncService (1f900e9)
    - [x] Update `SyncService.sync()` in `lib/services/syncService.ts` to invoke `fetchWineryData(user.id)` on `log_visit`
    - [x] Re-run tests to confirm Green status (Green phase)
- [x] Task: Conductor - User Manual Verification 'Phase 4: Offline Sync Queue Replay & Edge Case Invariants' (Protocol in workflow.md)

## Phase 5: Scaffolding Cleanup & Final Regression Verification [checkpoint: f2db817]
- [x] Task: Audit and clean up temporary scaffolding tests (4ee9868)
    - [x] Review all tests created during track implementation
    - [x] Remove any temporary scaffolding tests or throwaway harness fixtures, keeping only permanent regression tests
- [x] Task: Execute full automated test suite and type verification (9d572e0)
    - [x] Run containerized unit and integration test suite (`./scripts/run-jest-container.sh`)
    - [x] Run TypeScript type check (`npm run db:check-types:local` / `tsc --noEmit`)
- [x] Task: Conductor - User Manual Verification 'Phase 5: Scaffolding Cleanup & Final Regression Verification' (Protocol in workflow.md)
