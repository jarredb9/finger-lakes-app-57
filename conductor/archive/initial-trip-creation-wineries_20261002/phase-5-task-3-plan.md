# Implementation Plan: Phase 5 Task 3 - Refactor & Scaffolding Cleanup

**Track:** `initial-trip-creation-wineries_20261002` (Issue [#57](https://github.com/jarredb9/finger-lakes-app-57/issues/57))  
**Phase:** 5 (Offline Sync Parity (`syncService.ts`))  
**Task:** 3 (Refactor & Scaffolding Cleanup)  
**Specification Reference:** [spec.md](./spec.md) (Section 3.6)  
**Track Plan Reference:** [plan.md](./plan.md) (Phase 5 Task 3)  
**Preceding Task Plan References:** [phase-5-task-1-plan.md](./phase-5-task-1-plan.md), [phase-5-task-2-plan.md](./phase-5-task-2-plan.md)  

---

## 1. Objective & Seam-Bounded Architecture

### 1.1 Objective
Execute the Refactor and Scaffolding Cleanup task for Phase 5:
1. **Strong Typing for Offline Trip Mutations in `syncService.ts`:**
   - Define and export `CreateTripPayload` interface in `lib/services/syncService.ts` to strictly type the decrypted offline mutation payload for `'create_trip'`, matching the structure enqueued by `createTripHelper`.
   - Cast/narrow the decrypted payload in `case 'create_trip'` to `CreateTripPayload` to eliminate unchecked `any` leakage into `TripService.createTrip`, `trip_date`, `wineries`, and `tempId`.
2. **Numeric Radix & Parsing Hygiene across Offline Handlers:**
   - Standardize all `parseInt(...)` calls in `delete_visit`, `update_trip`, and `delete_trip` in `lib/services/syncService.ts` to explicitly specify radix 10 (`parseInt(..., 10)`).
3. **Clean Up Unnecessary `as any` Casts in Test Suites:**
   - Remove redundant `(SyncService as any).isSyncing = false;` casts in `lib/stores/__tests__/tripStore.syncStore.test.ts` and `lib/services/__tests__/syncService.test.ts`, directly accessing the public property `SyncService.isSyncing`.
4. **Scaffolding Audit:**
   - Audit repository to verify zero temporary exploration, scratch, or throwaway test files exist.
5. **Execution Verification Protocol:**
   - Execute the containerized Jest test suites to empirically verify 100% test pass rate with zero regressions.

---

### 1.2 Architectural Context & Seam Boundaries

#### 1. Mutation Payload Contract Seam (`CreateTripPayload`)
- In Phase 5 Task 2, `syncService.ts` was refactored to delegate offline trip creation to `TripService.createTrip(payload, item.id)`.
- However, `payload` was obtained via `getDecryptedPayload<any>(item, user.id)`, leaving all properties (`tempId`, `trip_date`, `wineries`, `notes`) untyped.
- `syncService.ts` already defines explicit payload interfaces for other mutations (`LogVisitPayload`, `UpdateVisitPayload`).
- Defining `CreateTripPayload` formalizes the data contract between `tripMutationHelpers.ts` (the producer) and `syncService.ts` (the consumer), ensuring type safety without runtime overhead.

#### 2. Integer Parsing Hygiene Seam
- In JavaScript, `parseInt` without radix 10 can produce unexpected behavior or linter warnings when parsing strings with leading zeros.
- Standardizing to `parseInt(value, 10)` in `delete_visit`, `update_trip`, and `delete_trip` ensures consistent numeric conversions across all sync handlers.

#### 3. Test Suite Type Safety
- `SyncService.isSyncing` is a declared boolean property on `SyncService` (`isSyncing: false`).
- Test suites previously used `(SyncService as any).isSyncing = false;` out of habit. Removing `as any` tightens test-to-implementation type alignment.

---

## 2. Invariants & Critical Guardrails

1. **Multi-Stop Replay Invariant:**
   - Offline `create_trip` replay through `TripService.createTrip(p, item.id)` must retain all winery stops without dropping stops 2+.
2. **Count Normalization Invariant:**
   - Replaced store trips must have a defined, accurate numeric `wineries_count`.
3. **Background Cache Invalidation Invariant:**
   - Day-view (`fetchTripsForDate`) and list-view (`fetchUpcomingTrips`, `fetchTrips`) cache invalidation calls must continue to execute upon sync.
4. **No Production Database Mutations (`AGENTS.md` Guardrail 1):**
   - Strictly zero database mutations or migrations against remote Supabase (`jfsxclrdxmvftxacjuqf`).
5. **BypassSandbox Mandates (`AGENTS.md` Section 3):**
   - Running containerized Jest suites (`./scripts/run-jest-container.sh`) requires `BypassSandbox: true` due to RHEL 8 glibc 2.28 compatibility.
6. **Modal Approval Invariant (`AGENTS.md` Section 2 & `conductor_antigravity.md`):**
   - The executor must halt and wait for explicit user approval via modal before modifying any repository files.

---

## 3. Target Files & Exact Drop-in Specifications

### 3.1 Target File: `lib/services/syncService.ts`
- **Absolute Path:** `/home/byrnesjd4821/Git/finger-lakes-app-57/lib/services/syncService.ts`
- **Action:** Import `Winery`, add `CreateTripPayload` interface, strongly type `'create_trip'`, and add radix 10 to `parseInt` calls.

---

#### Chunk 1: Import `Winery` Type
- **StartLine:** 9
- **EndLine:** 12
- **Instruction:** Import `Winery` from `@/lib/types`.

**TargetContent:**
```typescript
import { TripService } from './tripService';
import { Trip, toGooglePlaceId, toWineryDbId } from '@/lib/types';
import { isRecord } from '@/lib/utils/winery';
```

**ReplacementContent:**
```typescript
import { TripService } from './tripService';
import { Trip, Winery, toGooglePlaceId, toWineryDbId } from '@/lib/types';
import { isRecord } from '@/lib/utils/winery';
```

---

#### Chunk 2: Add `CreateTripPayload` Interface
- **StartLine:** 70
- **EndLine:** 77
- **Instruction:** Add `CreateTripPayload` interface directly after `UpdateVisitPayload`.

**TargetContent:**
```typescript
interface UpdateVisitPayload {
  visitId: string;
  newPhotos: (string | Base64Photo)[];
  photosToDelete: string[];
  visitData: Record<string, unknown>;
}

export const SyncService = {
```

**ReplacementContent:**
```typescript
interface UpdateVisitPayload {
  visitId: string;
  newPhotos: (string | Base64Photo)[];
  photosToDelete: string[];
  visitData: Record<string, unknown>;
}

interface CreateTripPayload {
  tempId?: number;
  name?: string;
  trip_date?: string;
  wineries?: Winery[];
  notes?: string | null;
  [key: string]: unknown;
}

export const SyncService = {
```

---

#### Chunk 3: Radix 10 in `delete_visit`
- **StartLine:** 379
- **EndLine:** 384
- **Instruction:** Add radix 10 to `parseInt(payload.visitId, 10)`.

**TargetContent:**
```typescript
            case 'delete_visit':
              const { error: deleteError } = await supabase.rpc('delete_visit', {
                p_visit_id: parseInt(payload.visitId)
              });
              error = deleteError;
              break;
```

**ReplacementContent:**
```typescript
            case 'delete_visit':
              const { error: deleteError } = await supabase.rpc('delete_visit', {
                p_visit_id: parseInt(payload.visitId, 10)
              });
              error = deleteError;
              break;
```

---

#### Chunk 4: Strong Typing in `create_trip` Case
- **StartLine:** 386
- **EndLine:** 421
- **Instruction:** Cast `payload as CreateTripPayload` (`const p = payload as CreateTripPayload;`) and use `p` properties with strict typing.

**TargetContent:**
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

**ReplacementContent:**
```typescript
            case 'create_trip': {
              const p = payload as CreateTripPayload;
              try {
                const syncedTrip = await TripService.createTrip(p, item.id);
                if (!syncedTrip) {
                  throw new Error(`Failed to create trip for mutation ${item.id}`);
                }
                const targetDate = syncedTrip.trip_date || p.trip_date;
                const wineriesCount =
                  syncedTrip.wineries_count ??
                  syncedTrip.wineries?.length ??
                  p.wineries?.length ??
                  0;
                const finalTrip: Trip = {
                  ...syncedTrip,
                  id: Number(syncedTrip.id),
                  user_id: syncedTrip.user_id || user.id,
                  name: syncedTrip.name || p.name,
                  trip_date: targetDate,
                  wineries: syncedTrip.wineries || p.wineries || [],
                  wineries_count: wineriesCount,
                  members: syncedTrip.members || [],
                  syncStatus: 'synced',
                };

                if (p.tempId) {
                  useTripStore.getState().replaceTripTempId(p.tempId, finalTrip);
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

#### Chunk 5: Radix 10 in `update_trip`
- **StartLine:** 423
- **EndLine:** 467
- **Instruction:** Add radix 10 to all `parseInt` calls within `case 'update_trip'`.

**TargetContent:**
```typescript
            case 'update_trip':
              const { tripId: uTripId, updates: uUpdates } = payload;
              if (uUpdates.wineryOrder) {
                const { error: reorderError } = await supabase.rpc('reorder_trip_wineries', {
                  p_trip_id: parseInt(uTripId),
                  p_winery_ids: uUpdates.wineryOrder
                });
                error = reorderError;
              } else if (uUpdates.removeWineryId) {
                const { error: removeWineryError } = await supabase
                  .from('trip_wineries')
                  .delete()
                  .eq('trip_id', uTripId)
                  .eq('winery_id', uUpdates.removeWineryId);
                error = removeWineryError;
              } else if (uUpdates.updateNote) {
                const { wineryId: nWineryId, notes: nNotes } = uUpdates.updateNote;
                if (typeof nNotes === 'string') {
                    const { error: noteError } = await supabase.rpc('update_trip_winery_notes', {
                      p_trip_id: parseInt(uTripId),
                      p_winery_id: nWineryId,
                      p_notes: nNotes
                    });
                    error = noteError;
                } else if (typeof nNotes === 'object') {
                    const promises = Object.entries(nNotes).map(([wId, text]) => 
                        supabase.rpc('update_trip_winery_notes', {
                            p_trip_id: parseInt(uTripId),
                            p_winery_id: parseInt(wId),
                            p_notes: text as string
                        })
                    );
                    const results = await Promise.all(promises);
                    const firstErrorResult = results.find(r => !!r.error);
                    error = firstErrorResult ? firstErrorResult.error : null;
                }
              } else if (uUpdates.addWinery) {
                  const { winery, notes: aNotes } = uUpdates.addWinery;
                  const { error: addError } = await supabase.rpc('add_winery_to_trip', {
                      p_trip_id: parseInt(uTripId),
                      p_winery_data: WineryService.getRpcData(winery),
                      p_notes: aNotes
                  });
                  error = addError;
              } else {
```

**ReplacementContent:**
```typescript
            case 'update_trip':
              const { tripId: uTripId, updates: uUpdates } = payload;
              if (uUpdates.wineryOrder) {
                const { error: reorderError } = await supabase.rpc('reorder_trip_wineries', {
                  p_trip_id: parseInt(uTripId, 10),
                  p_winery_ids: uUpdates.wineryOrder
                });
                error = reorderError;
              } else if (uUpdates.removeWineryId) {
                const { error: removeWineryError } = await supabase
                  .from('trip_wineries')
                  .delete()
                  .eq('trip_id', uTripId)
                  .eq('winery_id', uUpdates.removeWineryId);
                error = removeWineryError;
              } else if (uUpdates.updateNote) {
                const { wineryId: nWineryId, notes: nNotes } = uUpdates.updateNote;
                if (typeof nNotes === 'string') {
                    const { error: noteError } = await supabase.rpc('update_trip_winery_notes', {
                      p_trip_id: parseInt(uTripId, 10),
                      p_winery_id: nWineryId,
                      p_notes: nNotes
                    });
                    error = noteError;
                } else if (typeof nNotes === 'object') {
                    const promises = Object.entries(nNotes).map(([wId, text]) => 
                        supabase.rpc('update_trip_winery_notes', {
                            p_trip_id: parseInt(uTripId, 10),
                            p_winery_id: parseInt(wId, 10),
                            p_notes: text as string
                        })
                    );
                    const results = await Promise.all(promises);
                    const firstErrorResult = results.find(r => !!r.error);
                    error = firstErrorResult ? firstErrorResult.error : null;
                }
              } else if (uUpdates.addWinery) {
                  const { winery, notes: aNotes } = uUpdates.addWinery;
                  const { error: addError } = await supabase.rpc('add_winery_to_trip', {
                      p_trip_id: parseInt(uTripId, 10),
                      p_winery_data: WineryService.getRpcData(winery),
                      p_notes: aNotes
                  });
                  error = addError;
              } else {
```

---

#### Chunk 6: Radix 10 in `delete_trip`
- **StartLine:** 503
- **EndLine:** 508
- **Instruction:** Add radix 10 to `parseInt(payload.tripId, 10)`.

**TargetContent:**
```typescript
            case 'delete_trip':
              const { error: dTripError } = await supabase.rpc('delete_trip', {
                p_trip_id: parseInt(payload.tripId)
              });
              error = dTripError;
              break;
```

**ReplacementContent:**
```typescript
            case 'delete_trip':
              const { error: dTripError } = await supabase.rpc('delete_trip', {
                p_trip_id: parseInt(payload.tripId, 10)
              });
              error = dTripError;
              break;
```

---

### 3.2 Target File: `lib/stores/__tests__/tripStore.syncStore.test.ts`
- **Absolute Path:** `/home/byrnesjd4821/Git/finger-lakes-app-57/lib/stores/__tests__/tripStore.syncStore.test.ts`
- **Action:** Remove redundant `as any` type cast on `SyncService.isSyncing`.

---

#### Chunk 1: Type-Safe `SyncService.isSyncing` Reset
- **StartLine:** 50
- **EndLine:** 56
- **Instruction:** Replace `(SyncService as any).isSyncing = false;` with `SyncService.isSyncing = false;`.

**TargetContent:**
```typescript
  beforeEach(() => {
    jest.clearAllMocks();
    mockAddMutation.mockResolvedValue(undefined);
    mockRemoveMutation.mockResolvedValue(undefined);
    (SyncService as any).isSyncing = false;

    // Mock navigator.onLine to false (default for enqueue tests)
```

**ReplacementContent:**
```typescript
  beforeEach(() => {
    jest.clearAllMocks();
    mockAddMutation.mockResolvedValue(undefined);
    mockRemoveMutation.mockResolvedValue(undefined);
    SyncService.isSyncing = false;

    // Mock navigator.onLine to false (default for enqueue tests)
```

---

### 3.3 Target File: `lib/services/__tests__/syncService.test.ts`
- **Absolute Path:** `/home/byrnesjd4821/Git/finger-lakes-app-57/lib/services/__tests__/syncService.test.ts`
- **Action:** Remove redundant `as any` type cast on `SyncService.isSyncing`.

---

#### Chunk 1: Type-Safe `SyncService.isSyncing` Reset
- **StartLine:** 74
- **EndLine:** 78
- **Instruction:** Replace `(SyncService as any).isSyncing = false;` with `SyncService.isSyncing = false;`.

**TargetContent:**
```typescript
  beforeEach(() => {
    jest.clearAllMocks();
    (SyncService as any).isSyncing = false;

    mockSupabase = {
```

**ReplacementContent:**
```typescript
  beforeEach(() => {
    jest.clearAllMocks();
    SyncService.isSyncing = false;

    mockSupabase = {
```

---

## 4. Execution Verification Protocol

### 4.1 Verification Commands
Once user approval is granted and the code modification is executed, run the containerized Jest test runner against all target test suites:
```bash
./scripts/run-jest-container.sh lib/stores/__tests__/tripStore.syncStore.test.ts lib/services/__tests__/syncService.test.ts
```

Also run full mutation service tests to ensure zero cross-boundary regressions:
```bash
./scripts/run-jest-container.sh lib/services/__tests__/tripService.mutations.test.ts
```

And verify local TypeScript types:
```bash
npm run db:check-types:local
```

### 4.2 Expected Verification Signatures
1. **`lib/stores/__tests__/tripStore.syncStore.test.ts`:**
   - All tests pass (6 passed, 0 failed).
2. **`lib/services/__tests__/syncService.test.ts`:**
   - All tests pass (23 passed, 0 failed).
3. **`lib/services/__tests__/tripService.mutations.test.ts`:**
   - All tests pass (32 passed, 0 failed).
4. **TypeScript compilation:**
   - Clean compilation with 0 errors.

---

## 5. Scaffolding Audit & Plan Completion Checklist

- [ ] Apply Chunk 1 to `lib/services/syncService.ts` (import `Winery`).
- [ ] Apply Chunk 2 to `lib/services/syncService.ts` (`CreateTripPayload` interface).
- [ ] Apply Chunk 3 to `lib/services/syncService.ts` (radix 10 in `delete_visit`).
- [ ] Apply Chunk 4 to `lib/services/syncService.ts` (strongly typed `create_trip`).
- [ ] Apply Chunk 5 to `lib/services/syncService.ts` (radix 10 in `update_trip`).
- [ ] Apply Chunk 6 to `lib/services/syncService.ts` (radix 10 in `delete_trip`).
- [ ] Apply Chunk 1 to `lib/stores/__tests__/tripStore.syncStore.test.ts` (remove `as any`).
- [ ] Apply Chunk 1 to `lib/services/__tests__/syncService.test.ts` (remove `as any`).
- [ ] Run containerized verification suites.
- [ ] Verify zero scratch or scaffolding files remain in repository.
- [ ] Update `conductor/tracks/initial-trip-creation-wineries_20261002/plan.md` to record completion of Phase 5 Task 3.
