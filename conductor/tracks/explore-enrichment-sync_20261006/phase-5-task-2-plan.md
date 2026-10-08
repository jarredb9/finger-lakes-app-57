# Implementation Plan: Phase 5 Task 2 - Failing E2E Tests for Viewport Panning and FloatingSearchAreaButton (TDD Red Phase)

**Track:** `explore-enrichment-sync_20261006` (Issue [#44](https://github.com/jarredb9/finger-lakes-app-57/issues/44))  
**Phase:** 5 (Viewport Search UX & Map Event Sync)  
**Task:** 2 (Write failing E2E tests for viewport panning and FloatingSearchAreaButton overlay (TDD Red phase))  
**Specification Reference:** [spec.md](./spec.md)  
**Track Plan Reference:** [plan.md](./plan.md)  
**Workflow Reference:** [conductor/workflow.md](../../workflow.md)  

---

## 1. Executive Summary & Objective

### 1.1 Objective
Establish a comprehensive end-to-end (E2E) browser test suite in `e2e/map-viewport.spec.ts` using Playwright (TDD Red phase) that verifies the viewport panning and floating "Search this area" button overlay workflow before implementing production logic in Task 3:
1. **Initial Suppression Assertion**:
   - Assert the floating "Search this area" button (`[data-testid="floating-search-area-button"]`) is suppressed and absent on initial application load at the Finger Lakes seed location (`lat: 42.7000, lng: -76.9000`) with `autoSearch: false`.
2. **Proximity Suppression Assertion (<= 5 km)**:
   - When a search area is established (`lastSearchedBounds`), panning the viewport center within `5 km` (e.g. ~2.2 km shift north to `lat: 42.7200, lng: -76.9000`) keeps the floating button suppressed.
3. **Threshold Appearance Assertion (> 5 km with `autoSearch: false`)**:
   - When the viewport center pans `> 5 km` away from the center of `lastSearchedBounds` (e.g. ~13.3 km shift north toward Seneca Lake / Geneva at `lat: 42.8200, lng: -76.9000`), the floating "Search this area" button appears over the map canvas.
4. **Search Initiation & Dismissal Assertion**:
   - Clicking the floating "Search this area" button triggers `handleManualSearchArea()`, executes the area search, updates `lastSearchedBounds` to the active viewport, and dismisses the button (returns to hidden state).
5. **AutoSearch Bypass Assertion**:
   - When `autoSearch` is enabled (`true`), panning `> 5 km` suppresses the floating button because searches are automatically triggered without requiring manual button interaction.
6. **Canvas Drag Interaction Assertion**:
   - Direct mouse drag gestures on the map canvas (`[data-testid="map-view-canvas"]`) trigger viewport movement and display the floating button.

### 1.2 Development Methodology: Strict TDD (Red Phase)
- In this Red phase, `FloatingSearchAreaButton` remains stubbed (`return null`), `components/WineryMap.tsx` does not yet render the overlay, and `calculateDistanceKm` returns stubbed `0`.
- Authoring `e2e/map-viewport.spec.ts` and executing Playwright via the container runner (`./scripts/run-e2e-container.sh webkit e2e/map-viewport.spec.ts`) MUST compile cleanly and fail precisely on assertion targets (`expect(floatingButton).toBeVisible()`).
- The subsequent Green phase (Task 3) will implement the production Haversine formula, mount `FloatingSearchAreaButton` in `WineryMap.tsx`, wire `handleManualSearchArea()`, and add map resize listeners to make these tests pass.

---

## 2. Invariants & Critical Guardrails

1. **Strict TDD Red Phase Invariant (`spec.md` Section 21 & `AGENTS.md` Section 5):**
   - All newly added tests must fail with clear assertion failures against stub implementations.
   - Do not implement production math, overlay mounting, or UI click handlers during this Red phase.
2. **Container Runner Requirement (`AGENTS.md` Section 3):**
   - Playwright E2E tests must be executed via the container runner script with `BypassSandbox: true`:
     ```bash
     ./scripts/run-e2e-container.sh webkit e2e/map-viewport.spec.ts
     ```
3. **Modal & Plan Approval Invariant (`AGENTS.md` Section 2 & `conductor_antigravity.md`):**
   - Halts and requires explicit affirmative user confirmation via interactive GUI modal (`ask_question`) before creating or modifying code files.
4. **Global Discovery Scope Alignment (`AGENTS.md` Section 4 & ADR 0004):**
   - The initial camera view seeds at the Finger Lakes, NY (`42.7`, `-76.9`), but all viewport calculations and area searches are globally unconstrained.
5. **Type Safety & Scoped Strictness (`spec.md` Section 93):**
   - Zero new `any` types introduced. Viewport coordinates and bounding box structures use canonical types (`SerializableBounds`).

---

## 3. Target Files & Line Anchors

### File 1: `e2e/map-viewport.spec.ts` (New File)
- **Location:** `e2e/map-viewport.spec.ts`
- **Purpose:** Create comprehensive Playwright E2E test suite covering viewport distance threshold checking, button visibility, click dispatch, and autoSearch gating.

---

## 4. Exact Drop-In Code Blocks

### 4.1 Target File 1: `e2e/map-viewport.spec.ts` (New File)

#### Full File Content:
```typescript
import { test, expect } from './utils';
import { login, clearServiceWorkers, waitForAppReady, waitForMapReady } from './helpers';
import { SerializableBounds } from '@/lib/stores/mapStore';

/**
 * Finger Lakes default seed area:
 * Center: lat: 42.7000, lng: -76.9000
 * Radius bounds: north: 42.75, south: 42.65, east: -76.85, west: -76.95 (~11 km bounding box)
 */
const SEED_SEARCH_BOUNDS: SerializableBounds = {
  north: 42.75,
  south: 42.65,
  east: -76.85,
  west: -76.95,
};

test.describe('Map Viewport Panning & FloatingSearchAreaButton Overlay (E2E)', () => {
  test.beforeEach(async ({ page, user, mockMaps }) => {
    await clearServiceWorkers(page);
    await page.addInitScript(() => {
      window._E2E_SKIP_DETAILS_MOCK = true;
    });
    await mockMaps.initDefaultMocks({ currentUserId: user.id });
    await login(page, user.email, user.password);
    await waitForAppReady(page);
    await waitForMapReady(page);
  });

  test('floating search button is suppressed initially on fresh map load', async ({ page }) => {
    // On fresh load with autoSearch: false and no prior search, floating button must NOT be visible
    const floatingButton = page.getByTestId('floating-search-area-button');
    await expect(floatingButton).not.toBeVisible();
  });

  test('floating search button is suppressed when viewport center remains within 5 km of last search', async ({ page }) => {
    // 1. Establish initial lastSearchedBounds at seed location (center ~42.70, -76.90)
    await page.evaluate((bounds) => {
      const store = window.useMapStore?.getState();
      if (store) {
        store.setAutoSearch(false);
        store.setLastSearchedBounds(bounds);
        store.setCenter({ lat: 42.70, lng: -76.90 });
      }
    }, SEED_SEARCH_BOUNDS);

    // 2. Pan viewport slightly north (~2.2 km: lat 42.72, lng -76.90)
    await page.evaluate(() => {
      const store = window.useMapStore?.getState();
      if (store) {
        store.setCenter({ lat: 42.72, lng: -76.90 });
        store.setBounds({
          north: 42.77,
          south: 42.67,
          east: -76.85,
          west: -76.95,
        });
      }
    });

    // 3. Floating search button must remain suppressed (distance <= 5 km)
    const floatingButton = page.getByTestId('floating-search-area-button');
    await expect(floatingButton).not.toBeVisible();
  });

  test('floating search button appears when viewport center pans >5 km away with autoSearch false', async ({ page }) => {
    // 1. Establish initial search at seed location (center 42.70, -76.90)
    await page.evaluate((bounds) => {
      const store = window.useMapStore?.getState();
      if (store) {
        store.setAutoSearch(false);
        store.setLastSearchedBounds(bounds);
        store.setCenter({ lat: 42.70, lng: -76.90 });
      }
    }, SEED_SEARCH_BOUNDS);

    const floatingButton = page.getByTestId('floating-search-area-button');
    await expect(floatingButton).not.toBeVisible();

    // 2. Pan viewport north toward Geneva/Seneca Lake (~13.3 km shift: lat 42.82, lng -76.90)
    await page.evaluate(() => {
      const store = window.useMapStore?.getState();
      if (store) {
        store.setCenter({ lat: 42.82, lng: -76.90 });
        store.setBounds({
          north: 42.87,
          south: 42.77,
          east: -76.85,
          west: -76.95,
        });
      }
    });

    // 3. Assert floating "Search this area" button appears over map canvas
    await expect(floatingButton).toBeVisible();
    await expect(floatingButton).toHaveText(/search this area/i);
  });

  test('clicking floating search button initiates area search and dismisses the button', async ({ page }) => {
    // 1. Seed state with viewport panned >5 km away (lat 42.82, lng -76.90)
    await page.evaluate((bounds) => {
      const store = window.useMapStore?.getState();
      if (store) {
        store.setAutoSearch(false);
        store.setLastSearchedBounds(bounds);
        store.setCenter({ lat: 42.82, lng: -76.90 });
        store.setBounds({
          north: 42.87,
          south: 42.77,
          east: -76.85,
          west: -76.95,
        });
      }
    }, SEED_SEARCH_BOUNDS);

    const floatingButton = page.getByTestId('floating-search-area-button');
    await expect(floatingButton).toBeVisible();

    // 2. Click floating "Search this area" button
    await floatingButton.click();

    // 3. Button must dismiss once search executes and new bounds are adopted
    await expect(floatingButton).not.toBeVisible();
  });

  test('floating search button remains suppressed when autoSearch is true even after panning >5 km', async ({ page }) => {
    // 1. Configure autoSearch to true with initial search bounds
    await page.evaluate((bounds) => {
      const store = window.useMapStore?.getState();
      if (store) {
        store.setAutoSearch(true);
        store.setLastSearchedBounds(bounds);
        store.setCenter({ lat: 42.70, lng: -76.90 });
      }
    }, SEED_SEARCH_BOUNDS);

    // 2. Pan viewport >5 km away (lat 42.82, lng -76.90)
    await page.evaluate(() => {
      const store = window.useMapStore?.getState();
      if (store) {
        store.setCenter({ lat: 42.82, lng: -76.90 });
        store.setBounds({
          north: 42.87,
          south: 42.77,
          east: -76.85,
          west: -76.95,
        });
      }
    });

    // 3. Floating button must NOT appear because autoSearch automatically executes
    const floatingButton = page.getByTestId('floating-search-area-button');
    await expect(floatingButton).not.toBeVisible();
  });

  test('mouse drag on map canvas triggers viewport pan and displays floating search button', async ({ page }) => {
    // 1. Establish initial search bounds at Finger Lakes seed
    await page.evaluate((bounds) => {
      const store = window.useMapStore?.getState();
      if (store) {
        store.setAutoSearch(false);
        store.setLastSearchedBounds(bounds);
        store.setCenter({ lat: 42.70, lng: -76.90 });
        store.setBounds(bounds);
      }
    }, SEED_SEARCH_BOUNDS);

    const floatingButton = page.getByTestId('floating-search-area-button');
    await expect(floatingButton).not.toBeVisible();

    // 2. Perform large drag gesture on map canvas to pan viewport >5 km
    const mapCanvas = page.locator('[data-testid="map-view-canvas"]').first();
    await expect(mapCanvas).toBeVisible();
    const box = await mapCanvas.boundingBox();
    if (box) {
      const startX = box.x + box.width / 2;
      const startY = box.y + box.height / 2;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      // Drag downward to pan viewport significantly north
      await page.mouse.move(startX, startY + 250, { steps: 10 });
      await page.mouse.up();
    }

    // 3. Floating button must appear once viewport center moves >5 km
    await expect(floatingButton).toBeVisible();
  });
});
```

---

## 5. Execution Verification Protocol

### 5.1 Verification Commands
During the execution phase, run the Playwright container runner with `BypassSandbox: true`:

```bash
./scripts/run-e2e-container.sh webkit e2e/map-viewport.spec.ts
```

*(Note: Can also be verified using `chromium` via `./scripts/run-e2e-container.sh chromium e2e/map-viewport.spec.ts`)*.

### 5.2 Expected Failure Semantics (TDD Red Phase Validation)
1. In the Red phase, `FloatingSearchAreaButton` returns `null` and `components/WineryMap.tsx` does not yet render it.
2. The initial suppression test (`floating search button is suppressed initially on fresh map load`) should pass.
3. Tests asserting button appearance (`floating search button appears when viewport center pans >5 km away with autoSearch false`, `clicking floating search button initiates area search and dismisses the button`, and `mouse drag on map canvas triggers viewport pan and displays floating search button`) MUST fail with:
   ```
   Error: Timed out 15000ms waiting for expect(locator).toBeVisible()
   Locator: getByTestId('floating-search-area-button')
   Expected: visible
   Received: hidden / <element(s) not found>
   ```
4. This confirms the Red phase failure criteria before proceeding to Green phase implementation in Task 3.

---

## 6. Post-Execution Protocol

### 6.1 Git Commit Command
Stage and commit the newly created test file:
```bash
git add e2e/map-viewport.spec.ts conductor/tracks/explore-enrichment-sync_20261006/phase-5-task-2-plan.md
git commit -m "test(explore): Write failing E2E tests for viewport panning and FloatingSearchAreaButton overlay (TDD Red phase)"
```

### 6.2 Git Notes Add Command
Format and attach the post-execution summary using the standard Conductor fields:
```bash
COMMIT_HASH=$(git log -1 --format="%H")
git notes add -m "Task: Write failing E2E tests for viewport panning and FloatingSearchAreaButton overlay (TDD Red phase)
Summary: Created e2e/map-viewport.spec.ts covering viewport panning and FloatingSearchAreaButton overlay interactions. Verified button suppression on initial load and within 5 km of last search, button appearance upon panning >5 km away with autoSearch false, search initiation and dismissal on button click, suppression when autoSearch is true, and canvas drag gestures. Verified tests fail cleanly in Red phase against stub implementations.
Files: e2e/map-viewport.spec.ts, conductor/tracks/explore-enrichment-sync_20261006/phase-5-task-2-plan.md
Rationale: Establishes empirical browser-level regression testing and satisfies the strict TDD Red phase invariant for Issue #44 Phase 5 Task 2 before implementing the production Haversine math and overlay component in Task 3." $COMMIT_HASH
```

### 6.3 Track Plan Update
Update `conductor/tracks/explore-enrichment-sync_20261006/plan.md`:
- Mark Phase 5 Task 2 as completed: `[x] Task: Write failing E2E tests for viewport panning and FloatingSearchAreaButton overlay (TDD Red phase) [commit: <short_sha>]`
- Stage and commit the plan:
  ```bash
  git add conductor/tracks/explore-enrichment-sync_20261006/plan.md
  git commit -m "chore(conductor): Mark Phase 5 Task 2 as complete in track plan"
  ```
