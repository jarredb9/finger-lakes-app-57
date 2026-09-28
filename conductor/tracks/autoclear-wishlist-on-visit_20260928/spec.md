# Specification: Auto-Clear Wishlist on Visit Logging (Issue #54 / ADR-0001)

## Overview
Enforces [ADR-0001](file:///home/byrnesjd4821/Git/finger-lakes-app-57/docs/adr/0001-wishlist-cleared-on-visit.md) across both database layer and client application state. Wishlists represent purely aspirational, unvisited wineries. When a user logs a visit to a winery that is currently on their wishlist, that winery must be automatically and permanently removed from their wishlist. Subsequent deletion of the visit must never restore the winery to the wishlist.

## Functional Requirements
1. **Database Migration (`log_visit` RPC)**:
   - Update PostgreSQL RPC `public.log_visit` to delete any matching record from `public.wishlist` for `(user_id, winery_id)` atomically within the visit logging transaction.
   - Retain backward-compatible return signature `jsonb` (`{ visit_id, winery_id }`).
   - One-time data cleanup: execute a data-migration cleanup query `DELETE FROM public.wishlist w WHERE EXISTS (SELECT 1 FROM public.visits v WHERE v.user_id = w.user_id AND v.winery_id = w.winery_id);` to retrospectively clear historical visits from wishlists.
2. **Client State Reactivity (`useWineryStore`)**:
   - Update `addVisitToWinery(wineryId)` (and optimistic visit creation flow) in `lib/stores/wineryStore.ts` to immediately update `onWishlist: false` and `wishlistIsPrivate: false` alongside `userVisited: true`.
   - Ensure optimistic visit creation in `visitMutationHelpers.ts` propagates this state immediately, keeping map markers, wishlist drawer/tabs, and winery details modals reactive without waiting for network response.
3. **Offline Sync Replay Resilience (`SyncService`)**:
   - When offline `log_visit` mutations are replayed in `lib/services/syncService.ts`, ensure that post-sync refresh revalidates winery store state (`fetchWineryData`) alongside visit state.
   - Idempotent replay: if a visit was logged offline and replayed, the database deletion of any wishlist entry remains idempotent and error-free.
4. **Permanent Wishlist Deletion Invariant (Non-Restoration)**:
   - When a visit is deleted (via `delete_visit` RPC or client `deleteVisit`), verify and ensure that the winery's wishlist status is never restored (`onWishlist` remains `false`).
5. **Strict Test-Driven Development (TDD) Lifecycle**:
   - Follow strict Red-Green-Refactor cycles for each tier:
     - Red: Author failing unit/integration tests asserting wishlist deletion and non-restoration behavior.
     - Green: Implement minimal code changes in database RPC, stores, and sync service to pass tests.
     - Refactor: Clean up code while maintaining green test suite.
   - Identify, audit, and clean up any temporary scaffolding tests or throwaway harness fixtures at the end of the track, preserving only clean, long-term regression tests.

## Non-Functional Requirements
- **Atomic Database Operations**: Wishlist deletion and visit insertion must run within the same database transaction in `log_visit`.
- **Zero Breaking Changes**: Preserve existing RPC arguments and response shapes (`jsonb_build_object('visit_id', v_visit_id, 'winery_id', v_winery_id)`).
- **Offline Integrity**: Offline mutation queuing and IndexedDB persistence must maintain state consistency across network outages and page reloads.
- **TDD Rigor & Test Hygiene**: Every phase begins with failing automated tests; all temporary scaffolding tests must be cleaned up before completion.

## Acceptance Criteria
- [ ] Logging a Visit via `log_visit` automatically deletes any row for `(auth.uid(), winery_id)` from `public.wishlist`.
- [ ] Saving a Visit in the client UI updates local state (`wineryStore`) so that `onWishlist` becomes `false` and `wishlistIsPrivate` becomes `false` immediately for that winery.
- [ ] Offline visit logging and sync queue reconstitution preserves this invariant upon replay.
- [ ] Deleting a Visit does not restore the winery to the user's Wishlist.
- [ ] Existing wishlisted wineries that already have visits logged are cleaned up via migration.
- [ ] Strict TDD workflow followed throughout all phases.
- [ ] Any scaffolding/throwaway test code is cleaned up and only permanent, robust regression tests remain.

## Out of Scope
- Modifying behavior of favorites (`public.favorites`) — favorites represent visited or unvisited preferences and are unaffected by visits.
- Modifying Trip Wineries or itineraries.
- Adding undo notifications or toast prompts specifically prompting the user to re-add to wishlist.
