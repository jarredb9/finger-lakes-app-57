# Implementation Plan: Test Automation Infrastructure Modernization & E2E Test Suite Stabilization

Stabilizing the test automation infrastructure by eliminating Node 24 JSDOM memory leaks, enabling global mock clearing, filling critical unit coverage gaps in visit offline reconstitution and service mutations, decomposing the monolithic `MockMapsManager` into modular fixtures, gating store `window` attachments behind E2E environments, eliminating arbitrary `waitForTimeout` sleeps and `{ force: true }` clicks, calibrating visual snapshots to 1%, and adding E2E coverage for itinerary reordering and offline reconnection.

## Phase 1: Jest 30 Isolation, Memory Leak Remediation & Service Mutation Tests
Focus: Eliminate Node 24 JSDOM worker memory exhaustion, configure global mock clearing, polyfill JSDOM URL helpers in jest.setup.ts, refactor store tests away from `jest.resetModules()`, and implement unit test suites for `visitInitHelpers.ts`, `socialService.ts`, and `tripService.ts`.

- [ ] Task: Configure Jest memory limits and global mock isolation in jest.config.mjs and jest.setup.ts
    - [ ] Add `workerIdleMemoryLimit: '512MB'` and `clearMocks: true` in `jest.config.mjs`
    - [ ] Polyfill `global.URL.createObjectURL` and `global.URL.revokeObjectURL` in `jest.setup.ts`
    - [ ] Ensure store and service mocks are cleanly reset in `afterEach` in `jest.setup.ts`
- [ ] Task: Refactor store and service tests to eliminate `jest.resetModules()` memory leaks
    - [ ] Hoist `@/utils/supabase/client` mocks to top-level `jest.mock()` in `lib/stores/__tests__/wineryStore.test.ts` and replace `jest.resetModules()` with explicit `useWineryStore.getState().reset()`
    - [ ] Audit and eliminate all remaining `jest.resetModules()` calls across the 22 affected test suites in `lib/` and `__tests__/`
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

## Phase 2: Modular Route Fixtures, Window Store Detachment & Runner Script
Focus: Eliminate cross-store window access in `uiStore.ts`, gate store window attachments behind `NEXT_PUBLIC_IS_E2E`, update unit assertions and login store hydration, decompose monolithic `MockMapsManager` into modular route fixtures under `e2e/fixtures/`, and fix positional argument parsing in `scripts/run-e2e-container.sh`.

- [ ] Task: Eliminate production cross-store window coupling in uiStore.ts
    - [ ] Replace `(window as any).useTripStore.getState().setSelectedTrip(null)` in `lib/stores/uiStore.ts:205-207` with direct store invocation or UI-only state reset
- [ ] Task: Write failing tests for production window store detachment
    - [ ] Add test in `lib/__tests__/tooling/store-isolation.test.ts` verifying stores are not attached to `window` when `process.env.NEXT_PUBLIC_IS_E2E !== 'true'`
    - [ ] Verify tests fail if unconditional window attachments exist (Red phase)
- [ ] Task: Implement environment-gated store detachment and update test harnesses
    - [ ] Gate `(window as any).use*Store` attachments across all 8 stores behind `process.env.NEXT_PUBLIC_IS_E2E === 'true'`
    - [ ] Update `lib/stores/__tests__/tripStore.slices.test.ts` and `visitStore.slices.test.ts` to assert against E2E-gated behavior
    - [ ] Verify `e2e/helpers.ts:login` store hydration checks function seamlessly in E2E runs
- [ ] Task: Decompose `MockMapsManager` into modular Playwright route fixtures
    - [ ] Create `e2e/fixtures/maps.fixture.ts` isolating Google Maps & Mapbox tile, geocode, and loader mocks
    - [ ] Create `e2e/fixtures/auth.fixture.ts` handling Supabase session mock injection and user fixtures
    - [ ] Create `e2e/fixtures/trips.fixture.ts` handling trip creation, stops, and visit RPC mocks
    - [ ] Refactor `e2e/utils.ts` and `e2e/fixtures/index.ts` to re-export consolidated fixtures without monolithic class coupling, ensuring zero breakage of existing specs
- [ ] Task: Refactor E2E helpers to eliminate store-poking in assertion retries
    - [ ] Refactor `e2e/helpers.ts` to remove `store.setState()` calls from retry loops
    - [ ] Drive all state seeding and assertions through Playwright route mocking and web-first UI interactions
- [ ] Task: Modernize container runner script `scripts/run-e2e-container.sh`
    - [ ] Update argument parsing (lines 103–119) so passing a spec file or CLI flag defaults project to `webkit` instead of misassigning `$PROJECT`
    - [ ] Support passing arbitrary Playwright CLI flags (`--grep`, `--update-snapshots`)
    - [ ] Update volume mounts to prevent host `node_modules` pollution and preserve SELinux `:Z` flags
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Modular Route Fixtures, Window Store Detachment & Runner Script' (Protocol in workflow.md)

## Phase 3: Flakiness Elimination, Actionability, Snapshot Calibration & E2E Coverage
Focus: Replace all 12 `waitForTimeout` sleeps with web-first auto-retrying assertions, audit and fix the 24 `{ force: true }` clicks, tighten visual regression tolerance to 1%, add missing E2E coverage for itinerary reordering and offline reconnection, and enforce lint guardrails in `eslint.config.mjs`.

- [ ] Task: Configure ESLint Playwright guardrails and snapshot tolerances
    - [ ] Add `eslint-plugin-playwright` to `devDependencies` in `package.json`
    - [ ] Configure `eslint-plugin-playwright` in `eslint.config.mjs` matching `files: ['e2e/**/*.{ts,js}']` (`playwright/no-wait-for-timeout: 'error'`, `playwright/no-force-option: 'warn'`)
    - [ ] Update `playwright.config.ts` to set `maxDiffPixelRatio: 0.01` (1%)
    - [ ] Remove inline `maxDiffPixelRatio: 0.10` overrides from `e2e/visual.spec.ts` (7 call sites) and re-baseline visual snapshots if necessary
- [ ] Task: Eliminate `page.waitForTimeout()` sleeps across test suite
    - [ ] Refactor `e2e/helpers.ts` (L509, L633) to replace sleeps with auto-retrying assertions
    - [ ] Refactor `e2e/trip-flow.spec.ts` (L101), `e2e/responsive-layout.spec.ts` (7 calls), `e2e/photo-flow.spec.ts` (L102), and `e2e/pwa-assets.spec.ts` (L119) to eliminate all `waitForTimeout` calls
- [ ] Task: Audit and resolve `{ force: true }` actionability issues
    - [ ] Audit the 24 occurrences of `{ force: true }` across 7 files (`photo-flow.spec.ts`, `helpers.ts`, `trip-flow.spec.ts`, `auth-recovery.spec.ts`, `visit-flow.spec.ts`, `accessibility.spec.ts`, `runtime-audit.spec.ts`)
    - [ ] Resolve underlying CSS z-index, animation transitions, or container visibility issues to enable native clicks
    - [ ] Add explicit code comments for any verified non-standard exceptions
- [ ] Task: Implement missing E2E specs for drag-and-drop itinerary reordering
    - [ ] Add end-to-end test in `e2e/trip-management.spec.ts` validating drag-and-drop itinerary reordering and persistent order update
- [ ] Task: Implement missing E2E specs for offline reconnect sync drainage
    - [ ] Add end-to-end test in `e2e/pwa-offline.spec.ts` validating queue drainage on reconnection (`setOffline(false)`) and UI cache invalidation
- [ ] Task: Verify full test suite across all target browser projects
    - [ ] Run `./scripts/run-e2e-container.sh all` and verify `chromium`, `webkit`, `mobile-safari`, and `mobile-chrome` pass cleanly with test runtimes < 15s
    - [ ] Run `npm test`, `npm run lint`, and `npm run type-check` to verify zero regressions
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Flakiness Elimination, Actionability, Snapshot Calibration & E2E Coverage' (Protocol in workflow.md)
