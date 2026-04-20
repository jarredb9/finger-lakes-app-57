# Specification: Track store-decoupling-component-purity - Pattern Isolation

## Objective
Evolve the application architecture from "Global State-Driven" to **"Pattern-Driven"** by isolating UI components from Zustand stores. This solves the "Whack-A-Mole" testing problem and ensures that UI changes never break unrelated logical flows.

## Dependencies
- **Track architecture-debt:** Must be completed first to solve the Modal/Portal bottleneck.
- **lib/types.ts:** Data interfaces must be clean of any Store-specific metadata.

## Technical Mandates (Architecture)
- **Container/Presentational Pattern:** Features must be split into "Containers" (which connect to Zustand) and "Presentational" components (which only take props).
- **Pure Function Cards:** Components like `TripCard`, `WineryCard`, and `VisitCard` MUST NOT call `useStore` hooks directly. They must receive data and callbacks via props.
- **Sync Locking (Revision IDs):** Implement a `version` or `last_updated` check in the `tripStore` and `visitStore` to ignore "stale" Realtime events that arrive after an optimistic update.
- **Interaction Guards:** UI actions MUST implement a "Readiness Gate" (e.g., a loading state or `data-hydrated` attribute) to ensure tests don't click during hydration flashes.
- **Selector Stability:** During component refactoring, existing `data-testid` attributes MUST be preserved. If a structural change requires a new selector, the corresponding E2E test MUST be updated in the same commit to prevent CI breakage.

## Scope

### 1. Component Purification
- **Surgical Refactor:** Audit `TripCard.tsx`, `WineryCard.tsx`, and `VisitCard.tsx`. Remove all `useTripStore`, `useUIStore`, and `useUserStore` calls.
- **Prop Injection:** Pass data and actions (`onShare`, `onEdit`, `onDelete`) from the parent Page or List container.

### 2. State Sync Reconciliation
- **The Sync Lock:** Add a `lastActionTimestamp` to the store. If a Realtime payload arrives with a timestamp older than the last local mutation, discard it.
- **Reactivity Check:** Ensure `useEffect` is only used for side effects, not for "syncing" state between props and internal state (use `useMemo` or local state derived from props).

### 3. Isolated Unit Testing
- **Raw JSON Testing:** Refactor Jest tests to mount `TripCard` with a static JSON object. Remove all `jest.mock('zustand')` boilerplate.
- **Storybook-Style Verification:** Create a mock data factory (`test/factories/trips.ts`) to generate variations of data (e.g., "Owned Trip", "Collaborative Trip") for fast visual testing.

### 4. Interaction Readiness
- **Hydration Guards:** Add a global `isHydrated` flag to the `AppShell`. UI buttons must be disabled or "Ghost" styled until the store is ready.
- **E2E Speed:** Transition all remaining `waitForToast` assertions to `expect(store.state)`.

### 5. Architectural Hardening
- **Persistence Status Pattern:** Eliminate "Magic Number" ID checks (e.g., `dbId > 100`). Implement a formal `SyncStatus` (`pending` | `synced` | `error`) in the entity types to drive UI states and mutation guards.
- **Signal-Based E2E Sync:** Replace `waitForTimeout` and arbitrary sleeps in test helpers with explicit `data-ready` or `data-state` attribute listeners on the UI containers.
- **Action Delegation Pattern:** Fully decouple specific UI flows (like Delete Confirmation Dialogs) from presentational cards. Cards must only emit "Intent" events; containers must handle the orchestration of the flow.
- **Strict Mock Validation:** The `MockMapsManager` must be updated to behave as a "Strict Mock," throwing errors when the application makes requests that violate the expected state or ownership rules.

### 6. Concurrency & Infrastructure Scalability
- **Proxy Optimization:** Transition from a "Full-MITM" proxy approach to a "Targeted Interception" model to reduce CPU overhead in shared-resource environments (RHEL 8/Podman).
- **Deterministic Helpers:** Standardize on "Action-First, Assertion-Second" patterns in all E2E helpers to eliminate double-submission race conditions.
- **Worker Isolation:** Implement strict isolation strategies to allow scaling the test suite across multiple CPU cores without data or Service Worker pollution.

## Success Criteria
1. `TripCard` unit tests require zero store mocks and run in < 1s.
2. No Realtime "UI Flicker" (item appearing/disappearing) during high-latency network simulations.
3. Zero `useEffect` hooks used for prop-to-state synchronization in UI components.
4. Total decoupling: Deleting the `lib/stores` folder should not cause TypeScript errors in the `components/ui` folder.
5. Full E2E suite passes with 100% stability when running with 4+ concurrent workers in a resource-constrained container.

## Validation Strategy
- **Isolation Audit:** Attempt to run `npm run test` on a single component while intentionally breaking the `useTripStore` file. The test should still pass.
- **Latency Simulation:** Use Chrome DevTools "Slow 3G" and verify that optimistic updates remain stable even when the server response is delayed by 2000ms.
