# Implementation Plan: Phase 2 Task 3 - Write Failing Component Tests for TripCard `onNavigateTrip` Delegation (TDD Red Phase)

**Track:** `ios-pwa-testing_20261015` (Issue [#71](https://github.com/jarredb9/finger-lakes-app-57/issues/71))  
**Phase:** 2 (Domain Refactoring & Compatibility Seam)  
**Task:** 3 (Write failing component tests for TripCard `onNavigateTrip` delegation (TDD Red phase))  
**Specification Reference:** [spec.md](./spec.md)  
**Track Plan Reference:** [plan.md](./plan.md)  
**Workflow Reference:** [conductor/workflow.md](../../workflow.md)  
**Preceding Checkpoint Reference:** [Phase 2 Task 2 Commit: c18c2acd]  

---

## 1. Executive Summary & Seam Architecture

### 1.1 Objective
Establish rigorous, failing component tests in `components/__tests__/trip-card-simple.test.tsx` (TDD Red phase) that assert container delegation to canonical `handleTripNavigation` / `onNavigateTrip` across all supported navigation providers (Google Maps, Apple Maps, and Waze), while verifying backward-compatible fallback to `@deprecated` `handleExportToMaps` / `onExportToMaps`. These tests will fail against the current unrefactored `components/trip-card-simple.tsx` container and `components/TripCardSimplePresentational.tsx` component, establishing a deterministic verification barrier for Phase 2 Task 4 (Green phase).

### 1.2 Target Seam & Seam Boundary Analysis
1. **Target Test File:** [components/__tests__/trip-card-simple.test.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/__tests__/trip-card-simple.test.tsx)
   - Currently tests `TripCardSimple` (container) with only `handleExportToMaps` wired from `useTripActions`.
   - Fails to assert delegation to canonical `handleTripNavigation` or verify multi-provider selection ('apple', 'google', 'waze').
   - Fails to assert graceful fallback to `handleExportToMaps` when `handleTripNavigation` is absent.
2. **Target Container Component:** [components/trip-card-simple.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/trip-card-simple.tsx)
   - Current state:
     - Invokes `const { currentMembers, handleExportToMaps } = useTripActions(trip)`.
     - Completely ignores `handleTripNavigation` returned by `useTripActions`.
     - Passes only `onExportToMaps={handleExportToMaps}` to `TripCardSimplePresentational`.
     - Does not provide `onNavigateTrip`.
3. **Target Presentational Component:** [components/TripCardSimplePresentational.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/TripCardSimplePresentational.tsx)
   - Current state:
     - `TripCardSimpleProps` only defines `onExportToMaps: (provider?: NavigationProvider) => void`.
     - Lacks `onNavigateTrip` prop definition.
     - Hardwires dropdown menu items directly to `onExportToMaps('apple')`, `onExportToMaps('google')`, and `onExportToMaps('waze')`.
4. **Current Failure Mechanics (TDD Red Phase):**
   - When `useTripActions` mock supplies both `handleTripNavigation: mockHandleTripNavigation` and `handleExportToMaps: mockHandleExportToMaps`:
     - Clicking any navigation provider menu item in `TripCardSimple` currently triggers `mockHandleExportToMaps` via `onExportToMaps`.
     - `mockHandleTripNavigation` receives 0 calls.
     - Asserting `expect(mockHandleTripNavigation).toHaveBeenCalledWith(provider)` reliably fails against the unhardened container.

---

## 2. Invariants & Critical Guardrails

1. **TDD Task Granularity Invariant (`AGENTS.md` Section 5):**
   - This task is strictly the **Red Phase**. Only `components/__tests__/trip-card-simple.test.tsx` will be modified.
   - Do NOT modify `components/trip-card-simple.tsx`, `components/TripCardSimplePresentational.tsx`, `components/trip-card.tsx`, or `components/TripCardPresentational.tsx` during this task.
2. **Domain Vocabulary Invariant (`CONTEXT.md` & ADR 0006):**
   - The primary navigation callback must test the canonical domain term `handleTripNavigation` and prop `onNavigateTrip`.
   - Test suites must clearly distinguish canonical trip navigation from deprecated maps export.
3. **Backwards Compatibility Invariant (`spec.md` Section 2.1):**
   - The test matrix must verify that if `useTripActions` or upstream consumers only supply `handleExportToMaps`, the component still dispatches correctly to the selected provider without runtime errors.
4. **Containerized Execution Mandate (`AGENTS.md` Section 3):**
   - Test execution must occur via `./scripts/containers/run-jest-container.sh components/__tests__/trip-card-simple.test.tsx` with `BypassSandbox: true` due to host RHEL 8 glibc 2.28 compatibility requirements.
5. **Modal & Plan Approval Invariant (`AGENTS.md` Section 2 & Conductor Rule):**
   - No source or test files may be edited until explicit user approval is received via interactive modal (`ask_question`).

---

## 3. Blueprint Specifications

### 3.1 Target File: `components/__tests__/trip-card-simple.test.tsx`
- **Path:** `components/__tests__/trip-card-simple.test.tsx`
- **Semantic Insertion Anchors:**
  1. *Spy Declarations (Anchor: Lines 38-41):*
     - Add `const mockHandleTripNavigation = jest.fn();` alongside `mockHandleExportToMaps`.
  2. *Default Hook Mock in `beforeEach` (Anchor: Lines 59-65):*
     - Update `(useTripActions as jest.Mock).mockReturnValue(...)` to provide `handleTripNavigation: mockHandleTripNavigation` in addition to `handleExportToMaps: mockHandleExportToMaps`.
  3. *Canonical Delegation Test Suite (Anchor: Lines 67-85):*
     - Refactor the existing single test into a dedicated `describe('Trip Navigation Delegation', ...)` block asserting:
       - Canonical delegation to `mockHandleTripNavigation` when selecting Google Maps: `expect(mockHandleTripNavigation).toHaveBeenCalledWith('google')`.
       - Canonical delegation to `mockHandleTripNavigation` when selecting Apple Maps: `expect(mockHandleTripNavigation).toHaveBeenCalledWith('apple')`.
       - Canonical delegation to `mockHandleTripNavigation` when selecting Waze: `expect(mockHandleTripNavigation).toHaveBeenCalledWith('waze')`.
       - Verification that `mockHandleExportToMaps` is not invoked when the canonical handler is active.
  4. *Backwards Compatibility Fallback Test (Anchor: After canonical delegation tests):*
     - Add test scenario where `useTripActions` returns only `handleExportToMaps` (omitting or undefining `handleTripNavigation`).
     - Assert that clicking a navigation provider correctly falls back to calling `mockHandleExportToMaps(provider)`.

### 3.2 Full TypeScript Interfaces & Signatures

```typescript
import { NavigationProvider } from '@/lib/utils/trip-navigation';
import { Trip, TripMember, GooglePlaceId, WineryDbId } from '@/lib/types';
import { UseTripActionsReturn } from '@/hooks/use-trip-actions';

// Target Hook Signature (from hooks/use-trip-actions.ts)
export interface UseTripActionsReturn {
  selectedFriends: string[];
  currentMembers: TripMember[];
  handleTripNavigation: (provider?: NavigationProvider) => void;
  /** @deprecated Use handleTripNavigation instead. Retained for backwards compatibility. */
  handleExportToMaps: (provider?: NavigationProvider) => void;
  saveTripMembers: (membersToSave?: string[]) => Promise<void>;
}

// Container Props Interface (from components/trip-card-simple.tsx)
export interface TripCardSimpleContainerProps {
  trip: Trip;
  onDelete: (tripId: number) => void;
}

// Presentational Props Interface (contract target for Green phase in components/TripCardSimplePresentational.tsx)
export interface TripCardSimplePresentationalProps {
  trip: Trip;
  isOwner: boolean;
  currentMembers: TripMember[];
  onDelete: (tripId: number) => void;
  onShare: (id: string, name: string) => void;
  onNavigateTrip?: (provider?: NavigationProvider) => void;
  /** @deprecated Use onNavigateTrip instead. Retained for backwards compatibility. */
  onExportToMaps?: (provider?: NavigationProvider) => void;
}
```

### 3.3 Precise Behavioral Logic & State Transitions

1. **Test Setup & Mocks (`beforeEach`):**
   - Reset all mock functions (`mockOnDelete`, `mockOpenShareDialog`, `mockHandleTripNavigation`, `mockHandleExportToMaps`).
   - Mock `useTripActions` return value:
     ```typescript
     (useTripActions as jest.Mock).mockReturnValue({
       currentMembers: [],
       handleTripNavigation: mockHandleTripNavigation,
       handleExportToMaps: mockHandleExportToMaps,
       selectedFriends: [],
       saveTripMembers: jest.fn(),
     });
     ```
2. **Canonical Navigation Delegation Tests:**
   - **Scenario 1 (Google Maps):**
     - Render `<TripCardSimple trip={trip} onDelete={mockOnDelete} />` with `trip.wineries = [mockWinery]`.
     - Click `screen.getByRole('menuitem', { name: /Google Maps/i })`.
     - Assert `expect(mockHandleTripNavigation).toHaveBeenCalledWith('google')`.
     - **Expected Red Phase Result:** FAILS (0 calls received because container only binds `onExportToMaps={handleExportToMaps}`).
   - **Scenario 2 (Apple Maps):**
     - Render `<TripCardSimple trip={trip} onDelete={mockOnDelete} />`.
     - Click `screen.getByRole('menuitem', { name: /Apple Maps/i })`.
     - Assert `expect(mockHandleTripNavigation).toHaveBeenCalledWith('apple')`.
     - **Expected Red Phase Result:** FAILS (0 calls received).
   - **Scenario 3 (Waze):**
     - Render `<TripCardSimple trip={trip} onDelete={mockOnDelete} />`.
     - Click `screen.getByRole('menuitem', { name: /Waze/i })`.
     - Assert `expect(mockHandleTripNavigation).toHaveBeenCalledWith('waze')`.
     - **Expected Red Phase Result:** FAILS (0 calls received).
3. **Backwards Compatibility Fallback Test:**
   - **Scenario 4 (Legacy hook return without `handleTripNavigation`):**
     - Override hook mock:
       ```typescript
       (useTripActions as jest.Mock).mockReturnValue({
         currentMembers: [],
         handleTripNavigation: undefined,
         handleExportToMaps: mockHandleExportToMaps,
         selectedFriends: [],
         saveTripMembers: jest.fn(),
       });
       ```
     - Render `<TripCardSimple trip={trip} onDelete={mockOnDelete} />`.
     - Click `screen.getByRole('menuitem', { name: /Google Maps/i })`.
     - Assert `expect(mockHandleExportToMaps).toHaveBeenCalledWith('google')`.
     - **Expected Result:** Passes as backward compatibility fallback.

---

## 4. Execution Verification Protocol

### Exact Test Runner Command
Per repository standards, execute Jest tests in the container runner with `BypassSandbox: true`:

```bash
./scripts/containers/run-jest-container.sh components/__tests__/trip-card-simple.test.tsx
```

### Expected Red Phase Execution Result
1. The canonical delegation tests fail with assertion errors:
   - `Expected: "google"`, `Number of calls: 0` (or `mockHandleTripNavigation` not called).
2. Existing unrelated tests (`isOwner true`, `isOwner false`) continue to pass.
3. Test suite execution terminates with non-zero exit code indicating test failure, confirming Red Phase validity.

---

## 5. Post-Execution Hygiene & Conductor Commit Protocol

Upon verifying the test failures represent genuine delegation gaps:

1. **Commit Code:**
   - Stage `components/__tests__/trip-card-simple.test.tsx`.
   - Commit message:
     ```bash
     git commit -m "test(trip): add failing component tests for TripCard onNavigateTrip delegation"
     ```

2. **Attach Git Note:**
   - Retrieve commit hash: `TASK_COMMIT_SHA=$(git log -1 --format="%H")`.
   - Attach note with standard fields:
     ```bash
     git notes add -m "Task: Write failing component tests for TripCard \`onNavigateTrip\` delegation (TDD Red phase)
Summary: Added failing component test suite in components/__tests__/trip-card-simple.test.tsx asserting TripCardSimple container delegation to canonical handleTripNavigation across Google Maps, Apple Maps, and Waze providers, alongside backwards-compatible fallback to handleExportToMaps.
Files:
- components/__tests__/trip-card-simple.test.tsx
Rationale: Fulfills Phase 2 Task 3 of track ios-pwa-testing_20261015 (Issue #71) under the TDD Task Granularity Invariant." $TASK_COMMIT_SHA
     ```

3. **Update & Commit Track Plan:**
   - In [conductor/tracks/ios-pwa-testing_20261015/plan.md](file:///home/byrnesjd4821/Git/finger-lakes-app-57/conductor/tracks/ios-pwa-testing_20261015/plan.md), update Task 3 under Phase 2 to `[x]` with commit short hash:
     ```markdown
     - [x] Task: Write failing component tests for TripCard `onNavigateTrip` delegation (TDD Red phase) [commit: <short_sha>]
         - [x] Update `components/__tests__/trip-card-simple.test.tsx` asserting delegation to `onNavigateTrip` while maintaining backwards compatibility for `onExportToMaps` (fails against current containers)
         - [x] Verify failing tests via `./scripts/containers/run-jest-container.sh components/__tests__/trip-card-simple.test.tsx`
     ```
   - Commit plan update:
     ```bash
     git add conductor/tracks/ios-pwa-testing_20261015/plan.md
     git commit -m "conductor(plan): Mark task 'Write failing component tests for TripCard onNavigateTrip delegation' as complete"
     ```

---

## 6. Gating & Approval Invariant

- Static code inspection is complete.
- Implementation plan has been written to `conductor/tracks/ios-pwa-testing_20261015/phase-2-task-3-plan.md`.
- **Zero project source code or test files have been modified yet.**
- Execution requires explicit affirmative user approval via modal dialog (`ask_question`).
