# Implementation Plan: Auto-Clear Wishlist on Visit Logging (Issue #54 / ADR-0001)

## Phase 1: Database Migration & RPC Hardening (TDD)
- [ ] Task: Write failing integration tests for database RPC wishlist auto-deletion
    - [ ] Add integration test cases in `lib/services/__tests__/supabase-rpc.integration.test.ts` asserting that calling `log_visit` deletes existing wishlist entry for the user and winery
    - [ ] Add test cases verifying that deleting a visit (`delete_visit`) does not restore the winery to `public.wishlist`
    - [ ] Confirm integration tests fail against the current un-migrated database schema (Red phase)
- [ ] Task: Create database migration updating `log_visit` RPC and historical data cleanup
    - [ ] Create a new migration file in `supabase/migrations/`
    - [ ] Add `DELETE FROM public.wishlist WHERE user_id = auth.uid() AND winery_id = v_winery_id;` inside `public.log_visit` transaction
    - [ ] Add one-time retrospective data migration cleanup query for existing visited wineries in wishlists
    - [ ] Apply migration locally via `npm run db:start` / `supabase db reset` (Green phase)
- [ ] Task: Verify database integration tests pass and types are updated
    - [ ] Re-run `supabase-rpc.integration.test.ts` to confirm Green status
    - [ ] Run `npm run db:gen-types` to ensure schema types are in sync
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Database Migration & RPC Hardening' (Protocol in workflow.md)

## Phase 2: Client State Reactivity & Optimistic Updates (TDD)
- [ ] Task: Write failing unit tests for wineryStore and optimistic visit logging
    - [ ] Create unit tests in `lib/stores/__tests__/wineryStore.test.ts` verifying that `addVisitToWinery` updates `onWishlist: false` and `wishlistIsPrivate: false`
    - [ ] Create unit tests in `lib/stores/__tests__/visitStore.domainInvariants.test.ts` asserting optimistic visit logging clears wishlist flags
    - [ ] Run tests to confirm failure (Red phase)
- [ ] Task: Implement client state updates in wineryStore and visitMutationHelpers
    - [ ] Update `addVisitToWinery` in `lib/stores/wineryStore.ts` to set `onWishlist: false` and `wishlistIsPrivate: false`
    - [ ] Verify `visitMutationHelpers.ts` propagates store state correctly during optimistic mutation
    - [ ] Run tests to confirm passing (Green phase)
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Client State Reactivity & Optimistic Updates' (Protocol in workflow.md)

## Phase 3: Offline Sync Queue Replay & Edge Case Invariants (TDD)
- [ ] Task: Write failing tests for SyncService log_visit queue processing and store revalidation
    - [ ] Add unit tests in `lib/services/__tests__/syncService.test.ts` checking store revalidation when `log_visit` is processed
    - [ ] Test offline replay idempotency and error handling
    - [ ] Run tests to confirm failure (Red phase)
- [ ] Task: Implement store revalidation and queue replay resilience in SyncService
    - [ ] Update `SyncService.sync()` to ensure winery store data (`fetchWineryData`) is synchronized when `log_visit` is in processed types
    - [ ] Run tests to confirm passing (Green phase)
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Offline Sync Queue Replay & Edge Case Invariants' (Protocol in workflow.md)

## Phase 4: Scaffolding Cleanup & Final Regression Verification
- [ ] Task: Audit and clean up temporary scaffolding tests
    - [ ] Review all tests created during track implementation
    - [ ] Remove any temporary scaffolding tests or throwaway harness fixtures, keeping only permanent regression tests
- [ ] Task: Execute full automated test suite and type verification
    - [ ] Run containerized unit and integration test suite (`./scripts/run-jest-container.sh`)
    - [ ] Run TypeScript type check (`npm run db:check-types:local` / `tsc --noEmit`)
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Scaffolding Cleanup & Final Regression Verification' (Protocol in workflow.md)
