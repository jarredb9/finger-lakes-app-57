# Implementation Plan: Phase 1 Task 4 - Implement `PwaHandler` Standalone Guard (TDD Green Phase)

**Track:** `ios-pwa-testing_20261015` (Issue [#71](https://github.com/jarredb9/finger-lakes-app-57/issues/71))  
**Phase:** 1 (Unit & Component Test Matrix)  
**Task:** 4 (Implement `PwaHandler` standalone guard (TDD Green phase))  
**Specification Reference:** [spec.md](./spec.md)  
**Track Plan Reference:** [plan.md](./plan.md)  
**Workflow Reference:** [conductor/workflow.md](../../workflow.md)  
**Preceding Task Reference:** [phase-1-task-3-plan.md](./phase-1-task-3-plan.md)

---

## 1. Executive Summary & Seam Architecture

### 1.1 Objective
Implement the standalone mode guard in `components/pwa-handler.tsx` to transition the failing component test matrix from Phase 1 Task 3 into a passing green state (TDD Green Phase). This change enforces the UI suppression invariant: when running in Standalone Mode (`isStandalone === true`), all PWA install affordances (the mobile top install bar and the desktop floating install card) must never render into the DOM, regardless of any upstream `isInstallable` signals.

### 1.2 Target Seam & Seam Boundary Analysis
1. **Target Component: `components/pwa-handler.tsx`**
   - **Current Implementation:**
     - Line 11: `const { isInstallable, installApp, isUpdateAvailable, updateApp } = usePwa();`
     - Line 62: `if (!isInstallable || isDismissed) return null;`
     - Problem: `isStandalone` is omitted from hook destructuring and the early-return guard. When `isStandalone === true` and `isInstallable === true`, the guard evaluates `false` and renders both `<div data-testid="mobile-pwa-install-bar">` and `<div data-testid="desktop-pwa-install-card">`.
   - **Green Phase Seam Hardening:**
     - Destructure `isStandalone` from `usePwa()`.
     - Update early-return condition to: `if (!isInstallable || isStandalone || isDismissed) return null;`.
     - Defense-in-depth: Even if `isInstallable` is truthy, `isStandalone: true` forces an immediate `null` return.
     - Preserves all existing listeners (`quota-exceeded-warning`) and PWA update toast notifications.

---

## 2. Invariants & Critical Guardrails

1. **TDD Task Granularity Invariant (`AGENTS.md` Section 5):**
   - This task is strictly the Green Phase for Phase 1 Task 4.
   - Minimal surgical changes to `components/pwa-handler.tsx` to satisfy the failing tests established in Task 3.
   - Zero modifications to test files (`components/__tests__/PwaHandler.test.tsx` or `components/nav/__tests__/user-nav.test.tsx`) are required.
2. **Standalone Install Suppression Invariant (`spec.md` Section 2.2):**
   - When running in Standalone Mode (`isStandalone === true`), `PwaHandler` must return `null`.
3. **Containerized Execution Mandate (`AGENTS.md` Section 3):**
   - Run Jest tests via the Podman container runner with `BypassSandbox: true` due to host glibc constraints:
     `./scripts/containers/run-jest-container.sh components/__tests__/PwaHandler.test.tsx components/nav/__tests__/user-nav.test.tsx`
4. **Non-Interactive & CI-Aware Mandate (`conductor/workflow.md`):**
   - Execute verification tests non-interactively without watch flags.

---

## 3. Blueprint Specifications

### 3.1 Target File: `components/pwa-handler.tsx`
- **Path:** `components/pwa-handler.tsx`
- **Semantic Insertion Anchors:**
  1. *Hook Destructuring (Anchor: Line 11):*
     - Replace:
       ```typescript
       const { isInstallable, installApp, isUpdateAvailable, updateApp } = usePwa();
       ```
     - With:
       ```typescript
       const { isInstallable, isStandalone, installApp, isUpdateAvailable, updateApp } = usePwa();
       ```
  2. *Render Guard (Anchor: Line 62):*
     - Replace:
       ```typescript
       if (!isInstallable || isDismissed) return null;
       ```
     - With:
       ```typescript
       if (!isInstallable || isStandalone || isDismissed) return null;
       ```

### 3.2 Full TypeScript Interfaces & Signatures

```typescript
// Component Signature in components/pwa-handler.tsx
export function PwaHandler(): React.JSX.Element | null;

// Consumed Hook Interface from hooks/use-pwa.ts
export interface UsePwaReturn {
  isInstallable: boolean;
  installApp: () => Promise<void>;
  isUpdateAvailable: boolean;
  updateApp: () => void;
  isStandalone: boolean;
}

// Component Props (Accepts zero props)
export type PwaHandlerProps = Record<string, never>;
```

### 3.3 Precise Behavioral Logic & State Transitions

1. **Guard Condition Evaluation:**
   - Formula: `!isInstallable || isStandalone || isDismissed`
   - Case A: `isStandalone === true`: Guard evaluates `true` -> returns `null` immediately.
   - Case B: `!isInstallable === true`: Guard evaluates `true` -> returns `null` immediately.
   - Case C: `isDismissed === true`: Guard evaluates `true` -> returns `null` immediately.
   - Case D: `isInstallable === true && !isStandalone && !isDismissed`: Guard evaluates `false` -> renders mobile bar (`mobile-pwa-install-bar`) and desktop card (`desktop-pwa-install-card`).
2. **State & Effect Preservations:**
   - `useEffect` for `quota-exceeded-warning` listener remains registered regardless of guard return value.
   - `useEffect` for `isUpdateAvailable` toast trigger remains active regardless of guard return value.
   - `isDismissed` local state toggles when user clicks mobile `X` button (`aria-label="Dismiss"`) or desktop card close button.

---

## 4. Execution Verification Protocol

### Exact Test Runner Command
Per `AGENTS.md` and repository standards, run Jest tests via the Podman container runner with `BypassSandbox: true`:

```bash
./scripts/containers/run-jest-container.sh components/__tests__/PwaHandler.test.tsx components/nav/__tests__/user-nav.test.tsx
```

### Expected Green Phase Execution Result
1. `components/__tests__/PwaHandler.test.tsx`:
   - All tests pass (8 passed, 0 failed):
     - `PwaHandler Component Quota Warning` (1 test)
     - `Standard Browser Mode (Non-Standalone)` (6 tests)
     - `Standalone Mode Suppression Invariant` (2 tests, including previously failing `suppresses install banner and card when isStandalone is true even if isInstallable is true`)
2. `components/nav/__tests__/user-nav.test.tsx`:
   - All tests pass (7 passed, 0 failed).
3. Test suite exit code is 0.

---

## 5. Post-Execution Hygiene & Conductor Commit Protocol

Upon verifying all tests pass:

1. **Commit Code Changes:**
   - Stage `components/pwa-handler.tsx`.
   - Commit message:
     ```bash
     git commit -m "feat(pwa): implement PwaHandler standalone guard"
     ```

2. **Attach Git Note:**
   - Retrieve commit hash: `TASK_COMMIT_SHA=$(git log -1 --format="%H")`.
   - Attach note with standard fields:
     ```bash
     git notes add -m "Task: Implement \`PwaHandler\` standalone guard (TDD Green phase)
Summary: Updated components/pwa-handler.tsx to destructure isStandalone from usePwa() and incorporate it into the early return guard (if (!isInstallable || isStandalone || isDismissed) return null;), cleanly suppressing install affordances in Standalone Mode.
Files:
- components/pwa-handler.tsx
Rationale: Fulfills Phase 1 Task 4 of track ios-pwa-testing_20261015 (Issue #71) under the TDD Task Granularity Invariant (Green phase), passing all component tests." $TASK_COMMIT_SHA
     ```

3. **Update & Commit Track Plan:**
   - In [conductor/tracks/ios-pwa-testing_20261015/plan.md](file:///home/byrnesjd4821/Git/finger-lakes-app-57/conductor/tracks/ios-pwa-testing_20261015/plan.md), update Task 4 to `[x]` with commit short hash:
     ```markdown
     - [x] Task: Implement `PwaHandler` standalone guard (TDD Green phase) [commit: <short_sha>]
         - [x] Update `components/pwa-handler.tsx` to guard `if (!isInstallable || isStandalone || isDismissed) return null;`
         - [x] Verify both component test suites pass via `./scripts/containers/run-jest-container.sh components/__tests__/PwaHandler.test.tsx components/nav/__tests__/user-nav.test.tsx`
     ```
   - Commit plan update:
     ```bash
     git add conductor/tracks/ios-pwa-testing_20261015/plan.md
     git commit -m "conductor(plan): Mark task 'Implement PwaHandler standalone guard' as complete"
     ```

---

## 6. Gating & Approval Invariant

- Static code inspection is complete.
- Implementation plan has been written to `conductor/tracks/ios-pwa-testing_20261015/phase-1-task-4-plan.md`.
- **Zero production or test files have been modified yet.**
- Execution requires explicit affirmative user approval via modal dialog (`ask_question`).
