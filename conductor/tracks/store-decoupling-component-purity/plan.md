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
- [~] Task 2: Update the `postgres_changes` subscription in `tripStore.ts` to ignore payloads where the DB timestamp is older than the `lastActionTimestamp`. **Verification:** Simulate slow network and confirm Realtime events do not "overwrite" optimistic local updates.
- [ ] Task 3: Repeat the "Sync Lock" logic for `useVisitStore.ts`. **Verification:** Confirm visits are no longer "ghosted" during heavy sync.

## Phase 3: Unit Testing Transformation
Objective: Achieve "Zero-Mock" unit testing for UI components.

- [ ] Task 1: Create a `test/factories/dataFactory.ts` that generates mock `Trip`, `Winery`, and `Visit` objects for tests.
- [ ] Task 2: Refactor `TripCard.test.tsx` and `VisitCardHistory.test.tsx` to use the factories and direct prop passing. **Verification:** Delete all `jest.mock('zustand')` lines and confirm tests still pass.
- [ ] Task 3: Transition E2E "Success" assertions from "Toast Visibility" to "Store State Confirmation" using `page.evaluate`. **Verification:** Confirm full E2E suite runs 20% faster.

## Phase: Review Fixes
- [x] Task: Apply review suggestions - Fully decouple search from TripCardPresentational [c99fc88]

Objective: Ensure the "Complexity Ceiling" has been lowered and codified.

- [ ] Task 1: Perform a "Deletion Test." Temporarily rename `lib/stores` and verify that `components/ui` remains error-free in the IDE.
- [ ] Task 2: Run the full E2E suite against WebKit in a high-latency Podman environment. **Verification:** 100% stability with zero `robustClick` calls.
- [ ] Task 3: Update `GEMINI.md` Core Architectural Standards to strictly mandate the Container/Presentational pattern and provide a link to the refactored `TripCard` as the reference implementation.
- [ ] Task 4: Archive the track and update the project CHANGELOG.
