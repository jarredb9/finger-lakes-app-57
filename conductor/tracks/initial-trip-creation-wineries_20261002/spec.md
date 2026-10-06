# Specification: Initial Trip Creation Winery Persistence & Store Synchronization

**Tracking:** Issue [#57](https://github.com/jarredb9/finger-lakes-app-57/issues/57)  
**Proposal Reference:** [issue-57-initial-trip-creation-wineries.md](file:///home/byrnesjd4821/Git/finger-lakes-app-57/conductor/proposals/issue-57-initial-trip-creation-wineries.md)  
**Type:** Bug Fix  

## 1. Overview
When creating a new trip via the "Create a Trip" dialog ([TripForm](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/trip-form.tsx)), users can input a name, select a date, and search/select wineries to include as Trip Stops. However, upon trip creation, the resulting trip card displays "0 Wineries", and the selected wineries are not associated with the created trip. In contrast, adding wineries from the winery modal or the trip details page works correctly.

This specification addresses the six underlying root causes identified through architectural audit and grilling:
1. **PostgreSQL RPC Coordinate Schema Mismatch:** While recent database migrations updated write RPCs (like `create_trip_with_winery`) to coalesce `COALESCE(p_winery_data->>'latitude', p_winery_data->>'lat')`, the baseline RPC `add_winery_to_trip` only extracts `(p_winery_data->>'lat')::numeric` and `(p_winery_data->>'lng')::numeric`. Meanwhile, `WineryService.getRpcData` only emitted `latitude` and `longitude`, causing PostgreSQL to insert `NULL` coordinates for chained stops.
2. **Unregistered Form Field:** The winery autocomplete in `TripForm` was controlled via imperative `form.setValue` calls rather than a formal React Hook Form `<FormField control={form.control} name="wineries" ... />` binding, causing state detachment in React 19's form lifecycle.
3. **Multi-Winery Chaining with Ephemeral IDs:** `TripService.createTrip` passed unpersisted/ephemeral IDs (`extra.dbId || 0`) to `addWineryToExistingTrip` for additional wineries (stops 2+), causing database foreign key lookups to fail for newly selected Google Places wineries without prior Postgres IDs.
4. **Offline Queue Replay Parity Gap:** `syncService.ts` re-implemented `create_trip` manually by invoking `create_trip_with_winery` with only the first winery (`payload.wineries[0]`), permanently dropping stops 2+ during offline sync and omitting `wineries_count`.
5. **Store Synchronization & Count Invariants:** `createTripHelper` did not populate `wineries_count` on optimistic or synced trip records, leaving trip cards evaluating `{trip.wineries_count ?? trip.wineries?.length ?? 0}` out of sync until a manual page refresh, and failed to trigger background cache re-fetching.
6. **Grammar & Pluralization Bug:** `TripCardSimplePresentational.tsx` hardcoded `{count} Wineries`, causing "1 Wineries" to render for single-stop trips unlike `TripCardPresentational.tsx`.

## 2. Domain Model Alignment (`CONTEXT.md`)
- **Trip:** A scheduled itinerary of planned winery stops for a specific calendar date, organized by an owner and optionally shared with collaborators.
- **Trip Stop:** A single planned destination within a Trip, specifying a Winery, its sequence in the itinerary, and planning notes. Avoid: *Visit*, *waypoint*, *destination*, *trip winery*.
- **Winery:** A commercial establishment producing or offering wine tasting in the region.
- All coordinate standardizations continue through `standardizeWineryData` accessing `location.latitude` and `location.longitude`.

## 3. Functional Requirements

### 3.1 PostgreSQL RPC Coordinate Standardization (`add_winery_to_trip`)
- Create a non-breaking Supabase migration to update `public.add_winery_to_trip(p_trip_id integer, p_winery_data jsonb, p_notes text DEFAULT NULL)`:
  - Update coordinate extraction to use:
    ```sql
    (COALESCE(p_winery_data->>'latitude', p_winery_data->>'lat'))::numeric,
    (COALESCE(p_winery_data->>'longitude', p_winery_data->>'lng'))::numeric,
    ```
  - Follow the expand-and-contract pattern to ensure 100% backward compatibility with existing callers while standardizing with all other write RPCs (`create_trip_with_winery`, `log_visit`).
  - Maintain identical ownership, permissions (`authenticated`, `service_role`), and security definer search path.

### 3.2 Dual-Key Coordinate Serialization in `WineryService.getRpcData`
- Update `WineryService.getRpcData(winery)` to serialize coordinates with dual-keys:
  ```typescript
  latitude: winery.latitude || 0,
  longitude: winery.longitude || 0,
  lat: winery.latitude || 0,
  lng: winery.longitude || 0,
  ```
- This defense-in-depth policy guarantees safety during deployment cutovers and avoids any transient coordinate loss regardless of migration timing.

### 3.3 Controlled Form Field Binding in `TripForm`
- Wrap winery search and selection inside `<FormField control={form.control} name="wineries" render={({ field }) => ...} />`.
- When a user selects a winery from `PlaceAutocomplete`, update state synchronously via `field.onChange([...current, winery])`, deduplicating by `winery.id`.
- Support winery removal via `field.onChange(current.filter(w => w.id !== winery.id))`.
- Remove legacy imperative `handleWineryToggle`, `ensureInDb`, and direct `form.setValue("wineries", ...)`.
- Ensure winery selection renders removable badge tags with accessible labels and distinct test IDs (`data-testid="selected-wineries-list"`, `data-testid="selected-winery-${winery.id}"`).

### 3.4 PlaceAutocomplete Selection UX & Re-Query Suppression
- Add `clearOnSelect?: boolean` prop to `PlaceAutocomplete` (defaulting to `false` for backward compatibility with `MapSearchBar`).
- When `clearOnSelect: true` (passed by `TripForm`), clear `inputValue` upon successful place selection and badge creation, leaving the input empty and immediately ready for adding subsequent winery stops.
- If place details resolution fails, retain the typed search query in the input field so the user can easily retry without retyping from scratch.
- Introduce an internal selection guard ref in `PlaceAutocomplete` to distinguish user typing from programmatic value assignments, preventing debounced re-queries and ensuring the suggestions dropdown remains closed after selection.
- Retain existing `blur()` invocation on suggestion selection to dismiss mobile virtual keyboards and keep newly added winery badges visible.

### 3.5 Polymorphic Chaining & Atomic Rollback in `TripService`
- Extend `TripService.addWineryToExistingTrip(tripId: number, wineryOrId: number | Winery, notes: string | null)`:
  - If `wineryOrId` is an object: invoke `add_winery_to_trip` with `p_winery_data: WineryService.getRpcData(wineryOrId)`.
  - If `wineryOrId` is a number: validate `wineryOrId > 0`; if valid, look up via `findWineryByDbId` or pass `p_winery_id`. If non-positive (`<= 0`), throw an error immediately.
- In `TripService.createTrip`:
  - Pass the first winery via `p_winery_data: WineryService.getRpcData(w)` to `create_trip_with_winery`.
  - For subsequent wineries (`trip.wineries.slice(1)`), iterate sequentially and invoke `this.addWineryToExistingTrip(data.trip_id, extra, null)`.
  - **Strict Rollback & Offline Queue Suppression:** If any chained stop addition fails, catch the error, invoke `this.deleteTrip(data.trip_id.toString())` to clean up the partial remote trip, tag the error (`preventOfflineEnqueue = true`), and rethrow.

### 3.6 Full Offline Sync Parity in `syncService.ts`
- Refactor `syncService.ts`'s `'create_trip'` case to directly invoke `TripService.createTrip(payload, item.id)`.
- Eliminates duplicate, incomplete stop-creation logic and ensures identical behavior online and offline.
- Upon completion, replace temporary trip with synced record containing accurate `wineries_count: syncedTrip.wineries?.length ?? payload.wineries?.length ?? 0`.
- Trigger background store cache re-fetches (`fetchUpcomingTrips`, `fetchTripsForDate`, `fetchTrips`).

### 3.7 Store Synchronization & Invalidation in `tripMutationHelpers`
- In `createTripHelper`:
  - Set optimistic `wineries_count: validWineries.length` on `tempTrip`.
  - Set synced `wineries_count: (createdTrip?.wineries?.length ?? validWineries.length)` on `syncedTrip`.
  - Check error tag: if `(error as any)?.preventOfflineEnqueue` is true, bypass `handleSyncError` offline queueing and immediately execute optimistic rollback.
  - Dispatch non-blocking, fire-and-forget background cache re-fetches for `fetchUpcomingTrips()`, `fetchTripsForDate(targetDate)`, and `fetchTrips(1, 'upcoming', true)` with error logging.

### 3.8 Presentation Badge Standardization in `TripCardSimplePresentational`
- Standardize badge pluralization in `TripCardSimplePresentational.tsx`:
  ```tsx
  const count = trip.wineries_count ?? trip.wineries?.length ?? 0;
  <Badge variant="secondary">
    <Wine className="w-3 h-3 mr-1" /> {count} {count === 1 ? 'Winery' : 'Wineries'}
  </Badge>
  ```

### 3.9 Eager List Trip Stop Hydration & Export Guard (`TripService.getTrips`, `TripCardSimplePresentational`)
- Update `TripService.getTrips` in `lib/services/tripService.ts` to query nested `trip_wineries (id, visit_order, notes, wineries (id, google_place_id, name, address, latitude, longitude))` and standardize/map each stop ordered by `visit_order` into `wineries: Winery[]` on each returned `Trip`.
- Safely derive `wineries_count` from `trip_wineries.length` (or nested count when mocked).
- Update the "Export to Google Maps" button in `TripCardSimplePresentational.tsx` to guard against pending sync states and zero wineries:
  ```tsx
  disabled={isPending || count === 0 || !trip.wineries || trip.wineries.length === 0}
  ```
- Default `wineries_count: overrides.wineries_count ?? overrides.wineries?.length ?? 0` in `createMockTrip` fixture (`lib/test-utils/fixtures.ts`) to maintain store count invariants across tests.

## 4. Test Suite Restructuring & Hygiene
- **Test File Modularization:**
  - Split `components/__tests__/react19-form-actions.test.tsx`:
    - Move auth form tests (`LoginForm`, `ForgotPasswordForm`, `ManualConfirmForm`) to `components/__tests__/auth-forms.test.tsx`.
    - Create dedicated `components/__tests__/trip-form.test.tsx` containing all `TripForm` tests (controlled `<FormField>` binding, autocomplete place selection, badge tag removal, validation, and submit payload delivery).
    - Remove legacy `react19-form-actions.test.tsx`.
- **Corrected Store Test Path:**
  - Update plan and scripts to target the actual path: `lib/stores/slices/__tests__/tripMutationHelpers.test.ts`.
- **End-to-End Testing Strategy (Playwright in Phase 7):**
  - **Fidelity Seam & Rationale:** While Jest (JSDOM) verifies unit logic, state transitions, and guards, real browser E2E verification is essential to guard against Combobox and dialog failure modes that JSDOM cannot replicate: pointer-down vs blur event race conditions, Radix UI `<Dialog>` portal stacking/clipping, and mobile virtual keyboard dismissal.
  - **Phasing Alignment:** E2E testing is strictly deferred to Phase 7. Multi-stop trip creation through the full UI journey depends on downstream service chaining (Phase 4), offline sync parity (Phase 5), and store count synchronization (Phase 6).
  - **Test Replacement:** Replace the existing 5-line placeholder stub `test('can create a new trip from a winery')` in `e2e/trip-flow.spec.ts` with `test('can create a new trip with initial winery stops from dialog')`.
  - **Primary Verification Engine:** Execute against WebKit (`./scripts/run-e2e-container.sh webkit e2e/trip-flow.spec.ts`) for maximum sensitivity to combobox focus, touch, and event-delegation quirks.

## 5. Strict TDD Workflow
Every task executes the strict Red-Green-Refactor cycle:
1. **Red Phase:** Write unit tests that capture the bug and assert the expected behavior. Execute containerized test runner (`./scripts/run-jest-container.sh`) and confirm failure before implementation.
2. **Green Phase:** Implement the minimal code required to satisfy the tests.
3. **Refactor Phase:** Refactor for clarity and maintainability, ensuring tests remain green.
4. **Scaffolding Cleanup:** Remove any temporary test harnesses or exploration scripts before phase completion.

## 6. Acceptance Criteria
1. Strict TDD cycle is followed and documented for each task (failing test run confirmed before code changes).
2. PostgreSQL migration updates `add_winery_to_trip` to coalesce `latitude`/`lat` and `longitude`/`lng` without breaking existing callers.
3. Submitting `TripForm` with 1 selected winery creates the trip in Supabase, links the winery stop with valid coordinates, and displays "1 Winery" on the newly rendered trip card immediately.
4. Submitting `TripForm` with multiple selected wineries (including newly searched Google Places wineries without prior Postgres database IDs) successfully links all stops with valid coordinates.
5. Removing a winery badge in `TripForm` prior to submit properly decrements the selection and submits only the remaining wineries.
6. Selecting a winery from autocomplete in `TripForm` immediately clears the search input, suppresses re-querying, keeps the suggestions dropdown closed, and leaves the input ready for additional stop selection.
7. `MapSearchBar` retains its selected location text (`clearOnSelect: false`) and does not re-open the suggestions dropdown after selection.
8. Optimistic trip state displays the correct winery count immediately without flickering to "0 Wineries".
9. If a chained stop addition fails during multi-winery creation, the trip is rolled back, and offline queueing is suppressed to prevent phantom duplicate replays.
10. Offline trip creation replayed through `syncService.ts` creates all winery stops and normalizes `wineries_count`.
11. Background re-fetches keep `upcomingTrips`, `tripsForDate`, and paginated `trips` synchronized with backend aggregates.
12. Containerized Jest tests pass for `auth-forms.test.tsx`, `trip-form.test.tsx`, `PlaceAutocomplete.test.tsx`, `tripService.mutations.test.ts`, and `tripMutationHelpers.test.ts`.
13. Playwright E2E test in WebKit replaces stub in `e2e/trip-flow.spec.ts`, verifying full trip creation with multiple winery stops and correct card count badge.
14. Zero temporary scaffolding files remain.
15. In "My Trips" tab (`TripCardSimple`), the "Export to Google Maps" button is enabled and fully functional for trips with wineries, disabled when `wineries_count === 0`, and disabled when `syncStatus === 'pending'`.

## 7. Out of Scope
- Changing external Google Places v1 API schemas.
- Reordering stops within the initial creation modal (reordering remains a trip details feature).

