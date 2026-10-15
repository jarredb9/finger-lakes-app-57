# Implementation Plan: Phase 2 Task 2 - Implement Canonical `handleTripNavigation` in `useTripActions` (TDD Green Phase)

**Track:** `ios-pwa-testing_20261015` (Issue [#71](https://github.com/jarredb9/finger-lakes-app-57/issues/71))  
**Phase:** 2 (Domain Refactoring & Compatibility Seam)  
**Task:** 2 (Implement canonical `handleTripNavigation` in `useTripActions` (TDD Green phase))  
**Specification Reference:** [spec.md](./spec.md)  
**Track Plan Reference:** [plan.md](./plan.md)  
**Workflow Reference:** [conductor/workflow.md](../../workflow.md)  
**Preceding Checkpoint Reference:** [Phase 2 Task 1 Commit: 1ed0abe4]  

---

## 1. Executive Summary & Seam Architecture

### 1.1 Objective
Implement the canonical `handleTripNavigation(provider: NavigationProvider = 'google')` handler in `hooks/use-trip-actions.ts` (TDD Green Phase), transitioning the failing test suite in `hooks/__tests__/use-trip-actions.test.ts` from Red to Green. Retain `handleExportToMaps` as a `@deprecated` backward-compatible alias that directly points by reference to `handleTripNavigation`, ensuring zero regressions across existing consumers (`TripCard`, `TripCardSimple`) while strictly complying with the project domain model (`CONTEXT.md` and ADR 0006).

### 1.2 Target Seam & Seam Boundary Analysis
1. **Target Hook:** [hooks/use-trip-actions.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/hooks/use-trip-actions.ts)
   - Current state:
     - Exports function `useTripActions(trip: Trip)`.
     - Returns `{ selectedFriends, currentMembers, handleExportToMaps, saveTripMembers }`.
     - Completely lacks `handleTripNavigation`.
     - Fails test assertions in `hooks/__tests__/use-trip-actions.test.ts` committed in Task 1 (`1ed0abe4`).
2. **Domain Model Alignment (`CONTEXT.md` & ADR 0006):**
   - Canonical Domain Concept: **Trip Navigation** via **Navigation Provider**.
   - Discouraged Terminology: "Maps export", "trip export", "route export".
   - Refactoring `useTripActions` to return `handleTripNavigation` establishes the canonical domain contract while retaining `handleExportToMaps` for backwards compatibility during Phase 2.
3. **The Seam Boundary Contract:**
   - `handleTripNavigation` is the primary handler function.
   - `handleExportToMaps` is assigned reference equivalence (`handleExportToMaps = handleTripNavigation`).
   - The returned object conforms to explicit interface `UseTripActionsReturn`.
4. **Target Test Suite:**
   - [hooks/__tests__/use-trip-actions.test.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/hooks/__tests__/use-trip-actions.test.ts)
   - Contains 13 unit tests verifying:
     - Friend fetching on mount.
     - Canonical `handleTripNavigation` existence and execution across Google Maps, Apple Maps, and Waze.
     - Empty/undefined winery guard early return.
     - Absence of asynchronous `navigator.geolocation` hops.
     - Sequential invocation safety without lockouts.
     - `@deprecated handleExportToMaps` alias delegation and identical behavior.
     - `saveTripMembers` success and error states.

---

## 2. Invariants & Critical Guardrails

1. **TDD Task Granularity Invariant (`AGENTS.md` Section 5):**
   - This task is strictly the **Green Phase** implementation. It modifies `hooks/use-trip-actions.ts` to satisfy the tests established in Task 1 without moving test goalposts.
2. **Domain Vocabulary Invariant (`CONTEXT.md` & ADR 0006):**
   - The primary exported action must be named `handleTripNavigation` accepting `NavigationProvider`.
3. **Backwards Compatibility Invariant (`spec.md` Section 2.1):**
   - `handleExportToMaps` must remain available on the returned hook object with identical signature and direct delegation (`expect(actions.handleExportToMaps).toBe(actions.handleTripNavigation)`).
4. **Synchronous Execution & Transient User Gesture Invariant (ADR 0006 & `spec.md` Section 2.1):**
   - Invocation of `launchTripNavigation(provider, trip.wineries)` must remain strictly synchronous within the user gesture event stack. No `async/await` hops or `navigator.geolocation` callbacks are permitted in the navigation path.
5. **Containerized Execution Mandate (`AGENTS.md` Section 3):**
   - Verification tests must be run via `./scripts/containers/run-jest-container.sh` with `BypassSandbox: true` due to host RHEL 8 glibc 2.28 compatibility requirements.

---

## 3. Blueprint Specifications

### 3.1 Target File: `hooks/use-trip-actions.ts`
- **Path:** `hooks/use-trip-actions.ts`
- **Semantic Insertion Anchors:**
  1. *Type Imports (Anchor: Line 2):* Update import from `@/lib/types` to include `TripMember`.
  2. *Return Type Interface (Anchor: Line 7, following imports):* Export interface `UseTripActionsReturn`.
  3. *Hook Return Signature & Implementation (Anchor: Lines 8-23):*
     - Add explicit return type `: UseTripActionsReturn` to `export function useTripActions(trip: Trip)`.
     - Implement `handleTripNavigation(provider: NavigationProvider = 'google')`.
     - Assign `const handleExportToMaps = handleTripNavigation;`.
  4. *Return Object (Anchor: Lines 34-39):*
     - Return `{ selectedFriends, currentMembers, handleTripNavigation, handleExportToMaps, saveTripMembers }`.

### 3.2 Full TypeScript Interfaces & Signatures

```typescript
import { NavigationProvider } from '@/lib/utils/trip-navigation';
import { Trip, TripMember } from '@/lib/types';

export interface UseTripActionsReturn {
  selectedFriends: string[];
  currentMembers: TripMember[];
  handleTripNavigation: (provider?: NavigationProvider) => void;
  /** @deprecated Use handleTripNavigation instead. Retained for backwards compatibility. */
  handleExportToMaps: (provider?: NavigationProvider) => void;
  saveTripMembers: (membersToSave?: string[]) => Promise<void>;
}

export function useTripActions(trip: Trip): UseTripActionsReturn;
```

### 3.3 Precise Behavioral Logic & State Transitions

1. **Friend Store Fetch on Mount:**
   - Preserve existing `useEffect(() => { fetchFriends(); }, [fetchFriends]);`.
2. **Canonical Navigation Handler (`handleTripNavigation`):**
   - **Signature:** `(provider: NavigationProvider = 'google') => void`
   - **Preconditions / Guards:**
     - Check `if (!trip.wineries || trip.wineries.length === 0) return;`
     - If empty or undefined, exit immediately without launching or opening windows.
   - **Execution:**
     - Call `launchTripNavigation(provider, trip.wineries)`.
     - Strictly synchronous execution, preserving transient user activation in Mobile Safari / WebKit.
3. **Deprecated Compatibility Alias (`handleExportToMaps`):**
   - Assign `const handleExportToMaps = handleTripNavigation;`.
   - Ensures strict reference equality (`handleExportToMaps === handleTripNavigation`).
4. **Member Persistence (`saveTripMembers`):**
   - Unchanged: maps `membersToSave || currentMembers.map(m => m.id)`, invokes `addMembersToTrip`, and displays corresponding toast on success or error.
5. **Return Shape:**
   - Return `{ selectedFriends, currentMembers, handleTripNavigation, handleExportToMaps, saveTripMembers }`.

---

## 4. Execution Verification Protocol

### Exact Test Runner Command
Per `AGENTS.md` and repository standards, execute Jest tests via the Podman container runner with `BypassSandbox: true`:

```bash
./scripts/containers/run-jest-container.sh hooks/__tests__/use-trip-actions.test.ts
```

### Expected Green Phase Execution Result
1. All 13 unit tests in `hooks/__tests__/use-trip-actions.test.ts` pass cleanly:
   - `fetches friends on mount` -> PASS
   - `handleTripNavigation (canonical)` suite (6 tests) -> PASS
   - `handleExportToMaps (@deprecated alias)` suite (5 tests) -> PASS
   - `saveTripMembers` suite (2 tests) -> PASS
2. Zero failures, 0 errors.

---

## 5. Post-Execution Hygiene & Conductor Commit Protocol

Upon verifying all tests pass:

1. **Commit Code:**
   - Stage `hooks/use-trip-actions.ts`.
   - Commit message:
     ```bash
     git commit -m "feat(trip): implement canonical handleTripNavigation in useTripActions"
     ```

2. **Attach Git Note:**
   - Retrieve commit hash: `TASK_COMMIT_SHA=$(git log -1 --format="%H")`.
   - Attach note with standard fields:
     ```bash
     git notes add -m "Task: Implement canonical \`handleTripNavigation\` in \`useTripActions\` (TDD Green phase)
Summary: Exported UseTripActionsReturn interface and canonical handleTripNavigation from hooks/use-trip-actions.ts with synchronous dispatch across Google Maps, Apple Maps, and Waze. Maintained @deprecated handleExportToMaps alias pointing by reference to handleTripNavigation for non-breaking backward compatibility. All 13 unit tests pass.
Files:
- hooks/use-trip-actions.ts
Rationale: Fulfills Phase 2 Task 2 of track ios-pwa-testing_20261015 (Issue #71) under the TDD Task Granularity Invariant." $TASK_COMMIT_SHA
     ```

3. **Update & Commit Track Plan:**
   - In [conductor/tracks/ios-pwa-testing_20261015/plan.md](file:///home/byrnesjd4821/Git/finger-lakes-app-57/conductor/tracks/ios-pwa-testing_20261015/plan.md), update Task 2 under Phase 2 to `[x]` with commit short hash:
     ```markdown
     - [x] Task: Implement canonical `handleTripNavigation` in `useTripActions` (TDD Green phase) [commit: <short_sha>]
         - [x] Export `handleTripNavigation` and provide `handleExportToMaps` as `@deprecated` alias in `hooks/use-trip-actions.ts`
         - [x] Verify test suite passes via `./scripts/containers/run-jest-container.sh hooks/__tests__/use-trip-actions.test.ts`
     ```
   - Commit plan update:
     ```bash
     git add conductor/tracks/ios-pwa-testing_20261015/plan.md
     git commit -m "conductor(plan): Mark task 'Implement canonical handleTripNavigation in useTripActions' as complete"
     ```

---

## 6. Gating & Approval Invariant

- Static code inspection is complete.
- Implementation plan has been written to `conductor/tracks/ios-pwa-testing_20261015/phase-2-task-2-plan.md`.
- **Zero project source code or test files have been modified yet.**
- Execution requires explicit affirmative user approval via modal dialog (`ask_question`).
