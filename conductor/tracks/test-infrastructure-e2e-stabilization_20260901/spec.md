# Specification: Test Automation Infrastructure Modernization & E2E Test Suite Stabilization

## 1. Overview & Objectives
This track executes the **Test Automation Infrastructure Modernization & E2E Test Suite Stabilization** initiative for Milestone [v3.6.0 - Architectural Recovery & Test Reliability](https://github.com/jarredb9/finger-lakes-app-57/milestone/1), completing the remaining QA scope of parent epic [#39](https://github.com/jarredb9/finger-lakes-app-57/issues/39) and addressing issues [#38](https://github.com/jarredb9/finger-lakes-app-57/issues/38) and [#25](https://github.com/jarredb9/finger-lakes-app-57/issues/25), building directly on [05-test-infrastructure-e2e-stabilization.md](file:///home/byrnesjd4821/Git/finger-lakes-app-57/conductor/proposals/05-test-infrastructure-e2e-stabilization.md).

The primary objectives are organized into **3 focused phases**:
1. **Jest 30 Isolation, Memory Leak Remediation & Service Mutation Tests (Phase 1)**: Eliminate Node 24 JSDOM memory exhaustion by setting `workerIdleMemoryLimit: '512MB'` and replacing `jest.resetModules()` with explicit store `reset()` invocations. Enable global mock isolation (`clearMocks: true`). Implement unit test suites covering binary Base64 serialization / offline photo reconstitution in `visitInitHelpers.ts` (`visitStore.domainInvariants.test.ts`), social RPC mutations (`socialService.test.ts`), and trip RPC mutation chains / ownership guards (`tripService.mutations.test.ts`).
2. **Modular Route Fixtures & Window Store Detachment (Phase 2)**: Decompose the monolithic ~123 KB `MockMapsManager` in `e2e/utils.ts` into modular route fixtures under `e2e/fixtures/` (`maps.fixture.ts`, `auth.fixture.ts`, `trips.fixture.ts`). Completely eliminate `(window as any).use*Store` attachments from production application code (`tripStore.ts`, etc.) and remove assertion retry store poking from test helpers, driving test scenarios entirely through UI actions and network route mocks. Modernize `scripts/run-e2e-container.sh` for reliable volume mounting and arbitrary CLI options.
3. **Flakiness Elimination, Actionability & E2E Coverage (Phase 3)**: Replace all arbitrary `page.waitForTimeout()` sleeps across `e2e/` with auto-retrying web-first assertions (`expect(locator).toBeVisible()`, `waitForResponse()`, `toPass()`). Audit all ~27 occurrences of `{ force: true }` clicks, fixing underlying z-index and animation actionability issues. Tighten visual regression tolerance to `maxDiffPixelRatio: 0.01` (1%). Add full E2E coverage for drag-and-drop itinerary reordering and offline mutation queue reconnection/drainage. Enforce lint guardrails via `eslint-plugin-playwright`.

---

## 2. Detailed Technical Scope

### 2.1 Unit Testing (Jest 30) Isolation & Memory Management
- **QA-05 (Node 24 JSDOM Memory Leaks)**:
  - Configure `workerIdleMemoryLimit: '512MB'` in `jest.config.mjs`.
  - Refactor `lib/stores/__tests__/wineryStore.test.ts` and related store tests to eliminate `jest.resetModules()` in `beforeEach`, invoking `useWineryStore.getState().reset()` instead.
- **QA-06 (Global Mock Isolation)**:
  - Enable `clearMocks: true` in `jest.config.mjs`.
  - Ensure all store and global mocks are reset cleanly between test runs in `jest.setup.ts`.
- **QA-13 (Visit Store Offline Reconstitution & Domain Invariants)**:
  - Build `lib/stores/__tests__/visitStore.domainInvariants.test.ts` to test `lib/stores/slices/visitInitHelpers.ts` (raising coverage from 27% to >= 80%), testing binary Base64 photo reconstitution and offline serialization.
- **QA-14 (Social & Trip Service Mutation Test Suites)**:
  - Implement `lib/services/__tests__/socialService.test.ts` (raising coverage from 0% to >= 80%), validating friend requests, social visits, and permissions.
  - Implement `lib/services/__tests__/tripService.mutations.test.ts`, covering multi-winery RPC chaining, trip deletion guards, and error rollbacks.

### 2.2 E2E Architecture & Fixture Modularization
- **QA-01 (Decompose `MockMapsManager`)**:
  - Decompose `e2e/utils.ts` (~123 KB) into modular route fixtures in `e2e/fixtures/`:
    - `e2e/fixtures/maps.fixture.ts` (Google Maps & Mapbox tile/API routes)
    - `e2e/fixtures/auth.fixture.ts` (Supabase Auth sessions and user state)
    - `e2e/fixtures/trips.fixture.ts` (Trips, stops, and visit RPC mocks)
- **QA-03 & QA-04 (Eliminate `window` Store Poking & Assertion Retries)**:
  - Remove `(window as any).use*Store = use*Store` from `lib/stores/tripStore.ts` and any other application store files.
  - Refactor `e2e/helpers.ts` to remove store poking (`store.setState()`) in assertion retries; drive state purely via native UI and network routes.
- **QA-07 (Container Runner Script Modernization)**:
  - Modernize `scripts/run-e2e-container.sh` to prevent host `node_modules` pollution, preserve SELinux `:Z` mount flags, and pass through arbitrary Playwright CLI flags.

### 2.3 Flakiness Elimination & Issue #25 Hardening
- **QA-09 & Issue #25 (Zero `waitForTimeout` & Actionability Audit)**:
  - Eliminate all `page.waitForTimeout()` sleeps across `e2e/helpers.ts`, `e2e/trip-flow.spec.ts`, `e2e/responsive-layout.spec.ts`, `e2e/photo-flow.spec.ts`, `e2e/pwa-resilience.spec.ts`, and `e2e/pwa-assets.spec.ts`.
  - Audit ~27 occurrences of `{ force: true }` in `e2e/helpers.ts` and spec files; resolve underlying z-index, visibility, and animation actionability issues.
- **QA-08 (Strict Visual Snapshot Calibration)**:
  - Reduce `maxDiffPixelRatio` in `playwright.config.ts` from `0.10` to `0.01` (1%).
- **QA-10 (High-Value E2E Coverage Gaps)**:
  - Add E2E tests for itinerary drag-and-drop reordering in `e2e/trip-management.spec.ts`.
  - Add E2E tests for offline reconnect queue drainage (`setOffline(false)`) and cache invalidation in `e2e/pwa-offline.spec.ts`.
- **Lint Guardrails**:
  - Configure `eslint-plugin-playwright` in `.eslintrc.json`:
    - `'playwright/no-wait-for-timeout': 'error'`
    - `'playwright/no-force-option': 'warn'`

---

## 3. Operational Guardrails (AGENTS.md)
- **Playwright Container Execution**: All E2E test executions must use `./scripts/run-e2e-container.sh [--build] [project] [test_file]`. No running directly on the host.
- **Valid Container Projects**: `chromium`, `webkit`, `mobile-safari`, `mobile-chrome`, `all`.
- **DOM Stability**: UI containers (`map-container`, `trip-list-container`) must use `data-state="loading|error|ready"`.
- **No Store Poking in Production**: Stores must not be exposed on `window`.

---

## 4. Acceptance Criteria
- [ ] `npm test` executes cleanly without out-of-memory heap exhaustion or worker crashes under Node 24.
- [ ] No production stores are attached to `window` in application source code.
- [ ] Zero instances of `page.waitForTimeout` remain in `e2e/` or test helpers.
- [ ] Zero `{ force: true }` options remain on standard interactive UI elements without explicit documented justification.
- [ ] `MockMapsManager` is broken into modular fixtures under `e2e/fixtures/`.
- [ ] `maxDiffPixelRatio` is reduced to `0.01` in `playwright.config.ts`.
- [ ] Drag-and-drop itinerary reordering and offline reconnect sync have automated E2E test coverage.
- [ ] `visitStore.domainInvariants.test.ts` passes and brings `visitInitHelpers.ts` coverage to >= 80%.
- [ ] `socialService.ts` and mutating operations in `tripService.ts` have dedicated unit test coverage in `lib/services/__tests__/` (>= 80%).
- [ ] Containerized test runner executes cleanly across all browser projects (`chromium`, `webkit`, `mobile-safari`, `mobile-chrome`) with individual test runtimes < 15 seconds.

---

## 5. Out of Scope
- Production database schema migrations or remote Supabase DDL mutations.
- Modifying business domain logic unrelated to test fixtures, service mutation error rollbacks, or store window detachments.
