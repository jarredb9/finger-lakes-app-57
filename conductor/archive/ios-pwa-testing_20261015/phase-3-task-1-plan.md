# Implementation Plan: Phase 3 Task 1 - Implement Playwright `standalonePage` Fixture and `enableStandaloneMode` Helper

**Track:** `ios-pwa-testing_20261015` (Automated iOS PWA Standalone Testing Matrix & Domain Refactoring - Issue [#71](https://github.com/jarredb9/finger-lakes-app-57/issues/71))  
**Phase:** Phase 3 (Playwright Standalone Fixture & E2E Verification)  
**Task:** Task 1 (Implement Playwright `standalonePage` fixture and `enableStandaloneMode` helper)  
**Specification Reference:** [conductor/tracks/ios-pwa-testing_20261015/spec.md](./spec.md)  
**Track Plan Reference:** [conductor/tracks/ios-pwa-testing_20261015/plan.md](./plan.md)  
**Architecture Decision Reference:** [docs/adr/0006-containerized-ios-pwa-emulation-testing.md](../../../docs/adr/0006-containerized-ios-pwa-emulation-testing.md)  
**Workflow Reference:** [conductor/workflow.md](../../workflow.md)  

---

## 1. Executive Summary & Objective

### 1.1 Objective
Implement the test automation seam for containerized iOS PWA testing by providing:
1. An `enableStandaloneMode(page: Page)` helper function in `e2e/fixtures/shims/browser.shim.ts` that configures both iOS WebClip (`window.navigator.standalone = true`) and W3C standard (`(display-mode: standalone)` matchMedia override) signals.
2. A method on `BrowserShim.prototype.enableStandaloneMode()` delegating to the helper.
3. A `standalonePage` Playwright test fixture in `e2e/fixtures/index.ts` extending `base.extend<{ ... standalonePage: Page }>` that automatically injects standalone mode prior to page execution.
4. Re-exporting `enableStandaloneMode` and `standalonePage` through `e2e/fixtures/index.ts` and `e2e/utils.ts` for backward-compatible test authoring.

This establishes the prerequisite foundation for Phase 3 Task 2 (`e2e/trip-navigation-pwa.spec.ts`) and Phase 3 Task 3 (`e2e/pwa-install-layout.spec.ts`).

---

## 2. Invariants & Critical Guardrails

1. **Dual Standalone Signal Emulation (ADR 0006 & `spec.md` Section 2.4):**
   - Must emulate both iOS WebClip (`window.navigator.standalone = true`) and standard W3C CSS display mode (`window.matchMedia('(display-mode: standalone)').matches = true`) to satisfy all checks in `hooks/use-pwa.ts`.
2. **Default Browser Mode Preservation:**
   - Standalone mode must NOT be applied globally or by default to standard `page` fixtures. Standard tests expecting browser mode (such as install prompt triggers) must continue to run in non-standalone mode unperturbed.
3. **Execution Timing & Navigation Resiliency:**
   - `enableStandaloneMode` must invoke `page.addInitScript` so that overrides are established before any application scripts, Next.js hydration, or React effects execute.
   - For resiliency, `enableStandaloneMode` must also attempt `page.evaluate` with a no-op `.catch()` so that if invoked on an already loaded page, standalone mode applies immediately.
4. **Environment Isolation & Container Compatibility (`AGENTS.md` Section 3):**
   - Playwright E2E tests run via Podman containers on RHEL 8 (`./scripts/containers/run-e2e-container.sh`). All code must be strictly compatible with containerized Node.js 24 and Playwright 1.50+ WebKit / Mobile Safari profiles.
5. **Modal Approval Invariant (`AGENTS.md` Section 2 & `conductor_antigravity.md`):**
   - The implementation plan must be presented and halted for explicit user approval via modal before modifying any files.

---

## 3. Plan Blueprint: Target Files & Semantic Insertion Anchors

### 3.1 Target File 1: `e2e/fixtures/shims/browser.shim.ts`
- **Path:** `e2e/fixtures/shims/browser.shim.ts`
- **Semantic Insertion Anchors:**
  1. **Anchor 1 (Method Insertion):** Inside class `BrowserShim`, immediately following the `failMarkers()` method (around line 232).
  2. **Anchor 2 (Top-Level Function Export):** At the bottom of the file, following `setupBrowserShims()` (around line 240).

### 3.2 Target File 2: `e2e/fixtures/index.ts`
- **Path:** `e2e/fixtures/index.ts`
- **Semantic Insertion Anchors:**
  1. **Anchor 1 (Import Declaration):** In the fixture imports block (around line 5), import `enableStandaloneMode` from `./shims/browser.shim`.
  2. **Anchor 2 (Test Extension Type Parameter):** In `base.extend<{ ... }>` (lines 181–185), add `standalonePage: Page;` to the fixture type parameter.
  3. **Anchor 3 (Fixture Implementation):** Inside the `base.extend({ ... })` configuration object (around line 226, following `user2`), add the `standalonePage` fixture definition:
     ```typescript
     standalonePage: async ({ page }, use) => {
       await enableStandaloneMode(page);
       await use(page);
     },
     ```
  4. **Anchor 4 (Barrel Re-Export):** In the re-export section (around line 245), export `enableStandaloneMode` from `./shims/browser.shim`.

### 3.3 Target File 3: `e2e/utils.ts`
- **Path:** `e2e/utils.ts`
- **Semantic Insertion Anchors:**
  1. **Anchor 1 (Re-Export List):** Inside the primary export list from `'./fixtures'` (lines 5–28), add `enableStandaloneMode`.

---

## 4. Full TypeScript Interfaces & Exported Function Signatures

### 4.1 `e2e/fixtures/shims/browser.shim.ts`

```typescript
// Exported standalone helper
export async function enableStandaloneMode(page: Page): Promise<void>;

// BrowserShim instance method
export class BrowserShim {
  constructor(private page: Page);
  // ... existing methods: setupWebGLAndMapMocks, failMarkers ...
  async enableStandaloneMode(): Promise<void>;
}
```

### 4.2 `e2e/fixtures/index.ts`

```typescript
// Fixture type extension
export const test: import('@playwright/test').TestType<
  import('@playwright/test').PlaywrightTestArgs &
  import('@playwright/test').PlaywrightTestOptions & {
    mockMaps: CompositeMockMapsManager;
    user: TestUser;
    user2: TestUser;
    standalonePage: Page;
  },
  import('@playwright/test').PlaywrightWorkerArgs &
  import('@playwright/test').PlaywrightWorkerOptions
>;

// Exported helper
export { enableStandaloneMode } from './shims/browser.shim';
```

### 4.3 `e2e/utils.ts`

```typescript
// Exported from facade
export {
  test,
  expect,
  MockMapsManager,
  createDefaultMockState,
  getAdminClient,
  supabase,
  createTestUser,
  deleteTestUser,
  mockGoogleMapsApi,
  createMockTrip,
  createMockVisitWithWinery,
  createMockMapMarkerRpc,
  MapsFixtureManager,
  mapsFixture,
  AuthFixtureManager,
  authFixture,
  TripsFixtureManager,
  tripsFixture,
  TripsHandler,
  VisitsHandler,
  SocialHandler,
  FavoritesHandler,
  enableStandaloneMode,
} from './fixtures';
```

---

## 5. Precise Behavioral Logic, Formulas & Edge Cases

### 5.1 `enableStandaloneMode(page: Page)` Implementation Logic

1. **`page.addInitScript` Injection:**
   - **Signal 1: iOS WebClip Navigator Override:**
     - Attempt `Object.defineProperty(window.navigator, 'standalone', { get: () => true, configurable: true, enumerable: true })`.
     - In catch block (fallback for strict or proxy environments), assign `(window.navigator as unknown as { standalone: boolean }).standalone = true`.
   - **Signal 2: W3C Standard Media Query Override:**
     - Intercept `window.matchMedia(query: string)`:
       - Cache `originalMatchMedia = window.matchMedia ? window.matchMedia.bind(window) : undefined`.
       - Check if `typeof query === 'string' && query.includes('display-mode: standalone')`.
       - If matching:
         - Construct base `MediaQueryList` object either from calling `originalMatchMedia(query)` or creating a conformant fallback with standard properties (`matches: true`, `media: query`, `onchange: null`, and no-op `addListener`, `removeListener`, `addEventListener`, `removeEventListener`, `dispatchEvent: () => true`).
         - Return a `Proxy` wrapping the object with a getter interceptor for `prop === 'matches'` returning `true`.
       - If not matching:
         - Delegate directly to `originalMatchMedia(query)` if defined.
         - Otherwise return a non-matching fallback (`matches: false`).
2. **`page.evaluate` Immediate Application:**
   - Execute the same navigator and matchMedia logic within `page.evaluate(...)`.
   - Wrap with `.catch(() => {})` so that if no page has been navigated yet, the promise resolves without rejecting.
3. **Edge Cases Handled:**
   - **Late Navigation vs Immediate Invocation:** If `enableStandaloneMode` is called before `page.goto()`, `addInitScript` handles it. If called after `page.goto()`, `evaluate` handles it immediately.
   - **Non-Matching Media Queries:** Non-standalone media queries (e.g., `(prefers-color-scheme: dark)`, `(max-width: 768px)`) continue to delegate cleanly to native `window.matchMedia`.
   - **EventListener Methods:** Standard `addEventListener` and legacy `addListener` calls on the returned `MediaQueryList` do not crash or throw undefined exceptions.

---

## 6. Execution Verification Protocol

Following implementation, the executor must run the following verification sequence:

1. **Static Type Checking (Host):**
   ```bash
   npm run type-check
   ```
   *Expected:* Exits with code 0. Confirms that `standalonePage` fixture, `enableStandaloneMode` helper, and re-exports in `e2e/fixtures/index.ts` and `e2e/utils.ts` satisfy all TypeScript compilation constraints.

2. **Linting Check (Host):**
   ```bash
   npm run lint
   ```
   *Expected:* Exits with code 0. Confirms no unused variables, formatting, or lint rule violations.

3. **Regression E2E Suite Verification (Containerized WebKit):**
   ```bash
   ./scripts/containers/run-e2e-container.sh webkit e2e/pwa-install-layout.spec.ts
   ```
   *Expected:* All tests in `e2e/pwa-install-layout.spec.ts` pass cleanly under containerized WebKit. Confirms that standard `page` fixture remains in browser mode without regression.

---

## 7. Step-by-Step Task Lifecycle & Post-Execution

### Step 1: Mark Task In Progress in `plan.md`
Update `conductor/tracks/ios-pwa-testing_20261015/plan.md`:
`- [ ] Task: Implement Playwright standalonePage fixture and enableStandaloneMode helper` -> `- [~] Task: Implement Playwright standalonePage fixture and enableStandaloneMode helper`

### Step 2: Implement Code Changes
Apply the modifications to:
- `e2e/fixtures/shims/browser.shim.ts`
- `e2e/fixtures/index.ts`
- `e2e/utils.ts`

### Step 3: Run Execution Verification Protocol
Execute `npm run type-check`, `npm run lint`, and `./scripts/containers/run-e2e-container.sh webkit e2e/pwa-install-layout.spec.ts`.

### Step 4: Commit Code Changes
Stage files and commit:
```bash
git add e2e/fixtures/shims/browser.shim.ts e2e/fixtures/index.ts e2e/utils.ts
git commit -m "feat(e2e): Implement Playwright standalonePage fixture and enableStandaloneMode helper"
```

### Step 5: Attach Task Summary with Git Notes
Retrieve commit hash and attach structured git note:
```bash
TASK_COMMIT_SHA=$(git log -1 --format="%H")
git notes add -m "Task: Implement Playwright \`standalonePage\` fixture and \`enableStandaloneMode\` helper

Summary: Added enableStandaloneMode helper in e2e/fixtures/shims/browser.shim.ts, added standalonePage fixture to Playwright test extension in e2e/fixtures/index.ts, and re-exported both via e2e/fixtures/index.ts and e2e/utils.ts for iOS WebClip and standalone PWA testing.

Files: e2e/fixtures/shims/browser.shim.ts, e2e/fixtures/index.ts, e2e/utils.ts

Rationale: Establishes the reusable Playwright test fixture and standalone emulation seam enabling automated iOS WebKit and Mobile Safari E2E testing without physical devices or macOS simulator licensing (ADR 0006)." $TASK_COMMIT_SHA
```

### Step 6: Update Track Plan & Commit Plan Update
1. Retrieve short SHA (`git log -1 --format="%h"`).
2. Update `conductor/tracks/ios-pwa-testing_20261015/plan.md`:
   - Change `[~]` to `[x]` with `[commit: <short_sha>]`.
   - Check both subtasks.
3. Commit plan update:
   ```bash
   git add conductor/tracks/ios-pwa-testing_20261015/plan.md
   git commit -m "conductor(plan): Mark task 'Implement Playwright standalonePage fixture and enableStandaloneMode helper' as complete"
   ```
