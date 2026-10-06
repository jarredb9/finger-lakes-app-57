# Implementation Plan: Phase 6 Task 2 - Implement Store Count Population, Offline Suppression & Badge Pluralization (Green Phase)

**Track:** `initial-trip-creation-wineries_20261002` (Issue [#57](https://github.com/jarredb9/finger-lakes-app-57/issues/57))  
**Phase:** 6 (Store Invariants, Background Invalidation & Badge Pluralization (`tripMutationHelpers`, `TripCardSimplePresentational`))  
**Task:** 2 (Implement Store Count Population, Offline Suppression & Badge Pluralization (Green Phase))  
**Specification Reference:** [spec.md](./spec.md) (Section 3.7, Section 3.8, Section 6)  
**Track Plan Reference:** [plan.md](./plan.md) (Phase 6, Task 2)  

---

## 1. Objective & Seam-Bounded Architecture

### 1.1 Objective
Implement the production code modifications and dedicated unit test coverage for Phase 6 Task 2 to turn the failing unit tests from Task 1 green and resolve presentation badge pluralization:
1. **Optimistic Store Invariant:** In `createTripHelper` (`lib/stores/slices/tripMutationHelpers.ts`), set `wineries_count: validWineries.length` on `tempTrip`.
2. **Synced Store Invariant:** In `createTripHelper`, ensure `syncedTrip` populates `wineries_count: (createdTrip?.wineries_count ?? createdTrip?.wineries?.length ?? validWineries.length)`.
3. **Background Cache Invalidation:** In `createTripHelper`, fire non-blocking background re-fetches (`fetchUpcomingTrips()`, `fetchTripsForDate(validTripDate)`, `fetchTrips(1, 'upcoming', true)`) with caught error logging.
4. **Offline Queue Suppression & Immediate Rollback:** In `createTripHelper`'s error handler, inspect `(error as { preventOfflineEnqueue?: boolean })?.preventOfflineEnqueue`. If true, bypass `handleSyncError`, immediately purge `tempId` from `trips`, `upcomingTrips`, and `tripsForDate`, and rethrow.
5. **Presentation Badge Pluralization:** In `components/TripCardSimplePresentational.tsx`, pluralize the winery badge correctly as `{count} {count === 1 ? 'Winery' : 'Wineries'}` where `count = trip.wineries_count ?? trip.wineries?.length ?? 0`.
6. **Component Unit Test Coverage:** Create `components/__tests__/TripCardSimplePresentational.test.tsx` to verify badge pluralization (0 Wineries, 1 Winery, 2 Wineries, fallback array length), syncing indicators, and interactive callbacks.

---

### 1.2 Architectural Context & Seam Boundaries

#### 1. Invariant 1: Store Optimistic & Synced `wineries_count` Population
- **Location:** `lib/stores/slices/tripMutationHelpers.ts`
- **Defect:** `tempTrip` currently omits `wineries_count`. When `createTripHelper` creates an optimistic trip, `useTripStore` stores `wineries_count: undefined`. Similarly, when `TripService.createTrip` resolves without an explicit count property, spreading `...createdTrip` leaves `wineries_count: undefined`.
- **Fix:** Explicitly set `wineries_count: validWineries.length` on `tempTrip`. On `syncedTrip`, set `wineries_count: createdTrip.wineries_count ?? createdTrip.wineries?.length ?? validWineries.length`.

#### 2. Invariant 2: Non-Blocking Background Cache Invalidation
- **Location:** `lib/stores/slices/tripMutationHelpers.ts`
- **Defect:** After remote creation succeeds, store collections are updated only via local state mapping. Dependent views (planner date views, upcoming trips, paginated views) remain stale until explicit refetch.
- **Fix:** Dispatch a non-blocking `void Promise.all([...]).catch(...)` after state reconciliation:
  ```typescript
  void Promise.all([
    get().fetchUpcomingTrips(),
    get().fetchTripsForDate(validTripDate),
    get().fetchTrips(1, 'upcoming', true)
  ]).catch(err => {
    console.error("Failed to refresh background cache after trip creation:", err);
  });
  ```

#### 3. Invariant 3: Offline Queue Suppression (`preventOfflineEnqueue`)
- **Location:** `lib/stores/slices/tripMutationHelpers.ts`
- **Defect:** In Phase 4, `TripService.createTrip` was updated to delete the partially created remote trip when chained stops (stops 2+) fail, tag the error with `preventOfflineEnqueue = true`, and rethrow. In `createTripHelper`, any error currently flows directly into `handleSyncError`. If treated as network/offline, it enqueues the mutation into IndexedDB `syncStore`. Upon reconnect, `syncService` replays the trip, creating duplicate or orphaned records.
- **Fix:** Check `(error as { preventOfflineEnqueue?: boolean })?.preventOfflineEnqueue`. If truthy, log the rollback, purge `tempId` from `tripsForDate`, `upcomingTrips`, and `trips`, and immediately rethrow without calling `handleSyncError`.

#### 4. Presentation Badge Pluralization
- **Location:** `components/TripCardSimplePresentational.tsx`
- **Defect:** Line 164 hardcodes `{trip.wineries_count ?? trip.wineries?.length ?? 0} Wineries`. For single-stop trips, this renders "1 Wineries", violating grammar and inconsistent with `TripCardPresentational.tsx`.
- **Fix:** Compute `const count = trip.wineries_count ?? trip.wineries?.length ?? 0;` and render `{count} {count === 1 ? 'Winery' : 'Wineries'}`.

---

## 2. Invariants & Guardrails

1. **Backwards Compatibility & Null Safety:**
   - Fallback chain for count must evaluate `trip.wineries_count ?? trip.wineries?.length ?? 0` to safeguard against undefined arrays or null count fields.
2. **Non-Blocking Resilience:**
   - Background re-fetch failures must never reject or abort `createTripHelper`. They must be caught and logged via `console.error`.
3. **Strict Offline Suppression:**
   - When `preventOfflineEnqueue: true`, `handleSyncError` must NOT be invoked, and negative IDs must be completely purged from `trips`, `upcomingTrips`, and `tripsForDate`.
4. **Zustand Store Normalization:**
   - Trip IDs must remain properly normalized when reconciling temporary IDs.
5. **Containerized Test Verification:**
   - All tests must execute and pass via `./scripts/run-jest-container.sh` with `BypassSandbox: true`.

---

## 3. Target Files & Exact Drop-in Specifications

### 3.1 Target File: `lib/stores/slices/tripMutationHelpers.ts`
- **Path:** `lib/stores/slices/tripMutationHelpers.ts`

#### Chunk 1: Populate `wineries_count` on `tempTrip`
- **StartLine:** 85
- **EndLine:** 93
- **TargetContent:**
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
- **ReplacementContent:**
```typescript
  const tempTrip: Trip = {
    id: tempId,
    user_id: user?.id || '',
    trip_date: validTripDate,
    name: validName,
    wineries: validWineries,
    wineries_count: validWineries.length,
    members: [],
    syncStatus: 'pending',
  };
```

---

#### Chunk 2: Synced Count Population, Background Invalidation & Offline Enqueue Suppression
- **StartLine:** 124
- **EndLine:** 148
- **TargetContent:**
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

    return createdTrip;
  } catch (error) {
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
```
- **ReplacementContent:**
```typescript
    set(state => {
      const syncedTrip = createdTrip ? {
        ...createdTrip,
        wineries_count: createdTrip.wineries_count ?? createdTrip.wineries?.length ?? validWineries.length,
        syncStatus: 'synced' as const
      } : null;
      return {
        tripsForDate: state.tripsForDate.map(t => Number(t.id) === tempId ? syncedTrip! : t),
        upcomingTrips: state.upcomingTrips.map(t => Number(t.id) === tempId ? syncedTrip! : t),
        trips: state.trips.map(t => Number(t.id) === tempId ? syncedTrip! : t),
        lastActionTimestamp: finishedNow
      };
    });

    void Promise.all([
      get().fetchUpcomingTrips(),
      get().fetchTripsForDate(validTripDate),
      get().fetchTrips(1, 'upcoming', true)
    ]).catch(err => {
      console.error("Failed to refresh background cache after trip creation:", err);
    });

    return createdTrip;
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
```

---

### 3.2 Target File: `components/TripCardSimplePresentational.tsx`
- **Path:** `components/TripCardSimplePresentational.tsx`

#### Chunk 1: Count Calculation Anchor
- **StartLine:** 30
- **EndLine:** 33
- **TargetContent:**
```typescript
    const router = useRouter();
    const isPending = trip.syncStatus === 'pending';

    const handleViewTrip = (tripId: number) => {
```
- **ReplacementContent:**
```typescript
    const router = useRouter();
    const isPending = trip.syncStatus === 'pending';
    const count = trip.wineries_count ?? trip.wineries?.length ?? 0;

    const handleViewTrip = (tripId: number) => {
```

---

#### Chunk 2: Badge Pluralization Drop-In
- **StartLine:** 164
- **EndLine:** 166
- **TargetContent:**
```typescript
                    <Badge variant="secondary"><Wine className="w-3 h-3 mr-1" /> {trip.wineries_count ?? trip.wineries?.length ?? 0} Wineries</Badge>
```
- **ReplacementContent:**
```typescript
                    <Badge variant="secondary"><Wine className="w-3 h-3 mr-1" /> {count} {count === 1 ? 'Winery' : 'Wineries'}</Badge>
```

---

### 3.3 Target File: `components/__tests__/TripCardSimplePresentational.test.tsx` (New Test File)
- **Path:** `components/__tests__/TripCardSimplePresentational.test.tsx`
- **Full File Content Drop-in:**

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import TripCardSimple from '../TripCardSimplePresentational';
import { createMockTrip, createMockWinery } from '@/lib/test-utils/fixtures';
import { Trip, TripMember, GooglePlaceId, WineryDbId } from '@/lib/types';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AvatarImage: ({ src, alt }: { src?: string; alt?: string }) => <img src={src} alt={alt} />,
  AvatarFallback: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('TripCardSimplePresentational', () => {
  const mockOnDelete = jest.fn();
  const mockOnShare = jest.fn();
  const mockOnExportToMaps = jest.fn();

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

  const defaultProps = {
    isOwner: true,
    currentMembers: [] as TripMember[],
    onDelete: mockOnDelete,
    onShare: mockOnShare,
    onExportToMaps: mockOnExportToMaps,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Badge Pluralization', () => {
    it('renders "1 Winery" when wineries_count is 1', () => {
      const trip: Trip = createMockTrip({
        name: 'Single Stop Trip',
        wineries_count: 1,
        wineries: [mockWinery1],
      });

      render(<TripCardSimple {...defaultProps} trip={trip} />);
      expect(screen.getByText(/1 Winery$/i)).toBeInTheDocument();
      expect(screen.queryByText(/1 Wineries/i)).not.toBeInTheDocument();
    });

    it('renders "0 Wineries" when wineries_count is 0', () => {
      const trip: Trip = createMockTrip({
        name: 'Empty Trip',
        wineries_count: 0,
        wineries: [],
      });

      render(<TripCardSimple {...defaultProps} trip={trip} />);
      expect(screen.getByText(/0 Wineries/i)).toBeInTheDocument();
    });

    it('renders "2 Wineries" when wineries_count is 2', () => {
      const trip: Trip = createMockTrip({
        name: 'Two Winery Tour',
        wineries_count: 2,
        wineries: [mockWinery1, mockWinery2],
      });

      render(<TripCardSimple {...defaultProps} trip={trip} />);
      expect(screen.getByText(/2 Wineries/i)).toBeInTheDocument();
    });

    it('falls back to wineries array length when wineries_count is undefined', () => {
      const singleWineryTrip: Trip = createMockTrip({
        name: 'Fallback Single Trip',
        wineries_count: undefined,
        wineries: [mockWinery1],
      });

      const { rerender } = render(<TripCardSimple {...defaultProps} trip={singleWineryTrip} />);
      expect(screen.getByText(/1 Winery$/i)).toBeInTheDocument();

      const multiWineryTrip: Trip = createMockTrip({
        name: 'Fallback Multi Trip',
        wineries_count: undefined,
        wineries: [mockWinery1, mockWinery2],
      });

      rerender(<TripCardSimple {...defaultProps} trip={multiWineryTrip} />);
      expect(screen.getByText(/2 Wineries/i)).toBeInTheDocument();

      const emptyWineryTrip: Trip = createMockTrip({
        name: 'Fallback Empty Trip',
        wineries_count: undefined,
        wineries: [],
      });

      rerender(<TripCardSimple {...defaultProps} trip={emptyWineryTrip} />);
      expect(screen.getByText(/0 Wineries/i)).toBeInTheDocument();
    });
  });

  describe('Interactions & Sync State', () => {
    it('navigates to trip details when "View Details" is clicked', () => {
      const trip: Trip = createMockTrip({ id: 42, name: 'Keuka Tour' });
      render(<TripCardSimple {...defaultProps} trip={trip} />);

      const viewDetailsBtn = screen.getByTestId('view-trip-details-btn');
      fireEvent.click(viewDetailsBtn);

      expect(mockPush).toHaveBeenCalledWith('/trips/42');
    });

    it('renders syncing indicator and disables interactive buttons when syncStatus is pending', () => {
      const trip: Trip = createMockTrip({
        id: -12345,
        name: 'Optimistic Pending Trip',
        syncStatus: 'pending',
      });

      render(<TripCardSimple {...defaultProps} trip={trip} />);

      expect(screen.getByText(/Syncing/i)).toBeInTheDocument();
      expect(screen.getByTestId('view-trip-details-btn')).toBeDisabled();
      expect(screen.getByTestId('share-trip-btn')).toBeDisabled();
      expect(screen.getByTestId('delete-trip-btn')).toBeDisabled();
    });

    it('invokes onShare when share button is clicked by owner', () => {
      const trip: Trip = createMockTrip({ id: 50, name: 'Shared Trip' });
      render(<TripCardSimple {...defaultProps} trip={trip} />);

      const shareBtn = screen.getByTestId('share-trip-btn');
      fireEvent.click(shareBtn);

      expect(mockOnShare).toHaveBeenCalledWith('50', 'Shared Trip');
    });

    it('invokes onDelete when delete button is clicked by owner', () => {
      const trip: Trip = createMockTrip({ id: 50, name: 'Trip To Delete' });
      render(<TripCardSimple {...defaultProps} trip={trip} />);

      const deleteBtn = screen.getByTestId('delete-trip-btn');
      fireEvent.click(deleteBtn);

      expect(mockDeleteTripAlert).not.toBeDefined?.();
      expect(mockOnDelete).toHaveBeenCalledWith(50);
    });

    it('invokes onExportToMaps when export button is clicked on trip with wineries', () => {
      const trip: Trip = createMockTrip({
        id: 50,
        wineries: [mockWinery1],
      });
      render(<TripCardSimple {...defaultProps} trip={trip} />);

      const exportBtn = screen.getByRole('button', { name: /Export to Google Maps/i });
      fireEvent.click(exportBtn);

      expect(mockOnExportToMaps).toHaveBeenCalledTimes(1);
    });
  });
});
```

---

## 4. Execution Verification Protocol

### 4.1 Verification Commands
The executor MUST execute the containerized Jest test suites using `BypassSandbox: true` (mandated by RHEL 8 glibc compatibility requirements):

```bash
# 1. Run the tripMutationHelpers store invariants test suite (Task 1 tests turned green)
./scripts/run-jest-container.sh lib/stores/slices/__tests__/tripMutationHelpers.test.ts

# 2. Run the TripCardSimplePresentational unit test suite (New tests verifying pluralization)
./scripts/run-jest-container.sh components/__tests__/TripCardSimplePresentational.test.tsx

# 3. Run both suites together to verify complete Phase 6 Green state
./scripts/run-jest-container.sh lib/stores/slices/__tests__/tripMutationHelpers.test.ts components/__tests__/TripCardSimplePresentational.test.tsx
```

### 4.2 Expected Verification Results
1. `lib/stores/slices/__tests__/tripMutationHelpers.test.ts`:
   - All tests pass (including 6 newly added tests from Task 1 that were previously failing):
     - `populates wineries_count on optimistic temporary trip during creation` -> PASS
     - `populates wineries_count on returned tempTrip when offline enqueuing succeeds` -> PASS
     - `populates wineries_count on synced trip in store after successful creation, falling back to wineries length` -> PASS
     - `preserves server wineries_count on synced trip if returned by TripService.createTrip` -> PASS
     - `dispatches background cache re-fetches for upcomingTrips, tripsForDate, and trips after creation` -> PASS
     - `does not throw or fail trip creation if background cache re-fetches reject` -> PASS
     - `bypasses handleSyncError and performs immediate optimistic rollback when error has preventOfflineEnqueue: true` -> PASS
     - `delegates to handleSyncError when error does NOT have preventOfflineEnqueue` -> PASS
     - Existing tests (permanent 400 rollback, `replaceTripTempId` reconciliation) -> PASS
2. `components/__tests__/TripCardSimplePresentational.test.tsx`:
   - All badge pluralization test cases pass ("1 Winery", "0 Wineries", "2 Wineries", fallback array lengths).
   - Syncing state and button callbacks pass.

---

## 5. Execution Steps Sequence

1. **Step 1:** Apply drop-in modifications to `lib/stores/slices/tripMutationHelpers.ts` (Chunk 1 and Chunk 2).
2. **Step 2:** Apply drop-in modifications to `components/TripCardSimplePresentational.tsx` (Chunk 1 and Chunk 2).
3. **Step 3:** Create `components/__tests__/TripCardSimplePresentational.test.tsx` with full unit test coverage.
4. **Step 4:** Execute the verification protocol via `./scripts/run-jest-container.sh` to confirm 100% green test status across both suites.
5. **Step 5:** Stage modified and created files, commit with message `feat(store,ui): Implement store count population, offline suppression and badge pluralization`, and update `plan.md` checkbox.
