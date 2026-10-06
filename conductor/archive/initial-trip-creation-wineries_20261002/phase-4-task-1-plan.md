# Implementation Plan: Phase 4 Task 1 - Write Failing Tests for Dual-Key Coordinates, Polymorphic Chaining, and Strict Rollback (Red Phase)

**Track:** `initial-trip-creation-wineries_20261002` (Issue [#57](https://github.com/jarredb9/finger-lakes-app-57/issues/57))  
**Phase:** 4 (Dual-Key Coordinates, Polymorphic Chaining & Strict Rollback)  
**Task:** 1 (Write Failing Tests for Dual-Key Coordinates, Polymorphic Chaining, and Strict Rollback)  
**Specification Reference:** [spec.md](./spec.md)  
**Track Plan Reference:** [plan.md](./plan.md)  

---

## 1. Objective & Seam-Bounded Architecture

### 1.1 Objective
Establish failing unit tests (TDD Red Phase) in `lib/services/__tests__/tripService.mutations.test.ts` that assert:
1. `WineryService.getRpcData` serializes dual-key coordinates (`latitude`, `longitude`, `lat`, and `lng`) for 100% backward compatibility across PostgreSQL RPCs.
2. `TripService.addWineryToExistingTrip` polymorphically accepts a full `Winery` object (without prior database ID) and passes standardized RPC data directly to `add_winery_to_trip`.
3. `TripService.addWineryToExistingTrip` validates numeric winery IDs, strictly rejecting non-positive values (`<= 0` or `NaN`) before issuing database RPCs.
4. `TripService.createTrip` successfully chains stops 2+ for newly selected Google Places wineries lacking prior database IDs (`dbId === undefined`) by passing full `Winery` objects.
5. `TripService.createTrip` enforces strict atomic rollback when any chained winery addition fails: it executes `deleteTrip` on the newly created partial trip, tags the caught error with `preventOfflineEnqueue = true`, and rethrows.

### 1.2 Architectural Context & Seam Boundaries
1. **The Dual-Key Serialization Requirement (`WineryService.getRpcData`):**
   - In `lib/services/wineryService.ts`, `getRpcData` currently only maps `latitude: winery.latitude || 0` and `longitude: winery.longitude || 0`.
   - RPCs in legacy or edge scenarios historically accessed `(p_winery_data->>'lat')::numeric` and `(p_winery_data->>'lng')::numeric`.
   - Emitting all 4 keys (`latitude`, `longitude`, `lat`, `lng`) in `getRpcData` provides defense-in-depth across all write RPCs (`create_trip_with_winery`, `add_winery_to_trip`, `log_visit`).
2. **The Polymorphic Chaining Bug (`TripService.createTrip` & `addWineryToExistingTrip`):**
   - In current `TripService.createTrip` (`lib/services/tripService.ts`), chained addition iterates through `extraWineries` and calls:
     ```typescript
     await this.addWineryToExistingTrip(data.trip_id, extra.dbId || 0, null);
     ```
   - For newly selected wineries from Google Places autocomplete, `extra.dbId` is `undefined`, so `extra.dbId || 0` passes `0` as the winery ID!
   - In current `TripService.addWineryToExistingTrip`, the signature only accepts `wineryId: number`. When passed `0`, `findWineryByDbId(0)` returns `undefined`, and it calls `add_winery_to_trip` with `p_winery_id: 0`, failing database foreign key constraints.
   - **Target Architecture (Phase 4 Task 2):**
     - Update `addWineryToExistingTrip` signature to `(tripId: number, wineryOrId: number | Winery, notes: string | null)`.
     - When `wineryOrId` is an object: invoke `add_winery_to_trip` with `p_winery_data: WineryService.getRpcData(wineryOrId)`.
     - When `wineryOrId` is a number: validate `wineryOrId > 0`. If `<= 0` or `NaN`, throw an `Error("Invalid winery ID")` immediately without issuing an RPC.
     - In `createTrip`: pass `extra` directly as a `Winery` object (`this.addWineryToExistingTrip(data.trip_id, extra, null)`).
3. **Strict Rollback & Offline Queue Suppression Contract:**
   - In current `createTrip`, when chained addition fails, it catches the error and executes `this.deleteTrip(data.trip_id.toString())`.
   - However, it rethrows the error without tagging `preventOfflineEnqueue = true`.
   - Without this tag, downstream store helpers (Phase 6) route the failure through `handleSyncError`, enqueueing a broken trip mutation into IndexedDB offline storage for perpetual retry.
   - **Target Architecture (Phase 4 Task 2):**
     ```typescript
     } catch (chainedError: any) {
         try {
             await this.deleteTrip(data.trip_id.toString());
         } catch (rollbackError) {
             console.error("Failed to rollback trip creation after chaining error:", rollbackError);
         }
         if (chainedError && typeof chainedError === 'object') {
             chainedError.preventOfflineEnqueue = true;
         }
         throw chainedError;
     }
     ```
4. **The Red-Phase Strategy:**
   - Add unit tests in `lib/services/__tests__/tripService.mutations.test.ts` asserting each of these behaviors.
   - Run the containerized Jest test suite (`./scripts/run-jest-container.sh lib/services/__tests__/tripService.mutations.test.ts`).
   - Confirm deterministic failures on the 6 newly added tests while verifying that all 26 existing tests continue to pass.

---

## 2. Invariants & Guardrails

1. **Existing Test Preservation Invariant:**
   - All 26 existing tests across `createTrip`, `deleteTrip`, `updateTrip`, `addMemberByEmail`, `removeMember`, `addWineryToNewTrip`, `addWineryToExistingTrip`, and `addWineryToTripByApi` must continue to pass without regression.
2. **Dual-Key Serialization Invariant:**
   - `WineryService.getRpcData` must emit both short (`lat`, `lng`) and long (`latitude`, `longitude`) coordinate keys.
   - If coordinates are undefined or zero, all four keys must evaluate to `0`.
3. **Polymorphic Input Invariant:**
   - `addWineryToExistingTrip` must accept either a numeric database ID or a full `Winery` object.
   - When given a `Winery` object, it must pass `p_winery_data` directly and never call `findWineryByDbId`.
4. **Non-Positive Rejection Invariant:**
   - `addWineryToExistingTrip` must reject non-positive numeric IDs (`<= 0` or `NaN`) by throwing immediately before issuing any network or database RPC.
5. **Atomic Rollback & Offline Suppression Invariant:**
   - When chained addition fails in `createTrip`, `delete_trip` RPC must be called with the generated trip ID, and the caught error must have `preventOfflineEnqueue === true`.
6. **No Production Code Changes Invariant:**
   - In Task 1 (Red Phase), strictly NO changes may be made to `lib/services/wineryService.ts` or `lib/services/tripService.ts`. Only the test file `lib/services/__tests__/tripService.mutations.test.ts` is modified.

---

## 3. Target Files & Exact Drop-in Specifications

### 3.1 Target File: `lib/services/__tests__/tripService.mutations.test.ts`
- **Path:** `lib/services/__tests__/tripService.mutations.test.ts`
- **Modifications:**
  - **Chunk 1:** Import `WineryService` from `../wineryService`.
  - **Chunk 2:** Add `mockWineryNoDb` fixture in `describe('createTrip', ...)`.
  - **Chunk 3:** Add test for chaining unpersisted Google Places wineries (`mockWineryNoDb`) in `describe('createTrip', ...)`.
  - **Chunk 4:** Add test for chained addition failure with `preventOfflineEnqueue = true` in `describe('createTrip', ...)`.
  - **Chunk 5:** Add polymorphic `Winery` object test and non-positive ID validation tests in `describe('addWineryToExistingTrip', ...)`.
  - **Chunk 6:** Add dedicated test suite `describe('WineryService.getRpcData Dual-Key Coordinates', ...)` at the bottom of the file.

---

#### Chunk 1: Import `WineryService`
**StartLine:** 1  
**EndLine:** 4  
**TargetContent:**
```typescript
import { TripService } from '../tripService';
import { Trip, Winery, GooglePlaceId, WineryDbId } from '@/lib/types';
import { createMockWinery } from '@/lib/test-utils/fixtures';
```
**ReplacementContent:**
```typescript
import { TripService } from '../tripService';
import { WineryService } from '../wineryService';
import { Trip, Winery, GooglePlaceId, WineryDbId } from '@/lib/types';
import { createMockWinery } from '@/lib/test-utils/fixtures';
```

---

#### Chunk 2: Add `mockWineryNoDb` Fixture
**StartLine:** 54  
**EndLine:** 63  
**TargetContent:**
```typescript
    const mockWinery2: Winery = createMockWinery({
      id: 'place_2' as GooglePlaceId,
      dbId: 102 as WineryDbId,
      name: 'Ravines Wine Cellars',
      address: '4000 State Route 14, Geneva, NY',
      latitude: 42.793,
      longitude: -76.963,
    });
```
**ReplacementContent:**
```typescript
    const mockWinery2: Winery = createMockWinery({
      id: 'place_2' as GooglePlaceId,
      dbId: 102 as WineryDbId,
      name: 'Ravines Wine Cellars',
      address: '4000 State Route 14, Geneva, NY',
      latitude: 42.793,
      longitude: -76.963,
    });

    const mockWineryNoDb: Winery = createMockWinery({
      id: 'place_nodb' as GooglePlaceId,
      dbId: undefined,
      name: 'Lamoreaux Landing Wine Cellars',
      address: '9224 NY-414, Lodi, NY',
      latitude: 42.502,
      longitude: -76.873,
    });
```

---

#### Chunk 3: Add Chained Unpersisted Wineries Test in `createTrip`
**StartLine:** 110  
**EndLine:** 113  
**TargetContent:**
```typescript
      expect(result.id).toBe(502);
    });

    it('creates an empty trip without wineries when no wineries are provided', async () => {
```
**ReplacementContent:**
```typescript
      expect(result.id).toBe(502);
    });

    it('chains wineries without database IDs (Google Places results) by passing full Winery objects', async () => {
      mockFindWineryByDbId.mockReturnValue(undefined);

      mockRpc
        .mockResolvedValueOnce({ data: { trip_id: 506 }, error: null }) // create_trip_with_winery for mockWinery1
        .mockResolvedValueOnce({ data: { success: true }, error: null }) // add_winery_to_trip for mockWineryNoDb
        .mockResolvedValueOnce({ data: { id: 506, name: 'Chained Unpersisted Tour', wineries: [mockWinery1, mockWineryNoDb] }, error: null }); // get_trip_details

      const tripInput: Partial<Trip> = {
        name: 'Chained Unpersisted Tour',
        trip_date: '2026-10-19',
        wineries: [mockWinery1, mockWineryNoDb],
      };

      const result = await TripService.createTrip(tripInput);

      expect(mockRpc).toHaveBeenCalledWith('create_trip_with_winery', expect.any(Object));
      expect(mockRpc).toHaveBeenCalledWith('add_winery_to_trip', {
        p_trip_id: 506,
        p_winery_data: expect.objectContaining({
          id: 'place_nodb',
          name: 'Lamoreaux Landing Wine Cellars',
          latitude: 42.502,
          longitude: -76.873,
          lat: 42.502,
          lng: -76.873,
        }),
        p_notes: null,
      });
      expect(result.id).toBe(506);
    });

    it('creates an empty trip without wineries when no wineries are provided', async () => {
```

---

#### Chunk 4: Add Strict Rollback with `preventOfflineEnqueue` Test in `createTrip`
**StartLine:** 156  
**EndLine:** 159  
**TargetContent:**
```typescript
      expect(mockRpc).toHaveBeenCalledWith('delete_trip', { p_trip_id: 505 });
    });
  });

  describe('deleteTrip', () => {
```
**ReplacementContent:**
```typescript
      expect(mockRpc).toHaveBeenCalledWith('delete_trip', { p_trip_id: 505 });
    });

    it('tags error with preventOfflineEnqueue = true and rolls back partial trip when secondary chained winery addition fails', async () => {
      mockFindWineryByDbId.mockReturnValue(null);

      mockRpc
        .mockResolvedValueOnce({ data: { trip_id: 505 }, error: null }) // create_trip_with_winery succeeds
        .mockResolvedValueOnce({ data: null, error: new Error('Secondary winery RPC failure') }) // add_winery_to_trip fails
        .mockResolvedValueOnce({ data: null, error: null }); // delete_trip (rollback)

      const tripInput: Partial<Trip> = {
        name: 'Rollback Tour',
        trip_date: '2026-10-18',
        wineries: [mockWinery1, mockWinery2],
      };

      let thrownError: any;
      try {
        await TripService.createTrip(tripInput);
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).toBeDefined();
      expect(thrownError.message).toBe('Secondary winery RPC failure');
      expect(thrownError.preventOfflineEnqueue).toBe(true);
      expect(mockRpc).toHaveBeenCalledWith('delete_trip', { p_trip_id: 505 });
    });
  });

  describe('deleteTrip', () => {
```

---

#### Chunk 5: Add Polymorphic `Winery` Object and Non-Positive ID Rejection in `addWineryToExistingTrip`
**StartLine:** 387  
**EndLine:** 390  
**TargetContent:**
```typescript
      await expect(TripService.addWineryToExistingTrip(300, 999, null)).rejects.toThrow('Trip not editable');
    });
  });

  describe('addWineryToTripByApi', () => {
```
**ReplacementContent:**
```typescript
      await expect(TripService.addWineryToExistingTrip(300, 999, null)).rejects.toThrow('Trip not editable');
    });

    it('accepts a full Winery object (without DB ID) and passes standardized RPC data directly', async () => {
      const mockWineryNoDb: Winery = createMockWinery({
        id: 'place_direct_obj' as GooglePlaceId,
        dbId: undefined,
        name: 'Boundary Breaks Vineyard',
        address: '1568 Porter Covert Rd, Lodi, NY',
        latitude: 42.605,
        longitude: -76.877,
      });

      mockRpc.mockResolvedValueOnce({ data: { success: true }, error: null });

      const result = await TripService.addWineryToExistingTrip(300, mockWineryNoDb as any, 'Lovely Riesling');

      expect(mockFindWineryByDbId).not.toHaveBeenCalled();
      expect(mockRpc).toHaveBeenCalledWith('add_winery_to_trip', {
        p_trip_id: 300,
        p_winery_data: expect.objectContaining({
          id: 'place_direct_obj',
          name: 'Boundary Breaks Vineyard',
          latitude: 42.605,
          longitude: -76.877,
          lat: 42.605,
          lng: -76.877,
        }),
        p_notes: 'Lovely Riesling',
      });
      expect(result).toEqual({ success: true });
    });

    it('rejects non-positive winery IDs (<= 0 or NaN) before issuing DB RPC', async () => {
      await expect(TripService.addWineryToExistingTrip(300, 0, null)).rejects.toThrow(/invalid winery id/i);
      await expect(TripService.addWineryToExistingTrip(300, -5, null)).rejects.toThrow(/invalid winery id/i);
      await expect(TripService.addWineryToExistingTrip(300, NaN, null)).rejects.toThrow(/invalid winery id/i);
      expect(mockRpc).not.toHaveBeenCalled();
    });
  });

  describe('addWineryToTripByApi', () => {
```

---

#### Chunk 6: Add Dedicated `WineryService.getRpcData Dual-Key Coordinates` Suite
**StartLine:** 408  
**EndLine:** 411  
**TargetContent:**
```typescript
      await expect(TripService.addWineryToTripByApi(55, [101])).rejects.toThrow('RPC batch error');
    });
  });
});
```
**ReplacementContent:**
```typescript
      await expect(TripService.addWineryToTripByApi(55, [101])).rejects.toThrow('RPC batch error');
    });
  });

  describe('WineryService.getRpcData Dual-Key Coordinates', () => {
    it('emits dual-key coordinates (latitude, longitude, lat, lng) for backward compatibility', () => {
      const winery = createMockWinery({
        id: 'place_dual_test' as GooglePlaceId,
        latitude: 42.474,
        longitude: -77.172,
      });

      const rpcData = WineryService.getRpcData(winery);

      expect(rpcData.latitude).toBe(42.474);
      expect(rpcData.longitude).toBe(-77.172);
      expect((rpcData as any).lat).toBe(42.474);
      expect((rpcData as any).lng).toBe(-77.172);
    });

    it('defaults lat and lng to 0 when coordinates are omitted or undefined', () => {
      const winery: Partial<Winery> = {
        id: 'place_missing_coords' as GooglePlaceId,
        name: 'Coords Test Winery',
      };

      const rpcData = WineryService.getRpcData(winery);

      expect(rpcData.latitude).toBe(0);
      expect(rpcData.longitude).toBe(0);
      expect((rpcData as any).lat).toBe(0);
      expect((rpcData as any).lng).toBe(0);
    });
  });
});
```

---

## 4. Red-Phase Failure Verification Rationale

When executed against the current un-refactored codebase (`lib/services/wineryService.ts` and `lib/services/tripService.ts`):

1. **`createTrip` - Failing Test 1 (`chains wineries without database IDs (Google Places results) by passing full Winery objects`):**
   - **Failure Point:** `expect(mockRpc).toHaveBeenCalledWith('add_winery_to_trip', expect.objectContaining({ p_winery_data: ... }))`.
   - **Root Cause:** Current `createTrip` lines 138-140 passes `extra.dbId || 0` to `addWineryToExistingTrip`. Because `mockWineryNoDb.dbId` is `undefined`, it evaluates to `0`. `addWineryToExistingTrip` finds no winery in store for ID `0` and invokes `add_winery_to_trip` with `p_winery_id: 0` instead of `p_winery_data`.
   - **Expected Failure:** Jest reports mock function mismatch: received `{ p_trip_id: 506, p_winery_id: 0, p_notes: null }`, expected `p_winery_data: ObjectContaining ...`.

2. **`createTrip` - Failing Test 2 (`tags error with preventOfflineEnqueue = true and rolls back partial trip when secondary chained winery addition fails`):**
   - **Failure Point:** `expect(thrownError.preventOfflineEnqueue).toBe(true)`.
   - **Root Cause:** Current `createTrip` lines 141-148 catches `chainedError` and executes `deleteTrip`, but rethrows `chainedError` directly without setting `chainedError.preventOfflineEnqueue = true`.
   - **Expected Failure:** `Expected: true, Received: undefined`.

3. **`addWineryToExistingTrip` - Failing Test 3 (`accepts a full Winery object (without DB ID) and passes standardized RPC data directly`):**
   - **Failure Point:** `expect(mockFindWineryByDbId).not.toHaveBeenCalled()` and `expect(mockRpc).toHaveBeenCalledWith('add_winery_to_trip', expect.objectContaining({ p_winery_data: ... }))`.
   - **Root Cause:** Current `addWineryToExistingTrip` lines 309-325 assumes `wineryId` is a number and passes `wineryOrId` to `findWineryByDbId(mockWineryNoDb)`. When that returns `undefined`, it falls back to calling `mockRpc('add_winery_to_trip', { p_winery_id: mockWineryNoDb })`.
   - **Expected Failure:** `mockFindWineryByDbId` is called 1 time (expected 0) and `mockRpc` receives `p_winery_id` instead of `p_winery_data`.

4. **`addWineryToExistingTrip` - Failing Test 4 (`rejects non-positive winery IDs (<= 0 or NaN) before issuing DB RPC`):**
   - **Failure Point:** `expect(TripService.addWineryToExistingTrip(300, 0, null)).rejects.toThrow(/invalid winery id/i)`.
   - **Root Cause:** Current `addWineryToExistingTrip` has no input validation on `wineryId`. Passing `0` or negative values attempts a database RPC call instead of rejecting immediately.
   - **Expected Failure:** Received Promise resolved successfully (or rejected with different DB error), expected Promise to reject with `/invalid winery id/i`.

5. **`WineryService.getRpcData` - Failing Test 5 (`emits dual-key coordinates (latitude, longitude, lat, lng) for backward compatibility`):**
   - **Failure Point:** `expect((rpcData as any).lat).toBe(42.474)`.
   - **Root Cause:** Current `WineryService.getRpcData` only returns `latitude` and `longitude`; `lat` and `lng` properties do not exist on the returned object.
   - **Expected Failure:** `Expected: 42.474, Received: undefined`.

6. **`WineryService.getRpcData` - Failing Test 6 (`defaults lat and lng to 0 when coordinates are omitted or undefined`):**
   - **Failure Point:** `expect((rpcData as any).lat).toBe(0)`.
   - **Root Cause:** In current `WineryService.getRpcData`, `lat` and `lng` keys are omitted entirely.
   - **Expected Failure:** `Expected: 0, Received: undefined`.

7. **Existing Test Preservation:**
   - All 26 existing tests in `lib/services/__tests__/tripService.mutations.test.ts` will continue to pass without regression.

---

## 5. Execution Verification Protocol

### Exact Test Runner Command
Per repository standards in `AGENTS.md`, Jest unit tests run containerized via Podman using the container runner script:

```bash
./scripts/run-jest-container.sh lib/services/__tests__/tripService.mutations.test.ts
```

> [!IMPORTANT]
> - Running this container runner requires `BypassSandbox: true` (due to host Podman socket requirements).
> - Expected outcome during Task 1 (Red Phase) verification:
>   - Exactly 6 tests fail:
>     1. `TripService.createTrip` -> `chains wineries without database IDs (Google Places results) by passing full Winery objects`
>     2. `TripService.createTrip` -> `tags error with preventOfflineEnqueue = true and rolls back partial trip when secondary chained winery addition fails`
>     3. `TripService.addWineryToExistingTrip` -> `accepts a full Winery object (without DB ID) and passes standardized RPC data directly`
>     4. `TripService.addWineryToExistingTrip` -> `rejects non-positive winery IDs (<= 0 or NaN) before issuing DB RPC`
>     5. `WineryService.getRpcData Dual-Key Coordinates` -> `emits dual-key coordinates (latitude, longitude, lat, lng) for backward compatibility`
>     6. `WineryService.getRpcData Dual-Key Coordinates` -> `defaults lat and lng to 0 when coordinates are omitted or undefined`
>   - Exactly 26 existing tests pass.
>   - Total: 32 tests in suite. Zero syntax or TypeScript compilation errors.

---

## 6. Gating & Approval
No source code files (`lib/services/wineryService.ts` or `lib/services/tripService.ts`) or test files have been modified yet. Under Conductor guidelines and project rules, proceeding to apply the test changes to `lib/services/__tests__/tripService.mutations.test.ts` and execute the Red Phase container runner requires explicit user approval.
