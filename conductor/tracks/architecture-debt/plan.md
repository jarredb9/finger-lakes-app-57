# Plan: Track architecture-debt - Foundational Stability & Testing

## Universal Constraints
- **Test-as-you-go:** Every task MUST be verified with a build (`npm run build`) and relevant tests (Jest for logic, E2E for UI) before proceeding.
- **Frequent Commits:** Commit at the end of every Phase, or after high-risk tasks.
- **No Regression:** Run `e2e/smoke.spec.ts` after any Store or Global Component change.

## Phase 1: Store & Hydration Cleanup
Objective: Eliminate 15+ second E2E hydration delays.

- [x] Task 1: Audit `tripStore.ts`, `visitStore.ts`, and `wineryDataStore.ts` persistence. Move `trips`, `visits`, and `wineries` to `unpersisted` state. (f9cf3db)
- [x] Task 2: Implement a conditional persistence bypass for E2E mode in all stores (`persist: NEXT_PUBLIC_IS_E2E !== 'true'`). (f9cf3db)
- [x] Task 3: Refactor the `GlobalModalRenderer` to clear all stateful content on `closeModal` to prevent stale UI flashes between tests. (f9cf3db)
- [x] Task 4: **Verification:** Confirm `localStorage` contains < 500 bytes of data after reload. Confirm `isModalOpen` is `false` and `modalContent` is `null` after closing.

## Phase 2: Modal Architecture & Portals
Objective: Decouple feature logic from the "God Renderer" singleton.

- [x] Task 1: Implement a `ModalHost` component at the root of `layout.tsx` to handle standard React Portals. (f9cf3db)
- [x] Task 2: Refactor `VisitForm` and `WineryNoteEditor` to be defined locally within their parent components and use Portals to render into `ModalHost`.
- [x] Task 3: Migrate `TripShareDialog` to the same Portal pattern, removing it from `GlobalModalRenderer`. **Verification:** Confirm sharing dialog still opens via store trigger but is managed locally by the feature.
- [x] Task 4: **Verification:** Run `e2e/visit-flow.spec.ts` and `e2e/trip-sharing.spec.ts` to ensure zero regressions in modal behavior.

## Phase 3: Type-Safe Testing Infrastructure (Implementation Complete - Awaiting Verification)
Objective: Eliminate the "Numeric ID" and "Selector Drift" bugs.

- [x] Task 1: Refactor `MockMapsManager` to enforce `database.types.ts` schemas on all RPC mock responses. **Verification:** TypeScript compilation errors if a mock field doesn't match the DB. (aef83d7)
- [x] Task 2: Implement "Atomic State Injection" helpers in `e2e/helpers.ts` (`injectTripState`, `injectVisitState`). (aef83d7)
- [x] Task 3: Refactor `e2e/trip-sharing.spec.ts` to use `injectTripState` and bypass navigation. **Verification:** Test runs in < 10 seconds and is independent of the Sidebar layout.(aef83d7)
- [x] Task 4: Audit all E2E specs for `robustClick` usage and replace with stable `data-testid` based clicks. **Verification:** Zero occurrences of `robustClick` in `e2e/` folder. (aef83d7)

## Phase 4: Data Layer Hardening
Objective: Consolidate the "ID Paradox" (Google vs DB ID).

- [X] Task 1: Centralize `ensureInDb` logic into `lib/services/wineryService.ts` to ensure consistent ID handling across Trips, Visits, and Favorites. ( d8aef19 )
- [X] Task 2: Add a "Schema Integrity" check to the CI pipeline to catch `database.types.ts` drift before tests are run. **Verification:** CI fails if local types don't match the Supabase project schema. ( d8aef19 )

## Phase 5: Standard Finalization
Objective: Codify the new stable state.

- [x] Task 1: Remove the "Migration & Transition Rule" from the `project-testing-best-practices` skill and update the skill based on changes made in this track. (0e46d19)
- [x] Task 2: Update `GEMINI.md` to move the Portal/Registry pattern from a "Plan" to a "Mandatory Core Standard." (bc4f40b)
- [ ] Task 3: Archive the track and update the project CHANGELOG.
