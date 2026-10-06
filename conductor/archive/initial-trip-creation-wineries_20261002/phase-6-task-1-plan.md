# Implementation Plan: Phase 6 Task 1 - Write Failing Tests for Store Invariants & Rollback Suppression (Red Phase)

**Track:** `initial-trip-creation-wineries_20261002` (Issue [#57](https://github.com/jarredb9/finger-lakes-app-57/issues/57))  
**Phase:** 6 (Store Invariants, Background Invalidation & Badge Pluralization (`tripMutationHelpers`, `TripCardSimplePresentational`))  
**Task:** 1 (Write Failing Tests for Store Invariants & Rollback Suppression (Red Phase))  
**Specification Reference:** [spec.md](./spec.md) (Section 3.7, Section 4, Section 6)  
**Track Plan Reference:** [plan.md](./plan.md) (Phase 6, Task 1)  

---

## 1. Objective & Seam-Bounded Architecture

### 1.1 Objective
Establish failing unit tests (TDD Red Phase) in:
- `lib/stores/slices/__tests__/tripMutationHelpers.test.ts`

These tests rigorously assert that:
1. **Optimistic Store Invariant:** `createTripHelper` populates `wineries_count: validWineries.length` on the temporary optimistic trip (`tempTrip`) across `trips`, `upcomingTrips`, and `tripsForDate`, both while in-flight and when returning optimistically via offline queueing (`enqueueIfOffline`).
2. **Synced Store Invariant:** Upon resolution of `TripService.createTrip`, `createTripHelper` ensures `syncedTrip` has `wineries_count` accurately set to `createdTrip?.wineries_count ?? createdTrip?.wineries?.length ?? validWineries.length` (never `undefined`).
3. **Background Cache Invalidation:** Upon successful trip creation, `createTripHelper` dispatches non-blocking, fire-and-forget background cache re-fetches for `fetchUpcomingTrips()`, `fetchTripsForDate(validTripDate)`, and `fetchTrips(1, 'upcoming', true)`. Re-fetch rejections are caught and logged without throwing or failing trip creation.
4. **Offline Queue Rollback Suppression:** When `TripService.createTrip` fails with an error tagged with `preventOfflineEnqueue: true` (e.g. from Phase 4 chained stop addition failure), `createTripHelper` strictly bypasses `handleSyncError`, prevents offline mutation enqueuing, immediately purges the optimistic temporary trip from all collections, and rethrows the error.
5. **Existing Regression Guard:** Existing tests (permanent 400 rollback and `replaceTripTempId` reconciliation) and non-tagged error offline queueing continue to pass without regression.

---

### 1.2 Architectural Context & Seam Boundaries

#### 1. The Missing `wineries_count` Invariant in `createTripHelper`
- In `lib/stores/slices/tripMutationHelpers.ts` (lines 85–93):
  ```typescript
  const tempTrip: Trip = {
    id: tempId,
    user_id: user?.id || '',
    trip_date: validTripDate,
    name: validName,
    wineries: validWineries,
    members: [],
    syncStatus: 'pending',
  };
  ```
  **The Defect:** `tempTrip` completely omits `wineries_count`.
- In `lib/stores/slices/tripMutationHelpers.ts` (lines 124–132):
  ```typescript
  set(state => {
    const syncedTrip = createdTrip ? { ...createdTrip, syncStatus: 'synced' as const } : null;
    return {
      tripsForDate: state.tripsForDate.map(t => Number(t.id) === tempId ? syncedTrip! : t),
      upcomingTrips: state.upcomingTrips.map(t => Number(t.id) === tempId ? syncedTrip! : t),
      trips: state.trips.map(t => Number(t.id) === tempId ? syncedTrip! : t),
      lastActionTimestamp: finishedNow
    };
  });
  ```
  **The Defect:** If `createdTrip` returned from `TripService.createTrip` does not explicitly include `wineries_count` (e.g. when returned from Supabase without joining counts), spreading `...createdTrip` leaves `wineries_count: undefined` on the synced record in `useTripStore`.
- Consequently, UI components like `TripCardSimplePresentational` evaluating `{trip.wineries_count ?? trip.wineries?.length ?? 0}` can evaluate to `0` or flash out of sync until a hard page reload.
- **Target Seam (Phase 6 Task 2):** Set `wineries_count: validWineries.length` on `tempTrip`, and set `wineries_count: (createdTrip?.wineries?.length ?? validWineries.length)` on `syncedTrip`.

#### 2. The Missing Background Cache Invalidation in `createTripHelper`
- In `lib/stores/slices/tripMutationHelpers.ts` (lines 118–134):
  `createTripHelper` awaits `TripService.createTrip`, updates local store collections via `map()`, and immediately returns `createdTrip`.
- **The Defect:** It does NOT trigger store cache re-fetches. If the user navigates between planner date views, or if other views rely on `upcomingTrips` or paginated `trips`, backend aggregate counters and sorting remain stale.
- **Target Seam (Phase 6 Task 2):** Dispatch:
  ```typescript
  void Promise.all([
    get().fetchUpcomingTrips(),
    get().fetchTripsForDate(validTripDate),
    get().fetchTrips(1, 'upcoming', true)
  ]).catch(err => {
    console.error("Failed to refresh background cache after trip creation:", err);
  });
  ```

#### 3. Offline Rollback Suppression Gap (`preventOfflineEnqueue`)
- In Phase 4, `TripService.createTrip` was updated to delete the partially created remote trip when chained stops (stops 2+) fail, tag the error with `preventOfflineEnqueue = true`, and rethrow:
  ```typescript
  (chainedError as { preventOfflineEnqueue?: boolean }).preventOfflineEnqueue = true;
  throw chainedError;
  ```
- In current `createTripHelper` (lines 135–139):
  ```typescript
  } catch (error) {
    if (await handleSyncError(error, 'create_trip', user?.id, syncPayload, idempotencyKey)) {
      return tempTrip;
    }
  ```
  **The Defect:** `createTripHelper` unconditionally calls `handleSyncError`! If `handleSyncError` treats the error as offline/network or if the user goes offline during chained creation, it will enqueue the creation mutation into IndexedDB `syncStore`. Upon reconnect, `syncService` would replay the trip, recreating duplicate or corrupted trips!
- **Target Seam (Phase 6 Task 2):** Check `(error as any)?.preventOfflineEnqueue`. If true, bypass `handleSyncError`, immediately purge `tempId` from `trips`, `upcomingTrips`, and `tripsForDate`, and rethrow.

#### 4. The Red-Phase Strategy
- In Task 1, we add unit test suites to `lib/stores/slices/__tests__/tripMutationHelpers.test.ts` covering:
  1. `wineries_count` population on `tempTrip` (optimistic in-flight and offline return).
  2. `wineries_count` population on `syncedTrip` (fallback to wineries length and server count preservation).
  3. Background cache invalidation dispatch (`fetchUpcomingTrips`, `fetchTripsForDate`, `fetchTrips`).
  4. Non-blocking resilience when background cache invalidation rejects.
  5. Error rollback and suppression of `handleSyncError` when `preventOfflineEnqueue: true`.
  6. Delegation preservation to `handleSyncError` when `preventOfflineEnqueue` is absent.
- When run against the current codebase, tests 1, 2, 3, and 5 MUST fail deterministically.
- Zero production code is modified in Task 1.

---

## 2. Invariants & Guardrails

1. **Existing Test Preservation Invariant:**
   - Existing tests in `lib/stores/slices/__tests__/tripMutationHelpers.test.ts` (permanent 400 rollback and `replaceTripTempId` reconciliation) must continue to pass without regression.
2. **Strict Red-Phase Invariant:**
   - In Task 1, NO production files (`lib/stores/slices/tripMutationHelpers.ts`, `components/TripCardSimplePresentational.tsx`, etc.) may be modified. Only test files are modified.
3. **Seam Boundary Invariant:**
   - Tests must operate through the store contract (`createTripHelper(get, set, ...)` with store state inspection via `useTripStore.getState()`), exactly matching established patterns.
4. **Rollback & Offline Queue Suppression Invariant:**
   - When `preventOfflineEnqueue: true`, `handleSyncError` must have zero invocations, and negative IDs must not linger in store state.
5. **Deterministic Count Population Invariant:**
   - `wineries_count` on both optimistic and synced store records must evaluate to a positive number matching the input/server stops.

---

## 3. Target Files & Exact Drop-in Specifications

### 3.1 Target File: `lib/stores/slices/__tests__/tripMutationHelpers.test.ts`
- **Path:** `lib/stores/slices/__tests__/tripMutationHelpers.test.ts`
- **Modifications:**
  - **Chunk 1 (Lines 1–6):** Update imports to include `createMockWinery`, `GooglePlaceId`, `WineryDbId`, `enqueueIfOffline`, and `handleSyncError`.
  - **Chunk 2 (Lines 64–76):** In `beforeEach`, add `jest.clearAllMocks()`, mock implementation resets for `enqueueIfOffline` and `handleSyncError`, and add an `afterEach` block to restore spies via `jest.restoreAllMocks()`.
  - **Chunk 3 (Lines 193–195):** Add new test suites:
    - `describe('createTripHelper store invariants - wineries_count population')`
    - `describe('createTripHelper background cache invalidation')`
    - `describe('createTripHelper error rollback & offline enqueue suppression')`

---

#### Chunk 1: Imports
**StartLine:** 1  
**EndLine:** 6  
**TargetContent:**
```typescript
import { act } from '@testing-library/react';
import { createMockTrip } from '@/lib/test-utils/fixtures';
import { Trip } from '@/lib/types';
import { useTripStore } from '@/lib/stores/tripStore';
import { createTripHelper } from '../tripMutationHelpers';
```
**ReplacementContent:**
```typescript
import { act } from '@testing-library/react';
import { createMockTrip, createMockWinery } from '@/lib/test-utils/fixtures';
import { Trip, GooglePlaceId, WineryDbId } from '@/lib/types';
import { useTripStore } from '@/lib/stores/tripStore';
import { createTripHelper } from '../tripMutationHelpers';
import { enqueueIfOffline, handleSyncError } from '@/lib/stores/sync-utils';
```

---

#### Chunk 2: `beforeEach` & `afterEach` Reset
**StartLine:** 64  
**EndLine:** 76  
**TargetContent:**
```typescript
  beforeEach(() => {
    mockTripService = {
      createTrip: jest.fn(),
      deleteTrip: jest.fn(),
      updateTrip: jest.fn(),
    };
    globalThis._TRIP_MUTATION_HELPERS_MOCKS = {
      mockTripService,
    };

    useTripStore.getState().reset();
  });
```
**ReplacementContent:**
```typescript
  beforeEach(() => {
    jest.clearAllMocks();
    mockTripService = {
      createTrip: jest.fn(),
      deleteTrip: jest.fn(),
      updateTrip: jest.fn(),
    };
    globalThis._TRIP_MUTATION_HELPERS_MOCKS = {
      mockTripService,
    };

    (enqueueIfOffline as jest.Mock).mockResolvedValue(false);
    (handleSyncError as jest.Mock).mockImplementation((error: Error | { message?: string; status?: number }) => {
      if (error?.message?.includes('400') || ('status' in error && error.status === 400)) {
        return Promise.resolve(false);
      }
      return Promise.resolve(false);
    });

    useTripStore.getState().reset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
```

---

#### Chunk 3: New Red-Phase Test Suites
**StartLine:** 192  
**EndLine:** 195  
**TargetContent:**
```typescript
    });
  });
});
```
**ReplacementContent:**
```typescript
    });
  });

  describe('createTripHelper store invariants - wineries_count population', () => {
    const mockWinery1 = createMockWinery({
      id: 'place_1' as GooglePlaceId,
      dbId: 101 as WineryDbId,
      name: 'Dr. Konstantin Frank',
    });
    const mockWinery2 = createMockWinery({
      id: 'place_2' as GooglePlaceId,
      dbId: 102 as WineryDbId,
      name: 'Ravines Wine Cellars',
    });

    it('populates wineries_count on optimistic temporary trip during creation', async () => {
      const get = useTripStore.getState;
      const set = useTripStore.setState;

      const newTripInput: Partial<Trip> = {
        name: 'Keuka Wine Trail',
        trip_date: '2026-10-20',
        wineries: [mockWinery1, mockWinery2],
      };

      let capturedOptimisticTrip: Trip | undefined;
      mockTripService.createTrip.mockImplementationOnce(async () => {
        capturedOptimisticTrip = useTripStore.getState().trips.find(t => Number(t.id) < 0);
        return {
          id: 501,
          name: 'Keuka Wine Trail',
          trip_date: '2026-10-20',
          user_id: 'test-user-1',
          wineries: [mockWinery1, mockWinery2],
          wineries_count: 2,
          members: [],
          syncStatus: 'synced',
        };
      });

      await act(async () => {
        await createTripHelper(get, set, newTripInput);
      });

      expect(capturedOptimisticTrip).toBeDefined();
      expect(capturedOptimisticTrip?.wineries_count).toBe(2);
      expect(capturedOptimisticTrip?.wineries).toHaveLength(2);
    });

    it('populates wineries_count on returned tempTrip when offline enqueuing succeeds', async () => {
      const get = useTripStore.getState;
      const set = useTripStore.setState;

      (enqueueIfOffline as jest.Mock).mockResolvedValueOnce(true);

      const newTripInput: Partial<Trip> = {
        name: 'Offline Tour',
        trip_date: '2026-10-20',
        wineries: [mockWinery1, mockWinery2],
      };

      let returnedTrip: Trip | null = null;
      await act(async () => {
        returnedTrip = await createTripHelper(get, set, newTripInput);
      });

      expect(returnedTrip).toBeDefined();
      expect(returnedTrip?.wineries_count).toBe(2);
      const storeTrip = useTripStore.getState().trips.find(t => Number(t.id) < 0);
      expect(storeTrip?.wineries_count).toBe(2);
    });

    it('populates wineries_count on synced trip in store after successful creation, falling back to wineries length', async () => {
      const get = useTripStore.getState;
      const set = useTripStore.setState;

      const newTripInput: Partial<Trip> = {
        name: 'Seneca Tour',
        trip_date: '2026-10-21',
        wineries: [mockWinery1, mockWinery2],
      };

      // Server response omitting wineries_count property
      const serverTripWithoutCount: Partial<Trip> = {
        id: 502,
        name: 'Seneca Tour',
        trip_date: '2026-10-21',
        user_id: 'test-user-1',
        wineries: [mockWinery1, mockWinery2],
        members: [],
      };
      mockTripService.createTrip.mockResolvedValueOnce(serverTripWithoutCount);

      await act(async () => {
        await createTripHelper(get, set, newTripInput);
      });

      const syncedTrip = useTripStore.getState().trips.find(t => t.id === 502);
      expect(syncedTrip).toBeDefined();
      expect(syncedTrip?.wineries_count).toBe(2);
      expect(syncedTrip?.syncStatus).toBe('synced');
    });

    it('preserves server wineries_count on synced trip if returned by TripService.createTrip', async () => {
      const get = useTripStore.getState;
      const set = useTripStore.setState;

      const newTripInput: Partial<Trip> = {
        name: 'Single Winery Trip',
        trip_date: '2026-10-21',
        wineries: [mockWinery1],
      };

      const serverTripWithCount: Partial<Trip> = {
        id: 503,
        name: 'Single Winery Trip',
        trip_date: '2026-10-21',
        user_id: 'test-user-1',
        wineries: [mockWinery1],
        wineries_count: 1,
        members: [],
      };
      mockTripService.createTrip.mockResolvedValueOnce(serverTripWithCount);

      await act(async () => {
        await createTripHelper(get, set, newTripInput);
      });

      const syncedTrip = useTripStore.getState().trips.find(t => t.id === 503);
      expect(syncedTrip).toBeDefined();
      expect(syncedTrip?.wineries_count).toBe(1);
    });
  });

  describe('createTripHelper background cache invalidation', () => {
    it('dispatches background cache re-fetches for upcomingTrips, tripsForDate, and trips after creation', async () => {
      const get = useTripStore.getState;
      const set = useTripStore.setState;

      const targetDate = '2026-10-25';
      const newTripInput: Partial<Trip> = {
        name: 'Cayuga Trail',
        trip_date: targetDate,
        wineries: [],
      };

      mockTripService.createTrip.mockResolvedValueOnce({
        id: 601,
        name: 'Cayuga Trail',
        trip_date: targetDate,
        user_id: 'test-user-1',
        wineries: [],
        wineries_count: 0,
        members: [],
      });

      const fetchUpcomingTripsSpy = jest.spyOn(useTripStore.getState(), 'fetchUpcomingTrips').mockResolvedValue(undefined);
      const fetchTripsForDateSpy = jest.spyOn(useTripStore.getState(), 'fetchTripsForDate').mockResolvedValue(undefined);
      const fetchTripsSpy = jest.spyOn(useTripStore.getState(), 'fetchTrips').mockResolvedValue(undefined);

      await act(async () => {
        await createTripHelper(get, set, newTripInput);
      });

      expect(fetchUpcomingTripsSpy).toHaveBeenCalledTimes(1);
      expect(fetchTripsForDateSpy).toHaveBeenCalledWith(targetDate);
      expect(fetchTripsSpy).toHaveBeenCalledWith(1, 'upcoming', true);
    });

    it('does not throw or fail trip creation if background cache re-fetches reject', async () => {
      const get = useTripStore.getState;
      const set = useTripStore.setState;

      const targetDate = '2026-10-25';
      const newTripInput: Partial<Trip> = {
        name: 'Resilient Trail',
        trip_date: targetDate,
        wineries: [],
      };

      mockTripService.createTrip.mockResolvedValueOnce({
        id: 602,
        name: 'Resilient Trail',
        trip_date: targetDate,
        user_id: 'test-user-1',
        wineries: [],
        wineries_count: 0,
        members: [],
      });

      jest.spyOn(useTripStore.getState(), 'fetchUpcomingTrips').mockRejectedValue(new Error('Network error on refresh'));
      jest.spyOn(useTripStore.getState(), 'fetchTripsForDate').mockRejectedValue(new Error('Network error on date refresh'));
      jest.spyOn(useTripStore.getState(), 'fetchTrips').mockRejectedValue(new Error('Network error on trips refresh'));

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      let result: Trip | null = null;
      await act(async () => {
        result = await createTripHelper(get, set, newTripInput);
      });

      expect(result).toBeDefined();
      expect(result?.id).toBe(602);
      consoleErrorSpy.mockRestore();
    });
  });

  describe('createTripHelper error rollback & offline enqueue suppression', () => {
    it('bypasses handleSyncError and performs immediate optimistic rollback when error has preventOfflineEnqueue: true', async () => {
      const get = useTripStore.getState;
      const set = useTripStore.setState;

      const existingTrip = createMockTrip({
        id: 100,
        name: 'Existing Established Trip',
        trip_date: '2026-10-01',
      });

      useTripStore.setState({
        trips: [existingTrip],
        upcomingTrips: [existingTrip],
        tripsForDate: [existingTrip],
      });

      const chainedError = new Error('Chained stop addition failed: 404 Winery Not Found');
      (chainedError as any).preventOfflineEnqueue = true;

      mockTripService.createTrip.mockRejectedValueOnce(chainedError);
      // If handleSyncError were erroneously invoked, configure it to return true
      (handleSyncError as jest.Mock).mockResolvedValueOnce(true);

      const newTripInput: Partial<Trip> = {
        name: 'Multi-Stop Rollback Trip',
        trip_date: '2026-10-01',
        user_id: 'test-user-1',
        wineries: [
          createMockWinery({ id: 'place_1' as GooglePlaceId, dbId: 101 as WineryDbId }),
          createMockWinery({ id: 'place_2' as GooglePlaceId, dbId: 102 as WineryDbId }),
        ],
      };

      await act(async () => {
        await expect(createTripHelper(get, set, newTripInput)).rejects.toThrow(
          'Chained stop addition failed: 404 Winery Not Found'
        );
      });

      // CRITICAL: handleSyncError must NOT be called when preventOfflineEnqueue is true
      expect(handleSyncError).not.toHaveBeenCalled();

      // Optimistic rollback: temporary trip must be purged from all collections
      const state = useTripStore.getState();
      expect(state.trips.find(t => Number(t.id) < 0 || t.name === 'Multi-Stop Rollback Trip')).toBeUndefined();
      expect(state.upcomingTrips.find(t => Number(t.id) < 0 || t.name === 'Multi-Stop Rollback Trip')).toBeUndefined();
      expect(state.tripsForDate.find(t => Number(t.id) < 0 || t.name === 'Multi-Stop Rollback Trip')).toBeUndefined();

      // Existing trip must be preserved
      expect(state.trips).toHaveLength(1);
      expect(state.trips[0].id).toBe(100);
    });

    it('delegates to handleSyncError when error does NOT have preventOfflineEnqueue', async () => {
      const get = useTripStore.getState;
      const set = useTripStore.setState;

      const networkError = new Error('Failed to fetch: Network offline');
      mockTripService.createTrip.mockRejectedValueOnce(networkError);
      (handleSyncError as jest.Mock).mockResolvedValueOnce(true);

      const newTripInput: Partial<Trip> = {
        name: 'Offline Queued Trip',
        trip_date: '2026-10-01',
        user_id: 'test-user-1',
        wineries: [],
      };

      let returnedTrip: Trip | null = null;
      await act(async () => {
        returnedTrip = await createTripHelper(get, set, newTripInput);
      });

      expect(handleSyncError).toHaveBeenCalledWith(
        networkError,
        'create_trip',
        'test-user-1',
        expect.objectContaining({ name: 'Offline Queued Trip' }),
        expect.any(String)
      );
      expect(returnedTrip).toBeDefined();
      expect(returnedTrip?.name).toBe('Offline Queued Trip');
    });
  });
});
```

---

## 4. Execution Verification Protocol

### 4.1 Verification Commands
Once approved, execute the containerized Jest test runner across the targeted suite:
```bash
./scripts/run-jest-container.sh lib/stores/slices/__tests__/tripMutationHelpers.test.ts
```

### 4.2 Expected Red-Phase Failure Signatures
In this Red Phase, the 2 pre-existing tests (`FM-6.4` permanent 400 error rollback and `replaceTripTempId` reconciliation) and the regression test (`delegates to handleSyncError when error does NOT have preventOfflineEnqueue`) must PASS, while the remaining 5 newly added tests must FAIL predictably:

1. **`populates wineries_count on optimistic temporary trip during creation`:**
   - **Expected Failure:** `expect(received).toBe(expected) // Expected: 2, Received: undefined` on `capturedOptimisticTrip?.wineries_count`.
   - **Reason:** Current `createTripHelper` (lines 85–93) constructs `tempTrip` without setting `wineries_count`.

2. **`populates wineries_count on returned tempTrip when offline enqueuing succeeds`:**
   - **Expected Failure:** `expect(received).toBe(expected) // Expected: 2, Received: undefined` on `returnedTrip?.wineries_count`.
   - **Reason:** Current `createTripHelper` returns `tempTrip` on offline enqueue, which has `wineries_count: undefined`.

3. **`populates wineries_count on synced trip in store after successful creation, falling back to wineries length`:**
   - **Expected Failure:** `expect(received).toBe(expected) // Expected: 2, Received: undefined` on `syncedTrip?.wineries_count`.
   - **Reason:** Current `createTripHelper` (line 125) does `{ ...createdTrip, syncStatus: 'synced' }` without providing `wineries_count` fallback when `createdTrip` lacks it.

4. **`dispatches background cache re-fetches for upcomingTrips, tripsForDate, and trips after creation`:**
   - **Expected Failure:** `expect(jest.fn()).toHaveBeenCalledTimes(expected) // Expected: 1, Received: 0` on `fetchUpcomingTripsSpy`.
   - **Reason:** Current `createTripHelper` does not call `fetchUpcomingTrips`, `fetchTripsForDate`, or `fetchTrips`.

5. **`bypasses handleSyncError and performs immediate optimistic rollback when error has preventOfflineEnqueue: true`:**
   - **Expected Failure:** `expect(received).rejects.toThrow() // Received function did not throw` (or `expect(jest.fn()).not.toHaveBeenCalled() // Expected: 0, Received: 1` on `handleSyncError`).
   - **Reason:** Current `createTripHelper` (lines 135–139) unconditionally calls `handleSyncError(error, ...)`. Because `handleSyncError` returns `true`, `createTripHelper` erroneously catches the error and returns `tempTrip` instead of executing rollback and rethrowing.

---

## 5. Risk Analysis & Regression Mitigation

| Risk | Impact | Mitigation Strategy |
| :--- | :--- | :--- |
| Mock state leakage across tests | Inaccurate call counts or unexpected mock behaviors in subsequent tests | `beforeEach` runs `jest.clearAllMocks()` and resets default mock implementations for `enqueueIfOffline` and `handleSyncError`. `afterEach` runs `jest.restoreAllMocks()`. |
| Spying on Zustand store methods interfering with store actions | Spies on `fetchUpcomingTrips` or `fetchTrips` might persist across suites | `jest.restoreAllMocks()` in `afterEach` cleanly restores original slice functions on `useTripStore.getState()`. |
| Unhandled Promise rejection during background cache re-fetch test | Node process warnings or test runner crashes | The resilience test installs a `console.error` spy and asserts `createTripHelper` resolves cleanly even when all 3 cache re-fetches reject. |
| Interference with pre-existing `FM-6.4` tests | Regressions in existing rollback assertions | Pre-existing tests remain untouched in the suite; new tests are added in separate, isolated `describe` blocks. |
