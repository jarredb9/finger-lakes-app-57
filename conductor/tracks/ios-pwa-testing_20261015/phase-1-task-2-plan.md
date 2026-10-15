# Implementation Plan: Phase 1 Task 2 - Implement `usePwa` Hook Hardening and Standalone Invariant (TDD Green Phase)

**Track:** `ios-pwa-testing_20261015` (Issue [#71](https://github.com/jarredb9/finger-lakes-app-57/issues/71))  
**Phase:** 1 (Unit & Component Test Matrix)  
**Task:** 2 (Implement `usePwa` hook hardening and standalone invariant (TDD Green phase))  
**Specification Reference:** [spec.md](./spec.md)  
**Track Plan Reference:** [plan.md](./plan.md)  
**Workflow Reference:** [conductor/workflow.md](../../workflow.md)  
**Preceding Task Reference:** [phase-1-task-1-plan.md](./phase-1-task-1-plan.md)

---

## 1. Executive Summary & Seam Architecture

### 1.1 Objective
Implement the TDD Green Phase hardening for `hooks/use-pwa.ts` to satisfy all test contracts established in `hooks/__tests__/use-pwa.test.ts`. This task resolves the Red Phase failures by:
1. Enforcing strict primitive boolean casting for `isStandalone` across all three standalone mode detection signals (iOS WebClip, W3C `(display-mode: standalone)`, and Android WebAPK referrer).
2. Enforcing the Standalone Installability Invariant:
   $$\text{isInstallable} \iff \neg\text{isStandalone} \land \text{hasInstallPrompt}$$
   guaranteeing that an app already running in Standalone Mode never presents an install prompt or reports `isInstallable: true`, even if synthetic or browser-deferred `beforeinstallprompt` events fire.
3. Providing full TypeScript type safety with explicit interfaces for `UsePwaReturn` and internal `BeforeInstallPromptEvent`.

### 1.2 Target Seam & Seam Boundary Analysis
1. **Target Component:** [hooks/use-pwa.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/hooks/use-pwa.ts)
   - **Current Flaws:**
     - `isStandalone` initialization performs uncast logical OR expressions (`window.matchMedia(...).matches || (window.navigator as any).standalone || document.referrer.includes(...)`), which can evaluate to non-boolean falsy/truthy values (e.g. `undefined` or `""`).
     - `isInstallable` evaluates strictly as `!!installPrompt`, disregarding `isStandalone`.
     - `installApp` does not guard against execution when `isStandalone: true`.
     - Types are loose (`useState<any>(null)` for `installPrompt` and implicit return type).
2. **Refactored Contract:**
   - Strict boolean casting: `Boolean(typeof window !== 'undefined' && (...))`
   - Hardened invariant: `isInstallable: !isStandalone && !!installPrompt`
   - Defense-in-depth: `installApp` early returns if `!installPrompt || isStandalone`
   - Type contract: `export interface UsePwaReturn` and return type annotation `: UsePwaReturn`
3. **Target Test Suite:**
   - [hooks/__tests__/use-pwa.test.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/hooks/__tests__/use-pwa.test.ts) (13 tests in 4 groups established in Task 1)

---

## 2. Invariants & Critical Guardrails

1. **TDD Task Granularity Invariant (`AGENTS.md` Section 5):**
   - This plan covers exclusively Task 2 (Green Phase). Only `hooks/use-pwa.ts` is modified in this task.
   - Component modifications (`pwa-handler.tsx` and `user-nav.tsx`) are reserved for subsequent Phase 1 tasks (Tasks 3 and 4).
2. **Standalone Installability Invariant (`spec.md` Section 2.2):**
   - When `isStandalone === true`, `isInstallable` must evaluate strictly to `false`, regardless of `installPrompt` state.
3. **Boolean Casting Invariant (`spec.md` Section 2.2):**
   - `isStandalone` must always evaluate strictly to a primitive boolean (`true` or `false`), never `undefined`, `""`, or a truthy non-boolean object.
4. **Environment Isolation & SSR Safety:**
   - Guard against SSR execution (`typeof window === 'undefined'`), defaulting `isStandalone` safely to `false` during server rendering.
5. **Static Initialization Stability:**
   - Maintain static evaluation of `isStandalone` during component mounting without attaching unnecessary runtime event listeners (e.g. `matchMedia` listeners).
6. **Containerized Execution Mandate (`AGENTS.md` Section 3):**
   - Unit tests must be executed via `./scripts/containers/run-jest-container.sh` with `BypassSandbox: true`.

---

## 3. Blueprint Specifications

### 3.1 Target File: `hooks/use-pwa.ts`
- **Path:** `hooks/use-pwa.ts`
- **Semantic Insertion Anchors:**
  1. *Type Exports (Top of File, immediately following imports):* Export `UsePwaReturn` interface and define internal `BeforeInstallPromptEvent` interface.
  2. *Function Signature:* Annotate `export function usePwa(): UsePwaReturn`.
  3. *State Initialization:* Replace `useState<any>(null)` with `useState<BeforeInstallPromptEvent | null>(null)`.
  4. *Standalone State:* Wrap standalone signal evaluations in `Boolean(...)` ensuring strict boolean casting.
  5. *Installation Callback:* Update `installApp` callback to guard `if (!installPrompt || isStandalone) return;` and include `isStandalone` in dependency array `[installPrompt, isStandalone]`.
  6. *Return Payload:* Compute `isInstallable: !isStandalone && !!installPrompt`.

### 3.2 Full TypeScript Interfaces & Signatures

```typescript
export interface UsePwaReturn {
  isInstallable: boolean;
  installApp: () => Promise<void>;
  isUpdateAvailable: boolean;
  updateApp: () => void;
  isStandalone: boolean;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePwa(): UsePwaReturn;
```

### 3.3 Precise Behavioral Logic

1. **State Initialization (`isStandalone`):**
   - Formula:
     ```typescript
     const [isStandalone] = useState<boolean>(() => {
       if (typeof window === 'undefined') return false;
       return Boolean(
         window.matchMedia('(display-mode: standalone)').matches
         || (window.navigator as any).standalone
         || (document.referrer && document.referrer.includes('android-app://'))
       );
     });
     ```
   - Behavior:
     - Returns `false` immediately during SSR when `window` is undefined.
     - Resolves to `true` if any of the three signals are present:
       1. W3C media query `(display-mode: standalone)` matches.
       2. iOS Safari standalone WebClip property `(window.navigator as any).standalone` is truthy.
       3. Android WebAPK referrer contains `android-app://`.
     - Explicitly wraps evaluation in `Boolean(...)` so that undefined navigator properties or empty referrer strings normalize strictly to boolean `false`.

2. **State Initialization (`installPrompt`):**
   - Typed as `useState<BeforeInstallPromptEvent | null>(null)`.
   - Populated when `beforeinstallprompt` event fires on `window`.
   - Cleared to `null` when user accepts the prompt outcome.

3. **Event Listener (`beforeinstallprompt`):**
   - Subscribes via `window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)`.
   - Calls `e.preventDefault()` to prevent default browser mini-infobar prompt.
   - Saves event instance via `setInstallPrompt(e as BeforeInstallPromptEvent)`.
   - Cleanup unregisters event listener on unmount.

4. **Action (`installApp`):**
   - Guard condition: `if (!installPrompt || isStandalone) return;`.
   - Invokes `await installPrompt.prompt()`.
   - Awaits `installPrompt.userChoice`.
   - If outcome is `'accepted'`, dispatches `setInstallPrompt(null)`.
   - If outcome is `'dismissed'`, retains prompt so user can trigger later in standard browser mode.

5. **Computed Invariant (`isInstallable`):**
   - Formula: `isInstallable: !isStandalone && !!installPrompt`.
   - Standalone Mode Guard: If `isStandalone` is `true`, `isInstallable` evaluates strictly to `false`, regardless of prompt existence.
   - Non-Standalone Mode: Evaluates to `true` if and only if `installPrompt !== null`.

---

## 4. Execution Verification Protocol

### Exact Test Runner Command
Per `AGENTS.md` and repository standards, execute Jest tests via the Podman container runner with `BypassSandbox: true`:

```bash
./scripts/containers/run-jest-container.sh hooks/__tests__/use-pwa.test.ts
```

### Expected Green Phase Execution Result
1. `hooks/__tests__/use-pwa.test.ts` executes in the container.
2. All 13 test cases pass across the 4 test suites:
   - `Standard Browser Mode (Non-Standalone)`: 5 tests pass.
   - `Standalone Mode Signal Detection Matrix`: 4 tests pass (including strict boolean check).
   - `Standalone Mode Installability Suppression Invariant (Red Phase)`: 3 tests transition from FAIL to PASS.
   - `PWA Update Integration Delegation`: 1 test passes.
3. Summary output reports:
   ```text
   PASS hooks/__tests__/use-pwa.test.ts
     usePwa Hook
       Standard Browser Mode (Non-Standalone)
         ✓ initializes with default non-standalone, non-installable state when no prompt fired
         ✓ captures beforeinstallprompt event, prevents default, and sets isInstallable to true
         ✓ completes app installation flow when user accepts prompt and clears isInstallable
         ✓ keeps isInstallable true if user dismisses install prompt
         ✓ gracefully handles installApp invocation when no install prompt is present
       Standalone Mode Signal Detection Matrix
         ✓ detects standalone mode via iOS WebClip signal (navigator.standalone = true)
         ✓ detects standalone mode via W3C standard media query (display-mode: standalone)
         ✓ detects standalone mode via Android app referrer (android-app://)
         ✓ enforces strict boolean type casting for isStandalone when standalone signals are undefined or empty
       Standalone Mode Installability Suppression Invariant (Red Phase)
         ✓ suppresses isInstallable when running in iOS WebClip standalone mode even if beforeinstallprompt fires
         ✓ suppresses isInstallable when running in W3C matchMedia standalone mode even if beforeinstallprompt fires
         ✓ suppresses isInstallable when running in Android referrer standalone mode even if beforeinstallprompt fires
       PWA Update Integration Delegation
         ✓ delegates isUpdateAvailable and updateApp to usePWAUpdate

   Test Suites: 1 passed, 1 total
   Tests:       13 passed, 13 total
   Snapshots:   0 total
   Time:        ...
   ```

---

## 5. Post-Execution Hygiene & Conductor Commit Protocol

Upon verifying that all 13 tests pass:

1. **Commit Code:**
   - Stage `hooks/use-pwa.ts`.
   - Commit message:
     ```bash
     git commit -m "feat(pwa): harden usePwa hook and enforce standalone installability invariant"
     ```

2. **Attach Git Note:**
   - Retrieve commit hash: `TASK_COMMIT_SHA=$(git log -1 --format="%H")`.
   - Attach note with standard fields:
     ```bash
     git notes add -m "Task: Implement \`usePwa\` hook hardening and standalone invariant (TDD Green phase)
   Summary: Hardened hooks/use-pwa.ts to enforce strict boolean casting for isStandalone across all signals (iOS WebClip, W3C display-mode, Android referrer) and enforced the Standalone Installability Invariant (isInstallable: !isStandalone && !!installPrompt). Added UsePwaReturn and BeforeInstallPromptEvent type contracts. Verified that all 13 unit tests pass.
   Files:
   - hooks/use-pwa.ts
   Rationale: Fulfills Phase 1 Task 2 of track ios-pwa-testing_20261015 (Issue #71) under the TDD Task Granularity Invariant (Green phase)." $TASK_COMMIT_SHA
     ```

3. **Update & Commit Track Plan:**
   - In [conductor/tracks/ios-pwa-testing_20261015/plan.md](file:///home/byrnesjd4821/Git/finger-lakes-app-57/conductor/tracks/ios-pwa-testing_20261015/plan.md), update Task 2 to `[x]` with commit short hash:
     ```markdown
     - [x] Task: Implement `usePwa` hook hardening and standalone invariant (TDD Green phase) [commit: <short_sha>]
         - [x] Update `hooks/use-pwa.ts` to enforce boolean casting on `isStandalone`
         - [x] Enforce invariant `isInstallable: !isStandalone && !!installPrompt`
         - [x] Verify test suite passes via `./scripts/containers/run-jest-container.sh hooks/__tests__/use-pwa.test.ts`
     ```
   - Commit plan update:
     ```bash
     git add conductor/tracks/ios-pwa-testing_20261015/plan.md
     git commit -m "conductor(plan): Mark task 'Implement usePwa hook hardening and standalone invariant' as complete"
     ```

---

## 6. Gating & Approval Invariant

- Static inspection is complete.
- Implementation plan has been written to `conductor/tracks/ios-pwa-testing_20261015/phase-1-task-2-plan.md`.
- **Zero source code files have been modified yet.**
- Execution requires explicit affirmative user approval via modal dialog (`ask_question`).
