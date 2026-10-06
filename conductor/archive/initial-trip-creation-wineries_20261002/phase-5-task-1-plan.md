# Implementation Plan: Phase 5 Task 1 - Write Failing Tests for Offline Multi-Stop Trip Replay (Red Phase)

**Track:** `initial-trip-creation-wineries_20261002` (Issue [#57](https://github.com/jarredb9/finger-lakes-app-57/issues/57))  
**Phase:** 5 (Offline Sync Parity (`syncService.ts`))  
**Task:** 1 (Write Failing Tests for Offline Multi-Stop Trip Replay)  
**Specification Reference:** [spec.md](./spec.md)  
**Track Plan Reference:** [plan.md](./plan.md)  

---

## 1. Objective & Seam-Bounded Architecture

### 1.1 Objective
Establish failing unit and integration tests (TDD Red Phase) in:
1. `lib/stores/__tests__/tripStore.syncStore.test.ts` (Store Integration Suite)
2. `lib/services/__tests__/syncService.test.ts` (SyncService Unit Suite)

These tests assert that:
1. An offline `create_trip` sync mutation with multiple wineries (stops 1, 2, ...) replays through `TripService.createTrip(payload, item.id)` rather than directly executing a partial Supabase RPC.
2. Stops 2+ are never dropped when syncing offline trips back to the server.
3. The temporary optimistic trip in `useTripStore` (e.g. `tempId = -1001`) is replaced via `replaceTripTempId` with a synced record whose `wineries_count` is accurately populated (`wineries_count: 2`).
4. When `TripService.createTrip` returns a record where `wineries_count` is omitted or undefined, `SyncService` normalizes `wineries_count` from `syncedTrip.wineries?.length ?? payload.wineries?.length ?? 0`.
5. Background store cache invalidation (`fetchUpcomingTrips`, `fetchTrips`, and `fetchTripsForDate`) is triggered after replaying `create_trip`.

---

### 1.2 Architectural Context & Seam Boundaries

#### 1. The Offline Queue Replay Parity Gap (`syncService.ts`)
- In `lib/services/syncService.ts` (lines 386–431), the `'create_trip'` switch case currently contains:
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
  ```
- **The Defect:** When a user creates a multi-stop trip while offline, `payload.wineries` contains all selected stops (`[w1, w2, w3]`). But upon replay, `syncService.ts` invokes `create_trip_with_winery` with ONLY `payload.wineries[0]`. Stops 2+ (`w2`, `w3`) are silently and permanently discarded!
- In contrast, online trip creation uses `TripService.createTrip` (hardened in Phase 4), which iterates over `trip.wineries.slice(1)`, invokes `addWineryToExistingTrip`, and executes atomic rollback if any stop fails.
- **Target Seam (Phase 5 Task 2):** `syncService.ts` must delegate directly to `TripService.createTrip(payload, item.id)`.

#### 2. The Missing `wineries_count` Invariant
- In current `syncService.ts` (lines 418–427):
  ```typescript
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
  ```
- **The Defect:** `finalTrip` does not set `wineries_count`. If `syncedTrip` is returned from `TripService.getTripById`, `wineries_count` is not explicitly guaranteed. If `finalTrip` fallback is used, `wineries_count` is `undefined`. Consequently, trip cards evaluating `{trip.wineries_count ?? trip.wineries?.length ?? 0}` can render stale or incorrect stop counts.
- **Target Seam (Phase 5 Task 2):** Set `wineries_count: syncedTrip?.wineries_count ?? syncedTrip?.wineries?.length ?? payload.wineries?.length ?? 0` on the replaced record.

#### 3. Background Cache Invalidation
- In current `syncService.ts` (lines 712–715):
  ```typescript
  if (processedTypes.has('create_trip') || processedTypes.has('update_trip') || processedTypes.has('delete_trip')) {
    useTripStore.getState().fetchTrips(1, 'upcoming', true);
    useTripStore.getState().fetchUpcomingTrips();
  }
  ```
- **The Defect:** When a trip is created for a specific calendar date, `fetchTripsForDate` is not triggered. If the user is viewing that date's day view in the planner, the planner remains stale until an explicit navigation or refresh.
- **Target Seam (Phase 5 Task 2):** Trigger `fetchUpcomingTrips()`, `fetchTrips(1, 'upcoming', true)`, and `fetchTripsForDate(targetDate)`.

#### 4. The Red-Phase Strategy
- In Task 1, we write rigorous test assertions that expect this target architecture.
- When run against the current codebase, the tests MUST fail deterministically:
  1. `TripService.createTrip` is called 0 times because `syncService.ts` calls `supabase.rpc` directly.
  2. The store's replaced trip lacks `wineries_count: 2`.
  3. `fetchTripsForDate` is never invoked during sync refresh.
- Zero production code is modified in Task 1.

---

## 2. Invariants & Guardrails

1. **Existing Test Preservation Invariant:**
   - All existing tests in `lib/stores/__tests__/tripStore.syncStore.test.ts` (enqueueing `create_trip`, `delete_trip`, `update_trip`) and `lib/services/__tests__/syncService.test.ts` must continue to pass without regression.
2. **Strict Red-Phase Invariant:**
   - In Task 1, NO production files (`lib/services/syncService.ts`, `lib/services/tripService.ts`, etc.) may be modified. Only test files are updated.
3. **Multi-Stop Integrity Invariant:**
   - Test payloads must include at least 2 distinct wineries (verifying stops 2+ preservation).
4. **Idempotency Key Forwarding Invariant:**
   - `SyncService.sync()` must pass the mutation's `item.id` as the `idempotencyKey` argument to `TripService.createTrip(payload, item.id)`.
5. **Accurate Count Invariant:**
   - The trip replaced in `useTripStore` must have `wineries_count === 2`.

---

## 3. Target Files & Exact Drop-in Specifications

### 3.1 Target File: `lib/stores/__tests__/tripStore.syncStore.test.ts`
- **Path:** `lib/stores/__tests__/tripStore.syncStore.test.ts`
- **Modifications:**
  - **Chunk 1 (Lines 1–34):** Import `SyncService`, `Trip`, `GooglePlaceId`, `WineryDbId`, `createMockWinery`. Expand `useSyncStore` and `createClient` mocks to support auth and mutation removal.
  - **Chunk 2 (Lines 36–48):** In `beforeEach`, reset `SyncService.isSyncing = false` and mock `removeMutation`.
  - **Chunk 3 (Lines 106–108):** Add new test suite `describe('offline create_trip replay with multi-stop parity', ...)` asserting multi-stop delegation, count normalization, and background cache refresh.

---

#### Chunk 1: Imports and Enhanced Mocks
**StartLine:** 1  
**EndLine:** 34  
**TargetContent:**
```typescript
import { act } from '@testing-library/react';
import { useTripStore } from '../tripStore';
import { useSyncStore } from '@/lib/stores/syncStore';

const mockAddMutation = jest.fn().mockResolvedValue(undefined);

jest.mock('@/lib/stores/syncStore', () => ({
  useSyncStore: {
    getState: jest.fn(() => ({
      addMutation: mockAddMutation,
      queue: [],
      initialize: jest.fn(),
    })),
  },
}));

jest.mock('@/lib/services/tripService', () => ({
  TripService: {
    createTrip: jest.fn(),
    deleteTrip: jest.fn(),
    updateTrip: jest.fn(),
    getTrips: jest.fn().mockResolvedValue({ trips: [], count: 0 }),
  },
}));

jest.mock('@/utils/supabase/client', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: { user: { id: 'user-123' } } }, error: null }),
    },
    rpc: jest.fn().mockResolvedValue({ data: {}, error: null }),
  })),
}));
```
**ReplacementContent:**
```typescript
import { act } from '@testing-library/react';
import { useTripStore } from '../tripStore';
import { useSyncStore } from '@/lib/stores/syncStore';
import { SyncService } from '@/lib/services/syncService';
import { Trip, GooglePlaceId, WineryDbId } from '@/lib/types';
import { createMockWinery } from '@/lib/test-utils/fixtures';

const mockAddMutation = jest.fn().mockResolvedValue(undefined);
const mockRemoveMutation = jest.fn().mockResolvedValue(undefined);
const mockUpdateMutationStatus = jest.fn();
const mockGetDecryptedPayload = jest.fn();

jest.mock('@/lib/stores/syncStore', () => ({
  useSyncStore: {
    getState: jest.fn(() => ({
      addMutation: mockAddMutation,
      removeMutation: mockRemoveMutation,
      updateMutationStatus: mockUpdateMutationStatus,
      getDecryptedPayload: mockGetDecryptedPayload,
      queue: [],
      isInitialized: true,
      initialize: jest.fn().mockResolvedValue(undefined),
    })),
  },
}));

jest.mock('@/lib/services/tripService', () => ({
  TripService: {
    createTrip: jest.fn(),
    deleteTrip: jest.fn(),
    updateTrip: jest.fn(),
    getTrips: jest.fn().mockResolvedValue({ trips: [], count: 0 }),
  },
}));

jest.mock('@/utils/supabase/client', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null }),
      getSession: jest.fn().mockResolvedValue({ data: { session: { user: { id: 'user-123' } } }, error: null }),
      onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
    },
    rpc: jest.fn().mockResolvedValue({ data: {}, error: null }),
  })),
}));
```

---

#### Chunk 2: `beforeEach` Cleanup
**StartLine:** 36  
**EndLine:** 48  
**TargetContent:**
```typescript
  beforeEach(() => {
    jest.clearAllMocks();
    mockAddMutation.mockResolvedValue(undefined);

    // Mock navigator.onLine to false
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
      writable: true,
    });

    useTripStore.getState().reset();
  });
```
**ReplacementContent:**
```typescript
  beforeEach(() => {
    jest.clearAllMocks();
    mockAddMutation.mockResolvedValue(undefined);
    mockRemoveMutation.mockResolvedValue(undefined);
    (SyncService as any).isSyncing = false;

    // Mock navigator.onLine to false (default for enqueue tests)
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
      writable: true,
    });

    useTripStore.getState().reset();
  });
```

---

#### Chunk 3: Add `describe('offline create_trip replay with multi-stop parity')` Suite
**StartLine:** 105  
**EndLine:** 108  
**TargetContent:**
```typescript
    }));
  });
});
```
**ReplacementContent:**
```typescript
    }));
  });

  describe('offline create_trip replay with multi-stop parity', () => {
    const mockWinery1 = createMockWinery({
      id: 'place_1' as GooglePlaceId,
      dbId: 101 as WineryDbId,
      name: 'Dr. Konstantin Frank',
      latitude: 42.553,
      longitude: -77.159,
    });

    const mockWinery2 = createMockWinery({
      id: 'place_2' as GooglePlaceId,
      dbId: 102 as WineryDbId,
      name: 'Ravines Wine Cellars',
      latitude: 42.793,
      longitude: -76.963,
    });

    it('replays offline multi-stop create_trip through TripService.createTrip without dropping stops 2+ and populates wineries_count', async () => {
      const tempId = -1001;
      const tempTrip: Trip = {
        id: tempId,
        user_id: 'user-123',
        name: 'Keuka Wine Trail',
        trip_date: '2026-10-20',
        wineries: [mockWinery1, mockWinery2],
        members: [],
        syncStatus: 'pending',
        wineries_count: 2,
      };

      // Seed optimistic trip in tripStore
      useTripStore.setState({
        trips: [tempTrip],
        upcomingTrips: [tempTrip],
        tripsForDate: [tempTrip],
      });

      const payload = {
        tempId,
        name: 'Keuka Wine Trail',
        trip_date: '2026-10-20',
        wineries: [mockWinery1, mockWinery2],
        notes: 'Two stops planned',
      };

      const mutationItem = {
        id: 'mutation-create-trip-123',
        type: 'create_trip',
        encryptedPayload: 'encrypted-payload',
        createdAt: new Date().toISOString(),
        userId: 'user-123',
      };

      (useSyncStore.getState as jest.Mock).mockReturnValue({
        queue: [mutationItem],
        isInitialized: true,
        initialize: jest.fn().mockResolvedValue(undefined),
        removeMutation: mockRemoveMutation,
        updateMutationStatus: mockUpdateMutationStatus,
        getDecryptedPayload: mockGetDecryptedPayload.mockResolvedValue(payload),
        addMutation: mockAddMutation,
      });

      const serverSyncedTrip: Trip = {
        id: 501,
        user_id: 'user-123',
        name: 'Keuka Wine Trail',
        trip_date: '2026-10-20',
        wineries: [mockWinery1, mockWinery2],
        members: [],
        syncStatus: 'synced',
        wineries_count: 2,
      };
      (TripService.createTrip as jest.Mock).mockResolvedValue(serverSyncedTrip);

      // Transition to online
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        value: true,
        writable: true,
      });

      await act(async () => {
        await SyncService.sync();
      });

      // 1. Assert delegation to TripService.createTrip with full payload and idempotency key
      expect(TripService.createTrip).toHaveBeenCalledTimes(1);
      expect(TripService.createTrip).toHaveBeenCalledWith(payload, 'mutation-create-trip-123');

      // 2. Assert optimistic tempId was replaced with synced trip
      const storeTrips = useTripStore.getState().trips;
      const replaced = storeTrips.find(t => t.id === 501);
      expect(replaced).toBeDefined();
      expect(replaced?.wineries_count).toBe(2);
      expect(replaced?.wineries).toHaveLength(2);
      expect(replaced?.syncStatus).toBe('synced');

      // 3. Assert temp trip was removed
      expect(storeTrips.find(t => t.id === tempId)).toBeUndefined();

      // 4. Assert mutation was removed from sync store queue
      expect(mockRemoveMutation).toHaveBeenCalledWith('mutation-create-trip-123');
    });

    it('populates wineries_count from wineries array length when TripService.createTrip returns record without wineries_count', async () => {
      const tempId = -1002;
      const tempTrip: Trip = {
        id: tempId,
        user_id: 'user-123',
        name: 'Seneca Tour',
        trip_date: '2026-10-21',
        wineries: [mockWinery1, mockWinery2],
        members: [],
        syncStatus: 'pending',
        wineries_count: 2,
      };

      useTripStore.setState({ trips: [tempTrip] });

      const payload = {
        tempId,
        name: 'Seneca Tour',
        trip_date: '2026-10-21',
        wineries: [mockWinery1, mockWinery2],
      };

      const mutationItem = {
        id: 'mutation-create-trip-456',
        type: 'create_trip',
        encryptedPayload: 'encrypted-payload',
        createdAt: new Date().toISOString(),
        userId: 'user-123',
      };

      (useSyncStore.getState as jest.Mock).mockReturnValue({
        queue: [mutationItem],
        isInitialized: true,
        initialize: jest.fn().mockResolvedValue(undefined),
        removeMutation: mockRemoveMutation,
        updateMutationStatus: mockUpdateMutationStatus,
        getDecryptedPayload: mockGetDecryptedPayload.mockResolvedValue(payload),
        addMutation: mockAddMutation,
      });

      // Trip returned without wineries_count property
      const serverTripWithoutCount: Partial<Trip> = {
        id: 502,
        user_id: 'user-123',
        name: 'Seneca Tour',
        trip_date: '2026-10-21',
        wineries: [mockWinery1, mockWinery2],
        members: [],
        syncStatus: 'synced',
      };
      (TripService.createTrip as jest.Mock).mockResolvedValue(serverTripWithoutCount);

      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        value: true,
        writable: true,
      });

      await act(async () => {
        await SyncService.sync();
      });

      const replaced = useTripStore.getState().trips.find(t => t.id === 502);
      expect(replaced).toBeDefined();
      expect(replaced?.wineries_count).toBe(2);
    });

    it('triggers background cache invalidation for upcoming trips, all trips, and target date', async () => {
      const tempId = -1003;
      const targetDate = '2026-10-22';
      const tempTrip: Trip = {
        id: tempId,
        user_id: 'user-123',
        name: 'Cayuga Route',
        trip_date: targetDate,
        wineries: [mockWinery1, mockWinery2],
        members: [],
        syncStatus: 'pending',
      };

      useTripStore.setState({ trips: [tempTrip] });

      const payload = {
        tempId,
        name: 'Cayuga Route',
        trip_date: targetDate,
        wineries: [mockWinery1, mockWinery2],
      };

      const mutationItem = {
        id: 'mutation-create-trip-789',
        type: 'create_trip',
        encryptedPayload: 'encrypted-payload',
        userId: 'user-123',
      };

      (useSyncStore.getState as jest.Mock).mockReturnValue({
        queue: [mutationItem],
        isInitialized: true,
        initialize: jest.fn().mockResolvedValue(undefined),
        removeMutation: mockRemoveMutation,
        updateMutationStatus: mockUpdateMutationStatus,
        getDecryptedPayload: mockGetDecryptedPayload.mockResolvedValue(payload),
        addMutation: mockAddMutation,
      });

      (TripService.createTrip as jest.Mock).mockResolvedValue({
        id: 503,
        user_id: 'user-123',
        name: 'Cayuga Route',
        trip_date: targetDate,
        wineries: [mockWinery1, mockWinery2],
        wineries_count: 2,
        members: [],
        syncStatus: 'synced',
      });

      const fetchTripsSpy = jest.spyOn(useTripStore.getState(), 'fetchTrips').mockResolvedValue(undefined);
      const fetchUpcomingTripsSpy = jest.spyOn(useTripStore.getState(), 'fetchUpcomingTrips').mockResolvedValue(undefined);
      const fetchTripsForDateSpy = jest.spyOn(useTripStore.getState(), 'fetchTripsForDate').mockResolvedValue(undefined);

      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        value: true,
        writable: true,
      });

      await act(async () => {
        await SyncService.sync();
      });

      expect(fetchUpcomingTripsSpy).toHaveBeenCalled();
      expect(fetchTripsSpy).toHaveBeenCalledWith(1, 'upcoming', true);
      expect(fetchTripsForDateSpy).toHaveBeenCalledWith(targetDate);
    });
  });
});
```

---

### 3.2 Target File: `lib/services/__tests__/syncService.test.ts`
- **Path:** `lib/services/__tests__/syncService.test.ts`
- **Modifications:**
  - **Chunk 1 (Lines 18–25):** Add mocks for `replaceTripTempId`, `fetchTripsForDate`, and `TripService`.
  - **Chunk 2 (Lines 208–210):** Add unit test `it('should handle create_trip mutations by delegating to TripService.createTrip with full multi-stop payload', ...)` right alongside `update_trip` and `delete_trip`.

---

#### Chunk 1: TripStore & TripService Mocks
**StartLine:** 18  
**EndLine:** 25  
**TargetContent:**
```typescript
jest.mock('@/lib/stores/tripStore', () => ({
  useTripStore: {
    getState: jest.fn(() => ({
      fetchTrips: jest.fn(),
      fetchUpcomingTrips: jest.fn(),
    })),
  },
}));
```
**ReplacementContent:**
```typescript
const mockReplaceTripTempId = jest.fn();
const mockFetchTrips = jest.fn();
const mockFetchUpcomingTrips = jest.fn();
const mockFetchTripsForDate = jest.fn();

jest.mock('@/lib/stores/tripStore', () => ({
  useTripStore: {
    getState: jest.fn(() => ({
      fetchTrips: mockFetchTrips,
      fetchUpcomingTrips: mockFetchUpcomingTrips,
      fetchTripsForDate: mockFetchTripsForDate,
      replaceTripTempId: mockReplaceTripTempId,
    })),
  },
}));

jest.mock('../tripService', () => ({
  TripService: {
    createTrip: jest.fn(),
    getTripById: jest.fn(),
  },
}));
```

---

#### Chunk 2: Unit Test for `create_trip` Delegation
**StartLine:** 208  
**EndLine:** 210  
**TargetContent:**
```typescript
    expect(mockSyncStore.removeMutation).toHaveBeenCalledWith('sync-trip-delete');
  });

  it('should handle update_profile mutations', async () => {
```
**ReplacementContent:**
```typescript
    expect(mockSyncStore.removeMutation).toHaveBeenCalledWith('sync-trip-delete');
  });

  it('should handle create_trip mutations by delegating to TripService.createTrip with full multi-stop payload', async () => {
    const { TripService } = require('../tripService');
    const mockWinery1 = { id: 'place_1', name: 'Winery 1', latitude: 42.5, longitude: -77.1 };
    const mockWinery2 = { id: 'place_2', name: 'Winery 2', latitude: 42.6, longitude: -77.2 };
    const payload = {
      tempId: -1001,
      name: 'Multi-Stop Tour',
      trip_date: '2026-10-25',
      wineries: [mockWinery1, mockWinery2],
      notes: 'Two stops',
    };

    const mockMutation = {
      id: 'sync-trip-create',
      type: 'create_trip',
      encryptedPayload: 'encrypted-payload',
      userId: 'test-user-id',
    };

    const mockSyncStore = {
      queue: [mockMutation],
      isInitialized: true,
      initialize: jest.fn().mockResolvedValue(undefined),
      removeMutation: jest.fn().mockResolvedValue(undefined),
      updateMutationStatus: jest.fn(),
      getDecryptedPayload: jest.fn().mockResolvedValue(payload),
    };

    (useSyncStore.getState as jest.Mock).mockReturnValue(mockSyncStore);

    const serverTrip = {
      id: 999,
      user_id: 'test-user-id',
      name: 'Multi-Stop Tour',
      trip_date: '2026-10-25',
      wineries: [mockWinery1, mockWinery2],
      members: [],
      syncStatus: 'synced',
      wineries_count: 2,
    };
    (TripService.createTrip as jest.Mock).mockResolvedValue(serverTrip);

    await SyncService.sync();

    expect(TripService.createTrip).toHaveBeenCalledWith(payload, 'sync-trip-create');
    expect(mockReplaceTripTempId).toHaveBeenCalledWith(-1001, expect.objectContaining({
      id: 999,
      wineries_count: 2,
      syncStatus: 'synced',
    }));
    expect(mockSyncStore.removeMutation).toHaveBeenCalledWith('sync-trip-create');
    expect(mockFetchUpcomingTrips).toHaveBeenCalled();
    expect(mockFetchTrips).toHaveBeenCalledWith(1, 'upcoming', true);
    expect(mockFetchTripsForDate).toHaveBeenCalledWith('2026-10-25');
  });

  it('should handle update_profile mutations', async () => {
```

---

## 4. Execution Verification Protocol

### 4.1 Verification Commands
Once approved, execute the containerized Jest test runner across both targeted suites:
```bash
./scripts/run-jest-container.sh lib/stores/__tests__/tripStore.syncStore.test.ts lib/services/__tests__/syncService.test.ts
```

### 4.2 Expected Red-Phase Failure Signatures
In this Red Phase, the existing tests must continue to PASS, while the 4 newly added tests must FAIL predictably:

1. **`lib/stores/__tests__/tripStore.syncStore.test.ts`:**
   - **Test:** `replays offline multi-stop create_trip through TripService.createTrip without dropping stops 2+ and populates wineries_count`
     - **Expected Failure:** `expect(jest.fn()).toHaveBeenCalledTimes(expected) - Expected: 1, Received: 0` on `TripService.createTrip`.
     - **Reason:** Current `syncService.ts` lines 386–407 executes `supabase.rpc('create_trip_with_winery')` directly and never calls `TripService.createTrip`.
   - **Test:** `populates wineries_count from wineries array length when TripService.createTrip returns record without wineries_count`
     - **Expected Failure:** `expect(received).toBe(2) - Expected: 2, Received: undefined` on `wineries_count`.
     - **Reason:** Current `syncService.ts` lines 418–426 constructs `finalTrip` without setting `wineries_count`.
   - **Test:** `triggers background cache invalidation for upcoming trips, all trips, and target date`
     - **Expected Failure:** `expect(jest.fn()).toHaveBeenCalledWith(expected) - Expected: "2026-10-22", Received: 0 calls` on `fetchTripsForDate`.
     - **Reason:** Current `syncService.ts` lines 712–715 does not invoke `fetchTripsForDate`.

2. **`lib/services/__tests__/syncService.test.ts`:**
   - **Test:** `should handle create_trip mutations by delegating to TripService.createTrip with full multi-stop payload`
     - **Expected Failure:** `expect(jest.fn()).toHaveBeenCalledWith(...)` on `TripService.createTrip` (0 calls).

---

## 5. Risk Analysis & Regression Mitigation

| Risk | Impact | Mitigation Strategy |
| :--- | :--- | :--- |
| Mock state leakage across test suites | Flaky or false-positive passes in later tests | All mock functions (`mockAddMutation`, `mockRemoveMutation`, `TripService.createTrip`, etc.) are explicitly cleared in `beforeEach`. |
| `navigator.onLine` pollution | Subsequent offline tests mistakenly execute as online | `beforeEach` strictly resets `navigator.onLine` to `false` for offline tests, and individual online tests explicitly set `true` within their scope. |
| Background `isSyncing` flag lock | Subsequent `SyncService.sync()` invocations early-exit | `(SyncService as any).isSyncing = false` is enforced in `beforeEach`. |
| Unhandled `idb-keyval` in Jest runner | Runner crashes on top-level import | `jest.setup.ts` already provides a global mock for `idb-keyval`, preventing environment errors. |
