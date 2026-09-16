# Specification: Test Automation Infrastructure Modernization & E2E Test Suite Stabilization

## 1. Overview & Objectives
This track executes the **Test Automation Infrastructure Modernization & E2E Test Suite Stabilization** initiative for Milestone [v3.6.0 - Architectural Recovery & Test Reliability](https://github.com/jarredb9/finger-lakes-app-57/milestone/1), completing the remaining QA scope of parent epic [#39](https://github.com/jarredb9/finger-lakes-app-57/issues/39) and addressing issues [#38](https://github.com/jarredb9/finger-lakes-app-57/issues/38) and [#25](https://github.com/jarredb9/finger-lakes-app-57/issues/25), building directly on [05-test-infrastructure-e2e-stabilization.md](file:///home/byrnesjd4821/Git/finger-lakes-app-57/conductor/proposals/05-test-infrastructure-e2e-stabilization.md).

The primary objectives are organized into **8 bounded phases** (adhering strictly to Contract Decoupling, Domain Separation, and Bounded Phase Sizing of max 3–4 tasks per phase):
1. **Jest 30 Test Infrastructure, Memory Limits & Module Reset Remediation (Phase 1)**: Eliminate Node 24 JSDOM memory exhaustion by setting `workerIdleMemoryLimit: '512MB'` in `jest.config.mjs`, enabling global mock isolation (`clearMocks: true`), polyfilling `URL.createObjectURL` / `URL.revokeObjectURL` in `jest.setup.ts`, and eliminating `jest.resetModules()` (34 occurrences across 22 test files) by hoisting mocks and utilizing explicit store/service resets.
2. **Visit Store Domain Invariants & Offline Photo Reconstitution (Phase 2)**: Build comprehensive domain invariant unit testing in `lib/stores/__tests__/visitStore.domainInvariants.test.ts` to test and harden `lib/stores/slices/visitInitHelpers.ts` (raising coverage from 27% to >= 80%), validating binary Base64 photo serialization, React 19 concurrent double-mount deduplication mutex, and offline mutation queue payload reconstitution.
3. **Supabase Service Mutation Test Suites & Ownership Guards (Phase 3)**: Implement unit test suites covering all 8 methods in `lib/services/__tests__/socialService.test.ts` (raising coverage from 0% to >= 80%) and mutating operations in `lib/services/__tests__/tripService.mutations.test.ts` (multi-winery RPC chaining, trip deletion guards, notes updates, and `.neq('role', 'owner')` owner protection guards).
4. **Store Isolation, Engine Window Detachment & Runner Script Modernization (Phase 4)**: Eliminate production cross-store window access in `lib/stores/uiStore.ts:205-207`. Strip `(window as any).use*Store` attachments from production builds by gating strictly behind `process.env.NEXT_PUBLIC_IS_E2E === 'true'`, augment `lib/shims.d.ts` with typed global `Window` and `globalThis` declarations to eliminate all `any` casts across stores, components, utilities, and tests, and update unit slice test assertions in `tripStore.slices.test.ts` and `visitStore.slices.test.ts`. Modernize `scripts/run-e2e-container.sh` to fix positional argument parsing (defaulting to `webkit`), guard `shift`, collect array CLI arguments safely, and add isolated container volume mounts to prevent host `node_modules` pollution.
5. **Playwright 1.63 Container & NPM Package Upgrade (Phase 5)**: Upgrade `@playwright/test` to 1.63.0 in `package.json` and sync lockfile, bump `PLAYWRIGHT_VERSION="v1.63.0-noble"` in `scripts/run-e2e-container.sh` and `scripts/run-jest-container.sh`, pull the new Noble container image, certify rootless Podman/Docker execution on RHEL 8 under SELinux `:Z`, verify browser binary parity (`chromium`, `webkit`, `Mobile Safari`, `firefox`), and certify Jest container runner compatibility without Node 24 regressions.
6. **Modular Route Fixtures & E2E Helper Store-Poking Decoupling (Phase 6)**: Decompose the monolithic ~80 KB `MockMapsManager` in `e2e/utils.ts` into modular route fixtures under `e2e/fixtures/` (`maps.fixture.ts`, `auth.fixture.ts`, `trips.fixture.ts`, `index.ts`) while re-exporting in `e2e/utils.ts` via an expand-and-contract delegation façade to ensure 100% backward compatibility across all 31 existing spec files. Refactor `e2e/helpers.ts` to eliminate store-poking in assertion retries and replace store hydration polling with DOM readiness checks (`data-state="ready"`).
7. **E2E Lint Guardrails, Snapshot Calibration & Actionability Flakiness Elimination (Phase 7)**: Configure `eslint-plugin-playwright` in `eslint.config.mjs` (ESLint 9 Flat Config) with `'playwright/no-wait-for-timeout': 'error'` and `'playwright/no-force-option': 'warn'`. Reduce `maxDiffPixelRatio` in `playwright.config.ts` from `0.10` to `0.01` (1%) and strip inline overrides in `e2e/visual.spec.ts`. Eliminate all 12 `page.waitForTimeout()` sleeps and remediate all 24 `{ force: true }` clicks across 7 files with native actionability fixes.
8. **High-Value E2E Feature Coverage & Cross-Browser Verification (Phase 8)**: Add end-to-end tests for drag-and-drop itinerary reordering using `@hello-pangea/dnd` in `e2e/trip-management.spec.ts` and offline reconnect queue drainage (`setOffline(false)`) and cache invalidation in `e2e/pwa-offline.spec.ts`. Execute full container test pass across all browser projects (`chromium`, `webkit`, `mobile-safari`, `mobile-chrome`).

---

## 2. Detailed Technical Scope

### 2.1 Unit Testing (Jest 30) Isolation & Memory Management
- **QA-05 (Node 24 JSDOM Memory Leaks & Module Reset Remediation)**:
  - Configure `workerIdleMemoryLimit: '512MB'` in `jest.config.mjs`.
  - Refactor test files with `jest.resetModules()` (34 occurrences across 22 test files, including `wineryStore.test.ts`, `tripStore.slices.test.ts`, `visitStore.slices.test.ts`, `visitStore.sync.test.ts`, `realtimeChannelCleanup.test.ts`, `privacy-refactor.test.ts`, and sync integration tests). Hoist `@/utils/supabase/client` mocks to file level with controllable state and invoke explicit `store.getState().reset()`.
  - Polyfill `global.URL.createObjectURL` and `global.URL.revokeObjectURL` in `jest.setup.ts` to support JSDOM testing of binary serialization.
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
  - Decompose `e2e/utils.ts` into modular route fixtures in `e2e/fixtures/`:
    - `e2e/fixtures/maps.fixture.ts` (Google Maps & Mapbox tile/API routes)
    - `e2e/fixtures/auth.fixture.ts` (Supabase Auth sessions and user state)
    - `e2e/fixtures/trips.fixture.ts` (Trips, stops, and visit RPC mocks)
    - `e2e/fixtures/index.ts` (Consolidated `test` fixture via `test.extend()`)
  - Re-export fixtures in `e2e/utils.ts` via an adapter class to ensure full backward compatibility across all 31 existing spec files.
- **QA-03 & QA-04 (Eliminate Production Window Stores & Decouple Assertion Retries)**:
  - Refactor `lib/stores/uiStore.ts:205-207` to eliminate cross-store window access (`(window as any).useTripStore.getState().setSelectedTrip(null)`).
  - Gate all store `window` attachments (`tripStore.ts:62-64`, `visitStore.ts:63-65`, `mapStore.ts:146-148`, `friendStore.ts:298-300`, `userStore.ts:201-203`, `wineryStore.ts:548-551`, `syncStore.ts:157-162`, `uiStore.ts:251-253`) and `<E2EStoreExposer />` (`app/layout.tsx:53`, `components/e2e-store-exposer.tsx:18`) strictly behind `process.env.NEXT_PUBLIC_IS_E2E === 'true'`, completely stripping window store exposure in standard development and production builds (noting that while `syncStore.ts` had previously gated `idbKeyVal`, `useSyncStore` itself was leaking unconditionally).
  - Augment `lib/shims.d.ts` with strongly typed `interface Window` and `globalThis` declarations (`use*Store`, `SyncService`, `createSupabaseClient`, `supabase`, `standardizeWineryData`, `getWineryVibeTags`, `idbKeyVal`, `_E2E_*`, `_PWA_UPDATING`), eliminating all `(window as any)` and `(global as any)` type casts across store files, components, utilities, and test suites.
  - Update unit assertions in `tripStore.slices.test.ts:83-86` and `visitStore.slices.test.ts:80-83` to reflect the gated test environment behavior.
  - Ensure `e2e/helpers.ts:login` replaces window store hydration checks with web-first DOM readiness checks (`data-state="ready"` on `map-container` and `trip-list-container`).
  - Refactor `e2e/helpers.ts` to eliminate `store.setState()` calls inside retry loops, driving assertions through native UI interactions and network route responses.
- **QA-07 (Container Runner Script Modernization & Volume Isolation)**:
  - Modernize and harden container runner scripts (`scripts/run-e2e-container.sh`, `scripts/run-jest-container.sh`, `scripts/run-dev-container.sh`, `scripts/run-build-container.sh`):
    - Fix positional argument parsing (lines 103–125) in `scripts/run-e2e-container.sh` so passing a spec path (e.g. `./scripts/run-e2e-container.sh e2e/trip-flow.spec.ts`) or flag defaults project to `webkit` rather than misassigning to `$PROJECT`.
    - Guard `shift` to eliminate crashes on zero positional arguments.
    - Support passing arbitrary Playwright CLI flags (`--grep`, `--debug`, `--update-snapshots`) as array parameters.
    - Prevent host `node_modules` pollution via container volume isolation (`-v /work/node_modules`) and reconcile SELinux `:Z` mount flags across all container scripts.

### 2.3 Playwright 1.63 Container & Toolchain Upgrade
- **QA-15 (Playwright 1.63 NPM & Container Upgrade)**:
  - Upgrade `@playwright/test` from `1.58.2` to `1.63.0` in `package.json` and sync `package-lock.json`.
  - Update `PLAYWRIGHT_VERSION="v1.63.0-noble"` uniformly across all container scripts (`scripts/run-e2e-container.sh`, `scripts/run-jest-container.sh`, `scripts/run-dev-container.sh`, `scripts/run-build-container.sh`).
  - Certify rootless Podman/Docker execution on RHEL 8 under SELinux `:Z` and container volume isolation (`-v /work/node_modules`).
  - Verify browser engines (`chromium`, `webkit`, `Mobile Safari`, `firefox`) within the new container.
  - Certify that the Jest container test runner (`scripts/run-jest-container.sh`), build runner (`scripts/run-build-container.sh`), and dev runner (`scripts/run-dev-container.sh`) continue to pass cleanly on the updated Noble image without Node 24 regressions.
  - Audit and remediate any breaking API changes or locator strictness issues introduced between 1.58 and 1.63.

### 2.4 Flakiness Elimination & Issue #25 Hardening
- **QA-09 & Issue #25 (Zero `waitForTimeout` & Actionability Audit)**:
  - Eliminate all 12 `page.waitForTimeout()` sleeps across verified files: `e2e/pwa-assets.spec.ts` (L119), `e2e/photo-flow.spec.ts` (L102), `e2e/trip-flow.spec.ts` (L101), `e2e/helpers.ts` (L509, L633), and `e2e/responsive-layout.spec.ts` (L42, L67, L101, L122, L127, L133, L139).
  - Replace sleeps with web-first auto-retrying assertions (`expect(locator).toBeVisible()`, `waitForResponse()`, `expect.poll()`, `toPass()`) or Playwright's `page.clock` API for timer/debounce-dependent flows (e.g. `page.clock.fastForward()`).
  - Audit all 24 code occurrences of `{ force: true }` across 7 files (`photo-flow.spec.ts`, `helpers.ts`, `trip-flow.spec.ts`, `auth-recovery.spec.ts`, `visit-flow.spec.ts`, `accessibility.spec.ts`, `runtime-audit.spec.ts`); resolve underlying z-index, visibility, hover styles, and animation actionability issues.
- **QA-08 (Strict Visual Snapshot Calibration)**:
  - Reduce `maxDiffPixelRatio` in `playwright.config.ts` from `0.10` to `0.01` (1%).
  - Strip the 7 inline `maxDiffPixelRatio: 0.10` overrides from `e2e/visual.spec.ts` (L67, L92, L123, L135, L147, L161, L176). Re-baseline snapshots if anti-aliasing variations emerge.
- **QA-10 (High-Value E2E Coverage Gaps)**:
  - Add E2E tests for itinerary drag-and-drop reordering in `e2e/trip-management.spec.ts`. Note: `@hello-pangea/dnd` relies on pointer/mouse/keyboard sensors rather than native HTML5 drag events; drive reordering via mouse steps (`page.mouse.move(..., { steps: 10 })`) or accessible keyboard interactions (`Space` -> `ArrowDown` -> `Space`).
  - Add E2E tests for offline reconnect queue drainage (`setOffline(false)`) and cache invalidation in `e2e/pwa-offline.spec.ts`.
- **Lint Guardrails**:
  - Configure `eslint-plugin-playwright` in `eslint.config.mjs` using ESLint 9 Flat Config (`playwright.configs['flat/recommended']` or plugin definition) matching `files: ['e2e/**/*.{ts,js}']`:
    - `'playwright/no-wait-for-timeout': 'error'`
    - `'playwright/no-force-option': 'warn'`

---

## 3. Operational Guardrails (AGENTS.md)
- **Playwright Container Execution**: All E2E test executions must use `./scripts/run-e2e-container.sh [--build] [project] [test_file]`. No running directly on the host.
- **Valid Container Projects**: `chromium`, `webkit`, `mobile-safari`, `mobile-chrome`, `all`.
- **DOM Stability**: UI containers (`map-container`, `trip-list-container`) must use `data-state="loading|error|ready"`.
- **No Store Poking in Production**: Stores must not be exposed on `window` in production builds.

---

## 4. Acceptance Criteria
- [ ] `npm test` executes cleanly without out-of-memory heap exhaustion or worker crashes under Node 24.
- [ ] Zero production stores are attached to `window` in production builds (`process.env.NEXT_PUBLIC_IS_E2E !== 'true'`).
- [ ] Cross-store window access in `uiStore.ts` is eliminated.
- [ ] Zero instances of `page.waitForTimeout` remain in `e2e/` or test helpers.
- [ ] Zero `{ force: true }` options remain on standard interactive UI elements without explicit documented justification.
- [ ] `@playwright/test` is upgraded to `1.63.0` in `package.json` and container image is updated to `v1.63.0-noble` across `run-e2e-container.sh` and `run-jest-container.sh`.
- [ ] Containerized test runner parses CLI arguments and spec files correctly and passes cleanly across browser projects in the 1.63 image.
- [ ] Jest container test runner executes cleanly without regressions in the 1.63 container image.
- [ ] `MockMapsManager` is broken into modular fixtures under `e2e/fixtures/` and re-exported through `e2e/utils.ts`.
- [ ] `maxDiffPixelRatio` is reduced to `0.01` globally and inline overrides in `e2e/visual.spec.ts` are removed.
- [ ] Drag-and-drop itinerary reordering and offline reconnect sync have automated E2E test coverage.
- [ ] `visitStore.domainInvariants.test.ts` passes and brings `visitInitHelpers.ts` coverage to >= 80%.
- [ ] `socialService.ts` and mutating operations in `tripService.ts` have dedicated unit test coverage in `lib/services/__tests__/` (>= 80%).
- [ ] `eslint-plugin-playwright` is configured in `eslint.config.mjs` and linter checks pass with zero errors.
- [ ] Global `Window` interface in `lib/shims.d.ts` provides complete typings for E2E store exposures and eliminates all `(window as any)` and `(global as any)` type casts.

---

## 5. Out of Scope
- Production database schema migrations or remote Supabase DDL mutations.
- Modifying business domain logic unrelated to test fixtures, service mutation error rollbacks, or store window detachments.
