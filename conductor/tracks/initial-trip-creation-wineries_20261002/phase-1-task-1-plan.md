# Implementation Plan: Phase 1 Task 1 - Failing Integration Test for `add_winery_to_trip` Coordinates (Red Phase)

**Track:** `initial-trip-creation-wineries_20261002` (Issue [#57](https://github.com/jarredb9/finger-lakes-app-57/issues/57))  
**Phase:** 1 (PostgreSQL RPC Coordinate Standardization (`add_winery_to_trip`))  
**Task:** 1 (Write Failing Integration Test for `add_winery_to_trip` Coordinates)  
**Specification Reference:** [spec.md](./spec.md)  
**Track Plan Reference:** [plan.md](./plan.md)  

---

## 1. Objective & Seam-Bounded Architecture

### 1.1 Objective
Establish an empirical, failing integration test (TDD Red Phase) verifying that calling the PostgreSQL RPC `add_winery_to_trip` with standardized `latitude` and `longitude` JSON keys in `p_winery_data` (and without legacy `lat` or `lng` keys) correctly persists numeric coordinates into the `public.wineries` table.

### 1.2 Root Cause & Seam Boundary Analysis
1. **The Disconnect:**
   - Client code (`WineryService.getRpcData`) serializes winery objects using standardized coordinates:
     ```typescript
     latitude: winery.latitude || 0,
     longitude: winery.longitude || 0,
     ```
   - In contrast, the baseline PostgreSQL RPC definition in `supabase/migrations/20260528000000_v2.11.0-stable.sql` (lines 387–388) only extracts:
     ```sql
     (p_winery_data->>'lat')::numeric,
     (p_winery_data->>'lng')::numeric,
     ```
   - When `add_winery_to_trip` is called with standardized `latitude`/`longitude` keys, `p_winery_data->>'lat'` and `p_winery_data->>'lng'` evaluate to `NULL`, resulting in `NULL` coordinates in `public.wineries`.
2. **Why `supabase-rpc.integration.test.ts` is the Target Suite:**
   - Unit test files such as `lib/services/__tests__/tripService.mutations.test.ts` mock `supabase.rpc` with Jest spies (`mockRpc`) and do not connect to PostgreSQL. A mocked test cannot detect PL/pgSQL extraction errors.
   - The canonical test suite for verifying PostgreSQL RPC execution against the live database is [lib/services/__tests__/supabase-rpc.integration.test.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/services/__tests__/supabase-rpc.integration.test.ts).
   - This matches the precedent set in track `autoclear-wishlist-on-visit_20260928` (commit `dc0443d`), where database RPC integration tests were placed in `supabase-rpc.integration.test.ts`.

---

## 2. Invariants & Guardrails

1. **Standardized Coordinate Extraction Invariant:**
   - `add_winery_to_trip` must persist valid numeric values when passed `latitude` and `longitude` in `p_winery_data`.
2. **Backward Compatibility (Expand-and-Contract) Invariant:**
   - Existing callers or legacy offline queues passing `lat` and `lng` must continue to persist valid numeric coordinates.
3. **Database Test Isolation & Teardown Hygiene:**
   - All newly generated Place IDs must be appended to the test suite's `createdWineryIds` array so that the existing `afterAll` hook automatically purges them from `public.wineries`.

---

## 3. Target File & Exact Drop-in Specifications

### Target File: `lib/services/__tests__/supabase-rpc.integration.test.ts`
- **Path:** `lib/services/__tests__/supabase-rpc.integration.test.ts`
- **Location:** Inside `describe('Trip Management RPCs', ...)` block, immediately after the `get_trip_details` test (around line 122).

#### Line Anchor Context:
```typescript
// lines 119-124
        expect(detailsError).toBeNull();
        expect(details).not.toBeNull();
        expect(details.id).toBe(tripId);
      });
    });

    describe('Visit Logging RPCs', () => {
```

#### Exact Drop-in Code Chunk:
```typescript
<<<<
        expect(detailsError).toBeNull();
        expect(details).not.toBeNull();
        expect(details.id).toBe(tripId);
      });
    });
====
        expect(detailsError).toBeNull();
        expect(details).not.toBeNull();
        expect(details.id).toBe(tripId);
      });

      it('should persist numeric coordinates when add_winery_to_trip is called with latitude and longitude keys (without lat/lng)', async () => {
        // 1. Create a base trip with user1
        const { data: tripData, error: tripError } = await user1.client.rpc('create_trip_with_winery', {
          p_trip_name: 'Coord Test Trip',
          p_trip_date: new Date().toISOString().split('T')[0],
          p_winery_data: {
            id: `mock-winery-base-${crypto.randomUUID()}`,
            name: 'Base Winery',
            address: '100 Base Way',
            lat: 42.5,
            lng: -76.9,
            rating: 4.5
          }
        });
        expect(tripError).toBeNull();
        const tripId = tripData.trip_id;

        // 2. Call add_winery_to_trip using standardized latitude / longitude keys (NO lat/lng keys)
        const wineryPlaceId = `mock-winery-coord-${crypto.randomUUID()}`;
        createdWineryIds.push(wineryPlaceId);
        const wineryData = {
          id: wineryPlaceId,
          name: 'Standardized Coord Winery',
          address: '200 Finger Lakes Rd',
          latitude: 42.7485,
          longitude: -76.8921,
          phone: '555-123-4567',
          website: 'https://example.com',
          rating: 4.8
        };

        const { data: addData, error: addError } = await user1.client.rpc('add_winery_to_trip', {
          p_trip_id: tripId,
          p_winery_data: wineryData,
          p_notes: 'Stop 2 via standardized coordinates'
        });

        expect(addError).toBeNull();
        expect(addData).toHaveProperty('success', true);
        expect(addData).toHaveProperty('winery_id');
        const wineryId = addData.winery_id;

        // 3. Inspect public.wineries - must persist numeric coordinates rather than NULL
        const { data: wineryRecord, error: wineryError } = await adminClient
          .from('wineries')
          .select('id, google_place_id, name, latitude, longitude')
          .eq('id', wineryId)
          .single();

        expect(wineryError).toBeNull();
        expect(wineryRecord).not.toBeNull();
        expect(wineryRecord.latitude).toBe(42.7485);
        expect(wineryRecord.longitude).toBe(-76.8921);

        // 4. Verify stop association in public.trip_wineries
        const { data: twRecord, error: twError } = await adminClient
          .from('trip_wineries')
          .select('trip_id, winery_id, notes, visit_order')
          .eq('trip_id', tripId)
          .eq('winery_id', wineryId)
          .single();

        expect(twError).toBeNull();
        expect(twRecord.notes).toBe('Stop 2 via standardized coordinates');
      });

      it('should maintain backward compatibility and persist numeric coordinates when add_winery_to_trip is called with legacy lat and lng keys', async () => {
        // 1. Create a base trip with user1
        const { data: tripData, error: tripError } = await user1.client.rpc('create_trip_with_winery', {
          p_trip_name: 'Legacy Coord Trip',
          p_trip_date: new Date().toISOString().split('T')[0],
          p_winery_data: {
            id: `mock-winery-legacy-base-${crypto.randomUUID()}`,
            name: 'Legacy Base Winery',
            address: '100 Base Way',
            lat: 42.5,
            lng: -76.9
          }
        });
        expect(tripError).toBeNull();
        const tripId = tripData.trip_id;

        // 2. Call add_winery_to_trip using legacy lat / lng keys
        const wineryPlaceId = `mock-winery-legacy-${crypto.randomUUID()}`;
        createdWineryIds.push(wineryPlaceId);
        const wineryData = {
          id: wineryPlaceId,
          name: 'Legacy Coord Winery',
          address: '300 Legacy Rd',
          lat: 42.6123,
          lng: -76.7456
        };

        const { data: addData, error: addError } = await user1.client.rpc('add_winery_to_trip', {
          p_trip_id: tripId,
          p_winery_data: wineryData,
          p_notes: 'Stop 2 via legacy coordinates'
        });

        expect(addError).toBeNull();
        expect(addData).toHaveProperty('success', true);
        const wineryId = addData.winery_id;

        // 3. Inspect public.wineries - legacy keys must persist
        const { data: wineryRecord, error: wineryError } = await adminClient
          .from('wineries')
          .select('id, latitude, longitude')
          .eq('id', wineryId)
          .single();

        expect(wineryError).toBeNull();
        expect(wineryRecord).not.toBeNull();
        expect(wineryRecord.latitude).toBe(42.6123);
        expect(wineryRecord.longitude).toBe(-76.7456);
      });
    });
>>>>
```

---

## 4. Red-Phase Failure Verification Rationale

When executed against the current un-migrated database schema:
1. **`should persist numeric coordinates when add_winery_to_trip is called with latitude and longitude keys (without lat/lng)`:**
   - **Failure Point:** Lines `expect(wineryRecord.latitude).toBe(42.7485)` and `expect(wineryRecord.longitude).toBe(-76.8921)`.
   - **Root Cause:** Current RPC only parses `lat` and `lng`, leaving `p_winery_data->>'lat'` as `NULL`.
   - **Expected Jest Failure:**
     ```text
     expect(received).toBe(expected) // Object.is equality

     Expected: 42.7485
     Received: null
     ```
2. **`should maintain backward compatibility and persist numeric coordinates when add_winery_to_trip is called with legacy lat and lng keys`:**
   - **Expected Status:** Passes, confirming that existing callers using legacy keys remain functional.

---

## 5. Execution Verification Protocol

### Exact Test Runner Command
Per `AGENTS.md` and `package.json`, integration tests run containerized using the following exact command:

```bash
TEST_TYPE=integration ./scripts/run-jest-container.sh lib/services/__tests__/supabase-rpc.integration.test.ts
```
*(Equivalent: `npm run test:integration:container -- lib/services/__tests__/supabase-rpc.integration.test.ts`)*

> [!IMPORTANT]
> - Running this container command requires `BypassSandbox: true` (due to container socket requirements).
> - The local Supabase stack must be running (`npm run db:start`).
> - The execution phase will confirm that the new test fails with `Received: null` for coordinates as documented in Section 4.

---

## 6. Gating & Approval
No files other than this implementation plan have been created or modified. Under Conductor guidelines, execution requires affirmative user approval.
