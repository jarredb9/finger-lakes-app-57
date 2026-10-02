# Specification: Initial Trip Creation Winery Persistence & Store Synchronization

**Tracking:** Issue [#57](https://github.com/jarredb9/finger-lakes-app-57/issues/57)  
**Proposal Reference:** [issue-57-initial-trip-creation-wineries.md](file:///home/byrnesjd4821/Git/finger-lakes-app-57/conductor/proposals/issue-57-initial-trip-creation-wineries.md)  
**Type:** Bug Fix  

## 1. Overview
When creating a new trip via the "Create a Trip" dialog ([TripForm](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/trip-form.tsx)), users can input a name, select a date, and search/select wineries to include. However, upon trip creation, the resulting trip card displays "0 Wineries", and the selected wineries are not associated with the created trip. In contrast, adding wineries from the winery modal or the trip details page works correctly.

This specification addresses the three underlying root causes:
1. **Unregistered Form Field:** The winery autocomplete in `TripForm` was controlled via imperative `form.setValue` calls rather than a formal React Hook Form `<FormField control={form.control} name="wineries" ... />` binding, causing state detachment in React 19's form lifecycle.
2. **Multi-Winery Chaining with Ephemeral IDs:** `TripService.createTrip` passed unpersisted/ephemeral IDs (`extra.dbId || 0`) to `addWineryToExistingTrip` for additional wineries (stops 2+), causing database foreign key lookups to fail for newly selected Google Places wineries.
3. **Store Synchronization & Count Invariants:** `createTripHelper` did not populate `wineries_count` on optimistic or synced trip records, leaving trip cards evaluating `{trip.wineries_count ?? trip.wineries?.length ?? 0}` out of sync until a manual page refresh, and failed to trigger background cache re-fetching.

## 2. Functional Requirements

### 2.1 Form Field Binding in `TripForm`
- Wrap winery search and selection inside `<FormField control={form.control} name="wineries" render={({ field }) => ...} />`.
- When a user selects a winery from `PlaceAutocomplete`, update state synchronously via `field.onChange([...current, winery])`.
- Support winery removal via `field.onChange(current.filter(w => w.id !== winery.id))`.
- Remove legacy imperative `handleWineryToggle` and direct `form.setValue("wineries", ...)`.
- Ensure winery selection renders removable badge tags with accessible labels and distinct test IDs (`data-testid="selected-wineries-list"`).

### 2.2 Polymorphic Multi-Winery Chaining in `TripService`
- Extend `TripService.addWineryToExistingTrip(tripId: number, wineryOrId: number | Winery, notes: string | null)` to accept either a numeric winery database ID or a full `Winery` domain object.
- If a `Winery` object is passed:
  - If it has a positive `dbId` (`wineryOrId.dbId > 0`), use the existing ID or RPC data.
  - If `!wineryOrId.dbId || wineryOrId.dbId <= 0` (e.g. from Google Places), construct RPC payload via `WineryService.getRpcData(wineryOrId)` and pass `p_winery_data` to ensure the winery is inserted/upserted and linked to the trip stop.
- In `TripService.createTrip`, iterate over subsequent wineries (`trip.wineries.slice(1)`) passing each full `Winery` object directly to `addWineryToExistingTrip`.

### 2.3 Store Synchronization & Background Cache Invalidation
- In `createTripHelper`:
  - Set optimistic `wineries_count: validWineries.length` on `tempTrip`.
  - Set `wineries_count: (createdTrip?.wineries?.length ?? validWineries.length)` on `syncedTrip`.
  - Ensure the resulting trip object in `trips` state retains both the populated `wineries` array and the accurate `wineries_count`.
  - Trigger non-blocking, fire-and-forget background cache re-fetches for `fetchUpcomingTrips()`, `fetchTripsForDate(targetDate)`, and `fetchTrips(1, 'upcoming', true)` with error handling to guarantee eventual consistency across all trip list views.

### 2.4 Presentation Badge Standardization
- Verify that `TripCardSimplePresentational` and any related trip card components display the winery count accurately using `{trip.wineries_count ?? trip.wineries?.length ?? 0}`.
- Ensure pluralization ("1 Winery" vs "N Wineries") renders consistently across both optimistic and confirmed states.

## 3. Strict TDD Workflow & Architecture Requirements
- **Strict Test-Driven Development (TDD):** Every task must strictly execute the Red-Green-Refactor cycle:
  1. **Red Phase:** Write unit tests that capture the bug and assert the expected behavior. Execute tests and verify expected failure before writing any implementation code.
  2. **Green Phase:** Write the minimal code required to pass tests.
  3. **Refactor Phase:** Refactor for clarity and maintainability while keeping tests green.
- **Test Artifact Hygiene & Scaffolding Cleanup:** Any temporary exploration files, one-off test harnesses, or throwaway scaffolding files created during development must be deleted before phase completion. Only permanent, high-value regression tests integrated into the project's standard test suites (`components/__tests__/`, `lib/services/__tests__/`, `lib/stores/__tests__/`, `e2e/`) are retained.
- **Runtime Invariants:** Follow project standards in [AGENTS.md](file:///home/byrnesjd4821/Git/finger-lakes-app-57/AGENTS.md) and [CONTEXT.md](file:///home/byrnesjd4821/Git/finger-lakes-app-57/CONTEXT.md).
- **Coordinate Standardization:** All wineries pass through `standardizeWineryData` accessing `location.latitude` and `location.longitude`.
- **Non-Blocking UI:** Trip creation form submission dialog must close smoothly without awaiting background list cache re-fetching.
- **Backwards Compatibility:** Maintain signature compatibility for `TripService.addWineryToExistingTrip` so existing numeric callers continue functioning without modification.

## 4. Acceptance Criteria
1. Strict TDD cycle is followed and documented for each task (failing test run confirmed before implementation).
2. Submitting `TripForm` with 1 selected winery creates the trip in Supabase, links the winery stop, and displays "1 Winery" on the newly rendered trip card immediately.
3. Submitting `TripForm` with multiple selected wineries (including newly searched Google Places wineries without prior Postgres database IDs) successfully associates all stops with the trip.
4. Removing a winery badge in `TripForm` prior to submit properly decrements the selection and submits only the remaining wineries.
5. Optimistic trip state displays the correct winery count immediately without flickering to "0 Wineries".
6. Background re-fetches keep `upcomingTrips`, `tripsForDate`, and paginated `trips` synchronized with backend aggregates.
7. Containerized Jest tests pass for `trip-form.test.tsx`, `tripService.mutations.test.ts`, and `tripMutationHelpers.test.ts`.
8. Playwright E2E test passes verifying trip creation with wineries in `e2e/trip-flow.spec.ts`.
9. All temporary scaffolding test files are deleted; only permanent, cleanly structured regression tests remain.

## 5. Out of Scope
- Redesigning the `PlaceAutocomplete` component or changing external Google Places v1 API schemas.
- Modifying Postgres RPC schemas or DDL migrations (existing RPCs `create_trip_with_winery` and `add_winery_to_trip` already support `p_winery_data`).
- Reordering stops within the initial creation modal (reordering remains a trip details feature).
