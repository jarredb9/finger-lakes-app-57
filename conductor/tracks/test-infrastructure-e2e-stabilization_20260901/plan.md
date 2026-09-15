# Implementation Plan: Test Automation Infrastructure Modernization & E2E Test Suite Stabilization

Stabilizing the test automation infrastructure by eliminating Node 24 JSDOM memory leaks, enabling global mock clearing, filling critical unit coverage gaps in visit offline reconstitution and service mutations, decomposing the monolithic `MockMapsManager` into modular fixtures, removing production `window` store attachments, eliminating arbitrary `waitForTimeout` sleeps and `{ force: true }` clicks, calibrating visual snapshots to 1%, and adding E2E coverage for itinerary reordering and offline reconnection.

## Phase 1: Jest 30 Isolation, Memory Leak Remediation & Service Mutation Tests
Focus: Eliminate Node 24 JSDOM worker memory exhaustion, configure global mock clearing, refactor store tests away from `jest.resetModules()`, and implement unit test suites for `visitInitHelpers.ts`, `socialService.ts`, and `tripService.ts`.

- [ ] Task: Configure Jest memory limits and global mock isolation in jest.config.mjs and jest.setup.ts
    - [ ] Add `workerIdleMemoryLimit: '512MB'` and `clearMocks: true` in `jest.config.mjs`
    - [ ] Ensure store and service mocks are cleanly reset in `afterEach` in `jest.setup.ts`
- [ ] Task: Refactor store tests to eliminate `jest.resetModules()` memory leaks
    - [ ] Replace `jest.resetModules()` in `lib/stores/__tests__/wineryStore.test.ts` with explicit `useWineryStore.getState().reset()`
    - [ ] Audit and remove any remaining `jest.resetModules()` calls in other store test suites
- [ ] Task: Write failing domain invariant tests for visit store offline reconstitution and serialization
    - [ ] Create `lib/stores/__tests__/visitStore.domainInvariants.test.ts` testing Base64 photo reconstitution and offline queueing in `lib/stores/slices/visitInitHelpers.ts`
    - [ ] Verify tests fail as expected (Red phase)
- [ ] Task: Implement fixes to satisfy visit store domain invariants
    - [ ] Harden `lib/stores/slices/visitInitHelpers.ts` photo serialization and error handling
    - [ ] Verify `visitStore.domainInvariants.test.ts` passes and coverage of `visitInitHelpers.ts` is >= 80% (Green phase)
- [ ] Task: Write failing unit test suites for social service and trip service mutations
    - [ ] Create `lib/services/__tests__/socialService.test.ts` covering friend requests, status updates, and social visit operations
    - [ ] Create `lib/services/__tests__/tripService.mutations.test.ts` covering multi-winery RPC chaining, trip deletion guards, and error rollbacks
    - [ ] Confirm tests fail (Red phase)
- [ ] Task: Implement service mutation hardening and verify test coverage
    - [ ] Ensure `socialService.ts` and `tripService.ts` error handling and rollback invariants satisfy all test cases
    - [ ] Run full Jest test suite to verify 100% passing tests with zero worker heap crashes (Green phase)
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Jest 30 Isolation, Memory Leak Remediation & Service Mutation Tests' (Protocol in workflow.md)

## Phase 2: Modular Route Fixtures & Window Store Detachment
Focus: Decompose monolithic `MockMapsManager` into modular route fixtures under `e2e/fixtures/`, detach production stores from `window`, eliminate assertion retry store pokes, and modernize the container runner script.

- [ ] Task: Write failing tests for production window store detachment and runner script options
    - [ ] Add test in `lib/__tests__/tooling/store-isolation.test.ts` verifying `window.useTripStore` and related stores are not attached in production code
    - [ ] Verify tests fail if store window attachments exist
- [ ] Task: Remove window store attachments from production code
    - [ ] Remove `(window as any).useTripStore = useTripStore` from `lib/stores/tripStore.ts`
    - [ ] Audit and remove any other `(window as any).use*Store` attachments across the repository
- [ ] Task: Decompose `MockMapsManager` into modular Playwright route fixtures
    - [ ] Create `e2e/fixtures/maps.fixture.ts` isolating Google Maps & Mapbox tile, geocode, and loader mocks
    - [ ] Create `e2e/fixtures/auth.fixture.ts` handling Supabase session mock injection and user fixtures
    - [ ] Create `e2e/fixtures/trips.fixture.ts` handling trip creation, stops, and visit RPC mocks
    - [ ] Refactor `e2e/utils.ts` and `e2e/fixtures/index.ts` to export consolidated fixtures without monolithic class coupling
- [ ] Task: Refactor E2E helpers to eliminate store-poking in assertion retries
    - [ ] Refactor `e2e/helpers.ts` to remove `store.setState()` calls from retry loops
    - [ ] Drive all state seeding and assertions through Playwright route mocking and web-first UI interactions
- [ ] Task: Modernize container runner script `scripts/run-e2e-container.sh`
    - [ ] Update volume mounts to prevent host `node_modules` pollution and ensure proper SELinux `:Z` flags
    - [ ] Support arbitrary Playwright CLI flags and verify `./scripts/run-e2e-container.sh chromium` boots cleanly
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Modular Route Fixtures & Window Store Detachment' (Protocol in workflow.md)

## Phase 3: Flakiness Elimination, Actionability & E2E Coverage
Focus: Replace all arbitrary `waitForTimeout` sleeps with web-first auto-retrying assertions, audit and fix `{ force: true }` clicks, tighten visual regression tolerance to 1%, add missing E2E coverage for itinerary reordering and offline reconnection, and enforce lint guardrails.

- [ ] Task: Configure ESLint Playwright guardrails and snapshot tolerances
    - [ ] Add `eslint-plugin-playwright` rules in `.eslintrc.json` (`playwright/no-wait-for-timeout: 'error'`, `playwright/no-force-option: 'warn'`)
    - [ ] Update `playwright.config.ts` to set `maxDiffPixelRatio: 0.01` (1%)
- [ ] Task: Eliminate `page.waitForTimeout()` sleeps across test suite
    - [ ] Refactor `e2e/helpers.ts` to replace sleeps with auto-retrying assertions (`expect(locator).toBeVisible()`, `waitForResponse()`)
    - [ ] Refactor `e2e/trip-flow.spec.ts`, `e2e/responsive-layout.spec.ts`, `e2e/photo-flow.spec.ts`, `e2e/pwa-resilience.spec.ts`, and `e2e/pwa-assets.spec.ts` to eliminate all `waitForTimeout` calls
- [ ] Task: Audit and resolve `{ force: true }` actionability issues
    - [ ] Audit ~27 occurrences of `{ force: true }` in `e2e/helpers.ts` and spec files
    - [ ] Resolve underlying CSS z-index, animation transitions, or container visibility issues to enable native clicks
    - [ ] Add explicit code comments for any verified non-standard exceptions (e.g. canvas overlay hitboxes)
- [ ] Task: Implement missing E2E specs for drag-and-drop itinerary reordering
    - [ ] Add end-to-end test in `e2e/trip-management.spec.ts` validating drag-and-drop itinerary reordering and persistent order update
- [ ] Task: Implement missing E2E specs for offline reconnect sync drainage
    - [ ] Add end-to-end test in `e2e/pwa-offline.spec.ts` validating queue drainage on reconnection (`setOffline(false)`) and UI cache invalidation
- [ ] Task: Verify full test suite across all target browser projects
    - [ ] Run `./scripts/run-e2e-container.sh all` and verify `chromium`, `webkit`, `mobile-safari`, and `mobile-chrome` pass cleanly with test runtimes < 15s
    - [ ] Run `npm test`, `npm run lint`, and `npm run type-check` to verify zero regressions
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Flakiness Elimination, Actionability & E2E Coverage' (Protocol in workflow.md)
