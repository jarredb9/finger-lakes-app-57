# Implementation Plan: Phase 6 Task 3 - Refactor & Scaffolding Cleanup

**Track:** `initial-trip-creation-wineries_20261002` (Issue [#57](https://github.com/jarredb9/finger-lakes-app-57/issues/57))  
**Phase:** 6 (Store Invariants, Background Invalidation & Badge Pluralization (`tripMutationHelpers`, `TripCardSimplePresentational`))  
**Task:** 3 (Refactor & Scaffolding Cleanup)  
**Specification Reference:** [spec.md](./spec.md) (Section 3.7, Section 3.8, Section 5, Section 6)  
**Track Plan Reference:** [plan.md](./plan.md) (Phase 6, Task 3)  
**Preceding Task Plan References:** [phase-6-task-1-plan.md](./phase-6-task-1-plan.md), [phase-6-task-2-plan.md](./phase-6-task-2-plan.md)  

---

## 1. Objective & Seam-Bounded Architecture

### 1.1 Objective
Execute the final Refactor and Scaffolding Cleanup task for Phase 6:
1. **Clean Up Store Helper Logic in `lib/stores/slices/tripMutationHelpers.ts`:**
   - Eliminate duplicated optimistic rollback state filtering in `createTripHelper` by extracting a dedicated `rollbackOptimisticTrip(set, tempId)` helper function.
   - Replace unchecked `(error as { preventOfflineEnqueue?: boolean })?.preventOfflineEnqueue` type assertions with a strongly-typed `PreventOfflineEnqueueError` interface and type guard function `isPreventOfflineEnqueueError(error: unknown): boolean`.
   - Ensure store count normalization in `replaceTripTempIdHelper` by enforcing fallback `wineries_count: syncedTrip.wineries_count ?? syncedTrip.wineries?.length ?? 0` during offline trip temp ID reconciliation.
2. **Verify and Tighten Zustand 5 Selector Hygiene in `components/trip-card-simple.tsx`:**
   - Refactor `TripCardSimple` (which wraps `TripCardSimplePresentational`) to replace naive full-store hook invocations (`useUIStore()`, `useUserStore()`) with atomic Zustand 5 selectors (`useUIStore(s => s.openShareDialog)`, `useUserStore(s => s.user)`), adhering to ST-10 selector hygiene.
3. **Comprehensive Unit Test Coverage for Cleanups:**
   - In `lib/stores/slices/__tests__/tripMutationHelpers.test.ts`, add a test case verifying `replaceTripTempId` count normalization and clean up test typing.
   - In `components/__tests__/selectorHygiene.test.tsx`, add test coverage for `TripCardSimple Selector Hygiene (ST-10)` verifying that unrelated `userStore` and `uiStore` state changes do not trigger re-renders.
4. **Scaffolding Audit:**
   - Audit the workspace to verify zero temporary scratch files, `.tmp`, `.bak`, `.orig`, or throwaway test fixtures exist.
5. **Execution Verification Protocol:**
   - Specify the exact containerized Jest commands to verify all tests pass with zero regressions.

---

### 1.2 Architectural Context & Seam Boundaries

#### 1. Store Helper Logic & Rollback DRY Seam
- **Location:** `lib/stores/slices/tripMutationHelpers.ts`
- **Context:** During Phase 6 Task 2, error handling was added for `preventOfflineEnqueue` alongside standard rollback in `handleSyncError`. Both catch pathways execute identical state mutations to purge `tempId` from `tripsForDate`, `upcomingTrips`, and `trips`.
- **Refactor:** Extracting `rollbackOptimisticTrip` centralizes collection purging, removes duplication, and ensures that any future additions to optimistic collections are rolled back uniformly across all error branches.
- **Strong Typing:** Defining `isPreventOfflineEnqueueError` replaces unsafe object casting with safe runtime inspection conforming to TypeScript strict typing guidelines.

#### 2. Replay Invariant Seam (`replaceTripTempIdHelper`)
- **Location:** `lib/stores/slices/tripMutationHelpers.ts`
- **Context:** When offline mutations are replayed by `SyncService`, `replaceTripTempIdHelper` replaces temporary negative-ID trips with server-confirmed records. If a server payload omits `wineries_count`, spreading `...syncedTrip` could leave `wineries_count: undefined` in store collections.
- **Refactor:** Explicitly setting `wineries_count: syncedTrip.wineries_count ?? syncedTrip.wineries?.length ?? 0` guarantees that reconciled trips satisfy the store count invariant across all views.

#### 3. Zustand 5 Selector Hygiene Seam (`TripCardSimple`)
- **Location:** `components/trip-card-simple.tsx`
- **Context:** `TripCardSimple` is the stateful container for `TripCardSimplePresentational`. Currently, it subscribes to `useUIStore()` and `useUserStore()` without selectors. In Zustand 5, subscribing without a selector binds the component to the entire store object, causing re-renders whenever any unrelated property (such as `isModalOpen`, `activeModal`, `activeWineryId`, or `error`) changes.
- **Refactor:** Switching to atomic selectors `useUIStore((s) => s.openShareDialog)` and `useUserStore((s) => s.user)` eliminates unnecessary re-render cascades and aligns `TripCardSimple` with the ST-10 selector hygiene contract established in `TripCard`.

---

## 2. Invariants & Critical Guardrails

1. **Store Count Invariant:**
   - Every trip record in `trips`, `upcomingTrips`, and `tripsForDate` must always provide a non-null, valid numeric `wineries_count` (optimistic, synced, and replayed).
2. **Selector Hygiene Invariant (ST-10):**
   - Components consuming Zustand stores must utilize atomic selectors or `useShallow` to prevent unnecessary re-render cascades on unrelated slice mutations.
3. **Rollback Integrity Invariant:**
   - Any remote creation failure (chained addition failure or server error) must completely remove negative temporary IDs from `trips`, `upcomingTrips`, and `tripsForDate`.
4. **No Remote Database Mutations (`AGENTS.md` Guardrail 1):**
   - Zero migrations, DDL, or DML mutations against remote Supabase (`jfsxclrdxmvftxacjuqf`).
5. **BypassSandbox Mandates (`AGENTS.md` Section 3):**
   - All Jest test executions must run via `./scripts/run-jest-container.sh` with `BypassSandbox: true` due to RHEL 8 glibc 2.28 compatibility constraints.
6. **Modal Approval Invariant (`AGENTS.md` Section 2 & `conductor_antigravity.md`):**
   - Execution requires affirmative approval via `ask_question` modal before modifying any files.

---

## 3. Target Files & Exact Drop-in Specifications

### 3.1 Target File: `lib/stores/slices/tripMutationHelpers.ts`
- **Path:** `lib/stores/slices/tripMutationHelpers.ts`
- **Action:** Add `PreventOfflineEnqueueError` interface, `isPreventOfflineEnqueueError` type guard, and `rollbackOptimisticTrip` helper; refactor `createTripHelper` error handling; normalize `wineries_count` in `replaceTripTempIdHelper`.

---

#### Chunk 1: Type Definitions & Rollback Helper
- **StartLine:** 10
- **EndLine:** 14
- **Instruction:** Add `PreventOfflineEnqueueError` interface, `isPreventOfflineEnqueueError` type guard, and `rollbackOptimisticTrip` helper before `ALLOWED_CREATE_TRIP_KEYS`.

**TargetContent:**
```typescript
type GetTripState = StoreApi<TripState>['getState'];
type SetTripState = StoreApi<TripState>['setState'];

const ALLOWED_CREATE_TRIP_KEYS = new Set<string>(['name', 'trip_date', 'wineries']);
```

**ReplacementContent:**
```typescript
type GetTripState = StoreApi<TripState>['getState'];
type SetTripState = StoreApi<TripState>['setState'];

export interface PreventOfflineEnqueueError {
  preventOfflineEnqueue?: boolean;
}

export function isPreventOfflineEnqueueError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'preventOfflineEnqueue' in error &&
    Boolean((error as PreventOfflineEnqueueError).preventOfflineEnqueue)
  );
}

function rollbackOptimisticTrip(set: SetTripState, tempId: number): void {
  set(state => ({
    tripsForDate: state.tripsForDate.filter(t => Number(t.id) !== tempId),
    upcomingTrips: state.upcomingTrips.filter(t => Number(t.id) !== tempId),
    trips: state.trips.filter(t => Number(t.id) !== tempId),
    lastActionTimestamp: Date.now(),
  }));
}

const ALLOWED_CREATE_TRIP_KEYS = new Set<string>(['name', 'trip_date', 'wineries']);
```

---

#### Chunk 2: DRY Rollback & Clean Error Inspection in `createTripHelper`
- **StartLine:** 148
- **EndLine:** 173
- **Instruction:** Use `isPreventOfflineEnqueueError` and `rollbackOptimisticTrip` in `createTripHelper`'s catch block.

**TargetContent:**
```typescript
  } catch (error) {
    if ((error as { preventOfflineEnqueue?: boolean })?.preventOfflineEnqueue) {
      console.error("Trip creation chained addition failed, rolling back optimistic state and suppressing offline enqueue.", error);
      set(state => ({ 
        tripsForDate: state.tripsForDate.filter(t => Number(t.id) !== tempId),
        upcomingTrips: state.upcomingTrips.filter(t => Number(t.id) !== tempId),
        trips: state.trips.filter(t => Number(t.id) !== tempId),
        lastActionTimestamp: Date.now()
      }));
      throw error;
    }

    if (await handleSyncError(error, 'create_trip', user?.id, syncPayload, idempotencyKey)) {
      return tempTrip;
    }

    console.error("Failed to create trip, rolling back optimistic state.", error);
    set(state => ({ 
      tripsForDate: state.tripsForDate.filter(t => Number(t.id) !== tempId),
      upcomingTrips: state.upcomingTrips.filter(t => Number(t.id) !== tempId),
      trips: state.trips.filter(t => Number(t.id) !== tempId),
      lastActionTimestamp: Date.now()
    }));
    throw error;
  }
}
```

**ReplacementContent:**
```typescript
  } catch (error) {
    if (isPreventOfflineEnqueueError(error)) {
      console.error("Trip creation chained addition failed, rolling back optimistic state and suppressing offline enqueue.", error);
      rollbackOptimisticTrip(set, tempId);
      throw error;
    }

    if (await handleSyncError(error, 'create_trip', user?.id, syncPayload, idempotencyKey)) {
      return tempTrip;
    }

    console.error("Failed to create trip, rolling back optimistic state.", error);
    rollbackOptimisticTrip(set, tempId);
    throw error;
  }
}
```

---

#### Chunk 3: Count Normalization in `replaceTripTempIdHelper`
- **StartLine:** 336
- **EndLine:** 347
- **Instruction:** Explicitly normalize `wineries_count` on `normalizedSyncedTrip`.

**TargetContent:**
```typescript
export function replaceTripTempIdHelper(
  set: SetTripState,
  tempId: number | string,
  syncedTrip: Trip
): void {
  const numericTempId = Number(tempId);
  const normalizedSyncedTrip: Trip = {
    ...syncedTrip,
    id: Number(syncedTrip.id),
    syncStatus: 'synced',
  };
```

**ReplacementContent:**
```typescript
export function replaceTripTempIdHelper(
  set: SetTripState,
  tempId: number | string,
  syncedTrip: Trip
): void {
  const numericTempId = Number(tempId);
  const normalizedSyncedTrip: Trip = {
    ...syncedTrip,
    id: Number(syncedTrip.id),
    wineries_count: syncedTrip.wineries_count ?? syncedTrip.wineries?.length ?? 0,
    syncStatus: 'synced',
  };
```

---

### 3.2 Target File: `components/trip-card-simple.tsx`
- **Path:** `components/trip-card-simple.tsx`
- **Action:** Convert `useUIStore()` and `useUserStore()` calls to atomic selectors.

---

#### Chunk 1: Atomic Selectors for `useUIStore` and `useUserStore`
- **StartLine:** 14
- **EndLine:** 17
- **Instruction:** Replace full-store destructuring with atomic selectors `s => s.openShareDialog` and `s => s.user`.

**TargetContent:**
```typescript
export default function TripCardSimple({ trip, onDelete }: TripCardSimpleProps) {
    const { openShareDialog } = useUIStore();
    const { user } = useUserStore();
    
```

**ReplacementContent:**
```typescript
export default function TripCardSimple({ trip, onDelete }: TripCardSimpleProps) {
    const openShareDialog = useUIStore((s) => s.openShareDialog);
    const user = useUserStore((s) => s.user);
    
```

---

### 3.3 Target File: `lib/stores/slices/__tests__/tripMutationHelpers.test.ts`
- **Path:** `lib/stores/slices/__tests__/tripMutationHelpers.test.ts`
- **Action:** Add unit test for count normalization in `replaceTripTempId` and clean error type assertions.

---

#### Chunk 1: Add Unit Test for `replaceTripTempId` Count Normalization
- **StartLine:** 203
- **EndLine:** 208
- **Instruction:** Add a test verifying `replaceTripTempId` normalizes `wineries_count` when `syncedServerTrip.wineries_count` is undefined.

**TargetContent:**
```typescript
        // Force fail if replaceTripTempId is not yet implemented
        expect(store.replaceTripTempId).toBeDefined();
      }
    });
  });

  describe('createTripHelper store invariants - wineries_count population', () => {
```

**ReplacementContent:**
```typescript
        // Force fail if replaceTripTempId is not yet implemented
        expect(store.replaceTripTempId).toBeDefined();
      }
    });

    it('normalizes wineries_count on reconciled synced trip when replacing tempId', () => {
      const tempId = -Date.now();
      const mockWinery = createMockWinery({
        id: 'place_1' as GooglePlaceId,
        dbId: 101 as WineryDbId,
        name: 'Dr. Konstantin Frank',
      });

      const tempTrip: Trip = {
        id: tempId,
        user_id: 'test-user-1',
        trip_date: '2026-10-01',
        name: 'Offline Created Trip',
        wineries: [mockWinery],
        wineries_count: 1,
        members: [],
        syncStatus: 'pending',
      };

      useTripStore.setState({
        trips: [tempTrip],
        upcomingTrips: [tempTrip],
        tripsForDate: [tempTrip],
      });

      // Server trip omitting wineries_count property
      const syncedServerTrip: Trip = {
        id: 42,
        user_id: 'test-user-1',
        trip_date: '2026-10-01',
        name: 'Offline Created Trip (Synced)',
        wineries: [mockWinery],
        members: [],
        syncStatus: 'synced',
      };

      const store = useTripStore.getState();
      act(() => {
        store.replaceTripTempId(tempId, syncedServerTrip);
      });

      const updatedState = useTripStore.getState();
      expect(updatedState.trips[0].wineries_count).toBe(1);
      expect(updatedState.upcomingTrips[0].wineries_count).toBe(1);
      expect(updatedState.tripsForDate[0].wineries_count).toBe(1);
    });
  });

  describe('createTripHelper store invariants - wineries_count population', () => {
```

---

#### Chunk 2: Clean Error Typing in Rollback Test
- **StartLine:** 460
- **EndLine:** 464
- **Instruction:** Replace `(chainedError as any).preventOfflineEnqueue = true` with `Object.assign`.

**TargetContent:**
```typescript
      const chainedError = new Error('Chained stop addition failed: 404 Winery Not Found');
      (chainedError as any).preventOfflineEnqueue = true;
```

**ReplacementContent:**
```typescript
      const chainedError = Object.assign(
        new Error('Chained stop addition failed: 404 Winery Not Found'),
        { preventOfflineEnqueue: true }
      );
```

---

### 3.4 Target File: `components/__tests__/selectorHygiene.test.tsx`
- **Path:** `components/__tests__/selectorHygiene.test.tsx`
- **Action:** Import and mock `TripCardSimple` / `TripCardSimplePresentational`, reset counter in `beforeEach`, and add dedicated selector hygiene test suite for `TripCardSimple`.

---

#### Chunk 1: Import & Mock `TripCardSimplePresentational`
- **StartLine:** 7
- **EndLine:** 17
- **Instruction:** Import `TripCardSimple`, declare `tripCardSimpleRenderCount`, and add mock for `TripCardSimplePresentational`.

**TargetContent:**
```typescript
import TripCard from "@/components/trip-card";
import { MapControls } from "@/components/map/map-controls";
import MapView from "@/components/map/MapView";
import { Trip, Winery } from "@/lib/types";

// Track render counts across components
let tripCardRenderCount = 0;
let mapControlsChildRenderCount = 0;
let mapViewChildRenderCount = 0;
```

**ReplacementContent:**
```typescript
import TripCard from "@/components/trip-card";
import TripCardSimple from "@/components/trip-card-simple";
import { MapControls } from "@/components/map/map-controls";
import MapView from "@/components/map/MapView";
import { Trip, Winery } from "@/lib/types";

// Track render counts across components
let tripCardRenderCount = 0;
let tripCardSimpleRenderCount = 0;
let mapControlsChildRenderCount = 0;
let mapViewChildRenderCount = 0;

// Mock child and peripheral components to accurately count parent re-render executions
jest.mock("@/components/TripCardSimplePresentational", () => {
  return function MockTripCardSimplePresentational(props: any) {
    tripCardSimpleRenderCount++;
    return (
      <div
        data-testid="mock-trip-card-simple-presentational"
        data-is-owner={String(props.isOwner)}
      />
    );
  };
});
```

---

#### Chunk 2: Reset `tripCardSimpleRenderCount` in `beforeEach`
- **StartLine:** 138
- **EndLine:** 144
- **Instruction:** Reset `tripCardSimpleRenderCount = 0` in `beforeEach`.

**TargetContent:**
```typescript
  beforeEach(() => {
    jest.clearAllMocks();
    tripCardRenderCount = 0;
    mapControlsChildRenderCount = 0;
    mapViewChildRenderCount = 0;
```

**ReplacementContent:**
```typescript
  beforeEach(() => {
    jest.clearAllMocks();
    tripCardRenderCount = 0;
    tripCardSimpleRenderCount = 0;
    mapControlsChildRenderCount = 0;
    mapViewChildRenderCount = 0;
```

---

#### Chunk 3: Add `TripCardSimple Selector Hygiene (ST-10)` Test Suite
- **StartLine:** 232
- **EndLine:** 237
- **Instruction:** Add `describe("TripCardSimple Selector Hygiene (ST-10)")` directly after `describe("TripCard Selector Hygiene (ST-10)")`.

**TargetContent:**
```typescript
      expect(screen.getByTestId("mock-trip-card-presentational")).toHaveAttribute(
        "data-is-updating",
        "true"
      );
    });
  });

  describe("MapControls Selector Hygiene (ST-10)", () => {
```

**ReplacementContent:**
```typescript
      expect(screen.getByTestId("mock-trip-card-presentational")).toHaveAttribute(
        "data-is-updating",
        "true"
      );
    });
  });

  describe("TripCardSimple Selector Hygiene (ST-10)", () => {
    it("does not re-render when unrelated userStore state changes (error)", () => {
      render(<TripCardSimple trip={baseTrip} onDelete={jest.fn()} />);
      const initialRenders = tripCardSimpleRenderCount;

      act(() => {
        useUserStore.setState({
          error: "Auth refresh error",
        } as any);
      });

      expect(tripCardSimpleRenderCount).toBe(initialRenders);
    });

    it("does not re-render when unrelated uiStore state changes (isModalOpen, activeModal)", () => {
      render(<TripCardSimple trip={baseTrip} onDelete={jest.fn()} />);
      const initialRenders = tripCardSimpleRenderCount;

      act(() => {
        useUIStore.setState({
          isModalOpen: true,
          activeModal: { type: "winery_notes" },
          activeWineryId: "42",
        });
      });

      expect(tripCardSimpleRenderCount).toBe(initialRenders);
    });

    it("re-renders when subscribed userStore state changes (user)", () => {
      render(<TripCardSimple trip={baseTrip} onDelete={jest.fn()} />);
      const initialRenders = tripCardSimpleRenderCount;

      act(() => {
        useUserStore.setState({
          user: { id: "user-2", email: "other@example.com" } as any,
        });
      });

      expect(tripCardSimpleRenderCount).toBe(initialRenders + 1);
    });
  });

  describe("MapControls Selector Hygiene (ST-10)", () => {
```

---

## 4. Execution Verification Protocol

Upon user approval to execute, run the containerized Jest runner to verify all affected test suites:

### 4.1 Step 1: Store Mutation Helpers Test Suite
```bash
./scripts/run-jest-container.sh lib/stores/slices/__tests__/tripMutationHelpers.test.ts
```
- **Expected Result:** All 12 tests pass, including count population, cache invalidation, rollback suppression, and the new `replaceTripTempId` count normalization test.

### 4.2 Step 2: TripCardSimple Presentational Test Suite
```bash
./scripts/run-jest-container.sh components/__tests__/TripCardSimplePresentational.test.tsx
```
- **Expected Result:** All 9 tests pass, confirming badge pluralization (0 Wineries, 1 Winery, 2 Wineries), syncing indicator, and interactive callbacks.

### 4.3 Step 3: Selector Hygiene Test Suite
```bash
./scripts/run-jest-container.sh components/__tests__/selectorHygiene.test.tsx
```
- **Expected Result:** All tests pass, including the new `TripCardSimple` selector hygiene tests confirming zero re-renders on unrelated store mutations.

### 4.4 Step 4: Combined Suite Run
```bash
./scripts/run-jest-container.sh lib/stores/slices/__tests__/tripMutationHelpers.test.ts components/__tests__/TripCardSimplePresentational.test.tsx components/__tests__/selectorHygiene.test.tsx
```
- **Expected Result:** 100% pass across all 3 test suites with zero failures.

---

## 5. Scaffolding Audit

1. **Verify No Temporary Artifacts:**
   - Audit git status to ensure no temporary test files, exploration scripts, or orphaned mock files were introduced.
2. **Type Checking:**
   - Confirm TypeScript passes without errors.

---

## 6. Execution Gate & User Modal Confirmation

In accordance with `AGENTS.md` Section 2 and `conductor_antigravity.md`:
- Static inspection is complete.
- The implementation plan is written to `conductor/tracks/initial-trip-creation-wineries_20261002/phase-6-task-3-plan.md`.
- **HALT:** Prompt user via native modal (`ask_question`) for affirmative approval before applying any file modifications.
