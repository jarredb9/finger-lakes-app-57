# Implementation Plan: Phase 7 Task 1 - E2E Integration Flow (Playwright)

**Track:** `initial-trip-creation-wineries_20261002` (Issue [#57](https://github.com/jarredb9/finger-lakes-app-57/issues/57))  
**Phase:** 7 (End-to-End Verification & Final Quality Gates)  
**Task:** 1 (E2E Integration Flow (Playwright))  
**Specification Reference:** [spec.md](./spec.md) (Section 3.3, 3.4, 3.8, 3.9, 4, 6)  
**Track Plan Reference:** [plan.md](./plan.md) (Phase 7, Task 1)  

---

## 1. Objective & Seam-Bounded Architecture

### 1.1 Objective
Implement end-to-end browser integration verification in WebKit replacing the existing placeholder stub `test('can create a new trip from a winery')` in `e2e/trip-flow.spec.ts` with `test('can create a new trip with initial winery stops from dialog')`.

This test verifies the complete cross-seam user journey for initial multi-stop trip creation through the UI dialog:
1. **Opening Dialog:** Navigating to the "Trips" tab and launching the "Create a New Trip" modal via the "New Trip" button in the sidebar.
2. **Form Interaction & Stop Selection:** Typing a trip name, searching for wineries via `PlaceAutocomplete`, and selecting multiple winery stops (`Mock Winery One` and `Vineyard of Illusion`).
3. **Combobox UX Invariants:** Verifying that `clearOnSelect` clears the autocomplete input upon selection, dismisses suggestions, and leaves the input immediately ready for additional stops without re-triggering search queries.
4. **Tag Lifecycle & Deduplication:** Asserting that selected winery badges render with accessible removal buttons, selecting a duplicate winery is suppressed (deduplication), and removing a badge properly detaches the stop.
5. **Form Submission & Creation:** Submitting the form, confirming Supabase RPC orchestration (`create_trip_with_winery` and `add_winery_to_trip`), and verifying modal dismissal.
6. **Card Display & AC 15 Verification:** Asserting that the newly created trip appears in the sidebar with the correct pluralized badge (`2 Wineries`) and an enabled "Export to Google Maps" button (satisfying AC 15 and guarding against the `0 Wineries` / disabled export regressions).
7. **Clean Teardown:** Deleting the created trip through the UI to ensure test isolation and prevent persistent test pollution.

### 1.2 Architectural Seam Boundaries & Prerequisites
To ensure deterministic execution across containerized headless WebKit:
1. **Google Maps SDK Shim (`e2e/fixtures/shims/google-maps-sdk.shim.ts`):**  
   `PlaceAutocomplete` utilizes the Google Maps Places New SDK (`google.maps.places.AutocompleteSuggestion`, `places.AutocompleteSessionToken`, and `places.Place.fetchFields`). While legacy `AutocompleteService` and `PlacesService` were shimmed, the New SDK classes must be provided in `GoogleMapsSdkShim` so `usePlacesAutocompleteSession` can instantiate tokens, query suggestions, and resolve details without crashing or invoking remote external endpoints.
2. **Mock Trip Handlers (`e2e/fixtures/handlers/trips.handler.ts`):**  
   - `create_trip_with_winery`: Must populate the first winery stop in the mock trip's `wineries` array and set `wineries_count: initialWineries.length`.
   - `add_winery_to_trip`: Must update `trip.wineries_count = trip.wineries.length`.
   - `/rest/v1/trips` REST handler: Must return `trip_wineries` populated with nested winery objects matching the expanded query from Phase 6 (`trip_wineries (id, visit_order, notes, wineries (...))`) so that background cache invalidations (`fetchTrips`) preserve the hydrated stops and keep the "Export to Google Maps" button enabled.
3. **E2E Test Spec (`e2e/trip-flow.spec.ts`):**  
   Replaces the 10-line stub at lines 21–31 with the comprehensive multi-stop creation flow using canonical mock wineries (`Mock Winery One` and `Vineyard of Illusion`).

---

## 2. Execution Verification Protocol

The primary verification command for this task targets WebKit inside the container runner:

```bash
./scripts/run-e2e-container.sh webkit e2e/trip-flow.spec.ts
```

> [!NOTE]
> As mandated by project critical guardrails (Section 3 of `AGENTS.md`), all container scripts (`./scripts/run-*-container.sh`) must be executed with `BypassSandbox: true`.

Expected outcome:
- All tests in `e2e/trip-flow.spec.ts` pass (2 passing tests: `can create a new trip with initial winery stops from dialog` and `can create a new trip from winery details`).

---

## 3. Step-by-Step Implementation Details

### 3.1 Target File: `e2e/fixtures/shims/google-maps-sdk.shim.ts`
**File Path:** `e2e/fixtures/shims/google-maps-sdk.shim.ts`  
**Purpose:** Provide Places New SDK shims (`importLibrary`, `AutocompleteSessionToken`, `Place`, `AutocompleteSuggestion`) to support `usePlacesAutocompleteSession` and `PlaceAutocomplete`.

#### Replacement Chunk 1
- **Line Range:** Lines 86–89
- **Target Content:**
```typescript
          };
        };

        // Call initialization callbacks if provided
```
- **Replacement Content:**
```typescript
          };
        };

        window.google.maps.importLibrary = async function(libraryName) {
          return window.google.maps[libraryName] || {};
        };

        window.google.maps.places.AutocompleteSessionToken = function() {
          this.id = 'mock-session-token-' + Math.random().toString(36).substring(2, 9);
        };

        window.google.maps.places.Place = function(options) {
          const allItems = {
            'ch-12345-mock-winery-1': { id: 'ch-12345-mock-winery-1', name: 'Mock Winery One', address: '123 Vineyard Way, NY', lat: 42.5, lng: -76.8 },
            'ch-67890-mock-winery-2': { id: 'ch-67890-mock-winery-2', name: 'Vineyard of Illusion', address: '456 Mirage Ln, NY', lat: 42.6, lng: -76.9 },
            'ch-abcde-mock-winery-3': { id: 'ch-abcde-mock-winery-3', name: 'The Phantom Cellar', address: '789 Ethereal Rd, NY', lat: 42.7, lng: -77.0 }
          };
          const item = (options && options.id && allItems[options.id]) || allItems['ch-12345-mock-winery-1'];
          this.id = item.id;
          this.displayName = item.name;
          this.formattedAddress = item.address;
          this.location = {
            lat: () => item.lat,
            lng: () => item.lng,
            latitude: item.lat,
            longitude: item.lng
          };
          this.rating = 4.8;
          this.userRatingCount = 120;
          this.fetchFields = async function(req) { return this; };
        };

        window.google.maps.places.AutocompleteSuggestion = {
          fetchAutocompleteSuggestions: async function(req) {
            const input = (req && req.input ? req.input : '').toLowerCase();
            const allItems = [
              { id: 'ch-12345-mock-winery-1', name: 'Mock Winery One', address: '123 Vineyard Way, NY' },
              { id: 'ch-67890-mock-winery-2', name: 'Vineyard of Illusion', address: '456 Mirage Ln, NY' },
              { id: 'ch-abcde-mock-winery-3', name: 'The Phantom Cellar', address: '789 Ethereal Rd, NY' }
            ];
            const filtered = allItems.filter(function(item) {
              return item.name.toLowerCase().includes(input) || item.address.toLowerCase().includes(input);
            });
            return {
              suggestions: (filtered.length > 0 ? filtered : allItems).map(function(item) {
                return {
                  placePrediction: {
                    text: { text: item.name + ', ' + item.address },
                    mainText: { text: item.name },
                    secondaryText: { text: item.address },
                    toPlace: function() { return new window.google.maps.places.Place({ id: item.id }); }
                  }
                };
              })
            };
          }
        };

        // Call initialization callbacks if provided
```

---

### 3.2 Target File: `e2e/fixtures/handlers/trips.handler.ts`
**File Path:** `e2e/fixtures/handlers/trips.handler.ts`  
**Purpose:** Ensure mock trips accurately reflect multi-winery stops, `wineries_count`, and nested stop hydration across RPCs and `/rest/v1/trips`.

#### Replacement Chunk 1 (In `create_trip_with_winery`)
- **Line Range:** Lines 146–161
- **Target Content:**
```typescript
        const newId = Math.floor(Math.random() * 10000);
        const wineryData = postData.p_winery_data || {};
        const wineryId = wineryData.id || 1;

        const newTrip: MockTrip = {
          ...createMockTrip({
            id: newId,
            name: postData.p_trip_name,
            trip_date: postData.p_trip_date,
            user_id: this.currentUserId,
            updated_at: new Date(Date.now() + 5000).toISOString(),
          }),
          idempotency_key: idempotencyKey,
          winery_id: wineryId,
        };
```
- **Replacement Content:**
```typescript
        const newId = Math.floor(Math.random() * 10000);
        const wineryData = postData.p_winery_data || {};
        const wineryId = wineryData.id || 1;

        const initialWineries: Winery[] = (wineryData && (wineryData.name || wineryData.id || wineryData.google_place_id)) ? [{
          id: String(wineryData.id || wineryData.google_place_id || 'ch-12345-mock-winery-1') as GooglePlaceId,
          dbId: (wineryData.dbId || wineryId) as WineryDbId,
          name: wineryData.name || 'Mock Winery One',
          address: wineryData.address || '',
          latitude: Number(wineryData.latitude ?? wineryData.lat ?? 0),
          longitude: Number(wineryData.longitude ?? wineryData.lng ?? 0),
          rating: 4.5,
          userVisited: false,
          onWishlist: false,
          isFavorite: false,
          visits: [],
          allows_dogs: null,
          has_ev_charging: null,
          serves_wine: null,
          good_for_children: null,
          outdoor_seating: null,
          primary_photo_reference: null,
          photo_references: null,
          cached_photos: null,
          parking_options: null,
          accessibility_options: null,
          last_enriched_at: new Date().toISOString(),
          ...wineryData,
        }] : [];

        const newTrip: MockTrip = {
          ...createMockTrip({
            id: newId,
            name: postData.p_trip_name,
            trip_date: postData.p_trip_date,
            user_id: this.currentUserId,
            wineries: initialWineries,
            wineries_count: initialWineries.length,
            updated_at: new Date(Date.now() + 5000).toISOString(),
          }),
          idempotency_key: idempotencyKey,
          winery_id: wineryId,
        };
```

#### Replacement Chunk 2 (In `add_winery_to_trip`)
- **Line Range:** Lines 248–251
- **Target Content:**
```typescript
              ...wineryData,
            });
            trip.updated_at = new Date().toISOString();
          }
```
- **Replacement Content:**
```typescript
              ...wineryData,
            });
            trip.wineries_count = trip.wineries.length;
            trip.updated_at = new Date().toISOString();
          }
```

#### Replacement Chunk 3 (In `/rest/v1/trips` REST Handler)
- **Line Range:** Lines 316–320
- **Target Content:**
```typescript
      const trips = this.state.trips || [];
      const transformed = trips.map(t => ({
        ...t,
        trip_wineries: [{ count: t.wineries?.length || 0 }],
        trip_members: (t.members || []).map(m => ({
```
- **Replacement Content:**
```typescript
      const trips = this.state.trips || [];
      const transformed = trips.map(t => ({
        ...t,
        trip_wineries: (t.wineries || []).map((w, idx) => ({
          id: idx + 1,
          visit_order: idx + 1,
          notes: '',
          wineries: {
            id: w.dbId || idx + 1,
            google_place_id: w.id,
            name: w.name,
            address: w.address,
            latitude: w.latitude,
            longitude: w.longitude,
          },
        })),
        trip_members: (t.members || []).map(m => ({
```

---

### 3.3 Target File: `e2e/trip-flow.spec.ts`
**File Path:** `e2e/trip-flow.spec.ts`  
**Purpose:** Replace stub test with full end-to-end integration test verifying dialog multi-stop trip creation, `PlaceAutocomplete` UX, badge pluralization, and export button availability.

#### Replacement Chunk 1
- **Line Range:** Lines 21–31
- **Target Content:**
```typescript
  test('can create a new trip from a winery', async ({ page }) => {
    await navigateToTab(page, 'Trips');
    await ensureSidebarExpanded(page);
    
    const sidebar = getSidebarContainer(page);
    
    // Check for the "New Trip" button directly in the main view
    const newTripButton = sidebar.getByRole('button', { name: 'New Trip' }).first();
    await newTripButton.scrollIntoViewIfNeeded();
    await expect(newTripButton).toBeVisible();
  });
```
- **Replacement Content:**
```typescript
  test('can create a new trip with initial winery stops from dialog', async ({ page }) => {
    await navigateToTab(page, 'Trips');
    await ensureSidebarExpanded(page);

    const sidebar = getSidebarContainer(page);

    // 1. Open "New Trip" dialog from sidebar
    const newTripButton = sidebar.getByRole('button', { name: 'New Trip' }).first();
    await newTripButton.scrollIntoViewIfNeeded();
    await expect(newTripButton).toBeVisible();
    await newTripButton.click();

    // 2. Assert dialog is visible
    const dialog = page.locator('[role="dialog"]').first();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: /Create a New Trip/i })).toBeVisible();

    const uniqueTripName = `E2E Multi-Stop Trip ${Date.now()}`;
    const nameInput = page.getByTestId('trip-name-input');
    await expect(nameInput).toBeVisible();
    await nameInput.fill(uniqueTripName);

    // 3. Search and select first winery via PlaceAutocomplete
    const autocompleteInput = page.getByTestId('place-autocomplete-input');
    await expect(autocompleteInput).toBeVisible();
    await autocompleteInput.fill('Mock Winery');

    const results = page.getByTestId('place-autocomplete-results');
    await expect(results).toBeVisible({ timeout: 10000 });

    const option1 = results.getByRole('option', { name: /Mock Winery One/i }).first();
    await expect(option1).toBeVisible();
    await option1.click();

    // 4. Assert clearOnSelect: clears input and closes results
    await expect(autocompleteInput).toHaveValue('');
    await expect(results).not.toBeVisible();

    // 5. Assert selected winery badge renders with removal button
    const wineriesList = page.getByTestId('selected-wineries-list');
    await expect(wineriesList).toBeVisible();
    const badge1 = wineriesList.getByTestId('selected-winery-ch-12345-mock-winery-1');
    await expect(badge1).toBeVisible();
    await expect(badge1).toContainText('Mock Winery One');
    const removeBadge1Btn = badge1.getByRole('button', { name: /Remove Mock Winery One/i });
    await expect(removeBadge1Btn).toBeVisible();

    // 6. Assert deduplication: re-selecting same winery does not duplicate badge
    await autocompleteInput.fill('Mock Winery');
    await expect(results).toBeVisible({ timeout: 10000 });
    await option1.click();
    await expect(autocompleteInput).toHaveValue('');
    await expect(wineriesList.locator('[data-testid^="selected-winery-"]')).toHaveCount(1);

    // 7. Assert badge removal and re-addition
    await removeBadge1Btn.click();
    await expect(wineriesList).not.toBeVisible();

    await autocompleteInput.fill('Mock Winery');
    await expect(results).toBeVisible({ timeout: 10000 });
    await option1.click();
    await expect(autocompleteInput).toHaveValue('');
    await expect(wineriesList).toBeVisible();
    await expect(badge1).toBeVisible();

    // 8. Search and select second winery
    await autocompleteInput.fill('Vineyard of Illusion');
    await expect(results).toBeVisible({ timeout: 10000 });

    const option2 = results.getByRole('option', { name: /Vineyard of Illusion/i }).first();
    await expect(option2).toBeVisible();
    await option2.click();

    // Assert second clearOnSelect and 2 badges present
    await expect(autocompleteInput).toHaveValue('');
    await expect(results).not.toBeVisible();

    const badge2 = wineriesList.getByTestId('selected-winery-ch-67890-mock-winery-2');
    await expect(badge2).toBeVisible();
    await expect(badge2).toContainText('Vineyard of Illusion');
    await expect(wineriesList.locator('[data-testid^="selected-winery-"]')).toHaveCount(2);

    // 9. Submit the form
    const submitBtn = page.getByTestId('create-trip-submit-btn');
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toBeEnabled();

    await Promise.all([
      page.waitForResponse(resp => (resp.url().includes('create_trip_with_winery') || resp.url().includes('create_trip')) && resp.status() === 200),
      submitBtn.click()
    ]);

    // 10. Assert dialog closes and trip appears in store
    await expect(dialog).not.toBeVisible({ timeout: 10000 });
    await expectTripInStore(page, uniqueTripName);

    // 11. Assert trip card displays correct pluralized badge ("2 Wineries") and enabled "Export to Google Maps" button (AC 15)
    const tripCard = sidebar.getByTestId('trip-card').filter({ hasText: uniqueTripName }).first();
    await expect(async () => {
      await page.evaluate(async () => {
        const store = window.useTripStore?.getState();
        if (store) await store.fetchTrips(1, 'upcoming', true);
      });
      await expect(tripCard).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 20000, intervals: [2000] });

    await tripCard.scrollIntoViewIfNeeded();
    await expect(tripCard.getByText('2 Wineries')).toBeVisible();

    const exportBtn = tripCard.getByRole('button', { name: 'Export to Google Maps' });
    await expect(exportBtn).toBeVisible();
    await expect(exportBtn).toBeEnabled();

    // 12. Cleanup: delete trip to maintain test isolation
    const deleteBtn = tripCard.getByTestId('delete-trip-btn');
    await expect(async () => {
      const alertDialog = page.locator('[role="alertdialog"]');
      if (!(await alertDialog.isVisible())) {
        await expect(deleteBtn).toBeVisible({ timeout: 5000 });
        await expect(deleteBtn).toBeEnabled({ timeout: 5000 });
        await deleteBtn.click();
        await expect(alertDialog).toBeVisible({ timeout: 5000 });
      }

      const confirmBtn = page.getByTestId('confirm-delete-trip-btn');
      await expect(confirmBtn).toBeVisible({ timeout: 5000 });
      await expect(confirmBtn).toBeEnabled({ timeout: 5000 });

      await Promise.all([
        page.waitForResponse(
          resp => (resp.url().includes('delete_trip') || (resp.url().includes('trips') && resp.request().method() === 'DELETE')) && [200, 204].includes(resp.status()),
          { timeout: 15000 }
        ),
        confirmBtn.click()
      ]);
    }).toPass({ timeout: 30000, intervals: [2000] });

    await expect(sidebar.getByText(uniqueTripName)).not.toBeVisible();
  });
```

---

## 4. Acceptance Criteria & Quality Gates
1. `e2e/fixtures/shims/google-maps-sdk.shim.ts` properly exposes Google Places New SDK shims (`importLibrary`, `AutocompleteSessionToken`, `Place`, `AutocompleteSuggestion`).
2. `e2e/fixtures/handlers/trips.handler.ts` tracks multi-winery stops in `newTrip.wineries`, updates `wineries_count`, and returns hydrated `trip_wineries` on `/rest/v1/trips`.
3. `e2e/trip-flow.spec.ts` executes the complete dialog trip creation flow in WebKit, verifying:
   - Dialog launch from sidebar
   - Multi-winery search and selection via `PlaceAutocomplete`
   - `clearOnSelect` clearing and dropdown closure
   - Removable badge tags and selection deduplication
   - Successful trip creation and dialog dismissal
   - Accurate card badge display ("2 Wineries")
   - Enabled "Export to Google Maps" button (AC 15)
   - Proper trip deletion teardown
4. Containerized WebKit execution passes:
   ```bash
   ./scripts/run-e2e-container.sh webkit e2e/trip-flow.spec.ts
   ```
