# Implementation Plan: Phase 1 Task 3 - Write Failing Component Tests for `PwaHandler` and `UserNav` Standalone Suppression (TDD Red Phase)

**Track:** `ios-pwa-testing_20261015` (Issue [#71](https://github.com/jarredb9/finger-lakes-app-57/issues/71))  
**Phase:** 1 (Unit & Component Test Matrix)  
**Task:** 3 (Write failing component tests for `PwaHandler` and `UserNav` standalone suppression (TDD Red phase))  
**Specification Reference:** [spec.md](./spec.md)  
**Track Plan Reference:** [plan.md](./plan.md)  
**Workflow Reference:** [conductor/workflow.md](../../workflow.md)  
**Preceding Task Reference:** [phase-1-task-2-plan.md](./phase-1-task-2-plan.md)

---

## 1. Executive Summary & Seam Architecture

### 1.1 Objective
Establish failing component tests in `components/__tests__/PwaHandler.test.tsx` and complementary standalone suppression assertions in `components/nav/__tests__/user-nav.test.tsx` (TDD Red Phase). This test matrix enforces UI suppression invariants across both global PWA install surfaces when running in Standalone Mode (`isStandalone: true`):
1. Suppressing the mobile top banner (`data-testid="mobile-pwa-install-bar"`) and desktop floating card (`data-testid="desktop-pwa-install-card"`) in `PwaHandler`.
2. Suppressing the `"Install App"` and `"Add to Home Screen"` dropdown menu items in `UserNav`.

The test suite deliberately fails against the unhardened implementation of `components/pwa-handler.tsx`, which currently does not check `isStandalone` and evaluates rendering purely on `if (!isInstallable || isDismissed) return null;`.

### 1.2 Target Seam & Seam Boundary Analysis
1. **Target Component 1: `components/pwa-handler.tsx`**
   - **Current Implementation:**
     - Consumes `const { isInstallable, installApp, isUpdateAvailable, updateApp } = usePwa();`
     - Evaluates exit condition: `if (!isInstallable || isDismissed) return null;`
     - Omits `isStandalone` from hook destructuring and guard condition.
   - **The Architectural Flaw (The Red Phase Failure Point):**
     - When `isStandalone === true` and `isInstallable === true` (a defense-in-depth condition where deferred or synthetic `beforeinstallprompt` signals enter the component), `PwaHandler` continues to render both the mobile install bar and desktop install card.
     - Testing `PwaHandler` with `{ isStandalone: true, isInstallable: true }` asserts that `container.firstChild` is `null` and test IDs are absent. This assertion **FAILS** against current `pwa-handler.tsx`, establishing the required TDD Red phase baseline.
2. **Target Component 2: `components/nav/user-nav.tsx`**
   - **Current Implementation:**
     - Consumes `const { isInstallable, isStandalone, installApp, isUpdateAvailable, updateApp } = usePwa();`
     - Conditionally renders install action: `{!isStandalone && (<DropdownMenuItem ...>{isInstallable ? "Install App" : "Add to Home Screen"}</DropdownMenuItem>)}`
   - **Verification Seam:**
     - `components/nav/__tests__/user-nav.test.tsx` currently lacks explicit test assertions verifying that `"Install App"` and `"Add to Home Screen"` are hidden when `isStandalone: true`.
     - Adding these test cases establishes regression immunity for navigation dropdown install actions.

---

## 2. Invariants & Critical Guardrails

1. **TDD Task Granularity Invariant (`AGENTS.md` Section 5):**
   - This plan covers exclusively Task 3 (Red Phase). No modifications to production components (`components/pwa-handler.tsx` or `components/nav/user-nav.tsx`) are permitted during this task.
   - The test suite must demonstrate empirical failure when executed against current `components/pwa-handler.tsx`.
2. **Standalone Install Suppression Invariant (`spec.md` Section 2.2 & 2.3):**
   - When running in Standalone Mode (`isStandalone === true`), all install affordances (floating cards, banners, navigation menu items) must be completely omitted from the DOM, regardless of `isInstallable` state.
3. **Containerized Execution Mandate (`AGENTS.md` Section 3):**
   - Jest component tests must be executed via `./scripts/containers/run-jest-container.sh` with `BypassSandbox: true` due to host glibc incompatibility.
4. **Mock Hygiene & Test Isolation:**
   - Both test suites must maintain strict mock resets in `beforeEach` to ensure zero state bleed across test executions.

---

## 3. Blueprint Specifications

### 3.1 Target File: `components/__tests__/PwaHandler.test.tsx`
- **Path:** `components/__tests__/PwaHandler.test.tsx`
- **Semantic Insertion Anchors:**
  1. *Imports (Anchor: Line 1):* Add `screen` and `fireEvent` from `@testing-library/react`, and import `UsePwaReturn` type from `@/hooks/use-pwa`.
  2. *Mock Setup (Anchor: Lines 20-25):* Update `(usePwa as jest.Mock)` to use `mockedUsePwa = usePwa as jest.MockedFunction<typeof usePwa>` and initialize `isStandalone: false` by default in `beforeEach`.
  3. *New Test Suite (Anchor: Line 48, following existing `describe('PwaHandler Component Quota Warning')`):* Append `describe('PwaHandler Component Install UI and Standalone Suppression', () => { ... })`.

#### Behavioral Logic & Test Scenarios for `PwaHandler.test.tsx`:
1. **Group: Standard Browser Mode (Non-Standalone):**
   - **Installable State Rendering:**
     - Setup: `isInstallable: true`, `isStandalone: false`.
     - Assertions:
       - Mobile top bar is in document (`screen.getByTestId('mobile-pwa-install-bar')`).
       - Desktop card is in document (`screen.getByTestId('desktop-pwa-install-card')`).
       - Install text visible: `"Install App"`, `"Install Winery App"`.
   - **Install Action Triggering:**
     - Mobile: Clicking the mobile `"Install"` button triggers `installApp()` mock once.
     - Desktop: Clicking the desktop `"Install Now"` button triggers `installApp()` mock once.
   - **Dismissal Action:**
     - Mobile: Clicking the mobile dismiss button (`aria-label="Dismiss"`) removes both banners from the DOM (`setIsDismissed(true)`).
     - Desktop: Clicking the desktop close button removes both banners from the DOM.
   - **Non-Installable State:**
     - Setup: `isInstallable: false`, `isStandalone: false`.
     - Assertions: `container.firstChild` is `null`, neither mobile bar nor desktop card is rendered.

2. **Group: Standalone Mode Suppression Invariant (Red Phase Targets):**
   - **Scenario 1: Non-Installable Standalone Mode:**
     - Setup: `isInstallable: false`, `isStandalone: true`.
     - Assertions:
       - `container.firstChild` is `null`.
       - `expect(screen.queryByTestId('mobile-pwa-install-bar')).not.toBeInTheDocument()`.
       - `expect(screen.queryByTestId('desktop-pwa-install-card')).not.toBeInTheDocument()`.
   - **Scenario 2: Installable Standalone Mode (Defense-in-depth Failure Point):**
     - Setup: `isInstallable: true`, `isStandalone: true`.
     - Assertions:
       - `expect(container.firstChild).toBeNull()`.
       - `expect(screen.queryByTestId('mobile-pwa-install-bar')).not.toBeInTheDocument()`.
       - `expect(screen.queryByTestId('desktop-pwa-install-card')).not.toBeInTheDocument()`.
     - **Empirical Red Phase Failure Point:** In current `components/pwa-handler.tsx`, line 62 evaluates `if (!isInstallable || isDismissed) return null;`. Because `isInstallable` is `true`, `PwaHandler` does not return `null` and renders the mobile install bar and desktop card. This causes `expect(container.firstChild).toBeNull()` to **FAIL** with:
       ```
       Expected: null
       Received: <div data-testid="mobile-pwa-install-bar" ... />
       ```

---

### 3.2 Target File: `components/nav/__tests__/user-nav.test.tsx`
- **Path:** `components/nav/__tests__/user-nav.test.tsx`
- **Semantic Insertion Anchors:**
  1. *New Test Cases (Anchor: Line 149, immediately preceding final `});`):* Append standalone suppression tests to the `describe('UserNav Component', () => { ... })` block.

#### Behavioral Logic & Test Scenarios for `user-nav.test.tsx`:
1. **Scenario 1: Standalone Mode Item Suppression:**
   - Setup: `isInstallable: false`, `isStandalone: true`.
   - Action: Render `UserNav`, open dropdown via `openDropdown(trigger)`.
   - Assertions:
     - `expect(screen.queryByRole('menuitem', { name: /install app/i })).not.toBeInTheDocument()`.
     - `expect(screen.queryByRole('menuitem', { name: /add to home screen/i })).not.toBeInTheDocument()`.
2. **Scenario 2: Defense-in-depth Standalone Mode Item Suppression:**
   - Setup: `isInstallable: true`, `isStandalone: true`.
   - Action: Render `UserNav`, open dropdown via `openDropdown(trigger)`.
   - Assertions:
     - `expect(screen.queryByRole('menuitem', { name: /install app/i })).not.toBeInTheDocument()`.
     - `expect(screen.queryByRole('menuitem', { name: /add to home screen/i })).not.toBeInTheDocument()`.

---

## 4. Full TypeScript Interfaces & Signatures

```typescript
// From hooks/use-pwa.ts
export interface UsePwaReturn {
  isInstallable: boolean;
  installApp: () => Promise<void>;
  isUpdateAvailable: boolean;
  updateApp: () => void;
  isStandalone: boolean;
}

// UserNav component props
export interface UserNavProps {
  user: AuthenticatedUser;
  trigger?: React.ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
}

// Mock function typing in tests
type MockedUsePwa = jest.MockedFunction<() => UsePwaReturn>;
```

---

## 5. Execution Verification Protocol

### Exact Test Runner Command
Per `AGENTS.md` and repository standards, execute Jest tests via the Podman container runner with `BypassSandbox: true`:

```bash
./scripts/containers/run-jest-container.sh components/__tests__/PwaHandler.test.tsx components/nav/__tests__/user-nav.test.tsx
```

### Expected Red Phase Execution Result
1. `components/nav/__tests__/user-nav.test.tsx` executes and passes all test cases (verifying that `UserNav`'s existing `!isStandalone` guard operates correctly).
2. `components/__tests__/PwaHandler.test.tsx` executes:
   - Quota warning suite passes.
   - Non-standalone browser mode suite passes.
   - Standalone suppression test with `isInstallable: true, isStandalone: true` **FAILS** against current `components/pwa-handler.tsx`:
     ```text
     FAIL components/__tests__/PwaHandler.test.tsx
       ● PwaHandler Component Install UI and Standalone Suppression › Standalone Mode Suppression Invariant › suppresses install banner and card when isStandalone is true even if isInstallable is true

         expect(received).toBeNull()

         Received: <div class="lg:hidden fixed top-0 left-0 right-0 z-[100] bg-background border-b shadow-sm animate-in fade-in slide-in-from-top-full duration-300" data-testid="mobile-pwa-install-bar">

         > expect(container.firstChild).toBeNull();
     ```
3. Test runner exits with non-zero status code, establishing the empirical Red Phase baseline for Task 4 (Green Phase implementation in `components/pwa-handler.tsx`).

---

## 6. Post-Execution Hygiene & Conductor Commit Protocol

Upon verifying the expected Red Phase failures:

1. **Commit Code:**
   - Stage `components/__tests__/PwaHandler.test.tsx` and `components/nav/__tests__/user-nav.test.tsx`.
   - Commit message:
     ```bash
     git commit -m "test(pwa): add failing component tests for PwaHandler and UserNav standalone suppression"
     ```

2. **Attach Git Note:**
   - Retrieve commit hash: `TASK_COMMIT_SHA=$(git log -1 --format="%H")`.
   - Attach note with standard fields:
     ```bash
     git notes add -m "Task: Write failing component tests for \`PwaHandler\` and \`UserNav\` standalone suppression (TDD Red phase)
Summary: Expanded components/__tests__/PwaHandler.test.tsx with install UI test cases and an empirical failing test for standalone suppression when isStandalone is true and isInstallable is true. Expanded components/nav/__tests__/user-nav.test.tsx with assertions verifying suppression of Install App and Add to Home Screen in Standalone Mode.
Files:
- components/__tests__/PwaHandler.test.tsx
- components/nav/__tests__/user-nav.test.tsx
Rationale: Fulfills Phase 1 Task 3 of track ios-pwa-testing_20261015 (Issue #71) under the TDD Task Granularity Invariant (Red phase)." $TASK_COMMIT_SHA
     ```

3. **Update & Commit Track Plan:**
   - In [conductor/tracks/ios-pwa-testing_20261015/plan.md](file:///home/byrnesjd4821/Git/finger-lakes-app-57/conductor/tracks/ios-pwa-testing_20261015/plan.md), update Task 3 to `[x]` with commit short hash:
     ```markdown
     - [x] Task: Write failing component tests for `PwaHandler` and `UserNav` standalone suppression (TDD Red phase) [commit: <short_sha>]
         - [x] Add test in `components/__tests__/PwaHandler.test.tsx` asserting install banner/card is suppressed (`null`) when `isStandalone: true` (fails against current component)
         - [x] Add test in `components/nav/__tests__/user-nav.test.tsx` asserting `"Install App"` / `"Add to Home Screen"` item is hidden when `isStandalone: true`
         - [x] Verify failing tests via `./scripts/containers/run-jest-container.sh components/__tests__/PwaHandler.test.tsx components/nav/__tests__/user-nav.test.tsx`
     ```
   - Commit plan update:
     ```bash
     git add conductor/tracks/ios-pwa-testing_20261015/plan.md
     git commit -m "conductor(plan): Mark task 'Write failing component tests for PwaHandler and UserNav standalone suppression' as complete"
     ```

---

## 7. Gating & Approval Invariant

- Static code inspection is complete.
- Implementation plan has been written to `conductor/tracks/ios-pwa-testing_20261015/phase-1-task-3-plan.md`.
- **Zero production or test files have been modified yet.**
- Execution requires explicit affirmative user approval via modal dialog (`ask_question`).
