# Implementation Plan: Test Automation Infrastructure Modernization & E2E Test Suite Stabilization

Stabilizing the test automation infrastructure by eliminating Node 24 JSDOM memory leaks, enabling global mock clearing, filling critical unit coverage gaps in visit offline reconstitution and service mutations, modernizing runner scripts and store isolation, upgrading the Playwright container and npm package to 1.63, decomposing the monolithic `MockMapsManager` into modular fixtures, gating store `window` attachments behind E2E environments, eliminating arbitrary `waitForTimeout` sleeps and `{ force: true }` clicks, calibrating visual snapshots to 1%, and adding E2E coverage for itinerary reordering and offline reconnection.

## Phase 1: Jest 30 Test Infrastructure, Memory Limits & Module Reset Remediation [checkpoint: ccd6a3d]
Focus: Eliminate Node 24 JSDOM worker memory exhaustion, configure global mock clearing, polyfill JSDOM URL helpers in `jest.setup.ts`, and eliminate `jest.resetModules()` across store and service test suites.

- [x] Task: Configure Jest memory limits, global mock isolation, and URL polyfills (Red Phase) [921ff3b]
    - [x] Add `workerIdleMemoryLimit: '512MB'` and `clearMocks: true` in `jest.config.mjs`
    - [x] Polyfill `global.URL.createObjectURL` and `global.URL.revokeObjectURL` in `jest.setup.ts`
    - [x] Create `lib/__tests__/tooling/jest-setup.test.ts` verifying URL polyfills and mock isolation
- [x] Task: Refactor store test suites to eliminate `jest.resetModules()` memory leaks (Green Phase) [3372783]
    - [x] Hoist `@/utils/supabase/client` mocks to top-level `jest.mock()` in `lib/stores/__tests__/wineryStore.test.ts` and replace `jest.resetModules()` with explicit `useWineryStore.getState().reset()`
    - [x] Audit and eliminate `jest.resetModules()` calls across 15 store test suites in `lib/stores/__tests__/` (26 call sites)
- [x] Task: Refactor service, slice, and utility test suites to eliminate remaining `jest.resetModules()` (Green Phase) [7e29efa]
    - [x] Hoist mocks and eliminate `jest.resetModules()` in `wineryService.test.ts`, `tripService.test.ts`, `e2e-utils.test.ts`, `relational-ids.test.ts`, `tripMutationHelpers.test.ts`, and `tripStore.domainInvariants.test.ts` (8 call sites)
    - [x] Verify zero occurrences of `jest.resetModules()` remain across the entire repository
- [x] Task: Conductor - User Manual Verification 'Phase 1: Jest 30 Test Infrastructure, Memory Limits & Module Reset Remediation' (Protocol in workflow.md) [ccd6a3d]

## Phase 2: Visit Store Domain Invariants & Offline Photo Reconstitution
Focus: Build comprehensive domain invariant testing and harden offline Base64 photo serialization, deduplication mutex, and queue reconstitution in `visitInitHelpers.ts`.

- [x] Task: Write failing domain invariant tests for visit store offline reconstitution (Red Phase) [c9acc26]
    - [x] Create `lib/stores/__tests__/visitStore.domainInvariants.test.ts` testing Base64 photo reconstitution, preview URLs, queue encryption, and optimistic deletion rollback
    - [x] Verify tests fail cleanly on missing invariant implementations (Red phase)
- [x] Task: Harden visitInitHelpers.ts to satisfy visit store domain invariants (Green Phase) [38553d1]
    - [x] Harden binary photo serialization, ID normalization, mutex deduplication, and error recovery in `lib/stores/slices/visitInitHelpers.ts`
    - [x] Verify `visitStore.domainInvariants.test.ts` passes and coverage of `visitInitHelpers.ts` is >= 80% (Green phase)
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Visit Store Domain Invariants & Offline Photo Reconstitution' (Protocol in workflow.md)

## Phase 3: Supabase Service Mutation Test Suites & Ownership Guards
Focus: Implement unit test suites and harden mutation flows, multi-winery RPC chaining, and owner protection guards in `socialService.ts` and `tripService.ts`.

- [ ] Task: Write failing unit test suites for social and trip service mutations (Red Phase)
    - [ ] Create `lib/services/__tests__/socialService.test.ts` covering all 8 social RPC methods and request handling
    - [ ] Create `lib/services/__tests__/tripService.mutations.test.ts` covering multi-winery RPC chaining, trip deletion guards, notes updates, and `.neq('role', 'owner')` owner protections
    - [ ] Verify tests execute and fail cleanly on unhandled mutation branches (Red phase)
- [ ] Task: Implement service mutation hardening and verify test coverage (Green Phase)
    - [ ] Harden error handling, ownership guard assertions, and rollback invariants in `socialService.ts` and `tripService.ts`
    - [ ] Verify both service test suites pass with >= 80% coverage (Green phase)
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Supabase Service Mutation Test Suites & Ownership Guards' (Protocol in workflow.md)

## Phase 4: Store Isolation, Engine Window Detachment & Runner Script Modernization
Focus: Eliminate cross-store window coupling in `uiStore.ts`, gate store window attachments behind `NEXT_PUBLIC_IS_E2E`, update unit assertions, and fix container runner CLI parsing.

- [ ] Task: Write failing store isolation tests and runner script argument parsing tests (Red Phase)
    - [ ] Create `lib/__tests__/tooling/store-isolation.test.ts` asserting stores are not attached to `window` when `NEXT_PUBLIC_IS_E2E !== 'true'`
    - [ ] Create `scripts/__tests__/run-e2e-container.test.sh` asserting CLI argument parsing without project collision, flag passthrough, and zero-argument safety
    - [ ] Verify both tests fail against the current codebase (Red phase)
- [ ] Task: Eliminate cross-store window coupling and gate store window exposure (Green Phase - Expand-and-Contract Part A)
    - [ ] Replace `(window as any).useTripStore.getState().setSelectedTrip(null)` in `lib/stores/uiStore.ts:205-207` with direct store invocation
    - [ ] Gate `(window as any).use*Store` attachments across all 8 stores behind `process.env.NEXT_PUBLIC_IS_E2E === 'true'`
    - [ ] Update unit assertions in `tripStore.slices.test.ts` and `visitStore.slices.test.ts` to assert gated test environment behavior
- [ ] Task: Modernize container runner script scripts/run-e2e-container.sh (Green Phase)
    - [ ] Fix positional argument parsing (lines 103–125) to default project to `webkit` when `$1` is a spec path or CLI flag
    - [ ] Guard `shift` to prevent crash on zero arguments and pass CLI arguments as array `TEST_ARGS=("$@")`
    - [ ] Add container volume isolation (`-v /work/node_modules`) to eliminate host pollution and reconcile SELinux `:Z` mount flags
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Store Isolation, Engine Window Detachment & Runner Script Modernization' (Protocol in workflow.md)

## Phase 5: Playwright 1.63 Container & NPM Package Upgrade
Focus: Upgrade `@playwright/test` and the Playwright container image to 1.63 (Noble base), certify rootless container execution on RHEL 8, and verify browser binary parity.

- [ ] Task: Upgrade Playwright dependency, container scripts, and create version canary (Red Phase)
    - [ ] Create `scripts/__tests__/playwright-version-check.test.sh` asserting `@playwright/test` and container image both resolve to `1.63.x`
    - [ ] Bump `@playwright/test` to `1.63.0` in `package.json` and sync `package-lock.json`
    - [ ] Update `PLAYWRIGHT_VERSION="v1.63.0-noble"` in `scripts/run-e2e-container.sh` and `scripts/run-jest-container.sh`
    - [ ] Verify version check test fails before container pull/build and passes after (Red/Green)
- [ ] Task: Pull 1.63 container image, certify browser engines, and verify Jest runner (Green Phase)
    - [ ] Pull `mcr.microsoft.com/playwright:v1.63.0-noble` and verify image inspect/exists in Podman
    - [ ] Run container smoke verification across `chromium`, `webkit`, and `Mobile Safari`
    - [ ] Run `./scripts/run-jest-container.sh` to confirm Jest 30 tests pass cleanly without glibc or Node regressions in the new image
- [ ] Task: Remediate 1.58 -> 1.63 deprecations and run baseline E2E smoke suite (Green Phase)
    - [ ] Audit and remediate any Playwright 1.63 breaking changes (locator strictness, network interception, snapshot config)
    - [ ] Run `./scripts/run-e2e-container.sh webkit e2e/auth-recovery.spec.ts` inside container
    - [ ] Confirm zero host `node_modules` pollution under volume isolation
- [ ] Task: Conductor - User Manual Verification 'Phase 5: Playwright 1.63 Container & NPM Package Upgrade' (Protocol in workflow.md)

## Phase 6: Modular Route Fixtures & E2E Helper Store-Poking Decoupling
Focus: Decompose monolithic `MockMapsManager` into modular fixtures under `e2e/fixtures/`, maintain backward compatibility through `e2e/utils.ts`, and eliminate store-poking in E2E helpers.

- [ ] Task: Create fixture contract parity tests and E2E readiness canary (Red Phase)
    - [ ] Create `e2e/__tests__/fixture-contract.test.ts` asserting interface parity, failure injectors, and bypasses
    - [ ] Create `e2e/canary-readiness.spec.ts` asserting readiness verification without window store access
    - [ ] Verify tests fail before modular fixtures are built (Red phase)
- [ ] Task: Implement modular route fixtures under e2e/fixtures/ (Green Phase - Expand-and-Contract Part A: Expand)
    - [ ] Create `e2e/fixtures/maps.fixture.ts` isolating Google Places REST, JS SDK mocks, and tile/asset mocks
    - [ ] Create `e2e/fixtures/auth.fixture.ts` handling Supabase Auth sessions, profiles, and test user fixtures
    - [ ] Create `e2e/fixtures/trips.fixture.ts` handling Trips, stops, visits, favorites, and social RPC mocks
    - [ ] Create `e2e/fixtures/index.ts` exporting composite `test` object via Playwright `test.extend()`
- [ ] Task: Refactor e2e/utils.ts into a backward-compatible delegation façade (Green Phase - Expand-and-Contract Part B)
    - [ ] Replace internal monolithic implementation in `e2e/utils.ts` with delegation to modular fixtures in `e2e/fixtures/`
    - [ ] Re-export `test`, `expect`, `MockMapsManager` adapter class, `createDefaultMockState`, and types
    - [ ] Verify existing multi-context specs pass with zero spec code changes
- [ ] Task: Refactor e2e/helpers.ts to eliminate store-poking in assertion retries (Green Phase - Expand-and-Contract Part C: Caller Migration)
    - [ ] Replace store hydration polling in `login()` with DOM readiness checks (`data-state="ready"`)
    - [ ] Remove `window.useMapStore.getState().setBounds(...)` poking from `waitForMapReady()`
    - [ ] Refactor `expectTripInStore` and `expectTripDeletedFromStore` to remove store fetch poking in retry loops
    - [ ] Migrate `e2e/trip-sharing.spec.ts` away from `injectTripState` to route mocks; deprecate unused injectors
- [ ] Task: Conductor - User Manual Verification 'Phase 6: Modular Route Fixtures & E2E Helper Store-Poking Decoupling' (Protocol in workflow.md)

## Phase 7: E2E Lint Guardrails, Snapshot Calibration & Actionability Flakiness Elimination
Focus: Enforce ESLint 9 Playwright rules, calibrate visual snapshots to 1%, eliminate all 12 `waitForTimeout` calls, and resolve 24 `{ force: true }` clicks.

- [ ] Task: Configure ESLint Playwright guardrails and visual snapshot tolerances (Red Phase)
    - [ ] Add `eslint-plugin-playwright` to `devDependencies` in `package.json`
    - [ ] Configure `files: ['e2e/**/*.{ts,js}']` in `eslint.config.mjs` with `'playwright/no-wait-for-timeout': 'error'` and `'playwright/no-force-option': 'warn'`
    - [ ] Update `playwright.config.ts` to set `maxDiffPixelRatio: 0.01` (1%)
    - [ ] Remove the 7 inline `maxDiffPixelRatio: 0.10` overrides from `e2e/visual.spec.ts`
    - [ ] Run `npm run lint` and confirm it flags the 12 `waitForTimeout` calls as errors (Red phase)
- [ ] Task: Eliminate all 12 page.waitForTimeout() sleeps across test suite (Green Phase)
    - [ ] Refactor `e2e/pwa-assets.spec.ts:119`, `e2e/photo-flow.spec.ts:102`, `e2e/responsive-layout.spec.ts` (7 calls), `e2e/helpers.ts:509,633`, and `e2e/trip-flow.spec.ts:101`
    - [ ] Replace sleeps with auto-retrying assertions (`waitForResponse`, `toBeVisible`, `toPass`, `expect.poll`)
- [ ] Task: Audit and resolve { force: true } actionability issues across 7 files (Green Phase)
    - [ ] Audit each of the 24 occurrences across the 7 files (`photo-flow.spec.ts` [9], `helpers.ts` [5], `trip-flow.spec.ts` [3], `auth-recovery.spec.ts` [3], `visit-flow.spec.ts` [2], `accessibility.spec.ts` [1], and `runtime-audit.spec.ts` [1])
    - [ ] Resolve illegitimate workarounds by fixing underlying CSS z-index, entry animations, hover triggers, drawer snap points, and button-enabled readiness
    - [ ] For verified exceptions where non-standard DOM or gesture overlays genuinely require it, retain `{ force: true }` with explicit inline code comments and `// eslint-disable-next-line playwright/no-force-option`
    - [ ] Verify `npm run lint` reports 0 errors and zero unjustified warnings on Playwright rules
- [ ] Task: Conductor - User Manual Verification 'Phase 7: E2E Lint Guardrails, Snapshot Calibration & Actionability Flakiness Elimination' (Protocol in workflow.md)

## Phase 8: High-Value E2E Feature Coverage & Cross-Browser Verification
Focus: Add end-to-end coverage for drag-and-drop itinerary reordering and offline reconnection queue drainage, certifying full cross-browser test pass.

- [ ] Task: Write failing E2E tests for itinerary reordering and offline reconnect sync (Red Phase)
    - [ ] Add failing test scaffold in `e2e/trip-management.spec.ts` asserting drag-and-drop stop reordering persistence
    - [ ] Add failing test scaffold in `e2e/pwa-offline.spec.ts` asserting online reconnection queue drainage and cache invalidation
    - [ ] Verify tests fail before implementation (Red phase)
- [ ] Task: Implement full E2E spec for drag-and-drop itinerary reordering (Green Phase)
    - [ ] Implement drag-and-drop simulation for `@hello-pangea/dnd` in `e2e/trip-management.spec.ts`, validating persistent reordered state and RPC payload
    - [ ] Verify test passes cleanly in container
- [ ] Task: Implement full E2E spec for offline reconnect queue drainage (Green Phase)
    - [ ] Implement `context.setOffline(false)` drainage flow, queue emptiness assertion (`queue.length === 0`), and UI cache invalidation in `e2e/pwa-offline.spec.ts`
    - [ ] Verify test passes cleanly in container
- [ ] Task: Full cross-browser container suite verification and quality gate (Verification)
    - [ ] Run `./scripts/run-e2e-container.sh all` across `chromium`, `webkit`, `mobile-safari`, and `mobile-chrome`
    - [ ] Run repository quality gate: `npm test`, `npm run lint`, and `npm run type-check`
- [ ] Task: Conductor - User Manual Verification 'Phase 8: High-Value E2E Feature Coverage & Cross-Browser Verification' (Protocol in workflow.md)
