# Implementation Plan: Phase 7 Task 2 - Full Suite Verification & Build Audit

**Track:** `initial-trip-creation-wineries_20261002` (Issue [#57](https://github.com/jarredb9/finger-lakes-app-57/issues/57))  
**Phase:** 7 (End-to-End Verification & Final Quality Gates)  
**Task:** 2 (Full Suite Verification & Build Audit)  
**Specification Reference:** [spec.md](./spec.md) (Sections 3.1–3.9, Section 4, Section 5, Section 6)  
**Track Plan Reference:** [plan.md](./plan.md) (Phase 7, Task 2)  
**Preceding Task Plan Reference:** [phase-7-task-1-plan.md](./phase-7-task-1-plan.md)  

---

## 1. Objective & Seam-Bounded Architecture

### 1.1 Objective
Execute the repository-wide test verification, static analysis, local database type auditing, production container build, and strict scaffolding cleanup for Issue [#57](https://github.com/jarredb9/finger-lakes-app-57/issues/57).

Throughout Phases 1 through 7 Task 1, comprehensive architectural solutions and test suites were implemented following strict Test-Driven Development (Red-Green-Refactor):
1. **Phase 1:** PostgreSQL RPC coordinate standardization in `add_winery_to_trip` supporting `latitude`/`longitude` alongside legacy `lat`/`lng`.
2. **Phase 2:** Test suite decomposition (extracting auth forms) and controlled `<FormField>` binding for `PlaceAutocomplete` and selected winery badges in `TripForm`.
3. **Phase 3:** `PlaceAutocomplete` selection UX invariants: `clearOnSelect: true` input clearing, debounced query suppression via programmatic selection guard, and suggestion dismissal.
4. **Phase 4:** Dual-key coordinate serialization in `WineryService.getRpcData`, polymorphic chaining in `TripService.addWineryToExistingTrip`, positive database ID validation, and atomic rollback with offline enqueue suppression (`preventOfflineEnqueue = true`).
5. **Phase 5:** Offline sync parity in `syncService.ts` delegating `create_trip` to `TripService.createTrip` to prevent dropping stops 2+ and maintaining `wineries_count`.
6. **Phase 6:** Store count population in `tripMutationHelpers.ts`, background cache refresh (`fetchUpcomingTrips`, `fetchTripsForDate`, `fetchTrips`), badge pluralization in `TripCardSimplePresentational.tsx`, eager stop hydration in `TripService.getTrips`, and export button guards.
7. **Phase 7 Task 1:** Playwright WebKit E2E integration verification in `e2e/trip-flow.spec.ts` exercising complete dialog multi-stop trip creation, `clearOnSelect` UX, badge removal, store sync, pluralized count, enabled maps export (AC 15), and deletion teardown.

The objective of Phase 7 Task 2 is to audit the entire repository and execute every quality gate to certify that the codebase is completely green, strongly typed, production-build ready, and free of any temporary or throwaway scaffolding artifacts.

---

### 1.2 Test Retention & Invariant Audit Inventory

All 14 test suites created or modified across this track are audited and confirmed for permanent retention as regression coverage:

| # | Test Suite File | Phase | Scope & Covered Invariants | Retention Status |
|---|---|---|---|---|
| 1 | [`lib/services/__tests__/supabase-rpc.integration.test.ts`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/services/__tests__/supabase-rpc.integration.test.ts) | Phase 1 | Verifies that PostgreSQL RPC `add_winery_to_trip` correctly persists numeric coordinates when called with `latitude`/`longitude` JSON keys. | **Permanent** (Retained) |
| 2 | [`components/__tests__/auth-forms.test.tsx`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/__tests__/auth-forms.test.tsx) | Phase 2 | Extracted auth form tests (`LoginForm`, `ForgotPasswordForm`, `ManualConfirmForm`) isolating authentication tests from trip forms. | **Permanent** (Retained) |
| 3 | [`components/__tests__/trip-form.test.tsx`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/__tests__/trip-form.test.tsx) | Phase 2 & 3 | Verifies controlled `<FormField>` binding, `PlaceAutocomplete` selection, removable winery badges, selection deduplication, and payload delivery to `createTrip`. | **Permanent** (Retained) |
| 4 | [`components/__tests__/PlaceAutocomplete.test.tsx`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/__tests__/PlaceAutocomplete.test.tsx) | Phase 3 | Verifies `clearOnSelect: true` input clearing, programmatic selection guard suppressing debounced re-queries, error recovery retaining typed text, and default `clearOnSelect: false` behavior for `MapSearchBar`. | **Permanent** (Retained) |
| 5 | [`lib/services/__tests__/tripService.mutations.test.ts`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/services/__tests__/tripService.mutations.test.ts) | Phase 4 | Verifies dual-key coordinate emission in `WineryService.getRpcData`, polymorphic winery object/numeric ID routing, non-positive ID rejection, and chained addition failure rollback with `preventOfflineEnqueue = true`. | **Permanent** (Retained) |
| 6 | [`lib/stores/__tests__/tripStore.syncStore.test.ts`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/stores/__tests__/tripStore.syncStore.test.ts) | Phase 5 | Verifies offline `create_trip` replay through `SyncService` creates all planned winery stops without dropping stops 2+ and populates `wineries_count`. | **Permanent** (Retained) |
| 7 | [`lib/services/__tests__/syncService.test.ts`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/services/__tests__/syncService.test.ts) | Phase 5 | Verifies `SyncService` delegates `create_trip` to `TripService.createTrip` with idempotency key and handles offline replay synchronization. | **Permanent** (Retained) |
| 8 | [`lib/stores/slices/__tests__/tripMutationHelpers.test.ts`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/stores/slices/__tests__/tripMutationHelpers.test.ts) | Phase 6 | Verifies `wineries_count` population on `tempTrip` and `syncedTrip`, background cache invalidation trigger, `preventOfflineEnqueue` offline bypass, and `replaceTripTempId` count normalization. | **Permanent** (Retained) |
| 9 | [`components/__tests__/TripCardSimplePresentational.test.tsx`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/__tests__/TripCardSimplePresentational.test.tsx) | Phase 6 | Verifies badge pluralization (`0 Wineries`, `1 Winery`, `2 Wineries`), syncing indicator, and export to Google Maps disabled state guard (`isPending || count === 0 || !trip.wineries || trip.wineries.length === 0`). | **Permanent** (Retained) |
| 10 | [`components/__tests__/trip-card-simple.test.tsx`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/__tests__/trip-card-simple.test.tsx) | Phase 6 | Verifies `TripCardSimple` container delegates correctly to `TripCardSimplePresentational` and binds `useTripActions` hook callbacks. | **Permanent** (Retained) |
| 11 | [`components/__tests__/selectorHygiene.test.tsx`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/__tests__/selectorHygiene.test.tsx) | Phase 6 | Verifies ST-10 selector hygiene: `TripCardSimple` does not re-render upon unrelated mutations to `userStore` or `uiStore`. | **Permanent** (Retained) |
| 12 | [`hooks/__tests__/use-trip-actions.test.ts`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/hooks/__tests__/use-trip-actions.test.ts) | Phase 6 | Verifies `useTripActions` Google Maps URL generation, stop ordering, and disabled state invariants when stops are empty. | **Permanent** (Retained) |
| 13 | [`lib/services/__tests__/tripService.test.ts`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/services/__tests__/tripService.test.ts) | Phase 6 | Verifies `TripService.getTrips` eager hydration of nested `trip_wineries`, visit order sorting, and standardized winery stop mapping. | **Permanent** (Retained) |
| 14 | [`e2e/trip-flow.spec.ts`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/e2e/trip-flow.spec.ts) | Phase 7 | Verifies full cross-seam WebKit browser flow: dialog launch, multi-stop autocomplete selection, `clearOnSelect` UX, badge removal, card rendering with "2 Wineries" and enabled maps export (AC 15), and deletion teardown. | **Permanent** (Retained) |

---

## 2. Invariants & Critical Guardrails

1. **Production Database Safety (`AGENTS.md` Guardrail 1):**
   - Strictly zero migrations, DDL, or DML mutations executed against remote Supabase project (`jfsxclrdxmvftxacjuqf`).
   - All database inspection and type validation must target the local stack via `npm run db:check-types:local`.
2. **Container Runner Mandates (`AGENTS.md` Section 3):**
   - Due to RHEL 8 glibc 2.28 compatibility constraints with Next.js native SWC (glibc >= 2.29), all Jest test runs, Playwright E2E tests, and production builds must run via container runner scripts with `BypassSandbox: true`:
     - Unit Tests: `./scripts/run-jest-container.sh`
     - Integration Tests: `TEST_TYPE=integration ./scripts/run-jest-container.sh`
     - Playwright E2E: `./scripts/run-e2e-container.sh webkit e2e/trip-flow.spec.ts`
     - Production Build: `./scripts/run-build-container.sh`
3. **TypeScript & Linter Integrity:**
   - `npm run type-check` must report 0 errors across all source and test files.
   - `npm run lint` must pass with 0 errors and zero unjustified warnings.
4. **Modal Approval Invariant (`AGENTS.md` Section 2 & `conductor_antigravity.md`):**
   - In accordance with Conductor rules, planning must be strictly non-mutating.
   - Halts for explicit affirmative user approval via native modal (`ask_question`) before executing any commands or modifying `plan.md`.

---

## 3. Target Files & Exact Drop-in Specifications

### 3.1 Target File: `conductor/tracks/initial-trip-creation-wineries_20261002/plan.md`
- **Path:** `conductor/tracks/initial-trip-creation-wineries_20261002/plan.md`
- **Action:** Mark Phase 7 Task 2 as completed upon successful execution of all verification stages.

#### Drop-in Chunk 1: Update Task Status
- **StartLine:** 117
- **EndLine:** 120
- **Instruction:** Mark `Task: Full Suite Verification & Build Audit` and its subtasks as complete.

**TargetContent:**
```markdown
- [ ] Task: Full Suite Verification & Build Audit
    - [ ] Run full unit test suite via container runner (`./scripts/run-jest-container.sh`).
    - [ ] Run type checking and container build (`npm run db:check-types:local`).
    - [ ] Perform strict scaffolding audit: ensure zero temporary or throwaway test files exist.
```

**ReplacementContent:**
```markdown
- [x] Task: Full Suite Verification & Build Audit
    - [x] Run full unit test suite via container runner (`./scripts/run-jest-container.sh`).
    - [x] Run type checking and container build (`npm run db:check-types:local`).
    - [x] Perform strict scaffolding audit: ensure zero temporary or throwaway test files exist.
```

---

## 4. Execution Verification Protocol

Following user confirmation, the executor must run the following verification stages sequentially. Every command must succeed before marking the task complete.

### Stage 1: Full Unit Test Suite (Containerized Jest)
Executes all unit tests across components, stores, hooks, services, and utilities:
```bash
./scripts/run-jest-container.sh
```
> [!NOTE]
> Requires `BypassSandbox: true`.
- **Expected Outcome:** 100% test pass across all unit test suites in the repository, confirming zero regressions introduced by this track's refactorings.

### Stage 2: Database RPC Integration Test Suite (Containerized Jest)
Executes the Supabase RPC integration test suite against the local running database stack:
```bash
TEST_TYPE=integration ./scripts/run-jest-container.sh lib/services/__tests__/supabase-rpc.integration.test.ts
```
> [!NOTE]
> Requires `BypassSandbox: true`.
- **Expected Outcome:** Passes cleanly, verifying that `add_winery_to_trip` persists numeric coordinates with `latitude`/`longitude` and `lat`/`lng`.

### Stage 3: Phase 7 Playwright E2E Integration Suite (Containerized WebKit)
Executes the end-to-end multi-stop trip creation test in WebKit:
```bash
./scripts/run-e2e-container.sh webkit e2e/trip-flow.spec.ts
```
> [!NOTE]
> Requires `BypassSandbox: true`.
- **Expected Outcome:** 2 passing tests in `e2e/trip-flow.spec.ts` (`can create a new trip with initial winery stops from dialog` and `can create a new trip from winery details`).

### Stage 4: Static Type Checking
Verifies TypeScript compilation across all application source and test files:
```bash
npm run type-check
```
- **Expected Outcome:** Exits with code 0 and reports 0 TypeScript errors.

### Stage 5: Local Database Type Synchronization Audit
Verifies that generated TypeScript database types match the current local Supabase database schema:
```bash
npm run db:check-types:local
```
> [!NOTE]
> Requires `BypassSandbox: true`.
- **Expected Outcome:** `diff lib/database.types.ts lib/database.types.tmp.ts` outputs no differences, confirming database schema and types are 100% in sync.

### Stage 6: ESLint Code Quality Check
Executes ESLint across all JavaScript, TypeScript, and Playwright spec files:
```bash
npm run lint
```
- **Expected Outcome:** Exits with code 0 and 0 errors.

### Stage 7: Next.js Production Build in Container
Executes the Next.js production build inside the container runner:
```bash
./scripts/run-build-container.sh
```
> [!NOTE]
> Requires `BypassSandbox: true`.
- **Expected Outcome:** Production build completes successfully with static and dynamic routes compiled, confirming zero server-side rendering or bundle packaging issues.

---

## 5. Scaffolding & Hygiene Audit

### 5.1 Temporary File & Working Tree Cleanliness
1. **No Temporary Artifacts:**
   - Audit `git status` and confirm working tree is clean.
   - Verify zero `.tmp`, `.bak`, `.orig`, `build.log`, or intermediate scratch files exist.
2. **Mock & Spy Cleanup:**
   - Audit all test files to verify that all `jest.spyOn()` calls invoke `.mockRestore()` in `finally` or test teardown blocks.
   - Verify that fake timer invocations (`jest.useFakeTimers()`) are paired with `jest.useRealTimers()`.
   - Verify that stores are cleanly reset in `beforeEach()` hooks (`useTripStore.getState().reset()`, `useWineryStore.getState().reset()`, etc.).
3. **No Dead or Orphaned Test Files:**
   - Confirm legacy `components/__tests__/react19-form-actions.test.tsx` remains deleted and replaced by `auth-forms.test.tsx` and `trip-form.test.tsx`.

---

## 6. Execution Gate & User Modal Confirmation

In accordance with Conductor specification-driven standards and `AGENTS.md` Invariant 5:
- Static inspection of all affected seams is complete.
- This plan has been written directly to `conductor/tracks/initial-trip-creation-wineries_20261002/phase-7-task-2-plan.md`.
- **HALT:** Prompt the user via native modal (`ask_question`) for affirmative approval before running any verification commands or updating `plan.md`.
