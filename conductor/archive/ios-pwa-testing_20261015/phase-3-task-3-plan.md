# Implementation Plan: Phase 3 Task 3 - Update `e2e/pwa-install-layout.spec.ts` for Standalone Mode Suppression

**Track:** `ios-pwa-testing_20261015` (Automated iOS PWA Standalone Testing Matrix & Domain Refactoring - Issue [#71](https://github.com/jarredb9/finger-lakes-app-57/issues/71))  
**Phase:** Phase 3 (Playwright Standalone Fixture & E2E Verification)  
**Task:** Task 3 (Update `e2e/pwa-install-layout.spec.ts` for Standalone Mode suppression)  
**Specification Reference:** [conductor/tracks/ios-pwa-testing_20261015/spec.md](./spec.md)  
**Track Plan Reference:** [conductor/tracks/ios-pwa-testing_20261015/plan.md](./plan.md)  
**Architecture Decision Reference:** [docs/adr/0006-containerized-ios-pwa-emulation-testing.md](../../../docs/adr/0006-containerized-ios-pwa-emulation-testing.md)  
**Workflow Reference:** [conductor/workflow.md](../../workflow.md)  

---

## 1. Executive Summary & Objective

### 1.1 Objective
Update the existing Playwright end-to-end test suite in `e2e/pwa-install-layout.spec.ts` to validate PWA Standalone Mode install suppression across mobile and desktop/tablet viewports. Specifically:
1. **Import Standalone Helper:** Import `enableStandaloneMode` from `./utils`.
2. **Mobile Standalone Mode Suppression Test:** Verify that when standalone mode is active (`window.navigator.standalone = true` and `(display-mode: standalone)` matchMedia override), dispatching `beforeinstallprompt` on mobile/tablet viewports (`< 1024px`) does **not** render `[data-testid="mobile-pwa-install-bar"]` nor `[data-testid="desktop-pwa-install-card"]`.
3. **Desktop Standalone Mode Suppression Test:** Verify that when standalone mode is active, dispatching `beforeinstallprompt` on desktop viewports (`>= 1024px`) does **not** render `[data-testid="desktop-pwa-install-card"]` nor `[data-testid="mobile-pwa-install-bar"]`.
4. **Hydration Synchronization:** Ensure tests wait for client-side hydration (via cookie consent banner visibility) before dispatching the `beforeinstallprompt` event, avoiding race conditions with component mounting.
5. **Signal Assertion:** Assert that both `window.navigator.standalone` and `window.matchMedia('(display-mode: standalone)').matches` evaluate to `true` on the page context.

---

## 2. Invariants & Critical Guardrails

1. **Standalone Mode Suppression Invariant (`spec.md` Section 2.2 & ADR 0006):**
   - When running in Standalone Mode, `usePwa` enforces `isInstallable: false` and `PwaHandler` guards `if (!isInstallable || isStandalone || isDismissed) return null;`.
   - The test must assert that neither `mobile-pwa-install-bar` nor `desktop-pwa-install-card` are ever mounted or visible in the DOM upon `beforeinstallprompt` dispatch.
2. **Hydration Verification Barrier:**
   - On `/login?pwa=true`, `aside[aria-label="Cookie consent"]` verifies client-side hydration. `beforeinstallprompt` must be dispatched only after this barrier is confirmed visible, guaranteeing that React event listeners in `usePwa` and `PwaHandler` are mounted.
3. **Viewport Matrix Parity:**
   - Existing browser mode tests verify layout docking when install prompts appear. The new standalone tests provide the symmetric inverse: verifying total suppression when standalone mode is active.
   - Tests must respect viewport constraints: mobile tests run when `viewport.width < 1024` and desktop tests run when `viewport.width >= 1024`.
4. **Container Compatibility (`AGENTS.md` Section 3):**
   - Playwright tests run inside rootless Podman containers on RHEL 8 without host internet access. Tests must execute cleanly under both `Mobile Safari` (`iPhone 12`) and `webkit` (`Desktop Safari`) projects.
5. **Modal & Plan Approval Invariant (`AGENTS.md` Section 2 & `conductor_antigravity.md`):**
   - A response of `User Skipped` or modal dismissal is strictly non-affirmative. Never proceed with file edits or test executions without affirmative user approval.

---

## 3. Plan Blueprint: Target Files & Semantic Insertion Anchors

### 3.1 Target File: `e2e/pwa-install-layout.spec.ts`
- **Path:** `e2e/pwa-install-layout.spec.ts`
- **Semantic Insertion Anchors:**
  1. **Anchor 1 (Import Statement):**
     - **Location:** Line 1.
     - **Current:** `import { test, expect } from './utils';`
     - **Target:** `import { test, expect, enableStandaloneMode } from './utils';`
  2. **Anchor 2 (Mobile Standalone Test Case):**
     - **Location:** Immediately after the existing mobile test case (line 47), before `test('Desktop/Tablet: Install Card at Bottom-Left...')`.
     - **Addition:** `test('Mobile: Standalone Mode suppresses Install Bar even when beforeinstallprompt fires', async ({ page }) => { ... });`
  3. **Anchor 3 (Desktop Standalone Test Case):**
     - **Location:** At the end of the `test.describe('PWA Install & Cookie Consent Layout', ...)` block, immediately after the existing desktop test case (line 89).
     - **Addition:** `test('Desktop/Tablet: Standalone Mode suppresses Install Card even when beforeinstallprompt fires', async ({ page }) => { ... });`

---

## 4. Full TypeScript Interfaces & Test Signatures

### 4.1 Test Function Signatures

```typescript
import { test, expect, enableStandaloneMode } from './utils';
import { clearServiceWorkers } from './helpers';

test.describe('PWA Install & Cookie Consent Layout', () => {
  test.beforeEach(async ({ page }: { page: import('@playwright/test').Page }) => {
    await clearServiceWorkers(page);
  });

  // Existing tests:
  // test('Mobile: Install Bar at Top and Cookie Consent at Bottom with No Overlap', async ({ page }) => { ... });

  // New Test 1: Mobile Standalone Suppression
  test('Mobile: Standalone Mode suppresses Install Bar even when beforeinstallprompt fires', async ({
    page,
  }: {
    page: import('@playwright/test').Page;
  }) => {
    // ...
  });

  // Existing test:
  // test('Desktop/Tablet: Install Card at Bottom-Left and Cookie Notice at Bottom-Right with No Overlap', async ({ page }) => { ... });

  // New Test 2: Desktop Standalone Suppression
  test('Desktop/Tablet: Standalone Mode suppresses Install Card even when beforeinstallprompt fires', async ({
    page,
  }: {
    page: import('@playwright/test').Page;
  }) => {
    // ...
  });
});
```

---

## 5. Precise Behavioral Logic, Formulas & Edge Cases

### 5.1 Mobile Standalone Suppression Test Logic
1. **Viewport Guard:**
   ```typescript
   const isMobile = (page.viewportSize()?.width ?? 1280) < 1024;
   test.skip(!isMobile, 'Mobile/Tablet (< 1024px) viewports only');
   ```
2. **Enable Standalone Emulation:**
   ```typescript
   await enableStandaloneMode(page);
   ```
3. **Navigate to PWA Test Route:**
   ```typescript
   await page.goto('/login?pwa=true');
   await page.waitForLoadState('domcontentloaded');
   ```
4. **Verify Window Standalone Signals:**
   ```typescript
   const isStandaloneNavigator = await page.evaluate(
     () => (window.navigator as unknown as { standalone?: boolean }).standalone
   );
   expect(isStandaloneNavigator).toBe(true);

   const isStandaloneDisplayMode = await page.evaluate(
     () => window.matchMedia('(display-mode: standalone)').matches
   );
   expect(isStandaloneDisplayMode).toBe(true);
   ```
5. **Await Hydration Barrier:**
   ```typescript
   const cookieConsent = page.locator('aside[aria-label="Cookie consent"]');
   await expect(cookieConsent).toBeVisible({ timeout: 10000 });
   ```
6. **Dispatch `beforeinstallprompt` Event:**
   ```typescript
   await page.evaluate(() => {
     window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true }));
   });
   ```
7. **Assert Total Install UI Suppression:**
   ```typescript
   const installBar = page.getByTestId('mobile-pwa-install-bar');
   const installCard = page.getByTestId('desktop-pwa-install-card');
   await expect(installBar).not.toBeVisible();
   await expect(installCard).not.toBeVisible();
   ```

### 5.2 Desktop Standalone Suppression Test Logic
1. **Viewport Guard:**
   ```typescript
   const isMobile = (page.viewportSize()?.width ?? 1280) < 1024;
   test.skip(isMobile, 'Desktop (>= 1024px) viewports only');
   ```
2. **Enable Standalone Emulation:**
   ```typescript
   await enableStandaloneMode(page);
   ```
3. **Navigate to PWA Test Route:**
   ```typescript
   await page.goto('/login?pwa=true');
   await page.waitForLoadState('domcontentloaded');
   ```
4. **Verify Window Standalone Signals:**
   ```typescript
   const isStandaloneNavigator = await page.evaluate(
     () => (window.navigator as unknown as { standalone?: boolean }).standalone
   );
   expect(isStandaloneNavigator).toBe(true);

   const isStandaloneDisplayMode = await page.evaluate(
     () => window.matchMedia('(display-mode: standalone)').matches
   );
   expect(isStandaloneDisplayMode).toBe(true);
   ```
5. **Await Hydration Barrier:**
   ```typescript
   const cookieConsent = page.locator('aside[aria-label="Cookie consent"]');
   await expect(cookieConsent).toBeVisible({ timeout: 10000 });
   ```
6. **Dispatch `beforeinstallprompt` Event:**
   ```typescript
   await page.evaluate(() => {
     window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true }));
   });
   ```
7. **Assert Total Install UI Suppression:**
   ```typescript
   const installCard = page.getByTestId('desktop-pwa-install-card');
   const installBar = page.getByTestId('mobile-pwa-install-bar');
   await expect(installCard).not.toBeVisible();
   await expect(installBar).not.toBeVisible();
   ```

### 5.3 Edge Cases & Defensive Verifications
1. **False Positive Prevention:**
   - Asserting that `cookieConsent` is visible before and after dispatch proves that the page did not crash or hang; rather, the absence of `mobile-pwa-install-bar` is strictly caused by `PwaHandler`'s standalone suppression logic.
2. **InitScript Ordering Invariant:**
   - `enableStandaloneMode(page)` must be invoked prior to `page.goto()` so `page.addInitScript` injects the overrides before Next.js initial render executes `useState(() => isStandalone)`.
3. **Cross-Engine Execution:**
   - Both `Mobile Safari` and `webkit` execute without timeout or selector drift.

---

## 6. Execution Verification Protocol

Following implementation of the changes in `e2e/pwa-install-layout.spec.ts`, the executor must execute:

1. **Static Type Checking (Host):**
   ```bash
   npm run type-check
   ```
   *Expected:* Code 0. Confirms all test signatures, imports, and fixture types compile without error.

2. **Linting Check (Host):**
   ```bash
   npm run lint
   ```
   *Expected:* Code 0. Confirms ESLint rules and formatting compliance.

3. **Targeted Mobile Safari E2E Test (Containerized):**
   ```bash
   ./scripts/containers/run-e2e-container.sh mobile-safari e2e/pwa-install-layout.spec.ts
   ```
   *Expected:* 2 tests passed, 2 skipped (desktop tests skipped on mobile viewport), 0 failures.

4. **Desktop WebKit Regression E2E Test (Containerized):**
   ```bash
   ./scripts/containers/run-e2e-container.sh webkit e2e/pwa-install-layout.spec.ts
   ```
   *Expected:* 2 tests passed, 2 skipped (mobile tests skipped on desktop viewport), 0 failures.

---

## 7. Step-by-Step Task Lifecycle & Post-Execution

### Step 1: Mark Task In Progress in `plan.md`
Update `conductor/tracks/ios-pwa-testing_20261015/plan.md`:
`- [ ] Task: Update \`e2e/pwa-install-layout.spec.ts\` for Standalone Mode suppression` -> `- [~] Task: Update \`e2e/pwa-install-layout.spec.ts\` for Standalone Mode suppression`

### Step 2: Implement Code Changes
Update `e2e/pwa-install-layout.spec.ts` following the blueprint specifications in Sections 3, 4, and 5.

### Step 3: Run Execution Verification Protocol
Execute `npm run type-check`, `npm run lint`, and the containerized Playwright commands for `mobile-safari` and `webkit`.

### Step 4: Commit Code Changes
Stage file and commit:
```bash
git add e2e/pwa-install-layout.spec.ts
git commit -m "test(e2e): Update e2e/pwa-install-layout.spec.ts for standalone mode suppression"
```

### Step 5: Attach Task Summary with Git Notes
Retrieve commit hash and attach structured git note:
```bash
TASK_COMMIT_SHA=$(git log -1 --format="%H")
git notes add -m "Task: Update \`e2e/pwa-install-layout.spec.ts\` for Standalone Mode suppression

Summary: Enhanced e2e/pwa-install-layout.spec.ts with standalone mode tests for both Mobile and Desktop viewports using enableStandaloneMode. Verified that dispatching beforeinstallprompt under standalone mode keeps mobile install bar and desktop install card completely suppressed.

Files: e2e/pwa-install-layout.spec.ts

Rationale: Enforces PWA standalone invariants and defense-in-depth UI suppression across containerized Mobile Safari and WebKit profiles (ADR 0006)." $TASK_COMMIT_SHA
```

### Step 6: Update Track Plan & Commit Plan Update
1. Retrieve short SHA (`git log -1 --format="%h"`).
2. Update `conductor/tracks/ios-pwa-testing_20261015/plan.md`:
   - Change `[~]` to `[x]` with `[commit: <short_sha>]`.
   - Check both subtasks.
3. Commit plan update:
   ```bash
   git add conductor/tracks/ios-pwa-testing_20261015/plan.md
   git commit -m "conductor(plan): Mark task 'Update e2e/pwa-install-layout.spec.ts for Standalone Mode suppression' as complete"
   ```
