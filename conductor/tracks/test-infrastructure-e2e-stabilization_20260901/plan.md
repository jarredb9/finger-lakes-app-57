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

## Phase 2: Visit Store Domain Invariants & Offline Photo Reconstitution [checkpoint: c0fd5d5]
Focus: Build comprehensive domain invariant testing and harden offline Base64 photo serialization, deduplication mutex, and queue reconstitution in `visitInitHelpers.ts`.

- [x] Task: Write failing domain invariant tests for visit store offline reconstitution (Red Phase) [c9acc26]
    - [x] Create `lib/stores/__tests__/visitStore.domainInvariants.test.ts` testing Base64 photo reconstitution, preview URLs, queue encryption, and optimistic deletion rollback
    - [x] Verify tests fail cleanly on missing invariant implementations (Red phase)
- [x] Task: Harden visitInitHelpers.ts to satisfy visit store domain invariants (Green Phase) [38553d1]
    - [x] Harden binary photo serialization, ID normalization, mutex deduplication, and error recovery in `lib/stores/slices/visitInitHelpers.ts`
    - [x] Verify `visitStore.domainInvariants.test.ts` passes and coverage of `visitInitHelpers.ts` is >= 80% (Green phase)
- [x] Task: Conductor - User Manual Verification 'Phase 2: Visit Store Domain Invariants & Offline Photo Reconstitution' (Protocol in workflow.md) [c0fd5d5]

## Phase 3: Supabase Service Mutation Test Suites & Ownership Guards [checkpoint: e527ff3]
Focus: Implement unit test suites and harden mutation flows, multi-winery RPC chaining, and owner protection guards in `socialService.ts` and `tripService.ts`.

- [x] Task: Write failing unit test suites for social and trip service mutations (Red Phase) [e3795d3]
    - [x] Create `lib/services/__tests__/socialService.test.ts` covering all 8 social RPC methods and request handling
    - [x] Create `lib/services/__tests__/tripService.mutations.test.ts` covering multi-winery RPC chaining, trip deletion guards, notes updates, and `.neq('role', 'owner')` owner protections
    - [x] Verify tests execute and fail cleanly on unhandled mutation branches (Red phase)
- [x] Task: Implement service mutation hardening and verify test coverage (Green Phase) [d961817]
    - [x] Harden error handling, ownership guard assertions, and rollback invariants in `socialService.ts` and `tripService.ts`
    - [x] Verify both service test suites pass with >= 80% coverage (Green phase)
- [x] Task: Conductor - User Manual Verification 'Phase 3: Supabase Service Mutation Test Suites & Ownership Guards' (Protocol in workflow.md) [e527ff3]

## Phase 4: Store Isolation, Engine Window Detachment & Runner Script Modernization [checkpoint: 2bbf3f9]
Focus: Eliminate cross-store window coupling in `uiStore.ts`, gate store window attachments behind `NEXT_PUBLIC_IS_E2E`, update unit assertions, and fix container runner CLI parsing.

- [x] Task: Write failing store isolation tests and runner script argument parsing tests (Red Phase) [855e627]
    - [x] Create `lib/__tests__/tooling/store-isolation.test.ts` asserting stores are not attached to `window` when `NEXT_PUBLIC_IS_E2E !== 'true'`
    - [x] Create `scripts/__tests__/run-container.test.sh` asserting CLI argument parsing, spec path defaulting, flag passthrough, zero-argument safety, and volume isolation across all 4 container scripts
    - [x] Verify both tests fail against the current codebase (Red phase)
- [x] Task: Eliminate cross-store window coupling and gate store window exposure (Green Phase - Expand-and-Contract Part A) [0f04411]
    - [x] Replace `(window as any).useTripStore.getState().setSelectedTrip(null)` in `lib/stores/uiStore.ts:205-207` with direct store invocation
    - [x] Gate `(window as any).use*Store` attachments across all 8 stores and `<E2EStoreExposer />` in `app/layout.tsx` behind `process.env.NEXT_PUBLIC_IS_E2E === 'true'`
    - [x] Update unit assertions in `tripStore.slices.test.ts` and `visitStore.slices.test.ts` to assert gated test environment behavior
- [x] Task: Modernize container runner scripts (Green Phase) [0f97476]
    - [x] Fix positional argument parsing (lines 103–125) in `scripts/run-e2e-container.sh` to default project to `webkit` when `$1` is a spec path or CLI flag
    - [x] Guard `shift` to prevent crash on zero arguments and pass CLI arguments as array `TEST_ARGS=("$@")`
    - [x] Add container volume isolation (`-v /work/node_modules`) across `run-e2e-container.sh`, `run-jest-container.sh`, `run-dev-container.sh`, and `run-build-container.sh` to eliminate host pollution and reconcile SELinux `:Z` mount flags
- [x] Task: Global Window Interface Augmentation & Type Cast Elimination (Green Phase - Expand-and-Contract Part B) [0f97476]
    - [x] Augment global `Window` interface and `_PWA_UPDATING` in `lib/shims.d.ts`
    - [x] Eliminate `(window as any)` and `(global as any)` type casts across all 8 stores, components (`e2e-store-exposer.tsx`, `mobile-winery-drawer.tsx`, `authenticated-modal-host.tsx`, `MapNavigation.tsx`), utilities (`lib/utils/winery.ts`, `e2e-utils.ts`), and test suites
    - [x] Verify zero type errors via `npm run type-check` and green store isolation assertions in container
- [x] Task: Apply review suggestions [c3505c5]
    - [x] Add `typeof` to store hook types on `Window` interface in `lib/shims.d.ts` and eliminate DOM modifier conflicts
    - [x] Update `e2e/utils.ts` mock bounds to match `SerializableBounds` structure
- [x] Task: Conductor - User Manual Verification 'Phase 4: Store Isolation, Engine Window Detachment & Runner Script Modernization' (Protocol in workflow.md) [2bbf3f9]

## Phase 5: Playwright 1.63 Container & NPM Package Upgrade [checkpoint: bd9287e]
Focus: Upgrade `@playwright/test` and the Playwright container image to 1.63 (Noble base), certify rootless container execution on RHEL 8, and verify browser binary parity.

- [x] Task: Upgrade Playwright dependency, container scripts, and create version canary (Red Phase) [9a98121]
    - [x] Create `scripts/__tests__/playwright-version-check.test.sh` asserting `@playwright/test` and all container scripts (`run-e2e-container.sh`, `run-jest-container.sh`, `run-dev-container.sh`, `run-build-container.sh`) resolve to `1.63.x` / `v1.63.0-noble`
    - [x] Bump `@playwright/test` to `1.63.0` in `package.json` and sync `package-lock.json`
    - [x] Update `PLAYWRIGHT_VERSION="v1.63.0-noble"` in `scripts/run-e2e-container.sh`, `scripts/run-jest-container.sh`, `scripts/run-dev-container.sh`, and `scripts/run-build-container.sh`
    - [x] Verify version check test fails before container pull/build and passes after (Red/Green)
- [x] Task: Pull 1.63 container image, certify browser engines, and verify Jest runner (Green Phase) [96dad40]
    - [x] Pull `mcr.microsoft.com/playwright:v1.63.0-noble` and verify image inspect/exists in Podman
    - [x] Run container smoke verification across `chromium`, `webkit`, and `Mobile Safari`
    - [x] Run `./scripts/run-jest-container.sh` to confirm Jest 30 tests pass cleanly without glibc or Node regressions in the new image
- [x] Task: Remediate 1.58 -> 1.63 deprecations and run baseline E2E smoke suite (Green Phase) [701f084]
    - [x] Audit and remediate any Playwright 1.63 breaking changes (locator strictness, network interception, snapshot config)
    - [x] Run `./scripts/run-e2e-container.sh webkit e2e/auth-recovery.spec.ts` inside container
    - [x] Confirm zero host `node_modules` pollution under volume isolation
- [x] Task: Conductor - User Manual Verification 'Phase 5: Playwright 1.63 Container & NPM Package Upgrade' (Protocol in workflow.md) [bd9287e]

## Phase 6: Modular Route Fixtures & E2E Helper Store-Poking Decoupling [checkpoint: 9ef4806]
Focus: Decompose monolithic `MockMapsManager` into modular fixtures under `e2e/fixtures/`, maintain backward compatibility through `e2e/utils.ts`, and eliminate store-poking in E2E helpers.

- [x] Task: Create fixture contract parity tests and E2E readiness canary (Red Phase) [7f2ed58]
    - [x] Create `e2e/__tests__/fixture-contract.test.ts` asserting interface parity, failure injectors, and bypasses
    - [x] Create `e2e/canary-readiness.spec.ts` asserting readiness verification without window store access
    - [x] Verify tests fail before modular fixtures are built (Red phase)
- [x] Task: Implement modular route fixtures under e2e/fixtures/ (Green Phase - Expand-and-Contract Part A: Expand) [9905091]
    - [x] Create `e2e/fixtures/maps.fixture.ts` isolating Google Places REST, JS SDK mocks, and tile/asset mocks
    - [x] Create `e2e/fixtures/auth.fixture.ts` handling Supabase Auth sessions, profiles, and test user fixtures
    - [x] Create `e2e/fixtures/trips.fixture.ts` handling Trips, stops, visits, favorites, and social RPC mocks
    - [x] Create `e2e/fixtures/index.ts` exporting composite `test` object via Playwright `test.extend()`
- [x] Task: Refactor e2e/utils.ts into a backward-compatible delegation façade (Green Phase - Expand-and-Contract Part B) [dda80ad]
    - [x] Replace internal monolithic implementation in `e2e/utils.ts` with delegation to modular fixtures in `e2e/fixtures/`
    - [x] Re-export `test`, `expect`, `MockMapsManager` adapter class, `createDefaultMockState`, and types
    - [x] Verify existing multi-context specs pass with zero spec code changes
- [x] Task: Refactor e2e/helpers.ts to eliminate store-poking in assertion retries (Green Phase - Expand-and-Contract Part C: Caller Migration) [6fa3871]
    - [x] Replace store hydration polling in `login()` with DOM readiness checks (`data-state="ready"`)
    - [x] Remove `window.useMapStore.getState().setBounds(...)` poking from `waitForMapReady()`
    - [x] Refactor `expectTripInStore` and `expectTripDeletedFromStore` to remove store fetch poking in retry loops
    - [x] Migrate `e2e/trip-sharing.spec.ts` away from `injectTripState` to route mocks; deprecate unused injectors
- [x] Task: Conductor - User Manual Verification 'Phase 6: Modular Route Fixtures & E2E Helper Store-Poking Decoupling' (Protocol in workflow.md) [9ef4806]

## Phase 7: Fixture Granularization & Domain-Driven Handler Decomposition [checkpoint: 6829f7e]
Focus: Decompose monolithic `maps.fixture.ts` (800 lines) and `trips.fixture.ts` (680 lines) into granular, single-responsibility domain handlers, browser shims, and utility modules under `e2e/fixtures/`, preserving 100% backward compatibility and adhering strictly to TDD.

- [x] Task: Create failing unit and contract parity tests for granular domain handlers and shims (Red Phase) [bf1e559]
    - [x] Create `e2e/__tests__/handler-contracts.test.ts` asserting contract interfaces, independent initialization, route registration patterns, and bypass toggles for `trips.handler.ts`, `visits.handler.ts`, `social.handler.ts`, `favorites.handler.ts`, `places.handler.ts`, `assets.handler.ts`, `browser.shim.ts`, and `google-maps-sdk.shim.ts`
    - [x] Create `e2e/__tests__/mock-wineries.test.ts` asserting canonical `MOCK_MARKERS` consistency and `getEquivalentWineryIds` normalization
    - [x] Verify tests fail cleanly before modular handlers are implemented (Red phase)
- [x] Task: Implement shared utilities, browser shims, and maps sub-handlers (Green Phase - Expand-and-Contract Part A) [93dc4e3]
    - [x] Create `e2e/fixtures/utils/mock-wineries.ts` and `e2e/fixtures/utils/diagnostic-logger.ts`
    - [x] Create `e2e/fixtures/shims/browser.shim.ts` (WebGL/Canvas mocks, SW filter, map bounds injection) and `e2e/fixtures/shims/google-maps-sdk.shim.ts` (Maps JS SDK stub)
    - [x] Create `e2e/fixtures/handlers/places.handler.ts` (Google Places REST, legacy endpoints, Edge Functions) and `e2e/fixtures/handlers/assets.handler.ts` (tiles, fonts, Mapbox, weather)
    - [x] Refactor `e2e/fixtures/maps.fixture.ts` into a lightweight orchestrator (<80 lines) delegating to shims and handlers
    - [x] Verify maps contract tests and `auth-recovery.spec.ts` pass cleanly (Green phase)
- [x] Task: Implement Supabase domain handlers and refactor trips fixture orchestrator (Green Phase - Expand-and-Contract Part B) [fabe682]
    - [x] Create `e2e/fixtures/handlers/trips.handler.ts` (trips RPCs & `/rest/v1/trips`), `e2e/fixtures/handlers/visits.handler.ts` (visits RPCs, idempotency), `e2e/fixtures/handlers/social.handler.ts` (social RPCs, friend feed, profile stats), and `e2e/fixtures/handlers/favorites.handler.ts` (favorites, wishlist, privacy, dynamic markers, `/rest/v1/favorites`)
    - [x] Refactor `e2e/fixtures/trips.fixture.ts` into a lightweight orchestrator (<85 lines) delegating to domain handlers
    - [x] Re-export granular handlers and utilities in `e2e/fixtures/index.ts` and `e2e/utils.ts`
    - [x] Verify all contract tests, canary tests, and existing multi-context specs pass cleanly with zero spec code changes (Green phase)
- [x] Task: Conductor - User Manual Verification 'Phase 7: Fixture Granularization & Domain-Driven Handler Decomposition' (Protocol in workflow.md) [6829f7e]

## Phase 8: E2E Helper Modularization & Domain Decomposition
Focus: Decompose monolithic `e2e/helpers.ts` (1,013 lines) into granular, single-responsibility domain helper modules (`core.ts`, `navigation.ts`, `auth.ts`, `wineries.ts`, `visits.ts`, `social.ts`, `assertions.ts`, `diagnostics.ts`, `index.ts`) under `e2e/helpers/`, establishing `e2e/helpers.ts` as a 100% backward-compatible delegation façade, adhering strictly to TDD.

- [x] Task: Create failing unit and contract parity tests for granular domain helpers (Red Phase) [44a5950]
    - [x] Create `e2e/__tests__/helper-contracts.test.ts` asserting module existence under `e2e/helpers/`, 38 exported function parity between `e2e/helpers/index.ts` and `e2e/helpers.ts`, and signature consistency
    - [x] Verify tests fail cleanly before modular helper files are created (Red phase)
- [x] Task: Implement domain helper modules and backward-compatible façade (Green Phase) [8d4554a]
    - [x] Implement `core.ts`, `navigation.ts`, `auth.ts`, `wineries.ts`, `visits.ts`, `social.ts`, `assertions.ts`, `diagnostics.ts`, and `index.ts` under `e2e/helpers/`
    - [x] Refactor `e2e/helpers.ts` into a lightweight delegation façade (`export * from './helpers/index';`)
    - [x] Verify `helper-contracts.test.ts` passes and `npm run type-check` succeeds with 0 errors (Green phase)
- [ ] Task: Verify E2E multi-spec smoke and regression safety in container (Verification)
    - [ ] Run `./scripts/run-e2e-container.sh webkit e2e/auth-recovery.spec.ts`
    - [ ] Run `./scripts/run-e2e-container.sh webkit e2e/canary-readiness.spec.ts`
    - [ ] Run `./scripts/run-e2e-container.sh webkit e2e/visit-flow.spec.ts`
    - [ ] Confirm zero regression across existing specs without modifying spec import paths
- [ ] Task: Conductor - User Manual Verification 'Phase 8: E2E Helper Modularization & Domain Decomposition' (Protocol in workflow.md)

## Phase 9: E2E Lint Guardrails, Snapshot Calibration & Actionability Flakiness Elimination
Focus: Enforce ESLint 9 Playwright rules, calibrate visual snapshots to 1%, eliminate all 12 `waitForTimeout` calls, and resolve 24 `{ force: true }` clicks across 8 files/modules.

- [ ] Task: Configure ESLint Playwright guardrails and visual snapshot tolerances (Red Phase)
    - [ ] Add `eslint-plugin-playwright` to `devDependencies` in `package.json`
    - [ ] Configure `files: ['e2e/**/*.{ts,js}']` in `eslint.config.mjs` with `'playwright/no-wait-for-timeout': 'error'` and `'playwright/no-force-option': 'warn'`
    - [ ] Update `playwright.config.ts` to set `maxDiffPixelRatio: 0.01` (1%)
    - [ ] Remove the 7 inline `maxDiffPixelRatio: 0.10` overrides from `e2e/visual.spec.ts`
    - [ ] Run `npm run lint` and confirm it flags the 12 `waitForTimeout` calls as errors (Red phase)
- [ ] Task: Eliminate all 12 page.waitForTimeout() sleeps across test suite (Green Phase)
    - [ ] Refactor `e2e/pwa-assets.spec.ts:119`, `e2e/photo-flow.spec.ts:102`, `e2e/responsive-layout.spec.ts` (7 calls), `e2e/helpers/wineries.ts` (1 call in `openWineryDetails`), `e2e/helpers/visits.ts` (1 call in `logVisit`), and `e2e/trip-flow.spec.ts:101`
    - [ ] Replace sleeps with auto-retrying assertions (`waitForResponse`, `toBeVisible`, `toPass`, `expect.poll`)
- [ ] Task: Audit and resolve { force: true } actionability issues across 8 files/modules (Green Phase)
    - [ ] Audit each of the 24 occurrences across the 8 files/modules (`photo-flow.spec.ts` [9], `e2e/helpers/wineries.ts` [2], `e2e/helpers/visits.ts` [3], `trip-flow.spec.ts` [3], `auth-recovery.spec.ts` [3], `visit-flow.spec.ts` [2], `accessibility.spec.ts` [1], and `runtime-audit.spec.ts` [1])
    - [ ] Resolve illegitimate workarounds by fixing underlying CSS z-index, entry animations, hover triggers, drawer snap points, and button-enabled readiness
    - [ ] For verified exceptions where non-standard DOM or gesture overlays genuinely require it, retain `{ force: true }` with explicit inline code comments and `// eslint-disable-next-line playwright/no-force-option`
    - [ ] Verify `npm run lint` reports 0 errors and zero unjustified warnings on Playwright rules
- [ ] Task: Conductor - User Manual Verification 'Phase 9: E2E Lint Guardrails, Snapshot Calibration & Actionability Flakiness Elimination' (Protocol in workflow.md)

## Phase 10: High-Value E2E Feature Coverage
Focus: Add end-to-end coverage for drag-and-drop itinerary reordering and offline reconnection queue drainage.

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
- [ ] Task: Conductor - User Manual Verification 'Phase 10: High-Value E2E Feature Coverage' (Protocol in workflow.md)

## Phase 11: Track Scaffolding Prune, Cross-Browser Certification & Final Quality Gate
Focus: Audit and prune ephemeral TDD scaffolding tests while preserving permanent contracts, certify full cross-browser container matrix, and execute repository quality gate.

- [ ] Task: Audit and prune track-specific post-TDD scaffolding tests (Cleanup)
    - [ ] Audit test suites created during this track (`scripts/__tests__`, `lib/__tests__/tooling`, `e2e/__tests__`) for pure scaffolding tests (e.g. version regex checks, temporary CLI parsing scaffolds)
    - [ ] Prune ephemeral scaffolding while preserving permanent behavioral contracts (`handler-contracts.test.ts`, `helper-contracts.test.ts`, `mock-wineries.test.ts`), store domain invariants, and container runner integrity
    - [ ] Verify test suite runs cleanly via `./scripts/run-jest-container.sh`
- [ ] Task: Full cross-browser container suite verification and quality gate (Verification)
    - [ ] Run `./scripts/run-e2e-container.sh all` across `chromium`, `webkit`, `mobile-safari`, and `mobile-chrome`
    - [ ] Run repository quality gate: `npm test`, `npm run lint`, and `npm run type-check`
- [ ] Task: Conductor - User Manual Verification 'Phase 11: Track Scaffolding Prune, Cross-Browser Certification & Final Quality Gate' (Protocol in workflow.md)


## Phase: Review Fixes
- [x] Task: Audit and prune previous conductor track's post-TDD scaffolding tests (5b77e92)
- [x] Task: Apply review suggestions [c3bf048]
- [x] Task: Apply review suggestions [b0c58b3]