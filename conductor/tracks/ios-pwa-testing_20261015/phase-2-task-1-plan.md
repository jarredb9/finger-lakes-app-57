# Implementation Plan: Phase 2 Task 1 - Write Failing Tests for Canonical `handleTripNavigation` in `useTripActions` (TDD Red Phase)

**Track:** `ios-pwa-testing_20261015` (Issue [#71](https://github.com/jarredb9/finger-lakes-app-57/issues/71))  
**Phase:** 2 (Domain Refactoring & Compatibility Seam)  
**Task:** 1 (Write failing tests for canonical `handleTripNavigation` in `useTripActions` (TDD Red phase))  
**Specification Reference:** [spec.md](./spec.md)  
**Track Plan Reference:** [plan.md](./plan.md)  
**Workflow Reference:** [conductor/workflow.md](../../workflow.md)  
**Preceding Checkpoint Reference:** [Phase 1 Checkpoint: 98052054]  

---

## 1. Executive Summary & Seam Architecture

### 1.1 Objective
Establish comprehensive failing tests in `hooks/__tests__/use-trip-actions.test.ts` (TDD Red Phase) asserting the canonical `handleTripNavigation(provider?: NavigationProvider)` handler in `useTripActions` across all supported navigation providers (Google Maps, Apple Maps, Waze), and asserting that the `@deprecated handleExportToMaps` alias delegates directly to `handleTripNavigation`.

This test suite intentionally fails against the current implementation of `hooks/use-trip-actions.ts`, which only exports `handleExportToMaps` and completely lacks `handleTripNavigation`.

### 1.2 Target Seam & Seam Boundary Analysis
1. **Target Hook:** [hooks/use-trip-actions.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/hooks/use-trip-actions.ts)
   - Current implementation:
     - Returns `{ selectedFriends, currentMembers, handleExportToMaps, saveTripMembers }`.
     - `handleExportToMaps(provider: NavigationProvider = 'google')` checks `if (!trip.wineries || trip.wineries.length === 0) return;` and calls `launchTripNavigation(provider, trip.wineries)`.
     - Lacks `handleTripNavigation`.
2. **Domain Model Alignment (`CONTEXT.md` & ADR 0006):**
   - In accordance with the canonical domain vocabulary (`CONTEXT.md`):
     - **Trip Navigation**: "The action of launching an external turn-by-turn navigation application to guide a user along a Trip's sequence of planned Trip Stops. *Avoid*: Maps export, trip export, GPS export, route export."
     - **Navigation Provider**: "An external turn-by-turn navigation mapping service (such as Apple Maps, Google Maps, or Waze) selected by the user to route a Trip. *Avoid*: Map provider, routing service, export target."
   - The symbol `handleExportToMaps` violates the domain model by using the discouraged "Maps export" terminology.
   - Refactoring `useTripActions` to expose canonical `handleTripNavigation` while maintaining `@deprecated handleExportToMaps` creates a non-breaking compatibility seam across the codebase.
3. **The Architectural Flaw (The Red Phase Target):**
   - When consumers attempt to destructure or invoke `handleTripNavigation` from `useTripActions(trip)`, the property is `undefined`.
   - In tests, accessing or executing `result.current.handleTripNavigation` results in `TypeError: result.current.handleTripNavigation is not a function` or returns `undefined`.
   - Asserting reference equality or delegation between `handleExportToMaps` and `handleTripNavigation` fails because `handleTripNavigation` does not exist on the current hook.
4. **Target Test File:**
   - [hooks/__tests__/use-trip-actions.test.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/hooks/__tests__/use-trip-actions.test.ts)
   - Tested in JSDOM via Jest using `@testing-library/react` (`renderHook`, `act`).

---

## 2. Invariants & Critical Guardrails

1. **TDD Task Granularity Invariant (`AGENTS.md` Section 5):**
   - This plan covers exclusively Phase 2 Task 1 (Red Phase). No modifications to production code in `hooks/use-trip-actions.ts` are permitted during this task.
   - The test suite must demonstrate empirical failure when executed against current `hooks/use-trip-actions.ts`.
2. **Domain Vocabulary Invariant (`CONTEXT.md`):**
   - The canonical operation is `Trip Navigation` via `NavigationProvider`. The hook must provide `handleTripNavigation` as its primary API.
3. **Backwards Compatibility Invariant (`spec.md` Section 2.1):**
   - `handleExportToMaps` must be retained as a `@deprecated` alias delegating directly to `handleTripNavigation`. Existing consumer tests and components must not break.
4. **Synchronous Execution & Transient User Gesture Invariant (ADR 0006 & `spec.md` Section 2.1):**
   - Navigation launches must occur synchronously upon user interaction (`window.open` called directly within the event stack) without asynchronous promises or delays (e.g. `navigator.geolocation.getCurrentPosition`), preventing Safari popup blocker suppression.
5. **Containerized Execution Mandate (`AGENTS.md` Section 3):**
   - Unit tests must be executed via `./scripts/containers/run-jest-container.sh` with `BypassSandbox: true` due to host RHEL 8 glibc 2.28 compatibility requirements.

---

## 3. Blueprint Specifications

### 3.1 Target File: `hooks/__tests__/use-trip-actions.test.ts`
- **Path:** `hooks/__tests__/use-trip-actions.test.ts`
- **Semantic Insertion Anchors:**
  1. *Type Interfaces (Anchor: Lines 8-9, following imports):* Add `UseTripActionsReturn` interface defining expected hook return shape to allow strict typing without TS compile errors during Red phase.
  2. *Canonical Test Suite (Anchor: Line 74, immediately preceding existing `describe('handleExportToMaps')`):* Insert `describe('handleTripNavigation (canonical)', () => { ... })`.
  3. *Deprecated Alias Suite (Anchor: Existing Line 75 `describe('handleExportToMaps')`):* Update the existing suite heading to `describe('handleExportToMaps (@deprecated alias)', () => { ... })` and add explicit delegation assertions.

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

export type UseTripActionsHook = (trip: Trip) => UseTripActionsReturn;
```

### 3.3 Test Matrix & Behavioral Logic

#### Group 1: Canonical `handleTripNavigation` Suite
1. **Hook Surface & Function Existence:**
   - Setup: Render hook with standard trip `createMockTrip({ id: 1 })`.
   - Cast: `const actions = result.current as unknown as UseTripActionsReturn;`
   - Assertion: `expect(typeof actions.handleTripNavigation).toBe('function');`
   - **Empirical Red Phase Failure Point:** In current `useTripActions`, `handleTripNavigation` is not returned. Evaluates to `'undefined'`. FAILS:
     ```
     Expected: "function"
     Received: "undefined"
     ```

2. **Empty / Undefined Winery Guard:**
   - Setup: Render hook with trip having `wineries: []`.
   - Action: `act(() => { actions.handleTripNavigation('google'); });`
   - Assertion: `expect(window.open).not.toHaveBeenCalled();`

3. **Default Provider Synchronous Launch (Google Maps):**
   - Setup: Render hook with trip containing `[mockWinery1, mockWinery2]`. Mock `navigator.geolocation.getCurrentPosition`.
   - Action: `act(() => { actions.handleTripNavigation(); });` (invoked without arguments).
   - Assertions:
     - `expect(mockGetCurrentPosition).not.toHaveBeenCalled();`
     - `expect(window.open).toHaveBeenCalledWith(expect.stringContaining('google.com/maps/dir/'), '_blank', 'noopener,noreferrer');`

4. **Explicit Provider Launch: Apple Maps:**
   - Setup: Render hook with trip containing `[mockWinery1, mockWinery2]`.
   - Action: `act(() => { actions.handleTripNavigation('apple'); });`
   - Assertions:
     - `expect(mockGetCurrentPosition).not.toHaveBeenCalled();`
     - `expect(window.open).toHaveBeenCalledWith(expect.stringContaining('maps.apple.com'), '_blank', 'noopener,noreferrer');`

5. **Explicit Provider Launch: Waze:**
   - Setup: Render hook with trip containing `[mockWinery1, mockWinery2]`.
   - Action: `act(() => { actions.handleTripNavigation('waze'); });`
   - Assertions:
     - `expect(mockGetCurrentPosition).not.toHaveBeenCalled();`
     - `expect(window.open).toHaveBeenCalledWith(expect.stringContaining('waze.com/ul'), '_blank', 'noopener,noreferrer');`

6. **Sequential Invocations & Lockout Freedom:**
   - Setup: Render hook with mock wineries.
   - Action: Call `actions.handleTripNavigation('google')` then `actions.handleTripNavigation('apple')`.
   - Assertion: `expect(window.open).toHaveBeenCalledTimes(2);`

#### Group 2: `@deprecated handleExportToMaps` Alias & Delegation Suite
1. **Direct Delegation & Reference Equivalence:**
   - Setup: Render hook with standard trip.
   - Cast: `const actions = result.current as unknown as UseTripActionsReturn;`
   - Assertion: `expect(actions.handleExportToMaps).toBe(actions.handleTripNavigation);`
   - **Empirical Red Phase Failure Point:** In current `useTripActions`, `handleExportToMaps` is a defined function while `handleTripNavigation` is `undefined`. FAILS with:
     ```
     Expected: undefined
     Received: [Function handleExportToMaps]
     ```

2. **Backwards-Compatible Invocation:**
   - Retain existing tests for `handleExportToMaps` verifying that invoking `handleExportToMaps('google')`, `handleExportToMaps('apple')`, and `handleExportToMaps('waze')` continues to work seamlessly.

---

## 4. Execution Verification Protocol

### Exact Test Runner Command
Per `AGENTS.md` and repository standards, execute Jest tests via the Podman container runner with `BypassSandbox: true`:

```bash
./scripts/containers/run-jest-container.sh hooks/__tests__/use-trip-actions.test.ts
```

### Expected Red Phase Execution Result
1. The updated test file `hooks/__tests__/use-trip-actions.test.ts` executes in the container.
2. The friend fetching, `saveTripMembers`, and existing navigation window launch assertions pass.
3. The new canonical `handleTripNavigation` tests and the delegation equality test **FAIL** with:
   ```text
   ● useTripActions › handleTripNavigation (canonical) › exposes canonical handleTripNavigation as a function

     expect(received).toBe(expected) // Object.is equality

     Expected: "function"
     Received: "undefined"

   ● useTripActions › handleExportToMaps (@deprecated alias) › maintains @deprecated handleExportToMaps alias delegating directly to handleTripNavigation

     expect(received).toBe(expected) // Object.is equality

     Expected: undefined
     Received: [Function handleExportToMaps]
   ```
4. This confirms that the test suite empirically reproduces the absence of `handleTripNavigation` and establishes the Red Phase baseline for Phase 2 Task 2 (Green Phase implementation).

---

## 5. Post-Execution Hygiene & Conductor Commit Protocol

Upon verifying the expected Red Phase failures:

1. **Commit Code:**
   - Stage `hooks/__tests__/use-trip-actions.test.ts`.
   - Commit message:
     ```bash
     git commit -m "test(trip): add failing tests for canonical handleTripNavigation in useTripActions"
     ```

2. **Attach Git Note:**
   - Retrieve commit hash: `TASK_COMMIT_SHA=$(git log -1 --format="%H")`.
   - Attach note with standard fields:
     ```bash
     git notes add -m "Task: Write failing tests for canonical \`handleTripNavigation\` in \`useTripActions\` (TDD Red phase)
Summary: Updated hooks/__tests__/use-trip-actions.test.ts with canonical handleTripNavigation test matrix (empty winery guards, Google Maps default/explicit, Apple Maps, Waze, and sequential execution) and asserted that deprecated handleExportToMaps alias delegates directly to handleTripNavigation. Established empirical failing assertions against current hook.
Files:
- hooks/__tests__/use-trip-actions.test.ts
Rationale: Fulfills Phase 2 Task 1 of track ios-pwa-testing_20261015 (Issue #71) under the TDD Task Granularity Invariant." $TASK_COMMIT_SHA
     ```

3. **Update & Commit Track Plan:**
   - In [conductor/tracks/ios-pwa-testing_20261015/plan.md](file:///home/byrnesjd4821/Git/finger-lakes-app-57/conductor/tracks/ios-pwa-testing_20261015/plan.md), update Task 1 under Phase 2 to `[x]` with commit short hash:
     ```markdown
     - [x] Task: Write failing tests for canonical `handleTripNavigation` in `useTripActions` (TDD Red phase) [commit: <short_sha>]
     ```
   - Commit plan update:
     ```bash
     git add conductor/tracks/ios-pwa-testing_20261015/plan.md
     git commit -m "conductor(plan): Mark task 'Write failing tests for canonical handleTripNavigation in useTripActions' as complete"
     ```

---

## 6. Gating & Approval Invariant

- Static code inspection is complete.
- Implementation plan has been written to `conductor/tracks/ios-pwa-testing_20261015/phase-2-task-1-plan.md`.
- **Zero project source code or test files have been modified yet.**
- Execution requires explicit affirmative user approval via modal dialog (`ask_question`).
