# Track Proposal: Test Automation Infrastructure Modernization & E2E Test Suite Stabilization

## Track Metadata
- **Proposed Track ID**: `test-infrastructure-e2e-stabilization_20260901`
- **Track Name**: Test Automation Infrastructure Modernization & E2E Test Suite Stabilization
- **Track Type**: `refactor`
- **Target Milestone**: [v3.6.0 - Architectural Recovery & Test Reliability](https://github.com/jarredb9/finger-lakes-app-57/milestone/1)
- **Parent Epic**: [#39 (Sprint 4: Frontend Modernization, Bundle Optimization & QA Architecture)](https://github.com/jarredb9/finger-lakes-app-57/issues/39)
- **Referenced Issues**: [#38 (Test Automation Infrastructure & Reliability)](https://github.com/jarredb9/finger-lakes-app-57/issues/38), [#25 (Stabilize E2E Test Suite by Resolving Next.js Hydration Race Conditions)](https://github.com/jarredb9/finger-lakes-app-57/issues/25)

---

## 1. Overview & Context
The technical debt audit and active investigation in Issue #25 identified deep architectural flakiness, anti-pattern sleeps, and test runner hazards in the test suite:
1. `MockMapsManager` in `e2e/utils.ts` is a monolithic 123 KB mock file that emulates entire backend systems inside JavaScript.
2. Production store instances are attached to `window` (`(window as any).use*Store = use*Store`), allowing E2E tests to poke state directly and bypass real UI lifecycles.
3. Tests rely on arbitrary `await page.waitForTimeout(...)` sleeps (up to 5,000ms) and `{ force: true }` clicks to mask hydration race conditions and animation timings, pushing full test run times to > 3 minutes.
4. `jest.resetModules()` called in `beforeEach` under JSDOM on Node 24 leaks V8 closures, causing worker memory exhaustion.
5. Global visual regression tolerance is set to `maxDiffPixelRatio: 0.10` (10%), allowing major visual regressions to pass silently.
6. Critical user paths (itinerary drag-and-drop reordering, offline mutation queue drainage on reconnect) have zero E2E test coverage.

This track represents the final stabilization phase (**Sprint 4 QA**) of Milestone v3.6.0, turning the test suite into a deterministic, fast, web-first verification system.

---

## 2. Guardrails & Operational Constraints (AGENTS.md)
- **Playwright Container Execution**: All E2E test executions must use the Podman container runner script: `./scripts/run-e2e-container.sh [--build] [project] [test_file]`. Do NOT run E2E suites directly on the host or in the main agent session.
- **Valid Container Projects**: `chromium`, `webkit`, `mobile-safari`, `mobile-chrome`, `all`.
- **DOM Stability Contract**: Tests must verify container state via `data-state="loading|error|ready"` on `map-container` and `trip-list-container` rather than early unmounting.
- **No Store Poking in Production**: Tests must drive behavior via standard user interactions and network mock routes. Production code must never expose stores on `window`.

---

## 3. Detailed Technical Requirements

### 3.1 Unit Testing (Jest 30) Isolation & Memory Management
- **[QA-05] Eliminate Node 24 JSDOM Memory Leaks**:
  - *Location*: [`jest.config.mjs`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/jest.config.mjs), [`lib/stores/__tests__/wineryStore.test.ts#L11-L38`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/stores/__tests__/wineryStore.test.ts#L11-L38)
  - *Problem*: `jest.resetModules()` inside `beforeEach` retains closures across V8 contexts, exhausting heap memory.
  - *Remediation*: Configure `workerIdleMemoryLimit: '512MB'` in `jest.config.mjs` and replace module re-evaluation with explicit `store.reset()` invocations.
- **[QA-06] Enable Global Mock Clears**:
  - *Location*: [`jest.config.mjs`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/jest.config.mjs), [`jest.setup.ts`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/jest.setup.ts)
  - *Problem*: Shared mutable mocks leak between independent test suites.
  - *Remediation*: Set `clearMocks: true` and reset all store mocks in `afterEach`.

### 3.2 E2E Architecture & Fixture Modularization
- **[QA-01] Decompose `MockMapsManager` Monolith**:
  - *Location*: [`e2e/utils.ts`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/e2e/utils.ts) (~123 KB)
  - *Problem*: Massive file attempting to mock Google Maps, Mapbox, Supabase Auth, and relational RPCs in a single class.
  - *Remediation*: Decompose into modular Playwright route fixtures under `e2e/fixtures/` (`maps.fixture.ts`, `auth.fixture.ts`, `trips.fixture.ts`).
- **[QA-03 & QA-04] Eliminate `window` Store Poking & Assertion Retries**:
  - *Location*: [`e2e/helpers.ts#L897-L980`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/e2e/helpers.ts#L897-L980), [`lib/stores/tripStore.ts#L1222-L1224`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/stores/tripStore.ts#L1222-L1224)
  - *Problem*: Production stores attach `window.useTripStore = useTripStore`, and test retry blocks invoke `store.setState()` to force UI state changes.
  - *Remediation*: Remove `window` store attachments completely; drive all test scenarios through UI actions and Playwright route mocks (`page.route()`).
- **[QA-07] Container Runner Script Modernization**:
  - *Location*: [`scripts/run-e2e-container.sh`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/scripts/run-e2e-container.sh)
  - *Problem*: Host node_modules contamination, SELinux volume mount permissions, and rigid argument passing.
  - *Remediation*: Fix container volume mounting, maintain `:Z` flags, and allow arbitrary Playwright CLI flags.

### 3.3 Flakiness Elimination & Issue #25 Hardening
- **[QA-09 & Issue #25] Zero `waitForTimeout` & Actionability Audit**:
  - *Location*: [`e2e/helpers.ts`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/e2e/helpers.ts), [`e2e/trip-flow.spec.ts`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/e2e/trip-flow.spec.ts), [`e2e/responsive-layout.spec.ts`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/e2e/responsive-layout.spec.ts)
  - *Problem*: Pervasive `page.waitForTimeout()` sleeps (up to 5,000ms) and ~27 occurrences of `{ force: true }` masking DOM layout/z-index issues.
  - *Remediation*:
    1. Replace every `waitForTimeout` with web-first auto-retrying assertions (`expect(locator).toBeVisible()`, `toPass()`, or `waitForResponse()`).
    2. Audit all `{ force: true }` clicks and fix underlying CSS z-index/animation actionability issues.
- **[QA-08] Strict Visual Snapshot Calibration**:
  - *Location*: [`playwright.config.ts#L38-L44`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/playwright.config.ts#L38-L44)
  - *Problem*: `maxDiffPixelRatio: 0.10` ignores up to 10% viewport shifts.
  - *Remediation*: Reduce `maxDiffPixelRatio` to `<= 0.01` (1%) and calibrate font/canvas rendering inside container.
- **[QA-10] High-Value Coverage Gaps**:
  - *Location*: [`e2e/trip-management.spec.ts`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/e2e/trip-management.spec.ts), [`e2e/pwa-offline.spec.ts`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/e2e/pwa-offline.spec.ts)
  - *Problem*: Missing tests for drag-and-drop itinerary reordering and full offline reconnect sync drainage (`setOffline(false)`).
  - *Remediation*: Add end-to-end specs validating itinerary reordering and offline reconnection flow.
- **Lint Guardrails**:
  - *Location*: [`.eslintrc.json`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/.eslintrc.json)
  - *Remediation*: Configure `eslint-plugin-playwright` with rules:
    - `'playwright/no-wait-for-timeout': 'error'`
    - `'playwright/no-force-option': 'warn'`

---

## 4. Acceptance Criteria
- [ ] `npm test` executes cleanly without out-of-memory heap crashes under Node 24.
- [ ] No production stores are attached to `window` in application source code.
- [ ] Zero instances of `page.waitForTimeout` remain in `e2e/` or test helpers.
- [ ] Zero `{ force: true }` options remain on standard interactive UI elements.
- [ ] `MockMapsManager` is broken into modular fixtures under `e2e/fixtures/`.
- [ ] `maxDiffPixelRatio` is reduced to `0.01` in `playwright.config.ts`.
- [ ] Drag-and-drop itinerary reordering and offline reconnect sync have automated E2E test coverage.
- [ ] `./scripts/run-e2e-container.sh chromium` and `./scripts/run-e2e-container.sh webkit` pass reliably with individual test runtimes < 15 seconds.

---

## 5. Proposed Phased Implementation Plan

### Phase 1: Jest 30 Isolation & Memory Leak Remediation
- [ ] Task: Configure `workerIdleMemoryLimit: '512MB'` and `clearMocks: true` in `jest.config.mjs`
- [ ] Task: Refactor `lib/stores/__tests__/` to replace `jest.resetModules()` with store `reset()`
- [ ] Task: Verify full Jest test suite runs cleanly with zero worker crashes
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Jest Isolation & Memory' (Protocol in workflow.md)

### Phase 2: Modular Route Fixtures & Window Store Detachment
- [ ] Task: Decompose `e2e/utils.ts` into modular fixtures under `e2e/fixtures/` (`maps`, `auth`, `trips`)
- [ ] Task: Remove `(window as any).use*Store` attachments from production stores
- [ ] Task: Refactor E2E helpers to drive state exclusively through UI and network route mocking
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Route Fixtures & Store Detachment' (Protocol in workflow.md)

### Phase 3: Anti-Pattern Sleep Removal, Actionability & E2E Coverage
- [ ] Task: Remove all `page.waitForTimeout()` calls and replace with web-first auto-retrying assertions
- [ ] Task: Audit and resolve all `{ force: true }` clicks in test specs
- [ ] Task: Add E2E tests for drag-and-drop itinerary reordering and offline sync drainage
- [ ] Task: Configure `eslint-plugin-playwright` lint guardrails and reduce `maxDiffPixelRatio` to `0.01`
- [ ] Task: Verify full containerized test run via `./scripts/run-e2e-container.sh all`
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Anti-Pattern Sleep Removal & Coverage' (Protocol in workflow.md)
