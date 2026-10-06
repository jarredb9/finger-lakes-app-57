# Implementation Plan: Phase 4 Task 2 - Implement Dual-Key Coordinates, Polymorphic Chaining & Rollback Semantics (Green Phase)

**Track:** `initial-trip-creation-wineries_20261002` (Issue [#57](https://github.com/jarredb9/finger-lakes-app-57/issues/57))  
**Phase:** 4 (Dual-Key Coordinates, Polymorphic Chaining & Strict Rollback)  
**Task:** 2 (Implement Dual-Key Coordinates, Polymorphic Chaining & Rollback Semantics)  
**Specification Reference:** [spec.md](./spec.md)  
**Track Plan Reference:** [plan.md](./plan.md)  
**Preceding Task Plan Reference:** [phase-4-task-1-plan.md](./phase-4-task-1-plan.md)  

---

## 1. Objective & Seam-Bounded Architecture

### 1.1 Objective
Transition all 6 failing unit tests in `lib/services/__tests__/tripService.mutations.test.ts` from Red to Green (TDD Green Phase) by implementing:
1. Dual-key coordinate serialization (`latitude`, `longitude`, `lat`, and `lng`) in `WineryService.getRpcData` (`lib/services/wineryService.ts`).
2. Type-safe polymorphic input handling and strict numeric ID validation in `TripService.addWineryToExistingTrip` (`lib/services/tripService.ts`).
3. Chained `Winery` object forwarding and atomic rollback with `preventOfflineEnqueue = true` in `TripService.createTrip` (`lib/services/tripService.ts`).

### 1.2 Architectural Context & Seam Analysis

1. **Dual-Key Coordinate Emission (`WineryService.getRpcData`):**
   - **Current State:** `getRpcData` maps only `latitude: winery.latitude || 0` and `longitude: winery.longitude || 0`.
   - **Target Behavior:** In addition to `latitude` and `longitude`, `getRpcData` must emit `lat: winery.latitude || 0` and `lng: winery.longitude || 0`.
   - **Rationale:** Legacy or unmigrated PostgreSQL RPCs (as well as external API callers) extract `(p_winery_data->>'lat')::numeric` and `(p_winery_data->>'lng')::numeric`. Emitting all 4 coordinate keys provides defense-in-depth across `create_trip_with_winery`, `add_winery_to_trip`, and `log_visit` without breaking any consumers.

2. **Polymorphic Chaining & ID Validation (`TripService.addWineryToExistingTrip`):**
   - **Current State:** `addWineryToExistingTrip(tripId: number, wineryId: number, notes: string | null)` only accepts numeric IDs and performs zero validation on non-positive or `NaN` numbers. If a `Winery` object is passed, `findWineryByDbId` fails and passes the raw object into `p_winery_id`, triggering database errors.
   - **Target Behavior:**
     - Update signature to `addWineryToExistingTrip(tripId: number, wineryOrId: number | Winery, notes: string | null = null)`.
     - **Object Branch:** When `wineryOrId` is an object (`typeof wineryOrId === 'object' && wineryOrId !== null`), directly invoke `supabase.rpc('add_winery_to_trip', { p_trip_id: tripId, p_winery_data: WineryService.getRpcData(wineryOrId), p_notes: notes })`. Do not call `findWineryByDbId`.
     - **Numeric Branch:** When `wineryOrId` is a number (`typeof wineryOrId === 'number'`), validate `!isNaN(wineryOrId) && wineryOrId > 0`. If `<= 0` or `NaN`, throw `new Error("Invalid winery ID")` immediately before issuing any RPC. If valid, check `findWineryByDbId(wineryOrId)`: if present in store, pass `p_winery_data: WineryService.getRpcData(winery)`; if missing from store, fallback to passing `p_winery_id: wineryOrId`.
     - **Invalid Fallback:** If neither, throw `new Error("Invalid winery ID or data")`.

3. **Chained Object Forwarding & Atomic Rollback Tagging (`TripService.createTrip`):**
   - **Current State:**
     ```typescript
     for (const extra of extraWineries) {
         await this.addWineryToExistingTrip(data.trip_id, extra.dbId || 0, null);
     }
     ```
     When newly searched Google Places wineries lack database IDs (`extra.dbId` is `undefined`), `extra.dbId || 0` passes `0`, which causes foreign key failures. Furthermore, when `chainedError` is caught during rollback, `chainedError.preventOfflineEnqueue` is not tagged.
   - **Target Behavior:**
     - Forward `extra` directly as a `Winery` object: `await this.addWineryToExistingTrip(data.trip_id, extra, extra.notes || null)`.
     - In the `catch (chainedError: any)` block: execute `await this.deleteTrip(data.trip_id.toString())` to clean up the partial remote trip, wrap the cleanup in a nested try/catch to ensure rollback failure does not obscure the primary error, tag `chainedError.preventOfflineEnqueue = true`, and rethrow `chainedError`.

---

## 2. Invariants & Guardrails

1. **Test Suite Invariant:**
   - All 32 tests in `lib/services/__tests__/tripService.mutations.test.ts` (the 26 legacy tests and the 6 Red-Phase tests added in Task 1) must pass completely with 0 failures and 0 skipped.
2. **Regression Invariant:**
   - `lib/services/__tests__/syncService.test.ts` must continue to pass without regression.
3. **Type Safety & Clean Signatures:**
   - Import `Winery` from `@/lib/types` into `lib/services/tripService.ts`.
   - Use strict TypeScript typing without unsafe type assertions (`as any`) in production code paths.
   - TypeScript compilation and type checks (`npm run db:check-types:local`) must pass with zero diagnostics.
4. **Idempotency & Clean Rollback:**
   - Partial trips created before secondary chained stop failures must be cleaned up via `deleteTrip`.
   - The error thrown must have `preventOfflineEnqueue === true` to ensure downstream offline sync stores (Phase 6) do not enqueue broken mutations.

---

## 3. Target Files & Exact Drop-in Specifications

### 3.1 Target File: `lib/services/wineryService.ts`
- **Path:** `lib/services/wineryService.ts`
- **Modifications:**
  - **Chunk 1:** Update `getRpcData` to emit dual-key coordinates (`latitude`, `longitude`, `lat`, and `lng`).

---

#### Chunk 1: Dual-Key Coordinates in `WineryService.getRpcData`
**StartLine:** 18  
**EndLine:** 28  
**TargetContent:**
```typescript
  getRpcData: (winery: Partial<Winery>) => ({
      id: winery.id,
      name: winery.name || '',
      address: winery.address || '',
      latitude: winery.latitude || 0,
      longitude: winery.longitude || 0,
      phone: winery.phone || null,
      website: winery.website || null,
      rating: winery.rating || null,
      user_rating_count: winery.userRatingCount || null,
  }),
```
**ReplacementContent:**
```typescript
  getRpcData: (winery: Partial<Winery>) => ({
      id: winery.id,
      name: winery.name || '',
      address: winery.address || '',
      latitude: winery.latitude || 0,
      longitude: winery.longitude || 0,
      lat: winery.latitude || 0,
      lng: winery.longitude || 0,
      phone: winery.phone || null,
      website: winery.website || null,
      rating: winery.rating || null,
      user_rating_count: winery.userRatingCount || null,
  }),
```

---

### 3.2 Target File: `lib/services/tripService.ts`
- **Path:** `lib/services/tripService.ts`
- **Modifications:**
  - **Chunk 1:** Import `Winery` type from `@/lib/types`.
  - **Chunk 2:** Update `createTrip` chained winery iteration to pass `extra` and tag `preventOfflineEnqueue = true` on rollback.
  - **Chunk 3:** Update `addWineryToExistingTrip` signature to `(tripId: number, wineryOrId: number | Winery, notes: string | null = null)` with polymorphic branching and non-positive ID validation.

---

#### Chunk 1: Import `Winery` Type in `lib/services/tripService.ts`
**StartLine:** 1  
**EndLine:** 3  
**TargetContent:**
```typescript
import { createClient } from '@/utils/supabase/client';
import { Trip } from '@/lib/types';
import { getTodayLocal, formatDateLocal } from '@/lib/utils';
```
**ReplacementContent:**
```typescript
import { createClient } from '@/utils/supabase/client';
import { Trip, Winery } from '@/lib/types';
import { getTodayLocal, formatDateLocal } from '@/lib/utils';
```

---

#### Chunk 2: Chained Winery Forwarding & Rollback Tagging in `TripService.createTrip`
**StartLine:** 135  
**EndLine:** 149  
**TargetContent:**
```typescript
        // If there were more wineries, add them to the existing trip
        if (trip.wineries.length > 1) {
            const extraWineries = trip.wineries.slice(1);
            try {
                for (const extra of extraWineries) {
                    await this.addWineryToExistingTrip(data.trip_id, extra.dbId || 0, null);
                }
            } catch (chainedError) {
                try {
                    await this.deleteTrip(data.trip_id.toString());
                } catch (rollbackError) {
                    console.error("Failed to rollback trip creation after chaining error:", rollbackError);
                }
                throw chainedError;
            }
        }
```
**ReplacementContent:**
```typescript
        // If there were more wineries, add them to the existing trip
        if (trip.wineries.length > 1) {
            const extraWineries = trip.wineries.slice(1);
            try {
                for (const extra of extraWineries) {
                    await this.addWineryToExistingTrip(data.trip_id, extra, extra.notes || null);
                }
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
        }
```

---

#### Chunk 3: Polymorphic Signature & Numeric Validation in `TripService.addWineryToExistingTrip`
**StartLine:** 309  
**EndLine:** 335  
**TargetContent:**
```typescript
  async addWineryToExistingTrip(tripId: number, wineryId: number, notes: string | null) {
    const supabase = createClient();
    const winery = findWineryByDbId(wineryId);

    if (!winery) {
        // If not in store, we might just have the ID. 
        // We can't use add_winery_to_trip RPC if it requires full winery data.
        
        // We should use the simple ID one if we only have wineryId.
        const { error } = await supabase.rpc('add_winery_to_trip', {
            p_trip_id: tripId,
            p_winery_id: wineryId,
            p_notes: notes
        });
        if (error) throw error;
        return { success: true };
    }

    const { error } = await supabase.rpc('add_winery_to_trip', {
        p_trip_id: tripId,
        p_winery_data: WineryService.getRpcData(winery),
        p_notes: notes
    });

    if (error) throw error;
    return { success: true };
  },
```
**ReplacementContent:**
```typescript
  async addWineryToExistingTrip(tripId: number, wineryOrId: number | Winery, notes: string | null = null) {
    const supabase = createClient();

    if (typeof wineryOrId === 'object' && wineryOrId !== null) {
      const { error } = await supabase.rpc('add_winery_to_trip', {
        p_trip_id: tripId,
        p_winery_data: WineryService.getRpcData(wineryOrId),
        p_notes: notes,
      });

      if (error) throw error;
      return { success: true };
    }

    if (typeof wineryOrId === 'number') {
      if (isNaN(wineryOrId) || wineryOrId <= 0) {
        throw new Error("Invalid winery ID");
      }

      const winery = findWineryByDbId(wineryOrId);

      if (!winery) {
        // If not in store, fallback to passing numeric winery ID
        const { error } = await supabase.rpc('add_winery_to_trip', {
          p_trip_id: tripId,
          p_winery_id: wineryOrId,
          p_notes: notes,
        });
        if (error) throw error;
        return { success: true };
      }

      const { error } = await supabase.rpc('add_winery_to_trip', {
        p_trip_id: tripId,
        p_winery_data: WineryService.getRpcData(winery),
        p_notes: notes,
      });

      if (error) throw error;
      return { success: true };
    }

    throw new Error("Invalid winery ID or data");
  },
```

---

## 4. Execution Verification Protocol

### 4.1 Primary Test Runner Command (Jest Container)
Per repository standards in `AGENTS.md`, Jest unit tests run containerized via Podman using the container runner script:

```bash
./scripts/run-jest-container.sh lib/services/__tests__/tripService.mutations.test.ts
```

> [!IMPORTANT]
> - Running this container runner requires `BypassSandbox: true` (due to host Podman socket requirements).
> - **Expected Verification Outcome:**
>   - Exactly 32 tests run and pass (0 failed, 0 skipped).
>   - The 6 tests that failed in the Red Phase must now be green:
>     1. `TripService.createTrip` -> `chains wineries without database IDs (Google Places results) by passing full Winery objects` (PASSED)
>     2. `TripService.createTrip` -> `tags error with preventOfflineEnqueue = true and rolls back partial trip when secondary chained winery addition fails` (PASSED)
>     3. `TripService.addWineryToExistingTrip` -> `accepts a full Winery object (without DB ID) and passes standardized RPC data directly` (PASSED)
>     4. `TripService.addWineryToExistingTrip` -> `rejects non-positive winery IDs (<= 0 or NaN) before issuing DB RPC` (PASSED)
>     5. `WineryService.getRpcData Dual-Key Coordinates` -> `emits dual-key coordinates (latitude, longitude, lat, lng) for backward compatibility` (PASSED)
>     6. `WineryService.getRpcData Dual-Key Coordinates` -> `defaults lat and lng to 0 when coordinates are omitted or undefined` (PASSED)
>   - All 26 pre-existing tests in the suite continue to pass.

### 4.2 Regression Test Runner Command (Sync Service)
Verify that dual-key coordinate emissions cause no regressions in sync service consumers:

```bash
./scripts/run-jest-container.sh lib/services/__tests__/syncService.test.ts
```

> [!NOTE]
> - **Expected Verification Outcome:** All unit tests in `syncService.test.ts` pass without errors.

### 4.3 Type-Check Verification
Verify TypeScript type conformance across the codebase:

```bash
npm run db:check-types:local
```

> [!NOTE]
> - **Expected Verification Outcome:** Zero TypeScript compiler diagnostics or type errors.

---

## 5. Gating & Approval
No production code files (`lib/services/wineryService.ts` or `lib/services/tripService.ts`) have been modified yet. Under Conductor guidelines, project rules, and user protocol, execution of these changes is halted pending explicit user approval via modal dialog.
