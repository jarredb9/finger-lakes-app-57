# Specification: Auto-Clear Wishlist on Visit Logging (Issue #54 / ADR-0001)

## Overview
Enforces [ADR-0001](file:///home/byrnesjd4821/Git/finger-lakes-app-57/docs/adr/0001-wishlist-cleared-on-visit.md) and updated [CONTEXT.md](file:///home/byrnesjd4821/Git/finger-lakes-app-57/CONTEXT.md) glossary across the database layer, client stores, utility standardizers, and synchronization services.

Wishlists represent aspirational wineries a user intends to visit in the future. When a user logs a visit to a winery currently on their wishlist, that winery is automatically and permanently cleared from their wishlist. Subsequent deletion of the visit must never restore the winery to the wishlist. However, users may manually re-add a visited winery to their wishlist to plan return visits (which will be cleared again upon subsequent visit logging).

## Settled Architectural Decisions

1. **Database Migration (`log_visit` RPC & Retrospective Cleanup)**:
   - Update PostgreSQL RPC `public.log_visit` to atomically delete any matching record from `public.wishlist` for `(user_id, winery_id)` during the initial visit insertion transaction.
   - Retain backward-compatible return signature `jsonb` (`{ visit_id, winery_id }`).
   - Idempotency key replays return existing visit records directly; deletion runs on initial insert.
   - Include a one-time retrospective data migration cleanup query:
     ```sql
     DELETE FROM public.wishlist w
     WHERE EXISTS (
       SELECT 1 FROM public.visits v
       WHERE v.user_id = w.user_id AND v.winery_id = w.winery_id
     );
     ```

2. **Data Standardization Bugfix (`standardizeWineryData`)**:
   - In `lib/utils/winery.ts`, fix boolean evaluation fallback (`rawOnWishlist || existing?.onWishlist`) which prevented explicit `false` values from overwriting existing `true` values.
   - Apply clean boolean precedence (`rawBoolean !== undefined ? rawBoolean : (existing ?? false)`) for `onWishlist`, `wishlistIsPrivate`, `isFavorite`, and `favoriteIsPrivate`.

3. **Client State Reactivity & Matching (`wineryStore`)**:
   - Enhance `addVisitToWinery` in `lib/stores/wineryStore.ts` to match wineries flexibly by both Place ID (`w.id === wineryId`) and DB ID (`w.dbId && String(w.dbId) === String(wineryId)`), identical to `getWinery`.
   - Update `userVisited: true`, `onWishlist: false`, and `wishlistIsPrivate: false` immediately upon optimistic visit creation.

4. **Optimistic Error Rollback (`visitMutationHelpers`)**:
   - In `saveVisitHelper` (`lib/stores/slices/visitMutationHelpers.ts`), capture pre-mutation winery state (`userVisited`, `onWishlist`, `wishlistIsPrivate`).
   - If visit persistence permanently fails with an unrecoverable error (not queued offline), roll back the winery flags in `useWineryStore` to their pre-mutation values alongside marking the visit as failed.

5. **Offline Sync Replay & Store Revalidation (`SyncService`)**:
   - In `lib/services/syncService.ts`, when `processedTypes.has('log_visit')` is present, call `useWineryStore.getState().fetchWineryData(user.id)` alongside `useVisitStore.getState().fetchVisits(1, true)`.
   - Ensure queue replay remains idempotent without schema or constraint conflicts.

6. **UI Card Presentation (`winery-card-thumbnail`)**:
   - In `components/winery-card-thumbnail.tsx`, permit both "Visited" and "Want to Go" badges to render when a user has visited and manually re-wishlisted a winery.

7. **Permanent Wishlist Deletion Invariant (Non-Restoration)**:
   - Deleting a visit (via `delete_visit` RPC or client `deleteVisit`) never restores any cleared wishlist row (`onWishlist` remains `false`).

8. **Strict Test-Driven Development (TDD) Lifecycle**:
   - Each phase follows Red-Green-Refactor cycles with failing unit/integration tests before code implementation.
   - Clean up any temporary test harness scaffolding, preserving permanent regression tests.

## Functional Requirements
- **FR-1**: Calling `log_visit` deletes any matching row in `public.wishlist` for the user and winery.
- **FR-2**: One-time database migration cleans up existing wishlists for visited wineries.
- **FR-3**: `standardizeWineryData` correctly handles `false` boolean values for wishlist and favorite flags without reverting to old `true` state.
- **FR-4**: Optimistic visit logging in client UI immediately updates `wineryStore` (`onWishlist: false`, `wishlistIsPrivate: false`, `userVisited: true`).
- **FR-5**: If visit creation permanently fails, client state rolls back to pre-mutation wishlist flags.
- **FR-6**: `SyncService` revalidates `wineryStore` via `fetchWineryData(user.id)` upon replaying `log_visit` offline mutations.
- **FR-7**: Deleting a visit never restores a winery to the wishlist.
- **FR-8**: Thumbnail card UI displays both "Visited" and "Want to Go" if a visited winery was manually re-wishlisted.

## Non-Functional Requirements
- **Atomic Database Operations**: Wishlist deletion and visit insertion execute in a single transaction in `log_visit`.
- **Zero Breaking Changes**: Preserve existing RPC arguments and response shapes (`jsonb_build_object('visit_id', v_visit_id, 'winery_id', v_winery_id)`).
- **Offline Integrity**: Offline mutation queuing and IndexedDB persistence maintain consistent state across network drops.
- **TDD Rigor**: All phases start with failing automated tests; scaffolding tests cleaned up before track completion.

## Acceptance Criteria
- [ ] Database RPC `log_visit` atomically deletes matching `public.wishlist` entry on initial visit insert.
- [ ] Historical visited wineries cleared from `public.wishlist` via migration script.
- [ ] `standardizeWineryData` unit tests prove explicit `false` values overwrite existing `true` values.
- [ ] `addVisitToWinery` updates `onWishlist: false` and `wishlistIsPrivate: false`, matching by Place ID and DB ID.
- [ ] Fatal visit saving errors roll back optimistic wishlist clearance.
- [ ] `SyncService` sync loop invokes `fetchWineryData(user.id)` when `log_visit` is processed.
- [ ] Deleting a visit leaves wishlist cleared.
- [ ] Thumbnail card renders both badges if a winery is both visited and wishlisted.
- [ ] Full unit, integration, and type checks pass.
