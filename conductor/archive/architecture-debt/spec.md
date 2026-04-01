# Specification: Track architecture-debt - Foundational Stability & Testing

## Objective
Harden the application architecture by decoupling global singleton modals, optimizing store persistence to eliminate hydration delays, and implementing a "State-Injected" E2E testing standard to stop the "Regression Loop" caused by navigation-heavy tests.

## Dependencies
- **lib/database.types.ts:** Must be synchronized with the backend.
- **e2e/MockMapsManager:** Needs refactoring for type-safe mocking.

## Technical Mandates (Architecture)
- **Modal Portals:** Transition from the `GlobalModalRenderer` "switch-case" pattern to **Feature-Owned Portals**. Modals should be defined in their respective feature files but rendered into a root-level `div` using `React Portal`. 
- **Persistence Pruning:** Zustand persistence MUST be limited to session-critical tokens and user preferences (e.g., `theme`, `userId`). **Large arrays like `trips` and `visits` must be removed from persistence.**
- **Atomic Testing:** All new and existing E2E tests MUST transition to a "State-Injected" model using `page.evaluate`. 
- **Schema-Safe Mocks:** The `MockMapsManager` MUST import and enforce types from `database.types.ts` to eliminate numeric/string ID mismatches.

## Scope

### 1. Store Optimization (Hydration)
- **Persistence Audit:** Refactor `tripStore.ts`, `visitStore.ts`, and `wineryDataStore.ts` to exclude data arrays from `localStorage`.
- **E2E Reset:** Ensure `persist: false` is active for all stores when `process.env.NEXT_PUBLIC_IS_E2E === 'true'`.

### 2. Modal Decoupling
- **Registry Pattern:** Implement a `ModalPortal` system. Move `VisitForm`, `WineryNoteEditor`, and `TripShareDialog` back to their feature domains.
- **Store Reset:** Ensure `closeModal()` in `useUIStore` explicitly resets all associated content pointers to prevent stale UI flashes.

### 3. Testing Infrastructure
- **Atomic Helpers:** Add `injectTripState`, `injectVisitState`, and `injectUserState` helpers to `e2e/helpers.ts`.
- **Mock Schema Sync:** Update `MockMapsManager` to use a generic type system derived from `database.types.ts` for all RPC fulfillments.
- **Robust Selection:** Move all selectors to `data-testid`. Delete `robustClick`.

### 4. Data Consistency
- **Service Centralization:** Ensure all trip and visit mutations pass through a centralized `ensureInDb` check in `lib/services/wineryService.ts` to handle Google vs. DB ID mismatches.

## Success Criteria
1. E2E full suite runs in under 120 seconds (currently much higher due to hydration).
2. `page.goto('/login')` hydration takes less than 2 seconds in Playwright.
3. 100% of E2E tests are "Navigation-Light" (using `page.evaluate` for setup).
4. No use of `robustClick` or manual event dispatching in any test file.

## Validation Strategy
- **Hydration Timer:** Add a console log to `layout.tsx` that measures `window.performance.now()` from `import` to `useEffect` mount.
- **Coverage Check:** Verify that changing the Sidebar layout does not break the `TripShareDialog` E2E test.
