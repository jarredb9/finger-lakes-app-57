# Implementation Plan: Phase 4 Task 3 - Refactor & Scaffolding Cleanup

**Track:** `initial-trip-creation-wineries_20261002` (Issue [#57](https://github.com/jarredb9/finger-lakes-app-57/issues/57))  
**Phase:** 4 (Dual-Key Coordinates, Polymorphic Chaining & Strict Rollback)  
**Task:** 3 (Refactor & Scaffolding Cleanup)  
**Specification Reference:** [spec.md](./spec.md)  
**Track Plan Reference:** [plan.md](./plan.md)  
**Preceding Task Plan References:** [phase-4-task-1-plan.md](./phase-4-task-1-plan.md), [phase-4-task-2-plan.md](./phase-4-task-2-plan.md)  

---

## 1. Objective & Seam-Bounded Architecture

### 1.1 Objective
Execute the Refactor and Scaffolding Cleanup task for Phase 4:
1. **Eliminate Unsafe Type Assertions & Permissive `any` Usages in Service Layer:**
   - Define and export `WineryRpcData` interface in `lib/services/wineryService.ts` to strictly type the output of `WineryService.getRpcData`, ensuring dual-key coordinates (`latitude`, `longitude`, `lat`, `lng`) have explicit types.
   - Refactor `catch (chainedError: any)` in `TripService.createTrip` (`lib/services/tripService.ts`) to use `catch (chainedError: unknown)` and narrow with safe property assignment `(chainedError as { preventOfflineEnqueue?: boolean }).preventOfflineEnqueue = true`.
   - Add explicit return type `Promise<{ success: true }>` to `TripService.addWineryToExistingTrip` (`lib/services/tripService.ts`).
2. **Clean Up Test Typing in `lib/services/__tests__/tripService.mutations.test.ts`:**
   - Remove redundant `mockWineryNoDb as any` cast in `addWineryToExistingTrip` tests now that the method signature officially accepts `number | Winery`.
   - Remove redundant `(rpcData as any).lat` and `(rpcData as any).lng` casts in `WineryService.getRpcData` unit tests now that `lat` and `lng` are typed properties.
   - Replace `let thrownError: any` with strict error typing `(Error & { preventOfflineEnqueue?: boolean }) | null` in the `createTrip` rollback test.
3. **Audit Scaffolding Artifacts & Temporary Files:**
   - Confirm zero temporary exploration, scratch, or throwaway test files exist across the repository.
4. **Execution Verification:**
   - Run the containerized Jest test suite for mutations and trip service to verify zero regressions.
   - Verify TypeScript compilation without type-check errors.
5. **Track Plan Updates:**
   - Update `conductor/tracks/initial-trip-creation-wineries_20261002/plan.md` to record completion of Phase 4 Task 3.

### 1.2 Architectural Context & Seam Boundaries

1. **RPC Payload Strong Typing Seam (`WineryService.getRpcData`):**
   - In Phase 4 Task 2, `getRpcData` was expanded to return `lat` and `lng` alongside `latitude` and `longitude`.
   - Without an explicit return interface, callers and test suites relied on implicit return inference or `as any` escape hatches.
   - Defining `export interface WineryRpcData` formalizes the shape of winery payloads serialized for Supabase RPCs (`create_trip_with_winery`, `add_winery_to_trip`, `log_visit`), establishing a clear seam boundary between the domain `Winery` model and Postgres RPC JSON contracts.
2. **Error Boundary & Rollback Tagging Seam (`TripService.createTrip`):**
   - TypeScript 4.0+ enforces `catch (e: unknown)` under strict settings. Catching `chainedError: any` disables type safety and creates risk of unchecked property mutations.
   - Using `catch (chainedError: unknown)` combined with runtime object narrowing (`typeof chainedError === 'object' && chainedError !== null`) ensures that attaching `preventOfflineEnqueue = true` is fully type-safe and runtime-sound.
3. **Polymorphic Chaining Contract Seam (`TripService.addWineryToExistingTrip`):**
   - In Phase 4 Task 1 (Red Phase), `mockWineryNoDb` had to be cast `as any` because the production method only accepted `number`.
   - In Phase 4 Task 2 (Green Phase), `addWineryToExistingTrip` was updated to accept `wineryOrId: number | Winery`.
   - Removing `as any` in the test restores end-to-end static verification: if `addWineryToExistingTrip`'s signature were to regress, the test file will immediately produce a compile-time TypeScript error.

---

## 2. Invariants & Critical Guardrails

1. **Test Suite Invariant:**
   - All 32 unit tests in `lib/services/__tests__/tripService.mutations.test.ts` must pass completely with 0 failures and 0 skipped.
2. **Regression Invariant:**
   - Pre-existing tests in `lib/services/__tests__/tripService.test.ts` must continue to pass without regression.
3. **Dual-Key Coordinate Emission Invariant:**
   - `WineryService.getRpcData` must continue to emit all four keys: `latitude`, `longitude`, `lat`, and `lng`.
4. **Strict Error Tagging Invariant:**
   - Rollback errors thrown by `TripService.createTrip` on chained addition failure must continue to expose `preventOfflineEnqueue: true`.
5. **No Production Database Mutations (`AGENTS.md` Guardrail 1):**
   - Strictly zero database mutations or migrations against remote Supabase (`jfsxclrdxmvftxacjuqf`).
6. **BypassSandbox Mandates (`AGENTS.md` Section 3):**
   - Running containerized Jest suites (`./scripts/run-jest-container.sh`) requires `BypassSandbox: true` due to RHEL 8 glibc 2.28 compatibility.
7. **Modal Approval Invariant (`AGENTS.md` Section 2 & `conductor_antigravity.md`):**
   - The executor must halt and wait for explicit user approval via modal before modifying any repository files.

---

## 3. Target Files & Exact Drop-in Specifications

### 3.1 Target File: `lib/services/wineryService.ts`

- **Path:** `lib/services/wineryService.ts`
- **Action:** Export `WineryRpcData` interface and explicitly annotate `getRpcData` return type.

#### Chunk 1: Define `WineryRpcData` and Annotate `getRpcData`
- **StartLine:** 13
- **EndLine:** 20
- **TargetContent:**
```typescript
};

export const WineryService = {
  /**
   * Standardizes winery data for Supabase RPCs.
   */
  getRpcData: (winery: Partial<Winery>) => ({
```
- **ReplacementContent:**
```typescript
};

export interface WineryRpcData {
  id?: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  lat: number;
  lng: number;
  phone: string | null;
  website: string | null;
  rating: number | null;
  user_rating_count: number | null;
}

export const WineryService = {
  /**
   * Standardizes winery data for Supabase RPCs.
   */
  getRpcData: (winery: Partial<Winery>): WineryRpcData => ({
```

---

### 3.2 Target File: `lib/services/tripService.ts`

- **Path:** `lib/services/tripService.ts`
- **Action:** Refactor `catch (chainedError: any)` to `unknown` in `createTrip`, and add explicit return type to `addWineryToExistingTrip`.

#### Chunk 1: Type-Safe Error Handling in `createTrip` Rollback
- **StartLine:** 141
- **EndLine:** 151
- **TargetContent:**
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
- **ReplacementContent:**
```typescript
            } catch (chainedError: unknown) {
                try {
                    await this.deleteTrip(data.trip_id.toString());
                } catch (rollbackError) {
                    console.error("Failed to rollback trip creation after chaining error:", rollbackError);
                }
                if (chainedError && typeof chainedError === 'object') {
                    (chainedError as { preventOfflineEnqueue?: boolean }).preventOfflineEnqueue = true;
                }
                throw chainedError;
            }
```

#### Chunk 2: Explicit Return Type on `addWineryToExistingTrip`
- **StartLine:** 312
- **EndLine:** 314
- **TargetContent:**
```typescript
  async addWineryToExistingTrip(tripId: number, wineryOrId: number | Winery, notes: string | null = null) {
    const supabase = createClient();
```
- **ReplacementContent:**
```typescript
  async addWineryToExistingTrip(tripId: number, wineryOrId: number | Winery, notes: string | null = null): Promise<{ success: true }> {
    const supabase = createClient();
```

---

### 3.3 Target File: `lib/services/__tests__/tripService.mutations.test.ts`

- **Path:** `lib/services/__tests__/tripService.mutations.test.ts`
- **Action:** Remove redundant `as any` casts and enforce strict error typing.

#### Chunk 1: Strict Error Typing in `createTrip` Rollback Test
- **StartLine:** 215
- **EndLine:** 225
- **TargetContent:**
```typescript
      let thrownError: any;
      try {
        await TripService.createTrip(tripInput);
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).toBeDefined();
      expect(thrownError.message).toBe('Secondary winery RPC failure');
      expect(thrownError.preventOfflineEnqueue).toBe(true);
```
- **ReplacementContent:**
```typescript
      let thrownError: (Error & { preventOfflineEnqueue?: boolean }) | null = null;
      try {
        await TripService.createTrip(tripInput);
      } catch (err) {
        if (err instanceof Error) {
          thrownError = err as Error & { preventOfflineEnqueue?: boolean };
        }
      }

      expect(thrownError).not.toBeNull();
      expect(thrownError?.message).toBe('Secondary winery RPC failure');
      expect(thrownError?.preventOfflineEnqueue).toBe(true);
```

#### Chunk 2: Remove `mockWineryNoDb as any` Cast in `addWineryToExistingTrip`
- **StartLine:** 471
- **EndLine:** 472
- **TargetContent:**
```typescript
      const result = await TripService.addWineryToExistingTrip(300, mockWineryNoDb as any, 'Lovely Riesling');
```
- **ReplacementContent:**
```typescript
      const result = await TripService.addWineryToExistingTrip(300, mockWineryNoDb, 'Lovely Riesling');
```

#### Chunk 3: Remove `(rpcData as any)` Casts in `WineryService.getRpcData` Tests
- **StartLine:** 525
- **EndLine:** 546
- **TargetContent:**
```typescript
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
```
- **ReplacementContent:**
```typescript
      const rpcData = WineryService.getRpcData(winery);

      expect(rpcData.latitude).toBe(42.474);
      expect(rpcData.longitude).toBe(-77.172);
      expect(rpcData.lat).toBe(42.474);
      expect(rpcData.lng).toBe(-77.172);
    });

    it('defaults lat and lng to 0 when coordinates are omitted or undefined', () => {
      const winery: Partial<Winery> = {
        id: 'place_missing_coords' as GooglePlaceId,
        name: 'Coords Test Winery',
      };

      const rpcData = WineryService.getRpcData(winery);

      expect(rpcData.latitude).toBe(0);
      expect(rpcData.longitude).toBe(0);
      expect(rpcData.lat).toBe(0);
      expect(rpcData.lng).toBe(0);
    });
```

---

### 3.4 Target File: `conductor/tracks/initial-trip-creation-wineries_20261002/plan.md`

- **Path:** `conductor/tracks/initial-trip-creation-wineries_20261002/plan.md`
- **Action:** Update Task 3 status from `[ ]` to `[x]` upon completion.

#### Line Anchor Reference (Lines 69–71):
- **StartLine:** 69
- **EndLine:** 71
- **TargetContent:**
```markdown
- [ ] Task: Refactor & Scaffolding Cleanup
    - [ ] Ensure strict TypeScript typing without unsafe type assertions.
    - [ ] Audit and remove any temporary scratch or scaffolding test files.
```
- **ReplacementContent:**
```markdown
- [x] Task: Refactor & Scaffolding Cleanup [commit: <commit_sha>]
    - [x] Ensure strict TypeScript typing without unsafe type assertions.
    - [x] Audit and remove any temporary scratch or scaffolding test files.
```

---

## 4. Scaffolding & Temporary File Audit

1. **Audit Scope:**
   - Scan working directory for any leftover `.tmp`, `.scratch`, `.bak`, or untracked test fixtures created during Phase 4.
2. **Current State:**
   - Git working tree is completely clean.
   - Zero temporary exploration scripts or throwaway test files exist.
   - Only authoritative test files (`lib/services/__tests__/tripService.mutations.test.ts`, `lib/services/__tests__/tripService.test.ts`) are retained.

---

## 5. Execution Verification Protocol

Following implementation, the executor MUST run the following verification steps in sequence:

### Step 1: Run Containerized Unit Test Suite
Execute the containerized test runner with `BypassSandbox: true` to verify all 32 tests in `tripService.mutations.test.ts` and the regression suite in `tripService.test.ts`:
```bash
./scripts/run-jest-container.sh lib/services/__tests__/tripService.mutations.test.ts lib/services/__tests__/tripService.test.ts
```
**Expected Outcome:**
- 2 test suites pass.
- All 32 tests in `tripService.mutations.test.ts` pass.
- All tests in `tripService.test.ts` pass.
- 0 failed, 0 skipped.

### Step 2: Run Local Type Check
Verify that all TypeScript types and signatures compile cleanly without diagnostics:
```bash
npm run type-check
```
**Expected Outcome:**
- Zero type errors or diagnostics.

---

## 6. Execution Plan & Commit Protocol

1. **Apply Code Edits:**
   - Edit `lib/services/wineryService.ts` (Chunk 1).
   - Edit `lib/services/tripService.ts` (Chunks 1 & 2).
   - Edit `lib/services/__tests__/tripService.mutations.test.ts` (Chunks 1, 2, & 3).
2. **Run Execution Verification:**
   - Run containerized Jest test command (Step 1).
   - Run `npm run type-check` (Step 2).
3. **Commit Implementation:**
   - Stage modified service and test files.
   - Commit message:
     ```bash
     git commit -m "refactor(services): Ensure strict typing and remove unsafe assertions in tripService and wineryService"
     ```
4. **Update & Commit Track Plan:**
   - Get commit hash: `COMMIT_SHA=$(git log -1 --format="%h")`
   - Update `conductor/tracks/initial-trip-creation-wineries_20261002/plan.md` with `[x]` and commit SHA.
   - Commit plan update:
     ```bash
     git commit -m "docs(conductor): update track plan for Phase 4 Task 3 completion"
     ```
