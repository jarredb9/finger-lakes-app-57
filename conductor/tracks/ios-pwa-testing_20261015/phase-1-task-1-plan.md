# Implementation Plan: Phase 1 Task 1 - Write Failing Tests for `usePwa` Hook and Standalone Installability Suppression (TDD Red Phase)

**Track:** `ios-pwa-testing_20261015` (Issue [#71](https://github.com/jarredb9/finger-lakes-app-57/issues/71))  
**Phase:** 1 (Unit & Component Test Matrix)  
**Task:** 1 (Write failing tests for `usePwa` hook and standalone installability suppression (TDD Red phase))  
**Specification Reference:** [spec.md](./spec.md)  
**Track Plan Reference:** [plan.md](./plan.md)  
**Workflow Reference:** [conductor/workflow.md](../../workflow.md)  

---

## 1. Executive Summary & Seam Architecture

### 1.1 Objective
Establish a comprehensive unit test suite in `hooks/__tests__/use-pwa.test.ts` (TDD Red Phase) validating the `usePwa` hook across all standalone mode signals and enforcing the Standalone Installability Invariant:
$$\text{isInstallable} \iff \neg\text{isStandalone} \land \text{hasInstallPrompt}$$

This test suite deliberately fails against the unhardened implementation of `hooks/use-pwa.ts`, which currently evaluates `isInstallable: !!installPrompt` without guarding against `isStandalone: true`.

### 1.2 Target Seam & Seam Boundary Analysis
1. **Target Component:** [hooks/use-pwa.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/hooks/use-pwa.ts)
   - Current implementation:
     - Initializes `isStandalone` using a lazy `useState` closure reading `window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone || document.referrer.includes('android-app://')`.
     - Returns `isInstallable: !!installPrompt`.
     - Subscribes to `window.addEventListener('beforeinstallprompt')`.
     - Exposes `installApp`, `isUpdateAvailable`, `updateApp`, and `isStandalone`.
2. **The Architectural Flaw (The Red Phase Target):**
   - In Browser Mode, when `beforeinstallprompt` fires, `isInstallable` becomes `true`.
   - In Standalone Mode (iOS WebClip, W3C `display-mode: standalone`, or Android WebAPK referrer), browsers may occasionally dispatch or retain synthetic/deferred `beforeinstallprompt` events.
   - Current `usePwa` evaluates `isInstallable` strictly as `!!installPrompt`. If an install prompt event is dispatched in Standalone Mode, `isInstallable` evaluates to `true`!
   - This violates the domain requirement that an app already running in Standalone Mode is never installable.
3. **Target Test Suite:**
   - [hooks/__tests__/use-pwa.test.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/hooks/__tests__/use-pwa.test.ts) (New File)
   - Tested in JSDOM environment using `@testing-library/react`'s `renderHook` and `act`.

---

## 2. Invariants & Critical Guardrails

1. **TDD Task Granularity Invariant (`AGENTS.md` Section 5):**
   - This plan covers exclusively Task 1 (Red Phase). No code changes to `hooks/use-pwa.ts` are permitted in this task.
   - The test suite must demonstrate empirical failure when executed against current `hooks/use-pwa.ts`.
2. **Standalone Installability Invariant (`spec.md` Section 2.2):**
   - Invariant: When `isStandalone === true`, `isInstallable` must remain strictly `false`, regardless of whether `beforeinstallprompt` has been captured.
3. **Boolean Casting Invariant:**
   - `isStandalone` must always evaluate strictly to a primitive boolean (`true` or `false`), never `undefined`, `""`, or a truthy non-boolean object.
4. **Environment Isolation & Mock Hygiene:**
   - All alterations to `window.navigator`, `window.matchMedia`, `document.referrer`, and `window` event listeners must be cleanly configured in `beforeEach` and restored in `afterEach` to prevent test bleed across other suites.
   - `usePWAUpdate` must be mocked to isolate `usePwa` from service worker lifecycle dependencies.
5. **Containerized Execution Mandate (`AGENTS.md` Section 3):**
   - Unit tests must be executed via `./scripts/run-jest-container.sh` with `BypassSandbox: true` due to host glibc incompatibility.

---

## 3. Blueprint Specifications

### 3.1 Target File: `hooks/__tests__/use-pwa.test.ts`
- **Path:** `hooks/__tests__/use-pwa.test.ts`
- **Action:** Create new test file.

### 3.2 Full TypeScript Interfaces & Signatures

```typescript
// Return type signature of usePwa
export interface UsePwaReturn {
  isInstallable: boolean;
  installApp: () => Promise<void>;
  isUpdateAvailable: boolean;
  updateApp: () => void;
  isStandalone: boolean;
}

// Custom BeforeInstallPromptEvent shape for JSDOM dispatch
export interface MockBeforeInstallPromptEvent extends Event {
  prompt: jest.Mock<Promise<void>, []>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  preventDefault: jest.Mock<void, []>;
}

// Mock interface for usePWAUpdate dependency
export interface MockUsePwaUpdateReturn {
  isUpdateAvailable: boolean;
  applyUpdate: jest.Mock<void, []>;
}
```

### 3.3 Test Matrix & Behavioral Logic

#### Group 1: Standard Browser Mode (Non-Standalone)
- **Initial State:**
  - Mock conditions: `matchMedia` returns `{ matches: false }`, `(navigator as any).standalone = false`, `document.referrer = ''`.
  - Assertions: `isStandalone === false`, `isInstallable === false`, `isUpdateAvailable === false`.
- **Event Dispatch (`beforeinstallprompt`):**
  - Create mock `BeforeInstallPromptEvent` with `prompt: jest.fn()`, `userChoice: Promise.resolve({ outcome: 'accepted' })`, `preventDefault: jest.fn()`.
  - Dispatch event via `act(() => window.dispatchEvent(event))`.
  - Assertions: `event.preventDefault` was called; `isInstallable === true`; `isStandalone === false`.
- **App Installation Flow (`installApp` accepted):**
  - Trigger `act(() => { result.current.installApp(); })`.
  - Assertions: `mockPrompt.prompt` was called; after awaiting resolution, `isInstallable === false`.
- **App Installation Flow (`installApp` dismissed):**
  - Create mock event where `userChoice` resolves with `{ outcome: 'dismissed' }`.
  - Trigger `installApp()`.
  - Assertions: `mockPrompt.prompt` was called; `isInstallable` remains `true` (prompt not accepted).
- **Graceful Invocation Without Prompt:**
  - Call `installApp()` when `installPrompt` is null.
  - Assertions: Resolves gracefully without throwing exceptions.

#### Group 2: Standalone Mode Signal Detection Matrix
- **Signal 1: iOS WebClip (`(window.navigator as any).standalone = true`):**
  - Mock condition: `Object.defineProperty(window.navigator, 'standalone', { value: true, configurable: true, writable: true })`.
  - Render hook.
  - Assertion: `expect(result.current.isStandalone).toBe(true)`.
- **Signal 2: W3C Standard Media Query (`(display-mode: standalone)`):**
  - Mock condition: `window.matchMedia` mocked to return `matches: true` for query `'(display-mode: standalone)'`.
  - Render hook.
  - Assertion: `expect(result.current.isStandalone).toBe(true)`.
- **Signal 3: Android App Referrer (`document.referrer` contains `android-app://`):**
  - Mock condition: `Object.defineProperty(document, 'referrer', { value: 'android-app://com.example.pwa', configurable: true, writable: true })`.
  - Render hook.
  - Assertion: `expect(result.current.isStandalone).toBe(true)`.
- **Signal 4: Strict Boolean Type Casting:**
  - Mock condition: `(navigator as any).standalone` is `undefined`, `matchMedia` returns `false`, `referrer` is `""`.
  - Render hook.
  - Assertion: `expect(result.current.isStandalone).toStrictEqual(false)` (validating strict boolean, not falsy object/string/undefined).

#### Group 3: Standalone Mode Installability Suppression Invariant (TDD Red Phase Gates)
- **Gate 1: iOS Standalone Suppression on Prompt Dispatch:**
  - Setup: iOS WebClip signal active (`navigator.standalone = true`).
  - Action: Dispatch `beforeinstallprompt` event inside `act()`.
  - Assertions:
    - `expect(result.current.isStandalone).toBe(true);`
    - `expect(result.current.isInstallable).toBe(false);`
  - **Empirical Red Phase Failure Point:** In current unhardened `hooks/use-pwa.ts`, `isInstallable: !!installPrompt` evaluates to `true`. This test FAILS with:
    ```
    Expected: false
    Received: true
    ```
- **Gate 2: W3C MatchMedia Standalone Suppression on Prompt Dispatch:**
  - Setup: W3C matchMedia standalone signal active (`matches = true`).
  - Action: Dispatch `beforeinstallprompt` event inside `act()`.
  - Assertions:
    - `expect(result.current.isStandalone).toBe(true);`
    - `expect(result.current.isInstallable).toBe(false);`
  - **Empirical Red Phase Failure Point:** FAILS with `Expected: false, Received: true`.
- **Gate 3: Android Referrer Standalone Suppression on Prompt Dispatch:**
  - Setup: Android referrer signal active (`document.referrer = 'android-app://...'`).
  - Action: Dispatch `beforeinstallprompt` event inside `act()`.
  - Assertions:
    - `expect(result.current.isStandalone).toBe(true);`
    - `expect(result.current.isInstallable).toBe(false);`
  - **Empirical Red Phase Failure Point:** FAILS with `Expected: false, Received: true`.

#### Group 4: PWA Update Integration Delegation
- **Update Delegation:**
  - Mock `usePWAUpdate` returning `{ isUpdateAvailable: true, applyUpdate: mockApplyUpdate }`.
  - Render hook.
  - Assertions:
    - `expect(result.current.isUpdateAvailable).toBe(true)`.
    - `result.current.updateApp()`; `expect(mockApplyUpdate).toHaveBeenCalledTimes(1)`.

---

## 4. Execution Verification Protocol

### Exact Test Runner Command
Per `AGENTS.md` and repository standards, execute Jest tests via the Podman container runner with `BypassSandbox: true`:

```bash
./scripts/run-jest-container.sh hooks/__tests__/use-pwa.test.ts
```

### Expected Red Phase Execution Result
1. The new test file `hooks/__tests__/use-pwa.test.ts` executes in the container.
2. Browser mode and signal detection tests pass.
3. The 3 standalone installability suppression invariant tests **FAIL** with:
   ```text
   ● usePwa Hook › Standalone Mode Installability Suppression Invariant (Red Phase) › suppresses isInstallable when running in iOS WebClip standalone mode even if beforeinstallprompt fires

     expect(received).toBe(expected) // Object.is equality

     Expected: false
     Received: true

     > expect(result.current.isInstallable).toBe(false);
   ```
4. This confirms that the test harness accurately reproduces the defect and establishes the Red Phase baseline for Task 2 (Green Phase implementation).

---

## 5. Post-Execution Hygiene & Conductor Commit Protocol

Upon verifying the expected Red Phase failures:

1. **Commit Code:**
   - Stage `hooks/__tests__/use-pwa.test.ts`.
   - Commit message:
     ```bash
     git commit -m "test(pwa): add failing tests for usePwa hook standalone installability suppression"
     ```

2. **Attach Git Note:**
   - Retrieve commit hash: `TASK_COMMIT_SHA=$(git log -1 --format="%H")`.
   - Attach note with standard fields:
     ```bash
     git notes add -m "Task: Write failing tests for \`usePwa\` hook and standalone installability suppression (TDD Red phase)
Summary: Created comprehensive unit test suite hooks/__tests__/use-pwa.test.ts testing browser mode, standalone mode signals (iOS WebClip, W3C matchMedia, Android referrer), and installability suppression. Established empirical failing assertions verifying that isInstallable is suppressed when isStandalone is true.
Files:
- hooks/__tests__/use-pwa.test.ts
Rationale: Fulfills Phase 1 Task 1 of track ios-pwa-testing_20261015 (Issue #71) under the TDD Task Granularity Invariant." $TASK_COMMIT_SHA
     ```

3. **Update & Commit Track Plan:**
   - In [conductor/tracks/ios-pwa-testing_20261015/plan.md](file:///home/byrnesjd4821/Git/finger-lakes-app-57/conductor/tracks/ios-pwa-testing_20261015/plan.md), update Task 1 to `[x]` with commit short hash:
     ```markdown
     - [x] Task: Write failing tests for `usePwa` hook and standalone installability suppression (TDD Red phase) [commit: <short_sha>]
     ```
   - Commit plan update:
     ```bash
     git add conductor/tracks/ios-pwa-testing_20261015/plan.md
     git commit -m "conductor(plan): Mark task 'Write failing tests for usePwa hook and standalone installability suppression' as complete"
     ```

---

## 6. Gating & Approval Invariant

- Static inspection is complete.
- Implementation plan has been written to `conductor/tracks/ios-pwa-testing_20261015/phase-1-task-1-plan.md`.
- **Zero project source code or test files have been modified yet.**
- Execution requires explicit affirmative user approval via modal dialog (`ask_question`).
