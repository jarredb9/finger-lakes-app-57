# Implementation Plan: Phase 6 Task 1 - Audit and Cleanup Temporary Test Scaffolding

**Track:** `explore-enrichment-sync_20261006` (Issue [#44](https://github.com/jarredb9/finger-lakes-app-57/issues/44))  
**Phase:** 6 (Test Suite Hardening, Scaffolding Cleanup & End-to-End Verification)  
**Task:** 1 (Audit and cleanup temporary test scaffolding)  
**Specification Reference:** [spec.md](./spec.md) Section 6 & 21  
**Track Plan Reference:** [plan.md](./plan.md)  
**Workflow Reference:** [conductor/workflow.md](../../workflow.md)  

---

## 1. Executive Summary & Objective

### 1.1 Objective
Audit all test files, test fixtures, and mocking harnesses introduced or modified throughout Phases 1 through 5 of the `explore-enrichment-sync_20261006` track. Specifically:
1. **Scaffolding Audit:** Perform comprehensive static code inspection across all 18 test and fixture files created or expanded during the track to verify test cleanliness, regression coverage, and absence of throwaway interim code.
2. **Debug Artifact Elimination:** Remove residual debugging statements (`console.log` statements in test suites) left behind from test debugging.
3. **Test Isolation & Teardown Hardening:** Eliminate shared state pollution across test boundaries by introducing robust `afterEach` and `afterAll` teardown hooks (clearing global mock handlers, resetting Zustand stores, restoring fake timers).
4. **Permanent Regression Test Certification:** Confirm that all permanent regression suites verifying database RPC schemas, Edge Function normalization, Zustand cache synchronization, Haversine distance calculations, vibe tag filtering, and Playwright E2E viewport interactions remain clean, isolated, and strictly documented.

---

## 2. Comprehensive Test Suite & Fixture Audit

A total of 18 test, fixture, and mock files were added or modified during this track:

| Category | File Path | Phase Introduced / Modified | Audit Finding & Action |
| :--- | :--- | :--- | :--- |
| **Edge Functions** | `supabase/functions/search-wineries/index.test.ts` | Phase 1 | **Retain permanent regression tests.** Remove leftover debug `console.log("Error response data:", data)` on line 42. |
| **Database RPC** | `lib/services/__tests__/db-optimization.integration.test.ts` | Phase 2 | **Retain permanent integration tests.** Confirmed test records clean up via `afterAll`. No temporary scaffolding remains. |
| **Domain Utilities** | `lib/utils/__tests__/winery.test.ts` | Phase 2 | **Retain permanent unit tests.** Enforces `parseTriStateBoolean`, vibe tag tri-state preservation, and ghost visit prevention. Clean. |
| **Store Cache** | `lib/stores/__tests__/wineryStore.enrichment.test.ts` | Phase 3 | **Retain permanent unit tests.** Add `afterAll` hook to cleanly unbind global properties (`_WINERY_ENRICH_RPC`, `_WINERY_ENRICH_INVOKE`, `_WINERY_ENRICH_FROM`) to eliminate global test environment pollution. |
| **Filter Hook** | `hooks/__tests__/use-winery-filter.test.ts` | Phase 4 | **Retain permanent unit tests.** Verifies unified viewport bounds list and strict `=== true` Vibe Tag conjunctions. Clean store resets in `beforeEach`. |
| **Thumbnail Card** | `components/__tests__/winery-card-thumbnail.test.tsx` | Phase 4 | **Retain permanent component tests.** Hardened `afterEach` timer restoration (`jest.useRealTimers()`) to prevent timer leaks upon test assertion failures. |
| **Component Integration** | `components/__tests__/vibe-tag-filtering.test.tsx` | Phase 4 | **Retain permanent integration tests.** Add `afterAll` hook resetting `lastSourceProps` and Zustand stores to preserve isolation. |
| **Map Distance** | `lib/utils/__tests__/map-utils.test.ts` | Phase 5 | **Retain permanent unit tests.** Verifies Haversine formula, landmark accuracy, coordinate shape flexibility, and 5 km threshold. Clean. |
| **Overlay Button** | `components/map/__tests__/floating-search-area-button.test.tsx` | Phase 5 | **Retain permanent component tests.** Verifies visibility suppression, loading state, and store hydration. Clean. |
| **Canvas Integration** | `components/__tests__/WineryMap.test.tsx` | Phase 5 | **Retain permanent component tests.** Add `useMapStore.getState().reset()` to `beforeEach` and `afterEach` to prevent center/bounds pollution. |
| **Map Container** | `components/map/__tests__/MapView.test.tsx` | Phase 4 & 5 | **Retain permanent component tests.** Mapbox WebGL fallback, GeoJSON generation, and map pin vibe tag filtering tests are clean. |
| **Map Hook** | `hooks/__tests__/use-winery-map.test.ts` | Phase 5 | **Retain permanent hook tests.** Verifies `lastSearchedBounds` seeding on initial mount. Resets stores in `beforeEach`. Clean. |
| **Search Hook** | `hooks/__tests__/use-winery-search.test.ts` | Existing (Audit) | **Remove leftover debug artifacts.** Strip lines 114 and 118 `console.log("CALLING EXECUTE SEARCH")` and `console.log("DONE CALLING EXECUTE SEARCH")`. |
| **E2E Viewport Spec** | `e2e/map-viewport.spec.ts` | Phase 5 | **Retain permanent Playwright E2E spec.** Cleanly uses standard `window._E2E_SKIP_DETAILS_MOCK = true` and `waitForMapReady`. |
| **Mock Fixtures** | `lib/test-utils/fixtures.ts` | Phase 2 | **Retain permanent fixture definitions.** Standardized default ratings and tri-state vibe tags. Clean. |
| **E2E Markers Mock** | `e2e/fixtures/utils/mock-wineries.ts` | Phase 2 | **Retain permanent fixture definitions.** Fully synchronized with expanded `MapMarkerRpc` schema. Clean. |
| **E2E Fav Handler** | `e2e/fixtures/handlers/favorites.handler.ts` | Phase 2 | **Retain permanent route mock.** Synchronized mock route payloads with expanded RPC columns. Clean. |
| **Auxiliary Stores** | `lib/stores/__tests__/syncStatus.test.ts` & `visitStore.test.ts` | Phase 3 | **Retain permanent unit tests.** Standardized mock signatures for `getWinery` and `upsertWinery`. Clean. |

---

## 3. Invariants & Critical Guardrails

1. **Production Database Safety (`AGENTS.md` Section 2):**
   - Strictly no mutations against remote Supabase project (`jfsxclrdxmvftxacjuqf`).
2. **Container Runner Requirement (`AGENTS.md` Section 3):**
   - RHEL 8 glibc (2.28) is incompatible with Next.js 16.3+ native SWC. All Jest unit test runs MUST execute via `./scripts/run-jest-container.sh` with `BypassSandbox: true`.
   - Playwright E2E tests MUST execute via `./scripts/run-e2e-container.sh` with `BypassSandbox: true`.
3. **No Test Logic Regression:**
   - Cleanup must preserve 100% of functional test assertions. Do not remove or weaken any regression test assertions.
4. **Modal Approval Gate (`AGENTS.md` Section 2 & `conductor_antigravity.md`):**
   - Must halt for explicit user confirmation via native interactive modal before modifying any files.

---

## 4. Target Files & Semantic Insertion Anchors

### 4.1 Target File 1: `hooks/__tests__/use-winery-search.test.ts`
- **Path:** `hooks/__tests__/use-winery-search.test.ts`
- **Anchor:** Lines 110–120 in `describe("useWinerySearch") -> it("should handle search errors and set error in store")`.
- **Target Modification:** Remove debug `console.log` statements before and after `result.current.executeSearch`.

### 4.2 Target File 2: `supabase/functions/search-wineries/index.test.ts`
- **Path:** `supabase/functions/search-wineries/index.test.ts`
- **Anchor:** Lines 38–45 in `Deno.test("search-wineries handler - successful search")`.
- **Target Modification:** Remove leftover `if (res.status !== 200) { console.log("Error response data:", data); }` debug inspection block.

### 4.3 Target File 3: `components/__tests__/WineryMap.test.tsx`
- **Path:** `components/__tests__/WineryMap.test.tsx`
- **Anchor:** Lines 34–37 (`beforeEach`).
- **Target Modification:** Add `useMapStore.getState().reset()` to `beforeEach` and add `afterEach` hook to reset `useMapStore` so test cases setting `autoSearch`, `center`, and `lastSearchedBounds` do not leak state across test suites.

### 4.4 Target File 4: `components/__tests__/winery-card-thumbnail.test.tsx`
- **Path:** `components/__tests__/winery-card-thumbnail.test.tsx`
- **Anchor:** Line 14 (start of `describe('WineryCardThumbnail')`) and line 82 (`Operational Status Badges and Null Hours Resilience`).
- **Target Modification:** Add `afterEach(() => { jest.useRealTimers(); });` to ensure fake timers are restored even if assertion errors occur during test execution.

### 4.5 Target File 5: `lib/stores/__tests__/wineryStore.enrichment.test.ts`
- **Path:** `lib/stores/__tests__/wineryStore.enrichment.test.ts`
- **Anchor:** Lines 102–105 (`afterEach`).
- **Target Modification:** Add an `afterAll` hook deleting global properties `_WINERY_ENRICH_RPC`, `_WINERY_ENRICH_INVOKE`, `_WINERY_ENRICH_FROM`, and `_E2E_ENABLE_REAL_SYNC` from `globalThis`.

### 4.6 Target File 6: `components/__tests__/vibe-tag-filtering.test.tsx`
- **Path:** `components/__tests__/vibe-tag-filtering.test.tsx`
- **Anchor:** Lines 144–145 (end of `beforeEach`).
- **Target Modification:** Add `afterAll` hook resetting `lastSourceProps = null`, `useMapStore.getState().reset()`, and `useWineryStore.getState().reset()`.

---

## 5. Type Signatures & Prop Definitions

All audited files maintain strict TypeScript contracts with zero new `any` additions:

```typescript
// Verified existing interfaces retained without modification:
export interface CoordinatePoint {
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
}

export interface FloatingSearchAreaButtonProps {
  onClick?: () => void;
  autoSearch?: boolean;
  isSearching?: boolean;
  currentCenter?: { lat: number; lng: number };
  lastSearchedBounds?: SerializableBounds | null;
  className?: string;
}
```

---

## 6. Precise Behavioral Logic & Cleanup Specification

### 6.1 `hooks/__tests__/use-winery-search.test.ts`
- Remove lines:
  ```typescript
  console.log("CALLING EXECUTE SEARCH");
  ```
  and
  ```typescript
  console.log("DONE CALLING EXECUTE SEARCH");
  ```
- Ensure execution block retains:
  ```typescript
  await act(async () => {
    await result.current.executeSearch("Some Area");
  });
  ```

### 6.2 `supabase/functions/search-wineries/index.test.ts`
- Remove lines:
  ```typescript
  if (res.status !== 200) {
    console.log("Error response data:", data);
  }
  ```
- Keep direct assertion:
  ```typescript
  assertEquals(res.status, 200);
  assertEquals(data.length, 1);
  ```

### 6.3 `components/__tests__/WineryMap.test.tsx`
- Update `beforeEach`:
  ```typescript
  beforeEach(() => {
    jest.clearAllMocks();
    useMapStore.getState().reset();
  });

  afterEach(() => {
    useMapStore.getState().reset();
  });
  ```

### 6.4 `components/__tests__/winery-card-thumbnail.test.tsx`
- Add top-level `afterEach` inside `describe('WineryCardThumbnail', ...)`:
  ```typescript
  afterEach(() => {
    jest.useRealTimers();
  });
  ```

### 6.5 `lib/stores/__tests__/wineryStore.enrichment.test.ts`
- Add `afterAll` hook:
  ```typescript
  afterAll(() => {
    delete (globalThis as any)._WINERY_ENRICH_RPC;
    delete (globalThis as any)._WINERY_ENRICH_INVOKE;
    delete (globalThis as any)._WINERY_ENRICH_FROM;
    delete (globalThis as any)._E2E_ENABLE_REAL_SYNC;
  });
  ```

### 6.6 `components/__tests__/vibe-tag-filtering.test.tsx`
- Add `afterAll` hook:
  ```typescript
  afterAll(() => {
    lastSourceProps = null;
    useMapStore.getState().reset();
    useWineryStore.getState().reset();
  });
  ```

---

## 7. Execution Verification Protocol

Following file modifications, execute the following commands to empirically verify all cleanups:

### 7.1 Targeted Unit & Component Tests (Container Runner)
Run all audited and cleaned test files in the Podman container runner (`BypassSandbox: true`):

```bash
./scripts/run-jest-container.sh hooks/__tests__/use-winery-search.test.ts components/__tests__/WineryMap.test.tsx components/__tests__/winery-card-thumbnail.test.tsx lib/stores/__tests__/wineryStore.enrichment.test.ts components/__tests__/vibe-tag-filtering.test.tsx
```

**Expected Result:** All tests pass with zero assertion failures, zero console noise, and zero state leakage across test boundaries.

### 7.2 Edge Function Regression Tests
Run Deno Edge Function tests inside the sandbox:

```bash
npm run test:functions
```

**Expected Result:** All 6 Edge Function tests pass with zero unhandled log messages.

### 7.3 TypeScript Static Typecheck
Verify compilation and strict typing inside the sandbox:

```bash
npm run type-check
```

**Expected Result:** Zero TypeScript compiler errors.

---

## 8. Post-Execution Protocol & Git Notes

### 8.1 Update Track Plan
Update `conductor/tracks/explore-enrichment-sync_20261006/plan.md` checking off Phase 6 Task 1:
```markdown
## Phase 6: Test Suite Hardening, Scaffolding Cleanup & End-to-End Verification
- [x] Task: Audit and cleanup temporary test scaffolding [commit: <commit-sha>]
    - [x] Audit all test files and fixtures created during this track
    - [x] Remove any throwaway intermediate scaffolds, redundant fixtures, or obsolete tests
    - [x] Confirm all permanent regression tests are clean, robust, and well-documented
```

### 8.2 Git Commit & Git Notes
Stage modified files and commit using `BypassSandbox: true`:

```bash
git add hooks/__tests__/use-winery-search.test.ts supabase/functions/search-wineries/index.test.ts components/__tests__/WineryMap.test.tsx components/__tests__/winery-card-thumbnail.test.tsx lib/stores/__tests__/wineryStore.enrichment.test.ts components/__tests__/vibe-tag-filtering.test.tsx conductor/tracks/explore-enrichment-sync_20261006/plan.md conductor/tracks/explore-enrichment-sync_20261006/phase-6-task-1-plan.md
git commit -m "chore(tests): Audit and cleanup temporary test scaffolding and debug artifacts"
```

Attach git notes using the standard fields:
```bash
git notes add -m "Task: Audit and cleanup temporary test scaffolding
Summary: Audited all 18 test and fixture additions across Phases 1 through 5 of Issue #44. Confirmed permanent retention of regression test suites covering Places API field masks, database RPC markers, Zustand store cache synchronization, Haversine distance calculations, Vibe Tag filtering, and Playwright E2E viewport interactions. Cleaned up leftover debug console.log statements in use-winery-search.test.ts and search-wineries edge function tests. Hardened test isolation by introducing afterEach/afterAll teardowns in WineryMap.test.tsx, winery-card-thumbnail.test.tsx, wineryStore.enrichment.test.ts, and vibe-tag-filtering.test.tsx to prevent global mock and Zustand store leakage.
Files: hooks/__tests__/use-winery-search.test.ts, supabase/functions/search-wineries/index.test.ts, components/__tests__/WineryMap.test.tsx, components/__tests__/winery-card-thumbnail.test.tsx, lib/stores/__tests__/wineryStore.enrichment.test.ts, components/__tests__/vibe-tag-filtering.test.tsx, conductor/tracks/explore-enrichment-sync_20261006/plan.md, conductor/tracks/explore-enrichment-sync_20261006/phase-6-task-1-plan.md
Rationale: Fulfills Phase 6 Task 1 acceptance criteria ensuring no interim scaffolding or test pollution remains prior to full regression execution."
```
