# Plan: Track store-decoupling-component-purity - Pattern Isolation

## Phase 1: Component Purity & Prop Injection
Objective: Decouple UI components from the Zustand stores.

- [x] Task 1: Audit `TripCard.tsx`. Refactor to a "Presentational" component that takes `trip`, `isOwner`, `onShare`, `onEdit`, `onDelete` as props. **Verification:** Confirm zero `useStore` hooks are called and all existing `data-testid` attributes are preserved. [7eecae0]
- [x] Task 2: Create a `TripListContainer` or update `TripList.tsx` to handle the Zustand connections for all its children. **Verification:** Confirm all trip actions still work as expected and the E2E `trip-management.spec.ts` passes. [58b20a1]
- [x] Task 3: Repeat the process for `WineryCardThumbnail.tsx` and `VisitCardHistory.tsx`. **Verification:** Components should now be testable in isolation. [7eecae0]
- [x] Task 4: Implement a `HydrationGuard` in the `AppShell`. Buttons must be disabled until `isHydrated` is `true`. **Verification:** Confirm Playwright tests correctly wait for hydration before interacting. [7eecae0]

## Phase 2: State Sync & Revision Control
Objective: Solve the "Three-Way Sync" paradox and Realtime flickers.

- [x] Task 1: Add a `lastActionTimestamp` to the `useTripStore` state. Update all mutation actions to set this timestamp. [6638063]
- [x] Task 2: Update the `postgres_changes` subscription in `tripStore.ts` to implement Sync Lock. **Verification:** Simulate slow network and confirm Realtime events do not "overwrite" optimistic local updates. [0d9b5ef]
- [x] Task 3: Repeat the "Sync Lock" logic for `useVisitStore.ts`. **Verification:** Confirm visits are no longer "ghosted" during heavy sync. [6d6db32]

## Phase 3: Unit Testing Transformation
Objective: Achieve "Zero-Mock" unit testing for UI components.

- [x] Task 1: Create a `test/factories/dataFactory.ts` that generates mock `Trip`, `Winery`, and `Visit` objects for tests. [fbb7747]
- [x] Task 2: Refactor `TripCard.test.tsx` and `VisitCardHistory.test.tsx` to use the factories and direct prop passing. **Verification:** Delete all `jest.mock('zustand')` lines and confirm tests still pass. [2d837df]
- [x] Task 3: Transition E2E "Success" assertions from "Toast Visibility" to "Store State Confirmation" using `page.evaluate`. **Verification:** Confirm full E2E suite runs 20% faster. [3255f2f]

## Phase: Review Fixes
- [x] Task: Apply review suggestions - Fully decouple search from TripCardPresentational [c99fc88]
- [x] Task: Apply review suggestions - Add updated_at to visits table and types [b8ad327]
- [x] Task: Apply review suggestions - Fix accessibility labels and PWA sync verification logs [4bf2a9a]
- [x] Task 1: Perform a "Deletion Test." Temporarily rename `lib/stores` and verify that `components/ui` remains error-free in the IDE. [d64195b]
- [x] Task 2: Run the full E2E suite against WebKit in a high-latency Podman environment. [5a91bb9]
- [x] Task 3: Update `GEMINI.md` Core Architectural Standards to strictly mandate the Container/Presentational pattern [2dc0564]
- [x] Task 4: Update `project-testing-best-practices` to reflect updated testing structure and best practices as a result of this track [43c3b5e]
- [x] Task 5: Apply review suggestions for Phase 5 - Fix unit test regression in TripCardPresentational.test.tsx [375a5f0]

## Phase 5: Architectural Hardening
Objective: Transition from "Defensive Fixes" to a Professional/Principal standard.

- [x] Task 1: Explicit Persistence States. Implement `SyncStatus` union in `lib/types.ts`. Update `useTripStore` and `useVisitStore` to manage this state. [4ae8d1c]
- [x] Task 2: Signal-Based Synchronization. Implement `data-state="ready"` in main containers. Update `e2e/helpers.ts` to utilize these signals. [55121ce]
- [x] Task 3: Action Delegation Pattern. Move `AlertDialog` from `TripCardPresentational` to `TripList` container. [55121ce]
- [x] Task 4: Strict Mock Validation. Update `MockMapsManager` to throw on invalid state requests. [55121ce]

**Verification Suite:** Run `trip-management.spec.ts`, `visit-flow.spec.ts`, `pwa-sync-deep.spec.ts`, `item-privacy.spec.ts`, and `smoke.spec.ts`.

## Phase 6: Systemic Test Robustness (Integration Robustness)
Objective: Standardize deterministic synchronization between E2E environment and application state to prevent race conditions in multi-context and real-database scenarios.

- [x] Task 1: Atomic Injection. Refactored `MockMapsManager` to use a one-time `_E2E_INJECTED` guard rather than a destructive persistent interval. [97f8cb6]
- [x] Task 2: Mutation Settlement Protocol. Implemented `waitForMutation` logic and explicit RPC waits in `item-privacy.spec.ts` and `helpers.ts`. [97f8cb6]
- [x] Task 3: Deterministic Hydration. Hardened `waitForAppReady` and implemented `waitForSignal` for modals. [97f8cb6]
- [x] Task 4: Fix Action-in-Retry Anti-Patterns. Decoupled form submission from retry loops in `login()` helper. [a8dbc76]

**Verification Suite:** Run `trip-management.spec.ts`, `item-privacy.spec.ts`, `wishlist-flow.spec.ts`, and `pwa-assets.spec.ts` under high concurrency (e.g., 2+ workers). (Current status: Resolved timeouts in pwa-assets.spec.ts)

## Phase 7: Concurrency & Infrastructure Scalability
Objective: Eliminate CPU saturation and network race conditions to support 2+ workers in containerized environments.

- [x] Task 1: Optimize Network Proxying. Refactor `MockMapsManager` in `e2e/utils.ts` to use targeted regex/glob patterns for Supabase and Google Maps instead of the expensive `**/*` catch-all. [add9710]
- [x] Task 2: Hardened Helper Logic. Audit `e2e/helpers.ts` and ensure no actions (clicks, fills, keypresses) occur inside `toPass` or `expect(async () => ...)` blocks. [6a54052]
- [x] Task 3: Service Worker Origin Isolation. Implement a deterministic sabotage or unique scoping strategy in `MockMapsManager` to prevent Worker A's Service Worker from intercepting Worker B's requests. [107e96c]
- [x] Task 4: Environment Parallelization. Update `playwright.config.ts` and `scripts/run-e2e-container.sh` to ensure each worker operates in a strictly isolated context (e.g., unique ports or storage partitions) when running "Real Data" tests. Currently implemented with 2 workers and unique storage partitions per worker. [65a4737]

**Verification Suite:** Run the full E2E suite with `workers: 2` in the Podman container. Confirm zero timeouts and 100% pass rate.

## Phase: Cleanup
Objective: Ensure the "Complexity Ceiling" has been lowered and codified.

- [ ] Task 1: Remove directives and project information that has become outdated due to this track in `GEMINI.md`
- [ ] Task 2: Add/update the directives and project information in the `GEMINI.md` that has changed as a result of this track
- [ ] Task 3: Remove directives and project information that has become outdated due to this track in the `project-testing-best-practices` skill
- [ ] Task 4: Add/update the directives and project information in the `project-testing-best-practices` skill that has changed as a result of this track
- [ ] Task 5: Archive the track and update the project CHANGELOG.

