# Implementation Plan: Initial Trip Creation Winery Persistence & Store Synchronization

**Tracking:** Issue [#57](https://github.com/jarredb9/finger-lakes-app-57/issues/57)  
**Specification Reference:** [spec.md](./spec.md)  

## Phase 1: PostgreSQL RPC Coordinate Standardization (`add_winery_to_trip`) [checkpoint: 5107fec]

- [x] Task: Write Failing Integration Test for `add_winery_to_trip` Coordinates (Red Phase) [commit: 45349bd]
    - [x] Add integration test in `lib/services/__tests__/supabase-rpc.integration.test.ts` verifying that calling `add_winery_to_trip` with `latitude`/`longitude` JSON keys (and without `lat`/`lng`) correctly persists numeric coordinates.
    - [x] Run containerized Jest suite (`TEST_TYPE=integration ./scripts/run-jest-container.sh lib/services/__tests__/supabase-rpc.integration.test.ts`) and confirm test failure.
- [x] Task: Create & Apply Supabase Migration for `add_winery_to_trip` (Green Phase) [commit: 2bad14ed]
    - [x] Create `supabase/migrations/20261002120000_standardize_add_winery_to_trip_coordinates.sql` updating `add_winery_to_trip` to use `COALESCE(p_winery_data->>'latitude', p_winery_data->>'lat')::numeric` and `COALESCE(p_winery_data->>'longitude', p_winery_data->>'lng')::numeric`.
    - [x] Apply migration locally via `npm run db:start` / verify schema.
    - [x] Run containerized Jest suite and verify test passes.
- [x] Task: Refactor & Scaffolding Cleanup [commit: 29170a4b]
    - [x] Verify TypeScript database types (`npm run db:check-types:local`).
    - [x] Remove any temporary SQL scripts or exploration artifacts.
- [x] Task: Conductor - User Manual Verification 'Phase 1: PostgreSQL RPC Coordinate Standardization' (Protocol in workflow.md)

## Phase 2: Test Suite Restructuring & Controlled Binding (`TripForm`) [checkpoint: 1944413]

- [x] Task: Restructure Legacy Test Suite & Write Failing Tests for Form Field Registration (Red Phase) [commit: 380d591b]
    - [x] Extract auth form tests (`LoginForm`, `ForgotPasswordForm`, `ManualConfirmForm`) from `components/__tests__/react19-form-actions.test.tsx` into `components/__tests__/auth-forms.test.tsx`.
    - [x] Create dedicated `components/__tests__/trip-form.test.tsx` containing existing `TripForm` tests and new failing tests asserting controlled `<FormField>` binding, `PlaceAutocomplete` selection, tag removal, and payload delivery to `createTrip`.
    - [x] Delete legacy `components/__tests__/react19-form-actions.test.tsx`.
    - [x] Run containerized Jest suite (`./scripts/run-jest-container.sh components/__tests__/trip-form.test.tsx components/__tests__/auth-forms.test.tsx`) and confirm expected failure on new tests.
- [x] Task: Implement Controlled `<FormField>` Binding in `TripForm` (Green Phase) [commit: 0a827d67]
    - [x] Refactor `components/trip-form.tsx` to bind `PlaceAutocomplete` and selected winery tags inside `<FormField control={form.control} name="wineries" render={({ field }) => ...} />`.
    - [x] Replace legacy imperative `handleWineryToggle`, `ensureInDb`, and `setValue` calls with `field.onChange`.
    - [x] Add test IDs (`data-testid="selected-wineries-list"`) and tag removal handlers.
    - [x] Run containerized Jest suite and verify all tests pass.
- [x] Task: Refactor & Scaffolding Cleanup [commit: 537e3cfc]
    - [x] Refactor `components/trip-form.tsx` for readability and adherence to UI container/presentational conventions.
    - [x] Audit and verify clean test files without any temporary scaffolding artifacts.
- [x] Task: Conductor - User Manual Verification 'Phase 2: Test Suite Restructuring & Controlled Binding' (Protocol in workflow.md)

## Phase 3: PlaceAutocomplete Selection UX & Re-Query Suppression (Red-Green-Refactor) [checkpoint: 4a82f6df]

- [x] Task: Write Failing Tests for `clearOnSelect` and Programmatic Re-Query Suppression (Red Phase) [commit: aadb0e30]
    - [x] Add unit tests in `components/__tests__/PlaceAutocomplete.test.tsx` asserting:
      - `clearOnSelect: true` clears `inputValue` upon successful suggestion selection.
      - Programmatic value updates do not trigger debounced `fetchSuggestions` or re-open the dropdown.
      - If place details resolution fails, the input field retains the typed search string and the dropdown remains closed.
    - [x] Add tests in `components/__tests__/trip-form.test.tsx` verifying that selecting a winery clears the search input when `clearOnSelect={true}`.
    - [x] Add regression tests in `components/__tests__/PlaceAutocomplete.test.tsx` verifying default `clearOnSelect: false` retains the selected place string without re-opening the dropdown (covering `MapSearchBar` behavior).
    - [x] Run containerized Jest suite (`./scripts/run-jest-container.sh components/__tests__/PlaceAutocomplete.test.tsx components/__tests__/trip-form.test.tsx`) and confirm expected test failures.
- [x] Task: Implement Selection Guard & `clearOnSelect` in `PlaceAutocomplete` (Green Phase) [commit: 369c2b00]
    - [x] In `components/PlaceAutocomplete.tsx`, implement `clearOnSelect?: boolean` prop and internal programmatic selection guard ref to suppress debounced re-queries.
    - [x] In `handleSelectSuggestion`, clear `inputValue` on successful selection if `clearOnSelect` is true; retain typed string on error.
    - [x] In `components/trip-form.tsx`, pass `clearOnSelect={true}` to `PlaceAutocomplete`.
    - [x] Run containerized Jest suite and confirm all tests pass.
- [x] Task: Refactor & Scaffolding Cleanup [commit: 579d0b45]
    - [x] Refactor `PlaceAutocomplete.tsx` for clean hook separation and accessibility.
    - [x] Perform scaffolding audit: ensure zero temporary or throwaway test files exist.
- [x] Task: Conductor - User Manual Verification 'Phase 3: PlaceAutocomplete Selection UX & Re-Query Suppression' (Protocol in workflow.md)

## Phase 4: Dual-Key Coordinates, Polymorphic Chaining & Strict Rollback (`WineryService`, `TripService`)

- [ ] Task: Write Failing Tests for Dual-Key Coordinates, Polymorphic Chaining, and Strict Rollback (Red Phase)
    - [ ] Add test cases in `lib/services/__tests__/tripService.mutations.test.ts` for dual-key coordinates in `WineryService.getRpcData` (`lat`/`lng` and `latitude`/`longitude`).
    - [ ] Add test cases for `addWineryToExistingTrip` with a full `Winery` object (no DB ID) and non-positive DB ID rejection.
    - [ ] Add test cases for `createTrip` chained winery addition and strict rollback with `preventOfflineEnqueue = true` when chained addition fails.
    - [ ] Run containerized Jest suite (`./scripts/run-jest-container.sh lib/services/__tests__/tripService.mutations.test.ts`) and confirm test failure.
- [ ] Task: Implement Dual-Key Coordinates, Polymorphic Chaining & Rollback Semantics (Green Phase)
    - [ ] Update `WineryService.getRpcData` to emit `latitude`, `longitude`, `lat`, and `lng` for 100% backward compatibility across all PostgreSQL RPCs.
    - [ ] Update `TripService.addWineryToExistingTrip` signature to `(tripId: number, wineryOrId: number | Winery, notes: string | null)` and validate positive ID if numeric.
    - [ ] Update `TripService.createTrip` to loop through `trip.wineries.slice(1)` passing `extra`, catch errors, execute `deleteTrip`, tag `preventOfflineEnqueue = true`, and rethrow.
    - [ ] Run containerized Jest suite and verify all tests pass.
- [ ] Task: Refactor & Scaffolding Cleanup
    - [ ] Ensure strict TypeScript typing without unsafe type assertions.
    - [ ] Audit and remove any temporary scratch or scaffolding test files.
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Dual-Key Coordinates, Polymorphic Chaining & Strict Rollback' (Protocol in workflow.md)

## Phase 5: Offline Sync Parity (`syncService.ts`)

- [ ] Task: Write Failing Tests for Offline Multi-Stop Trip Replay (Red Phase)
    - [ ] Add unit/integration test in `lib/stores/__tests__/tripStore.syncStore.test.ts` asserting that an offline `create_trip` sync item with multiple wineries replays through `TripService.createTrip` without dropping stops 2+ and populates `wineries_count`.
    - [ ] Run containerized Jest suite and confirm test failure.
- [ ] Task: Refactor `syncService.ts` to Delegate to `TripService.createTrip` (Green Phase)
    - [ ] In `lib/services/syncService.ts`, refactor `'create_trip'` case to invoke `TripService.createTrip(payload, item.id)`.
    - [ ] Populate `wineries_count` on the replaced store trip and trigger background cache invalidation (`fetchUpcomingTrips`, `fetchTripsForDate`, `fetchTrips`).
    - [ ] Run containerized Jest suite and verify all tests pass.
- [ ] Task: Refactor & Scaffolding Cleanup
    - [ ] Audit offline sync handlers and clean up redundant code.
- [ ] Task: Conductor - User Manual Verification 'Phase 5: Offline Sync Parity' (Protocol in workflow.md)

## Phase 6: Store Invariants, Background Invalidation & Badge Pluralization (`tripMutationHelpers`, `TripCardSimplePresentational`)

- [ ] Task: Write Failing Tests for Store Invariants & Rollback Suppression (Red Phase)
    - [ ] Add test cases to `lib/stores/slices/__tests__/tripMutationHelpers.test.ts` verifying `wineries_count` on `tempTrip` and `syncedTrip`.
    - [ ] Add test case verifying background cache invalidation (`fetchUpcomingTrips`, `fetchTripsForDate`, `fetchTrips`).
    - [ ] Add test case verifying that errors tagged with `preventOfflineEnqueue` bypass `handleSyncError` and do NOT enqueue to offline store.
    - [ ] Run containerized Jest suite (`./scripts/run-jest-container.sh lib/stores/slices/__tests__/tripMutationHelpers.test.ts`) and confirm test failure.
- [ ] Task: Implement Store Count Population, Offline Suppression & Badge Pluralization (Green Phase)
    - [ ] In `createTripHelper` (`lib/stores/slices/tripMutationHelpers.ts`), set `wineries_count: validWineries.length` on `tempTrip` and `wineries_count: (createdTrip?.wineries?.length ?? validWineries.length)` on `syncedTrip`.
    - [ ] Suppress offline enqueueing when `(error as any)?.preventOfflineEnqueue` is true.
    - [ ] Fire non-blocking `void Promise.all([...])` background cache refresh.
    - [ ] Update `components/TripCardSimplePresentational.tsx` badge to pluralize correctly: `{count} {count === 1 ? 'Winery' : 'Wineries'}`.
    - [ ] Run containerized Jest suite and verify all tests pass.
- [ ] Task: Refactor & Scaffolding Cleanup
    - [ ] Clean up store helper logic, verify Zustand 5 selectors, and remove any temporary test artifacts.
- [ ] Task: Conductor - User Manual Verification 'Phase 6: Store Invariants, Background Invalidation & Badge Pluralization' (Protocol in workflow.md)

## Phase 7: End-to-End Verification & Final Quality Gates

- [ ] Task: E2E Integration Flow (Playwright)
    - [ ] Add or update E2E test in `e2e/trip-flow.spec.ts` covering dialog opening, winery search/selection via `PlaceAutocomplete`, submission, and verifying the resulting trip card displays "1 Winery" (and "N Wineries" for multiple stops).
    - [ ] Execute Playwright test via container runner (`./scripts/run-e2e-container.sh webkit e2e/trip-flow.spec.ts`).
- [ ] Task: Full Suite Verification & Build Audit
    - [ ] Run full unit test suite via container runner (`./scripts/run-jest-container.sh`).
    - [ ] Run type checking and container build (`npm run db:check-types:local`).
    - [ ] Perform strict scaffolding audit: ensure zero temporary or throwaway test files exist.
- [ ] Task: Conductor - User Manual Verification 'Phase 7: End-to-End Verification & Final Quality Gates' (Protocol in workflow.md)

