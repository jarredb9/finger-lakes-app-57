# Implementation Plan: Phase 5 Task 2 - Refactor `syncService.ts` to Delegate to `TripService.createTrip` (Green Phase)

**Track:** `initial-trip-creation-wineries_20261002` (Issue [#57](https://github.com/jarredb9/finger-lakes-app-57/issues/57))  
**Phase:** 5 (Offline Sync Parity (`syncService.ts`))  
**Task:** 2 (Refactor `syncService.ts` to Delegate to `TripService.createTrip` - Green Phase)  
**Specification Reference:** [spec.md](./spec.md) (Section 3.6)  
**Track Plan Reference:** [plan.md](./plan.md) (Phase 5 Task 2)  

---

## 1. Objective & Seam-Bounded Architecture

### 1.1 Objective
Transition Phase 5 from Red to Green by eliminating the duplicate, incomplete offline trip creation logic in `lib/services/syncService.ts` and delegating directly to `TripService.createTrip(payload, item.id)`.

Specifically:
1. Refactor the `'create_trip'` switch case in `lib/services/syncService.ts` to delegate to `TripService.createTrip(payload, item.id)`.
2. Ensure that stops 2+ are never dropped when syncing offline multi-stop trips to Supabase.
3. Populate `wineries_count` on the synced trip record using `syncedTrip.wineries_count ?? syncedTrip.wineries?.length ?? payload.wineries?.length ?? 0` prior to replacing the optimistic trip in `useTripStore` via `replaceTripTempId`.
4. Trigger comprehensive background cache invalidation across all trip views:
   - `fetchTripsForDate(targetDate)` for planner day view synchronization.
   - `fetchUpcomingTrips()` and `fetchTrips(1, 'upcoming', true)` via the existing sync completion hook.
5. Turn all 4 failing tests from Phase 5 Task 1 Green across both `lib/stores/__tests__/tripStore.syncStore.test.ts` and `lib/services/__tests__/syncService.test.ts`.

---

### 1.2 Architectural Context & Seam Boundaries

#### 1. The Offline Queue Replay Parity Gap (Root Cause)
- In `lib/services/syncService.ts` (lines 386–431), `'create_trip'` previously invoked PostgreSQL RPC `create_trip_with_winery` with only `payload.wineries[0]`:
  ```typescript
  // PREVIOUS DEFECTIVE IMPLEMENTATION:
  case 'create_trip': {
    let createdTripResult = null;
    if (payload.wineries && payload.wineries.length > 0) {
      const { data, error: tripError } = await supabase.rpc('create_trip_with_winery', {
        p_trip_name: payload.name,
        p_trip_date: payload.trip_date,
        p_winery_data: WineryService.getRpcData(payload.wineries[0]), // ONLY FIRST STOP PERSISTED!
        p_notes: payload.notes || null,
        p_members: [],
        p_idempotency_key: item.id
      });
      error = tripError;
      createdTripResult = data;
    }
  ```
- **Consequence:** Any winery stops after the first stop (stops 2, 3, etc.) were permanently lost when replaying offline-created trips.
- In Phase 4, `TripService.createTrip` was hardened to iterate over `trip.wineries.slice(1)`, polymorphicly chain each stop via `this.addWineryToExistingTrip`, and execute an atomic rollback (`this.deleteTrip`) if any chained addition fails.
- By delegating to `TripService.createTrip(payload, item.id)`, offline sync inherits full multi-stop parity, Google Places ephemeral ID resolution, and strict atomic rollback semantics.

#### 2. The `wineries_count` Invariant
- When `replaceTripTempId(payload.tempId, finalTrip)` is called, the store replaces the optimistic placeholder (e.g. `tempId = -1001`) with `finalTrip`.
- If `wineries_count` is undefined or omitted on `syncedTrip`, trip cards evaluating `{trip.wineries_count ?? trip.wineries?.length ?? 0}` can fall out of sync until a manual page refresh.
- In this Green phase, `wineries_count` is explicitly calculated and guaranteed:
  ```typescript
  const wineriesCount =
    syncedTrip.wineries_count ??
    syncedTrip.wineries?.length ??
    payload.wineries?.length ??
    0;
  ```

#### 3. Day-View Cache Invalidation (`fetchTripsForDate`)
- `syncService.ts` already refreshes `upcomingTrips` and paginated `trips` at lines 712–716 when `processedTypes.has('create_trip')`.
- However, calendar planner views rely on `tripsForDate`. By dispatching `useTripStore.getState().fetchTripsForDate(targetDate)` within `case 'create_trip'`, the planner day view is immediately refreshed when offline mutations sync back to Supabase.

---

## 2. Invariants & Guardrails

1. **Multi-Stop Parity Invariant:**
   - All wineries present in `payload.wineries` must be sent to the server. Stops 2+ must never be dropped during offline replay.
2. **Idempotency Key Forwarding Invariant:**
   - `item.id` from the sync queue mutation must be passed as the second argument (`idempotencyKey`) to `TripService.createTrip(payload, item.id)`.
3. **Accurate Count Invariant:**
   - The replaced trip in `useTripStore` must have a defined, non-null numeric `wineries_count`.
4. **Error Pipeline Invariant:**
   - If `TripService.createTrip` throws an error, the error must be captured (`error = err`) so that `SyncService`'s existing 4xx DLQ routing, 5xx exponential backoff with jitter, and error status updates function without interruption.
5. **Non-Breaking Existing Sync Handlers:**
   - Zero changes to other mutation types (`log_visit`, `update_visit`, `delete_visit`, `update_trip`, `delete_trip`, `update_profile`, `social_action`, `winery_action`).

---

## 3. Target Files & Exact Drop-in Specifications

### 3.1 Target File: `lib/services/syncService.ts`
- **Absolute Path:** `/home/byrnesjd4821/Git/finger-lakes-app-57/lib/services/syncService.ts`
- **Imports Status:**
  - `useTripStore` is already imported at line 6 (`import { useTripStore } from '@/lib/stores/tripStore';`).
  - `TripService` is already imported at line 9 (`import { TripService } from './tripService';`).
  - `Trip` is already imported at line 10 (`import { Trip, toGooglePlaceId, toWineryDbId } from '@/lib/types';`).
  - **No import changes required.**

---

#### Chunk 1: Refactor `'create_trip'` Case to Delegate to `TripService.createTrip`
- **StartLine:** 386
- **EndLine:** 431
- **Instruction:** Replace lines 386–431 with delegation to `TripService.createTrip`, count population, optimistic ID replacement, and day-view cache invalidation.

**TargetContent:**
```typescript
            case 'create_trip': {
              let createdTripResult: { trip_id?: number | string; id?: number | string } | null = null;
              if (payload.wineries && payload.wineries.length > 0) {
                  const { data, error: tripError } = await supabase.rpc('create_trip_with_winery', {
                    p_trip_name: payload.name,
                    p_trip_date: payload.trip_date,
                    p_winery_data: WineryService.getRpcData(payload.wineries[0]),
                    p_notes: payload.notes || null,
                    p_members: [],
                    p_idempotency_key: item.id
                  });
                  error = tripError;
                  createdTripResult = data;
              } else {
                  const { data, error: tripError } = await supabase.rpc('create_trip', {
                    p_name: payload.name,
                    p_trip_date: payload.trip_date,
                    p_idempotency_key: item.id
                  });
                  error = tripError;
                  createdTripResult = data;
              }

              if (!error && payload.tempId) {
                const serverTripId = createdTripResult?.trip_id || createdTripResult?.id;
                if (serverTripId) {
                  let syncedTrip: Trip | null = null;
                  try {
                    syncedTrip = await TripService.getTripById(serverTripId.toString());
                  } catch {
                    syncedTrip = null;
                  }
                  const finalTrip: Trip = syncedTrip || {
                    id: Number(serverTripId),
                    user_id: user.id,
                    name: payload.name,
                    trip_date: payload.trip_date,
                    wineries: payload.wineries || [],
                    members: [],
                    syncStatus: 'synced',
                  };
                  useTripStore.getState().replaceTripTempId(payload.tempId, finalTrip);
                }
              }
              break;
            }
```

**ReplacementContent:**
```typescript
            case 'create_trip': {
              try {
                const syncedTrip = await TripService.createTrip(payload, item.id);
                if (!syncedTrip) {
                  throw new Error(`Failed to create trip for mutation ${item.id}`);
                }
                const targetDate = syncedTrip.trip_date || payload.trip_date;
                const wineriesCount =
                  syncedTrip.wineries_count ??
                  syncedTrip.wineries?.length ??
                  payload.wineries?.length ??
                  0;
                const finalTrip: Trip = {
                  ...syncedTrip,
                  id: Number(syncedTrip.id),
                  user_id: syncedTrip.user_id || user.id,
                  name: syncedTrip.name || payload.name,
                  trip_date: targetDate,
                  wineries: syncedTrip.wineries || payload.wineries || [],
                  wineries_count: wineriesCount,
                  members: syncedTrip.members || [],
                  syncStatus: 'synced',
                };

                if (payload.tempId) {
                  useTripStore.getState().replaceTripTempId(payload.tempId, finalTrip);
                }

                if (targetDate) {
                  useTripStore.getState().fetchTripsForDate(targetDate);
                }
              } catch (err) {
                error = err;
              }
              break;
            }
```

---

## 4. Execution Verification Protocol

### 4.1 Verification Commands
Once user approval is granted and the code modification is executed, run the containerized Jest test runner against both target test suites:
```bash
./scripts/run-jest-container.sh lib/stores/__tests__/tripStore.syncStore.test.ts lib/services/__tests__/syncService.test.ts
```

### 4.2 Expected Green-Phase Signatures
All test suites must pass 100%:

1. **`lib/stores/__tests__/tripStore.syncStore.test.ts` (All Passing):**
   - `should enqueue create_trip mutation in SyncStore when offline` -> PASS
   - `should enqueue delete_trip mutation in SyncStore when offline` -> PASS
   - `should enqueue update_trip mutation in SyncStore when offline` -> PASS
   - `offline create_trip replay with multi-stop parity`:
     - `replays offline multi-stop create_trip through TripService.createTrip without dropping stops 2+ and populates wineries_count` -> PASS
     - `populates wineries_count from wineries array length when TripService.createTrip returns record without wineries_count` -> PASS
     - `triggers background cache invalidation for upcoming trips, all trips, and target date` -> PASS

2. **`lib/services/__tests__/syncService.test.ts` (All Passing):**
   - `should handle create_trip mutations by delegating to TripService.createTrip with full multi-stop payload` -> PASS
   - All existing `update_trip`, `delete_trip`, `log_visit`, `update_profile`, `social_action`, OCC, DLQ, and backoff tests -> PASS

---

## 5. Risk Analysis & Regression Mitigation

| Risk | Impact | Mitigation Strategy |
| :--- | :--- | :--- |
| `TripService.createTrip` rejection unhandled | Replay loop crashes or leaves queue stuck | Wrapped in `try / catch (err) { error = err; }`. Errors are routed directly into `SyncService`'s existing 4xx DLQ and 5xx backoff handlers. |
| Missing `tempId` on non-optimistic payloads | Runtime error during store replacement | `if (payload.tempId)` guard prevents invalid `replaceTripTempId` calls. |
| Incomplete `wineries_count` on server response | Trip card badge renders "0 Wineries" or stale count | Cascading fallback: `syncedTrip.wineries_count ?? syncedTrip.wineries?.length ?? payload.wineries?.length ?? 0`. |
| Missing `trip_date` in payload | Day-view invalidation called with undefined | `targetDate = syncedTrip.trip_date || payload.trip_date` with `if (targetDate)` guard before calling `fetchTripsForDate`. |
| Cache invalidation promise rejection | Failure of background fetch blocks sync completion | `fetchTripsForDate` internally catches errors and resets loading state. |
