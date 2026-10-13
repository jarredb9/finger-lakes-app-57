# Phase 3 Task 4 Implementation Plan: Reactive Propagation of User Actions Across persistentWineries (TDD Green Phase)

## Overview & Scope
This plan implements reactive state propagation across the authoritative master cache (`wineryStore.persistentWineries`) and the volatile search candidate layer (`mapStore.searchResults`) for user state mutations:
1. `toggleFavorite`: Ingests unpersisted search candidates into `persistentWineries` upon favoriting, updates both stores optimistically, synchronizes backend RPC results, and handles rollback cleanly.
2. `toggleWishlist`: Ingests unpersisted search candidates into `persistentWineries` upon adding to wishlist, updates both stores optimistically, synchronizes backend RPC results, and handles rollback cleanly.
3. `toggleFavoritePrivacy` & `toggleWishlistPrivacy`: Synchronizes privacy state across both stores.
4. `saveVisit` & `addVisitToWinery`: Automatically ingests unpersisted search candidates into `persistentWineries` with `userVisited: true`, clears wishlist flags (`onWishlist: false`, `wishlistIsPrivate: false` per ADR-0001), and updates `mapStore.searchResults`.
5. `deleteVisit` & `optimisticallyDeleteVisit`: Enforces ghost visit prevention by reverting `userVisited: false` across `persistentWineries` and `mapStore.searchResults` when the only visit for a winery is deleted, while preserving `userVisited: true` when other visits remain.
6. `updateWinery`: Propagates partial updates across both `persistentWineries` and matching `mapStore.searchResults`.

---

## Target Files & Line Anchors

### File 1: `lib/stores/wineryStore.ts`
- **Imports Anchor (Lines 1-11)**: Add `import { useMapStore } from './mapStore';`
- **Interface Anchor (Line 41)**: Expand `optimisticallyDeleteVisit: (visitId: string, wineryId?: GooglePlaceId | string) => void;`
- **`toggleFavorite` Implementation (Lines 360-405)**: Support unpersisted search candidates and sync `useMapStore.searchResults`.
- **`toggleWishlist` Implementation (Lines 407-452)**: Support unpersisted search candidates and sync `useMapStore.searchResults`.
- **`toggleFavoritePrivacy` Implementation (Lines 454-491)**: Synchronize `useMapStore.searchResults`.
- **`toggleWishlistPrivacy` Implementation (Lines 493-531)**: Synchronize `useMapStore.searchResults`.
- **`updateWinery` Implementation (Lines 533-538)**: Synchronize `useMapStore.searchResults`.
- **`addVisitToWinery` Implementation (Lines 541-554)**: Ingest unpersisted search candidates, clear wishlist flags, and sync `useMapStore.searchResults`.
- **`optimisticallyDeleteVisit` Implementation (Line 556)**: Implement ghost visit clearing for `wineryId` across `persistentWineries` and `useMapStore.searchResults`.

### File 2: `lib/stores/slices/visitMutationHelpers.ts`
- **`saveVisitHelper` Implementation (Lines 20-30)**: Ingest unpersisted candidate into `useWineryStore.persistentWineries` when saving a visit for an unpersisted winery.

### File 3: `lib/stores/slices/visitInitHelpers.ts`
- **`deleteVisitHelper` Implementation (Lines 22-71)**: Check remaining visits for target winery, call `optimisticallyDeleteVisit(visitId, wineryIdentifier)` if no other visits remain, and handle rollback on failure.

---

## Exact Drop-In Code Blocks

### 1. `lib/stores/wineryStore.ts`

#### Edit 1.1: Imports & Interface Anchor
**Location**: Lines 1-11 and Line 41.

```typescript
// Replace lines 1-11:
import { createWithEqualityFn } from 'zustand/traditional';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Winery, Visit, GooglePlaceId, WineryDbId, MapMarkerRpc } from '@/lib/types';
import { createClient } from '@/utils/supabase/client';
import { invokeFunction } from '@/lib/utils';
import { standardizeWineryData, GoogleWinery } from '@/lib/utils/winery';
import { WineryService } from '@/lib/services/wineryService';
import { enqueueIfOffline, handleSyncError } from './sync-utils';
import { idbStorage } from './idb-persist-storage';
import { isE2E, shouldMockWineries } from './e2e-utils';
import { useMapStore } from './mapStore';
```

```typescript
// Replace line 41:
  optimisticallyDeleteVisit: (visitId: string, wineryId?: GooglePlaceId | string) => void;
```

#### Edit 1.2: Actions Implementation
**Location**: Lines 360-560 in `lib/stores/wineryStore.ts`.

```typescript
      toggleFavorite: async (target) => {
        const wineryId = typeof target === 'string' ? target : target.id;
        const original = get().persistentWineries;
        const originalSearchResults = useMapStore.getState().searchResults;
        let winery = original.find(w => w.id === wineryId || (w.dbId && String(w.dbId) === String(wineryId)));
        if (!winery) {
          if (typeof target !== 'string') {
            winery = target;
          } else {
            winery = originalSearchResults.find(w => w.id === wineryId || (w.dbId && String(w.dbId) === String(wineryId)));
          }
        }
        if (!winery) {
          return;
        }

        const nextState = !winery.isFavorite;

        const existsInCache = original.some(w => w.id === wineryId || (winery?.dbId && w.dbId === winery.dbId));
        if (existsInCache) {
          set({
            persistentWineries: original.map(w =>
              w.id === wineryId || (winery?.dbId && w.dbId === winery.dbId)
                ? { ...w, isFavorite: nextState }
                : w
            ),
          });
        } else {
          const standardized = standardizeWineryData(
            { ...winery, isFavorite: nextState },
            undefined,
            { preserveUserFlags: true }
          );
          const sanitized = sanitizeWineryForCache(standardized || { ...winery, isFavorite: nextState });
          set({
            persistentWineries: [...original, sanitized],
          });
        }

        useMapStore.setState(state => ({
          searchResults: state.searchResults.map(w =>
            w.id === wineryId || (winery?.dbId && w.dbId === winery.dbId)
              ? { ...w, isFavorite: nextState }
              : w
          ),
        }));

        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        const syncPayload = {
          action: 'toggle_favorite',
          wineryId: winery.id,
          wineryDbId: winery.dbId,
          wineryName: winery.name,
          wineryAddress: winery.address,
          latitude: winery.latitude,
          longitude: winery.longitude,
        };

        if (await enqueueIfOffline('winery_action', user?.id, syncPayload)) {
          return;
        }

        try {
          const result = await WineryService.toggleFavorite(winery);
          set(state => ({
            persistentWineries: state.persistentWineries.map(w =>
              w.id === wineryId || (winery?.dbId && w.dbId === winery.dbId)
                ? { ...w, isFavorite: result.isFavorite, dbId: (result.dbId || w.dbId) as WineryDbId }
                : w
            ),
          }));
          useMapStore.setState(state => ({
            searchResults: state.searchResults.map(w =>
              w.id === wineryId || (winery?.dbId && w.dbId === winery.dbId)
                ? { ...w, isFavorite: result.isFavorite, dbId: (result.dbId || w.dbId) as WineryDbId }
                : w
            ),
          }));
        } catch (err: any) {
          if (await handleSyncError(err, 'winery_action', user?.id, syncPayload)) {
            return;
          }
          console.error('[wineryStore] Fav toggle failed:', err);
          set({ persistentWineries: original, error: err.message });
          useMapStore.setState({ searchResults: originalSearchResults });
        }
      },

      toggleWishlist: async (target) => {
        const wineryId = typeof target === 'string' ? target : target.id;
        const original = get().persistentWineries;
        const originalSearchResults = useMapStore.getState().searchResults;
        let winery = original.find(w => w.id === wineryId || (w.dbId && String(w.dbId) === String(wineryId)));
        if (!winery) {
          if (typeof target !== 'string') {
            winery = target;
          } else {
            winery = originalSearchResults.find(w => w.id === wineryId || (w.dbId && String(w.dbId) === String(wineryId)));
          }
        }
        if (!winery) {
          return;
        }

        const nextState = !winery.onWishlist;

        const existsInCache = original.some(w => w.id === wineryId || (winery?.dbId && w.dbId === winery.dbId));
        if (existsInCache) {
          set({
            persistentWineries: original.map(w =>
              w.id === wineryId || (winery?.dbId && w.dbId === winery.dbId)
                ? { ...w, onWishlist: nextState }
                : w
            ),
          });
        } else {
          const standardized = standardizeWineryData(
            { ...winery, onWishlist: nextState },
            undefined,
            { preserveUserFlags: true }
          );
          const sanitized = sanitizeWineryForCache(standardized || { ...winery, onWishlist: nextState });
          set({
            persistentWineries: [...original, sanitized],
          });
        }

        useMapStore.setState(state => ({
          searchResults: state.searchResults.map(w =>
            w.id === wineryId || (winery?.dbId && w.dbId === winery.dbId)
              ? { ...w, onWishlist: nextState }
              : w
          ),
        }));

        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        const syncPayload = {
          action: 'toggle_wishlist',
          wineryId: winery.id,
          wineryDbId: winery.dbId,
          wineryName: winery.name,
          wineryAddress: winery.address,
          latitude: winery.latitude,
          longitude: winery.longitude,
        };

        if (await enqueueIfOffline('winery_action', user?.id, syncPayload)) {
          return;
        }

        try {
          const result = await WineryService.toggleWishlist(winery);
          set(state => ({
            persistentWineries: state.persistentWineries.map(w =>
              w.id === wineryId || (winery?.dbId && w.dbId === winery.dbId)
                ? { ...w, onWishlist: result.onWishlist, dbId: (result.dbId || w.dbId) as WineryDbId }
                : w
            ),
          }));
          useMapStore.setState(state => ({
            searchResults: state.searchResults.map(w =>
              w.id === wineryId || (winery?.dbId && w.dbId === winery.dbId)
                ? { ...w, onWishlist: result.onWishlist, dbId: (result.dbId || w.dbId) as WineryDbId }
                : w
            ),
          }));
        } catch (err: any) {
          if (await handleSyncError(err, 'winery_action', user?.id, syncPayload)) {
            return;
          }
          console.error('[wineryStore] Wishlist toggle failed:', err);
          set({ persistentWineries: original, error: err.message });
          useMapStore.setState({ searchResults: originalSearchResults });
        }
      },

      toggleFavoritePrivacy: async (wineryId) => {
        const original = get().persistentWineries;
        const originalSearchResults = useMapStore.getState().searchResults;
        const winery = original.find(w => w.id === wineryId || (w.dbId && String(w.dbId) === String(wineryId)));
        if (!winery) {
          return;
        }

        const nextPrivacy = !winery.favoriteIsPrivate;
        set({
          persistentWineries: original.map(w => (w.id === wineryId || (w.dbId && String(w.dbId) === String(wineryId))) ? { ...w, favoriteIsPrivate: nextPrivacy } : w),
        });
        useMapStore.setState(state => ({
          searchResults: state.searchResults.map(w => (w.id === wineryId || (w.dbId && String(w.dbId) === String(wineryId))) ? { ...w, favoriteIsPrivate: nextPrivacy } : w),
        }));

        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        const syncPayload = {
          action: 'toggle_favorite_privacy',
          wineryDbId: winery.dbId,
        };

        if (await enqueueIfOffline('winery_action', user?.id, syncPayload)) {
          return;
        }

        try {
          const result = await WineryService.toggleFavoritePrivacy(winery);
          set(state => ({
            persistentWineries: state.persistentWineries.map(w =>
              (w.id === wineryId || (w.dbId && String(w.dbId) === String(wineryId))) ? { ...w, favoriteIsPrivate: result.isPrivate, dbId: result.dbId as WineryDbId } : w
            ),
          }));
          useMapStore.setState(state => ({
            searchResults: state.searchResults.map(w =>
              (w.id === wineryId || (w.dbId && String(w.dbId) === String(wineryId))) ? { ...w, favoriteIsPrivate: result.isPrivate, dbId: (result.dbId || w.dbId) as WineryDbId } : w
            ),
          }));
        } catch (err: any) {
          if (await handleSyncError(err, 'winery_action', user?.id, syncPayload)) {
            return;
          }
          set({ persistentWineries: original, error: err.message });
          useMapStore.setState({ searchResults: originalSearchResults });
          throw err;
        }
      },

      toggleWishlistPrivacy: async (wineryId) => {
        const original = get().persistentWineries;
        const originalSearchResults = useMapStore.getState().searchResults;
        const winery = original.find(w => w.id === wineryId || (w.dbId && String(w.dbId) === String(wineryId)));
        if (!winery) {
          return;
        }

        const nextPrivacy = !winery.wishlistIsPrivate;
        set({
          persistentWineries: original.map(w => (w.id === wineryId || (w.dbId && String(w.dbId) === String(wineryId))) ? { ...w, wishlistIsPrivate: nextPrivacy } : w),
        });
        useMapStore.setState(state => ({
          searchResults: state.searchResults.map(w => (w.id === wineryId || (w.dbId && String(w.dbId) === String(wineryId))) ? { ...w, wishlistIsPrivate: nextPrivacy } : w),
        }));

        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        const syncPayload = {
          action: 'toggle_wishlist_privacy',
          wineryDbId: winery.dbId,
        };

        if (await enqueueIfOffline('winery_action', user?.id, syncPayload)) {
          return;
        }

        try {
          const result = await WineryService.toggleWishlistPrivacy(winery);
          set(state => ({
            persistentWineries: state.persistentWineries.map(w =>
              (w.id === wineryId || (w.dbId && String(w.dbId) === String(wineryId))) ? { ...w, wishlistIsPrivate: result.isPrivate, dbId: result.dbId as WineryDbId } : w
            ),
          }));
          useMapStore.setState(state => ({
            searchResults: state.searchResults.map(w =>
              (w.id === wineryId || (w.dbId && String(w.dbId) === String(wineryId))) ? { ...w, wishlistIsPrivate: result.isPrivate, dbId: (result.dbId || w.dbId) as WineryDbId } : w
            ),
          }));
        } catch (err: any) {
          if (await handleSyncError(err, 'winery_action', user?.id, syncPayload)) {
            return;
          }
          console.error('[wineryStore] Wishlist privacy toggle failed:', err);
          set({ persistentWineries: original, error: err.message });
          useMapStore.setState({ searchResults: originalSearchResults });
          throw err;
        }
      },

      updateWinery: (id, updates) => {
        const existing = get().getWinery(id);
        if (existing) {
          get().upsertWinery({ ...existing, ...updates });
        }
        useMapStore.setState(state => ({
          searchResults: state.searchResults.map(w =>
            w.id === id || (w.dbId && existing?.dbId && w.dbId === existing.dbId)
              ? { ...w, ...updates }
              : w
          ),
        }));
      },

      // ST-03: Compatibility stubs for visits (visitStore owns visits directly)
      addVisitToWinery: (wineryId, visit) => {
        set(state => {
          const exists = state.persistentWineries.some(w =>
            w.id === wineryId || (w.dbId && String(w.dbId) === String(wineryId))
          );
          if (exists) {
            return {
              persistentWineries: state.persistentWineries.map(w =>
                w.id === wineryId || (w.dbId && String(w.dbId) === String(wineryId))
                  ? {
                      ...w,
                      userVisited: true,
                      onWishlist: false,
                      wishlistIsPrivate: false,
                    }
                  : w
              ),
            };
          }

          const searchCandidate = useMapStore.getState().searchResults.find(w =>
            w.id === wineryId || (w.dbId && String(w.dbId) === String(wineryId))
          );
          if (searchCandidate) {
            const standardized = standardizeWineryData(
              {
                ...searchCandidate,
                userVisited: true,
                onWishlist: false,
                wishlistIsPrivate: false,
              },
              undefined,
              { preserveUserFlags: true }
            );
            if (standardized) {
              return {
                persistentWineries: [...state.persistentWineries, sanitizeWineryForCache(standardized)],
              };
            }
          }

          if (visit?.wineries) {
            const fallback: Winery = {
              id: (visit.wineries.google_place_id || wineryId) as GooglePlaceId,
              dbId: visit.wineries.id,
              name: visit.wineries.name || '',
              address: visit.wineries.address || '',
              latitude: visit.wineries.latitude,
              longitude: visit.wineries.longitude,
              userVisited: true,
              onWishlist: false,
              wishlistIsPrivate: false,
              isFavorite: false,
              visits: [],
            };
            return {
              persistentWineries: [...state.persistentWineries, fallback],
            };
          }

          return {};
        });

        useMapStore.setState(state => ({
          searchResults: state.searchResults.map(w =>
            w.id === wineryId || (w.dbId && String(w.dbId) === String(wineryId))
              ? {
                  ...w,
                  userVisited: true,
                  onWishlist: false,
                  wishlistIsPrivate: false,
                }
              : w
          ),
        }));
      },
      optimisticallyUpdateVisit: () => {},
      optimisticallyDeleteVisit: (visitId, wineryId) => {
        if (!wineryId) return;
        set(state => ({
          persistentWineries: state.persistentWineries.map(w =>
            w.id === wineryId || (w.dbId && String(w.dbId) === String(wineryId))
              ? { ...w, userVisited: false }
              : w
          ),
        }));
        useMapStore.setState(state => ({
          searchResults: state.searchResults.map(w =>
            w.id === wineryId || (w.dbId && String(w.dbId) === String(wineryId))
              ? { ...w, userVisited: false }
              : w
          ),
        }));
      },
      replaceVisit: () => {},
      confirmOptimisticUpdate: () => {},
      revertOptimisticUpdate: () => {},
```

---

### 2. `lib/stores/slices/visitMutationHelpers.ts`
**Location**: Lines 20-30 in `lib/stores/slices/visitMutationHelpers.ts`.

```typescript
// Replace lines 20-30:
  set({ isSavingVisit: true });
  const supabase = createClient();
  const { addVisitToWinery, replaceVisit, upsertWinery } = useWineryStore.getState();

  const existingWinery = useWineryStore.getState().getWinery?.(winery.id);
  const preMutationWinery = {
    userVisited: existingWinery?.userVisited ?? winery.userVisited ?? false,
    onWishlist: existingWinery?.onWishlist ?? winery.onWishlist ?? false,
    wishlistIsPrivate: existingWinery?.wishlistIsPrivate ?? winery.wishlistIsPrivate ?? false,
  };

  if (!existingWinery) {
    upsertWinery({
      ...winery,
      userVisited: true,
      onWishlist: false,
      wishlistIsPrivate: false,
    });
  }
```

---

### 3. `lib/stores/slices/visitInitHelpers.ts`
**Location**: Lines 22-71 in `lib/stores/slices/visitInitHelpers.ts`.

```typescript
// Replace lines 22-71:
export async function deleteVisitHelper(
  get: GetVisitState,
  set: SetVisitState,
  visitId: string
): Promise<void> {
  const { optimisticallyDeleteVisit, revertOptimisticUpdate, confirmOptimisticUpdate } = useWineryStore.getState();
  const supabase = createClient();

  const originalVisits = get().visits;
  const visitToDelete = originalVisits.find(v => String(v.id) === String(visitId));
  const wineryIdentifier = (visitToDelete?.wineryId ||
    visitToDelete?.wineries?.google_place_id ||
    (visitToDelete?.wineries?.id != null ? String(visitToDelete.wineries.id) : undefined)) as string | undefined;

  const remainingVisits = originalVisits.filter(v =>
    String(v.id) !== String(visitId) && (
      (visitToDelete?.wineryId && v.wineryId === visitToDelete.wineryId) ||
      (visitToDelete?.wineries?.google_place_id && v.wineries?.google_place_id === visitToDelete.wineries.google_place_id) ||
      (visitToDelete?.wineries?.id != null && v.wineries?.id === visitToDelete.wineries.id)
    )
  );
  const hasOtherVisits = remainingVisits.length > 0;

  if (!hasOtherVisits && wineryIdentifier) {
    optimisticallyDeleteVisit(visitId, wineryIdentifier);
  } else {
    optimisticallyDeleteVisit(visitId);
  }

  const now = Date.now();
  set(state => ({
    visits: state.visits.filter(v => String(v.id) !== String(visitId)),
    lastActionTimestamp: now
  }));
  get().setLastActionTimestamp(String(visitId), now);

  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  const syncPayload = { visitId };

  if (await enqueueIfOffline('delete_visit', user?.id, syncPayload)) {
    set({ lastActionTimestamp: Date.now() });
    return;
  }

  try {
    const numericId = parseInt(visitId, 10);
    if (!isNaN(numericId) && numericId > 0) {
      const { error } = await supabase.rpc('delete_visit', { p_visit_id: numericId });
      if (error) throw error;
    }
    
    confirmOptimisticUpdate();
    set({ lastActionTimestamp: Date.now() });
  } catch (error) {
    if (await handleSyncError(error, 'delete_visit', user?.id, syncPayload)) {
      set({ lastActionTimestamp: Date.now() });
      return;
    }

    console.error("Failed to delete visit, marking as error:", error);
    revertOptimisticUpdate();
    if (!hasOtherVisits && wineryIdentifier) {
      useWineryStore.getState().addVisitToWinery(wineryIdentifier);
    }
    const revertedVisits = originalVisits.map(v => 
      String(v.id) === String(visitId) ? { ...v, syncStatus: 'error' as const } : v
    );
    set({ visits: revertedVisits, lastActionTimestamp: Date.now() });
    throw error;
  }
}
```

---

## Execution Verification Protocol
During the execution phase, run the following verification commands using the container runner (`BypassSandbox: true`):

1. **Target Store Enrichment Test Suite**:
   ```bash
   ./scripts/run-jest-container.sh lib/stores/__tests__/wineryStore.enrichment.test.ts
   ```
   *Expected Outcome*: All test cases in `wineryStore.enrichment.test.ts` pass cleanly (including the 6 Phase 3 Task 3 reactive synchronization tests).

2. **Core Store Regression Test Suites**:
   ```bash
   ./scripts/run-jest-container.sh lib/stores/__tests__/wineryStore.test.ts
   ./scripts/run-jest-container.sh lib/stores/__tests__/visitStore.domainInvariants.test.ts
   ./scripts/run-jest-container.sh lib/stores/__tests__/wineryStore.syncStore.test.ts
   ```
   *Expected Outcome*: No regressions across existing store invariant suites.

3. **TypeScript Type Verification**:
   ```bash
   npm run type-check
   ```
   *Expected Outcome*: Zero TypeScript diagnostic errors.
