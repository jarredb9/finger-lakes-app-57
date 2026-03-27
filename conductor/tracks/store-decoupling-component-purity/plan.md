# Plan: Track store-decoupling-component-purity - Pattern Isolation

## Phase 1: Component Purity & Prop Injection
Objective: Decouple UI components from the Zustand stores.

- [ ] Task 1: Audit `TripCard.tsx`. Refactor to a "Presentational" component that takes `trip`, `isOwner`, `onShare`, `onEdit`, `onDelete` as props. **Verification:** Confirm zero `useStore` hooks are called within the file.
- [ ] Task 2: Create a `TripListContainer` or update `TripList.tsx` to handle the Zustand connections for all its children. **Verification:** Confirm all trip actions still work as expected.
- [ ] Task 3: Repeat the process for `WineryCardThumbnail.tsx` and `VisitCardHistory.tsx`. **Verification:** Components should now be testable in isolation.
- [ ] Task 4: Implement a `HydrationGuard` in the `AppShell`. Buttons must be disabled until `isHydrated` is `true`. **Verification:** Confirm Playwright tests correctly wait for hydration before interacting.

## Phase 2: State Sync & Revision Control
Objective: Solve the "Three-Way Sync" paradox and Realtime flickers.

- [ ] Task 1: Add a `lastActionTimestamp` to the `useTripStore` state. Update all mutation actions to set this timestamp.
- [ ] Task 2: Update the `postgres_changes` subscription in `tripStore.ts` to ignore payloads where the DB timestamp is older than the `lastActionTimestamp`. **Verification:** Simulate slow network and confirm Realtime events do not "overwrite" optimistic local updates.
- [ ] Task 3: Repeat the "Sync Lock" logic for `useVisitStore.ts`. **Verification:** Confirm visits are no longer "ghosted" during heavy sync.

## Phase 3: Unit Testing Transformation
Objective: Achieve "Zero-Mock" unit testing for UI components.

- [ ] Task 1: Create a `test/factories/dataFactory.ts` that generates mock `Trip`, `Winery`, and `Visit` objects for tests.
- [ ] Task 2: Refactor `TripCard.test.tsx` and `VisitCardHistory.test.tsx` to use the factories and direct prop passing. **Verification:** Delete all `jest.mock('zustand')` lines and confirm tests still pass.
- [ ] Task 3: Transition E2E "Success" assertions from "Toast Visibility" to "Store State Confirmation" using `page.evaluate`. **Verification:** Confirm full E2E suite runs 20% faster.

## Phase 4: System Validation & Final Decoupling
Objective: Ensure the "Complexity Ceiling" has been lowered.

- [ ] Task 1: Perform a "Deletion Test." Temporarily rename `lib/stores` and verify that `components/ui` remains error-free in the IDE.
- [ ] Task 2: Run the full E2E suite against WebKit in a high-latency Podman environment. **Verification:** 100% stability with zero `robustClick` calls.
- [ ] Task 3: Archive the track and update the "Standard Operating Procedures" in `GEMINI.md` to mandate the Container/Presentational pattern for all new features.
