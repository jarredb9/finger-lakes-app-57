# Implementation Plan: Phase 3 Task 2 - Author `e2e/trip-navigation-pwa.spec.ts` for Mobile Safari Popup Navigation

**Track:** `ios-pwa-testing_20261015` (Automated iOS PWA Standalone Testing Matrix & Domain Refactoring - Issue [#71](https://github.com/jarredb9/finger-lakes-app-57/issues/71))  
**Phase:** Phase 3 (Playwright Standalone Fixture & E2E Verification)  
**Task:** Task 2 (Author `e2e/trip-navigation-pwa.spec.ts` for Mobile Safari popup navigation)  
**Specification Reference:** [conductor/tracks/ios-pwa-testing_20261015/spec.md](./spec.md)  
**Track Plan Reference:** [conductor/tracks/ios-pwa-testing_20261015/plan.md](./plan.md)  
**Architecture Decision Reference:** [docs/adr/0006-containerized-ios-pwa-emulation-testing.md](../../../docs/adr/0006-containerized-ios-pwa-emulation-testing.md)  
**Workflow Reference:** [conductor/workflow.md](../../workflow.md)  

---

## 1. Executive Summary & Objective

### 1.1 Objective
Author a comprehensive Playwright end-to-end test suite in `e2e/trip-navigation-pwa.spec.ts` targeting containerized `Mobile Safari` (and `webkit`). The suite validates:
1. **Network Route Interception:** Prevents container DNS resolution timeouts and deadlocks in rootless container environments by intercepting external navigation provider destinations (`maps.apple.com`, `google.com/maps`, `waze.com`) via `page.context().route(...)` returning immediate HTTP 200 stub pages.
2. **Deterministic State Pre-seeding:** Pre-seeds multi-stop mock trips in `mockMaps.state.trips` using standardized test fixtures to guarantee trip cards render with active "Trip Navigation" triggers.
3. **Transient User Gesture Preservation (ADR 0006):** Asserts that user-initiated clicks on Apple Maps, Google Maps, and Waze menu items in Standalone PWA mode (`standalonePage`) successfully emit native `page.waitForEvent('popup')` events without being blocked by WebKit's popup blocker.
4. **URL & Query Parameter Verification:** Inspects opened popup URLs to verify that domain, path, waypoints, destination, and coordinate parameters conform to the canonical specification in `lib/utils/trip-navigation.ts`.
5. **Defensive Edge Case Handling:** Asserts that trips with zero winery stops have their navigation action triggers disabled (`toBeDisabled()`), preventing errant popups or navigation dispatches.

---

## 2. Invariants & Critical Guardrails

1. **Transient User Gesture Invariant (ADR 0006 & `spec.md` Section 2.4):**
   - External turn-by-turn navigation must be triggered synchronously within user click event boundaries (`window.open(url, '_blank', 'noopener,noreferrer')`).
   - The test must assert that `page.waitForEvent('popup')` resolves cleanly under WebKit Mobile Safari without throwing popup blocked errors.
2. **Container Network Isolation & DNS Timeout Prevention (`AGENTS.md` Section 3):**
   - Playwright tests run inside rootless Podman containers on RHEL 8 without host internet access. Any unintercepted request to external domains (`maps.apple.com`, `google.com`, `waze.com`) will hang until test timeout.
   - All external navigation domains MUST be intercepted on the BrowserContext (`page.context().route(...)`) before executing navigation dispatches.
3. **PWA Standalone Mode Integration:**
   - Tests must utilize the `standalonePage` fixture established in Phase 3 Task 1 to ensure `window.navigator.standalone = true` and `(display-mode: standalone)` matchMedia queries are active.
4. **Mobile Drawer Viewport Stability:**
   - To avoid mobile sheet drag animation race conditions, tests must set `window._E2E_FULL_DRAWER = true` via `addInitScript` and use auto-retrying Playwright locators for trip list containers.
5. **Popup Resource Hygiene:**
   - Every opened popup page must be explicitly closed via `await popup.close()` immediately following URL assertions to prevent memory leaks and zombie WebKit renderer processes in the container.
6. **Modal & Plan Approval Invariant (`AGENTS.md` Section 2):**
   - A response of `User Skipped` or modal dismissal is strictly non-affirmative. Never proceed with file creation or test execution without affirmative user approval.

---

## 3. Plan Blueprint: Target Files & Semantic Insertion Anchors

### 3.1 Target File 1: `e2e/trip-navigation-pwa.spec.ts` (New File)
- **Path:** `e2e/trip-navigation-pwa.spec.ts`
- **Semantic Structure:**
  1. **Imports:** Import `test`, `expect`, `createMockTrip`, `MockMapsManager`, and `TestUser` from `./utils`; import `createMockWinery` from `@/lib/test-utils/fixtures`; import helper functions `login`, `navigateToTab`, `ensureSidebarExpanded`, `waitForSignal`, `getTodayLocal`.
  2. **Test Suite Scope:** `test.describe('Mobile Safari PWA Standalone Trip Navigation', () => { ... })`.
  3. **`test.beforeEach` Hook:**
     - Configure full drawer layout: `await standalonePage.addInitScript(() => { window._E2E_FULL_DRAWER = true; });`.
     - Register BrowserContext route intercepts for `maps.apple.com`, `google.com/maps`, and `waze.com`.
     - Pre-seed mock trips in `mockMaps.state.trips` (a 2-stop active trip and a 0-stop empty trip).
     - Initialize default mocks with `currentUserId: user.id`.
     - Log in via `login(standalonePage, user.email, user.password, { skipMapReady: true })`.
     - Navigate to `Trips` tab via `navigateToTab(standalonePage, 'Trips')`.
     - Expand sidebar via `ensureSidebarExpanded(standalonePage)`.
     - Await signal readiness on `trip-list-container`.
  4. **Test Case 1: Apple Maps Dispatch:**
     - Open "Trip Navigation" dropdown for the multi-stop trip card.
     - Click "Apple Maps" menu item while listening for `standalonePage.waitForEvent('popup')`.
     - Assert popup URL points to `maps.apple.com/directions` with `mode=driving`, destination matching last stop, and waypoint matching intermediate stop.
     - Close popup.
  5. **Test Case 2: Google Maps Dispatch:**
     - Open "Trip Navigation" dropdown.
     - Click "Google Maps" menu item while listening for `standalonePage.waitForEvent('popup')`.
     - Assert popup URL points to `google.com/maps/dir` with `api=1`, destination matching last stop, and waypoints matching intermediate stop.
     - Close popup.
  6. **Test Case 3: Waze Dispatch:**
     - Open "Trip Navigation" dropdown.
     - Click "Waze" menu item while listening for `standalonePage.waitForEvent('popup')`.
     - Assert popup URL points to `waze.com/ul` with `navigate=yes` and `ll` matching first stop coordinates.
     - Close popup.
  7. **Test Case 4: Zero-Stop Disabled Trigger & Standalone State:**
     - Assert `window.navigator.standalone` and `matchMedia('(display-mode: standalone)')` are true on `standalonePage`.
     - Assert that the "Trip Navigation" button on the zero-stop trip card is disabled (`toBeDisabled()`).

---

## 4. Full TypeScript Interfaces & Test Signatures

### 4.1 Mock Data Blueprint

```typescript
import { GooglePlaceId, NavigationProvider, WineryDbId } from '@/lib/types';
import { createMockTrip, createMockWinery } from '@/lib/test-utils/fixtures';

export interface NavigationRouteTestFixture {
  activeTripName: string;
  emptyTripName: string;
  stop1: {
    id: GooglePlaceId;
    dbId: WineryDbId;
    name: string;
    address: string;
    latitude: number;
    longitude: number;
  };
  stop2: {
    id: GooglePlaceId;
    dbId: WineryDbId;
    name: string;
    address: string;
    latitude: number;
    longitude: number;
  };
}
```

### 4.2 Route Interceptor Signatures

```typescript
// Route handler for external navigation providers
export async function setupExternalNavigationRouteInterceptors(
  context: import('@playwright/test').BrowserContext
): Promise<void>;
```

### 4.3 Playwright Test Fixtures Extension Signature

```typescript
// Uses the extended test fixture containing standalonePage, mockMaps, and user
import { test, expect } from './utils';

test.describe('Mobile Safari PWA Standalone Trip Navigation', () => {
  test.beforeEach(async ({ standalonePage, mockMaps, user }) => { ... });

  test('dispatches Apple Maps navigation popup preserving transient gestures and query parameters', async ({ standalonePage }) => { ... });
  test('dispatches Google Maps navigation popup preserving transient gestures and query parameters', async ({ standalonePage }) => { ... });
  test('dispatches Waze navigation popup preserving transient gestures and query parameters', async ({ standalonePage }) => { ... });
  test('enforces standalone mode signals and disables navigation on zero-stop trips', async ({ standalonePage }) => { ... });
});
```

---

## 5. Precise Behavioral Logic, Formulas & Edge Cases

### 5.1 Route Interception Logic
To avoid DNS resolution failure in isolated containers:
1. **Apple Maps:** Match regex `/.*maps\.apple\.com.*/`. Fulfill with status 200, header `Content-Type: text/html`, body `'<!DOCTYPE html><html><body><div id="mock-apple-maps">Apple Maps Mock</div></body></html>'`.
2. **Google Maps:** Match regex `/.*google\.com\/maps\/dir.*/`. Fulfill with status 200, header `Content-Type: text/html`, body `'<!DOCTYPE html><html><body><div id="mock-google-maps">Google Maps Mock</div></body></html>'`.
3. **Waze:** Match regex `/.*waze\.com\/ul.*/`. Fulfill with status 200, header `Content-Type: text/html`, body `'<!DOCTYPE html><html><body><div id="mock-waze">Waze Mock</div></body></html>'`.

### 5.2 Pre-seeded Data Specifications
1. **Active Trip (2 Stops):**
   - `id`: `881`
   - `name`: `'PWA Standalone Navigation Tour'`
   - `trip_date`: `getTodayLocal()`
   - `user_id`: `user.id`
   - `wineries`:
     - Stop 1: `name: 'First Stop Vineyard'`, `address: '100 Vineyard Rd, Geneva, NY 14456'`, `latitude: 42.868`, `longitude: -76.985`.
     - Stop 2: `name: 'Destination Cellars'`, `address: '200 Seneca Way, Watkins Glen, NY 14891'`, `latitude: 42.380`, `longitude: -76.870`.
   - `wineries_count`: `2`
2. **Empty Trip (0 Stops):**
   - `id`: `882`
   - `name`: `'Empty PWA Navigation Trip'`
   - `trip_date`: `getTodayLocal()`
   - `user_id`: `user.id`
   - `wineries`: `[]`
   - `wineries_count`: `0`

### 5.3 Popup Dispatch & Assertion Verification Flow
For each navigation provider:
1. Locate card:
   ```typescript
   const tripCard = standalonePage.locator('[data-testid="trip-card"][data-trip-id="881"]').first();
   await expect(tripCard).toBeVisible({ timeout: 10000 });
   ```
2. Trigger dropdown menu:
   ```typescript
   const navTrigger = tripCard.getByRole('button', { name: 'Trip Navigation' });
   await expect(navTrigger).toBeVisible();
   await expect(navTrigger).toBeEnabled();
   await navTrigger.click();
   ```
3. Await popup and click provider item:
   ```typescript
   const [popup] = await Promise.all([
     standalonePage.waitForEvent('popup'),
     standalonePage.getByRole('menuitem', { name: providerName }).click(),
   ]);
   ```
4. Verify URL query structure:
   - **Apple Maps (`providerName === 'Apple Maps'`):**
     - `await expect(popup).toHaveURL(/maps\.apple\.com\/directions/);`
     - Parse URL:
       - `url.pathname` === `'/directions'`
       - `url.searchParams.get('mode')` === `'driving'`
       - `url.searchParams.get('destination')` contains `'Destination Cellars'`
       - `url.searchParams.get('waypoint')` contains `'First Stop Vineyard'`
   - **Google Maps (`providerName === 'Google Maps'`):**
     - `await expect(popup).toHaveURL(/google\.com\/maps\/dir/);`
     - Parse URL:
       - `url.pathname` contains `'/maps/dir'`
       - `url.searchParams.get('api')` === `'1'`
       - `url.searchParams.get('destination')` contains `'Destination Cellars'`
       - `url.searchParams.get('waypoints')` contains `'First Stop Vineyard'`
   - **Waze (`providerName === 'Waze'`):**
     - `await expect(popup).toHaveURL(/waze\.com\/ul/);`
     - Parse URL:
       - `url.pathname` === `'/ul'`
       - `url.searchParams.get('navigate')` === `'yes'`
       - `url.searchParams.get('ll')` === `'42.868,-76.985'`
5. Cleanup:
   ```typescript
   await popup.close();
   ```

### 5.4 Edge Cases Handled
1. **WebKit Popup Blocker Suppression:** Verifies that invoking `window.open` within the click event handler maintains transient user gesture token so Mobile Safari does not suppress the popup window.
2. **Zero-Stop Navigation Guard:** Verifies that a trip card with no winery stops renders the `Trip Navigation` button in a `disabled` state with `count === 0`, ensuring users cannot open an invalid navigation route.
3. **Viewport Dimension Tolerance:** Works across Mobile Safari phone profiles (`390 x 844`), desktop Safari (`webkit`), and tablet viewports without selector drift.

---

## 6. Execution Verification Protocol

Following implementation of `e2e/trip-navigation-pwa.spec.ts`, the executor must run the following verification sequence:

1. **Static Type Checking (Host):**
   ```bash
   npm run type-check
   ```
   *Expected:* Code 0. Confirms that test imports, types, and fixture bindings compile cleanly.

2. **Linting Check (Host):**
   ```bash
   npm run lint
   ```
   *Expected:* Code 0. Confirms compliance with project ESLint rules and no unused variables.

3. **Targeted Mobile Safari E2E Test (Containerized):**
   ```bash
   ./scripts/containers/run-e2e-container.sh mobile-safari e2e/trip-navigation-pwa.spec.ts
   ```
   *Expected:* All 4 tests in `e2e/trip-navigation-pwa.spec.ts` pass under `Mobile Safari` project with 0 failures and 0 flaky retries.

4. **Desktop WebKit Regression E2E Test (Containerized):**
   ```bash
   ./scripts/containers/run-e2e-container.sh webkit e2e/trip-navigation-pwa.spec.ts
   ```
   *Expected:* Test suite passes under desktop WebKit, confirming cross-device engine compatibility.

---

## 7. Step-by-Step Task Lifecycle & Post-Execution

### Step 1: Mark Task In Progress in `plan.md`
Update `conductor/tracks/ios-pwa-testing_20261015/plan.md`:
`- [ ] Task: Author \`e2e/trip-navigation-pwa.spec.ts\` for Mobile Safari popup navigation` -> `- [~] Task: Author \`e2e/trip-navigation-pwa.spec.ts\` for Mobile Safari popup navigation`

### Step 2: Implement Test File
Create `e2e/trip-navigation-pwa.spec.ts` following the blueprint specifications in Sections 3, 4, and 5.

### Step 3: Run Execution Verification Protocol
Execute `npm run type-check`, `npm run lint`, and `./scripts/containers/run-e2e-container.sh mobile-safari e2e/trip-navigation-pwa.spec.ts`.

### Step 4: Commit Code Changes
Stage file and commit:
```bash
git add e2e/trip-navigation-pwa.spec.ts
git commit -m "test(e2e): Author e2e/trip-navigation-pwa.spec.ts for Mobile Safari popup navigation"
```

### Step 5: Attach Task Summary with Git Notes
Retrieve commit hash and attach structured git note:
```bash
TASK_COMMIT_SHA=$(git log -1 --format="%H")
git notes add -m "Task: Author \`e2e/trip-navigation-pwa.spec.ts\` for Mobile Safari popup navigation

Summary: Authored comprehensive Playwright E2E test suite in e2e/trip-navigation-pwa.spec.ts verifying external turn-by-turn navigation (Apple Maps, Google Maps, Waze) in standalone PWA mode under Mobile Safari, transient user gesture preservation, query parameter formatting, route interception, and zero-stop button disabling.

Files: e2e/trip-navigation-pwa.spec.ts

Rationale: Validates iOS WebClip and standalone PWA external navigation functionality under containerized Mobile Safari without requiring physical iOS hardware or macOS simulator licensing (ADR 0006)." $TASK_COMMIT_SHA
```

### Step 6: Update Track Plan & Commit Plan Update
1. Retrieve short SHA (`git log -1 --format="%h"`).
2. Update `conductor/tracks/ios-pwa-testing_20261015/plan.md`:
   - Change `[~]` to `[x]` with `[commit: <short_sha>]`.
   - Check all 5 subtasks under Task 2.
3. Commit plan update:
   ```bash
   git add conductor/tracks/ios-pwa-testing_20261015/plan.md
   git commit -m "conductor(plan): Mark task 'Author e2e/trip-navigation-pwa.spec.ts for Mobile Safari popup navigation' as complete"
   ```
