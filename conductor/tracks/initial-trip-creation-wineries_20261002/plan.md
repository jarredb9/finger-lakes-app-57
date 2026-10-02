# Implementation Plan: Initial Trip Creation Winery Persistence & Store Synchronization

**Tracking:** Issue [#57](https://github.com/jarredb9/finger-lakes-app-57/issues/57)  
**Specification Reference:** [spec.md](./spec.md)  

## Phase 1: Form Field Registration & Controlled Binding (`TripForm`)

- [ ] Task: Write Failing Unit Tests for Form Field Registration (Red Phase)
    - [ ] Add test cases to `components/__tests__/trip-form.test.tsx` verifying controlled `wineries` field registration, autocomplete selection, badge rendering with removal, and payload delivery to `createTrip`.
    - [ ] Run containerized Jest suite (`./scripts/run-jest-container.sh components/__tests__/trip-form.test.tsx`) and confirm test failure.
- [ ] Task: Implement Controlled `<FormField>` Binding in `TripForm` (Green Phase)
    - [ ] Refactor `components/trip-form.tsx` to bind `PlaceAutocomplete` and selected winery tags inside `<FormField control={form.control} name="wineries" render={({ field }) => ...} />`.
    - [ ] Replace legacy imperative `handleWineryToggle` and `setValue` calls with `field.onChange`.
    - [ ] Add test IDs (`data-testid="selected-wineries-list"`) and tag removal handlers.
    - [ ] Run containerized Jest suite and verify all tests pass.
- [ ] Task: Refactor & Scaffolding Cleanup
    - [ ] Refactor `components/trip-form.tsx` for readability and adherence to UI container/presentational conventions.
    - [ ] Audit and remove any temporary scaffolding test files created during development, keeping only permanent regression tests.
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Form Field Registration & Controlled Binding' (Protocol in workflow.md)

## Phase 2: Polymorphic Multi-Winery Chaining (`TripService`)

- [ ] Task: Write Failing Tests for Polymorphic `addWineryToExistingTrip` and Multi-Winery `createTrip` (Red Phase)
    - [ ] Add test cases in `lib/services/__tests__/tripService.mutations.test.ts` testing `addWineryToExistingTrip` with a `Winery` object having an unassigned/ephemeral DB ID.
    - [ ] Add test case for `createTrip` with multiple wineries verifying `p_winery_data` RPC payload is passed to subsequent stops.
    - [ ] Run containerized Jest suite (`./scripts/run-jest-container.sh lib/services/__tests__/tripService.mutations.test.ts`) and confirm test failure.
- [ ] Task: Implement Polymorphic `addWineryToExistingTrip` and Chained RPC Calls (Green Phase)
    - [ ] Update `TripService.addWineryToExistingTrip` signature to `(tripId: number, wineryOrId: number | Winery, notes: string | null)`.
    - [ ] If `wineryOrId` is an object with missing/non-positive `dbId`, construct `p_winery_data` via `WineryService.getRpcData(wineryOrId)` for RPC invocation.
    - [ ] Update `TripService.createTrip` to pass full `Winery` objects in loop over `trip.wineries.slice(1)`.
    - [ ] Run containerized Jest suite and verify all tests pass.
- [ ] Task: Refactor & Scaffolding Cleanup
    - [ ] Ensure clean TypeScript typing without unsafe type assertions.
    - [ ] Audit and remove any temporary scratch or scaffolding test files.
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Polymorphic Multi-Winery Chaining' (Protocol in workflow.md)

## Phase 3: Store Invariants, Count Normalization & Cache Invalidation (`tripMutationHelpers`)

- [ ] Task: Write Failing Tests for Store Invariants & Background Re-fetches (Red Phase)
    - [ ] Add test cases to `lib/stores/__tests__/tripMutationHelpers.test.ts` checking `wineries_count` in both optimistic (`tempTrip`) and synced (`syncedTrip`) states.
    - [ ] Assert that background invalidation triggers `fetchUpcomingTrips`, `fetchTripsForDate`, and `fetchTrips`.
    - [ ] Run containerized Jest suite and confirm test failure.
- [ ] Task: Implement Store Count Population & Cache Re-fetch Dispatch (Green Phase)
    - [ ] In `createTripHelper`, populate `wineries_count: validWineries.length` on `tempTrip` and `wineries_count: (createdTrip?.wineries?.length ?? validWineries.length)` on `syncedTrip`.
    - [ ] Implement non-blocking `void Promise.all([...])` background cache refresh with error handling.
    - [ ] Verify count badge fallback `{trip.wineries_count ?? trip.wineries?.length ?? 0}` in `TripCardSimplePresentational.tsx`.
    - [ ] Run containerized Jest suite and verify all tests pass.
- [ ] Task: Refactor & Scaffolding Cleanup
    - [ ] Clean up store helper logic, verify Zustand 5 selectors, and remove any temporary test artifacts.
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Store Invariants, Count Normalization & Cache Invalidation' (Protocol in workflow.md)

## Phase 4: End-to-End Verification & Final Quality Gates

- [ ] Task: E2E Integration Flow (Playwright)
    - [ ] Add or update E2E test in `e2e/trip-flow.spec.ts` covering dialog opening, winery search/selection, submission, and verifying the resulting trip card displays "1 Winery" (or "N Wineries").
    - [ ] Execute Playwright test via container runner (`./scripts/run-e2e-container.sh`).
- [ ] Task: Full Suite Verification & Build Audit
    - [ ] Run full unit test suite via container runner (`./scripts/run-jest-container.sh`).
    - [ ] Run type checking and container build (`npm run db:check-types:local`).
    - [ ] Perform strict scaffolding audit: ensure zero temporary or throwaway test files exist.
- [ ] Task: Conductor - User Manual Verification 'Phase 4: End-to-End Verification & Final Quality Gates' (Protocol in workflow.md)
