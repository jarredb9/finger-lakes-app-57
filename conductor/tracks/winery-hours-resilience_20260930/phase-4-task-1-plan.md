# Implementation Plan: Phase 4 Task 1 - Audit Test Suite and Verify Permanent Regression Retention

**Track:** `winery-hours-resilience_20260930` (Issue #56)  
**Phase:** 4 (Test Retention Audit & Final Regression Verification)  
**Task:** 1 (Audit test suite and verify permanent regression retention)

---

## 1. Executive Summary & Objective

Throughout Phases 1, 2, and 3 of the `winery-hours-resilience_20260930` track, comprehensive unit and integration test suites were designed and implemented following strict Test-Driven Development (TDD Red-Green-Refactor) practices. These test suites addressed the root cause of Issue #56: eliminating the false-closed defect across presentation surfaces, decoupling layout loading from asynchronous Google Places enrichment, hardening numeric ID database lookups, enforcing selective Zustand IndexedDB migration (version 2), and ensuring seamless session-backed modal restoration during PWA updates.

The objective of Phase 4 Task 1 is to conduct a complete audit of the test suite to:
1. **Audit All Created and Modified Test Suites:** Review and inventory all 10 unit and integration test suites across `components/`, `lib/stores/`, and `hooks/`, verifying that every critical invariant is covered and permanently retained.
2. **Establish Permanent End-to-End Regression Coverage (`e2e/winery-hours-resilience.spec.ts`):** Codify the Playwright E2E test suite specified in the architectural proposal (`conductor/proposals/winery-hours-resilience-and-root-cause.md`) and referenced in Phase 4 Task 2. This ensures end-to-end regression protection across desktop and mobile layouts for tri-state operational hours, loading skeleton states, schedule fallbacks with website linking, and dynamic asynchronous enrichment.
3. **Audit Scaffolding, Scratch Artifacts & Mock Hygiene:** Verify that zero temporary scratch files or dangling test mocks exist, and confirm that all test spies cleanly restore their targets (`mockRestore()`, `useRealTimers()`, `clearAllMocks()`).

---

## 2. Test Suite Audit & Retention Inventory

### 2.1 Inventory of Test Suites Created or Modified Across Track

| # | Test Suite File | Phase | Scope & Covered Invariants | Retention Status |
|---|---|---|---|---|
| 1 | [`components/winery/__tests__/winery-info-card.test.tsx`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/winery/__tests__/winery-info-card.test.tsx) | Phase 1 | Verifies tri-state operational badge (`Open Now`, `Closed`, `Hours Unavailable`), animated loading skeleton pill when `isLoading === true`, weekly dropdown toggle, safe rendering on incomplete `weekday_text`, and schedule fallback with direct website link when hours are missing. | **Permanent** (Retained) |
| 2 | [`components/winery/__tests__/mobile-winery-drawer.test.tsx`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/winery/__tests__/mobile-winery-drawer.test.tsx) | Phase 1 | Verifies mobile peek badge displays `🟢 OPEN NOW`, `🔴 CLOSED`, or `⚪ HOURS UNAVAILABLE`; renders animated skeleton pill `peek-status-skeleton` when loading; and ensures cached winery content renders immediately when `isLoading === true`. | **Permanent** (Retained) |
| 3 | [`components/winery/__tests__/desktop-winery-modal.test.tsx`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/winery/__tests__/desktop-winery-modal.test.tsx) | Phase 1 | Verifies decoupled layout loading: cached winery content renders immediately with `isLoading: true` (only `!winery` displays the full-screen dialog skeleton), and verifies rating badge / address formatting. | **Permanent** (Retained) |
| 4 | [`components/__tests__/winery-card-thumbnail.test.tsx`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/__tests__/winery-card-thumbnail.test.tsx) | Phase 1 | Verifies `Open` and `Closed` badges render with clock icon, and verifies that when `isOpen === null`, the status badge is cleanly omitted from thumbnail cards without defaulting to `Closed`. | **Permanent** (Retained) |
| 5 | [`lib/stores/__tests__/wineryStore.test.ts`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/stores/__tests__/wineryStore.test.ts) | Phase 2 | Verifies `ensureWineryDetails('2988')` on numeric DB IDs resolves `google_place_id` and invokes Edge Function `get-winery-details` when Postgres hours are null; maintains `loadingWineryId`; handles Edge Function rejection/timeout without stalling `inFlightRevalidations`; and handles stale cache revalidation. | **Permanent** (Retained) |
| 6 | [`components/__tests__/PlaceAutocomplete.test.tsx`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/__tests__/PlaceAutocomplete.test.tsx) | Phase 2 | Verifies development/E2E test fixture interceptor: allows autocomplete to select synthetic test wineries (`test-*`, `mock-*`) from local store and bypasses remote Google Place Details queries. | **Permanent** (Retained) |
| 7 | [`hooks/__tests__/use-places-autocomplete-session.test.ts`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/hooks/__tests__/use-places-autocomplete-session.test.ts) | Phase 2 | Verifies prepending synthetic test winery fixtures to autocomplete suggestions in development/E2E mode for deterministic testability. | **Permanent** (Retained) |
| 8 | [`lib/stores/__tests__/wineryStore.persist.test.ts`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/stores/__tests__/wineryStore.persist.test.ts) | Phase 3 | Verifies Zustand persist `version: 2` configuration, custom selective `migrate` function that purges corrupt enriched records (`enrichment_tier === 'enriched' | 'full'` without valid `openingHours`) while strictly preserving basic map markers and offline pins, and validates end-to-end IndexedDB rehydration. | **Permanent** (Retained) |
| 9 | [`hooks/__tests__/use-pwa-update.test.ts`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/hooks/__tests__/use-pwa-update.test.ts) | Phase 3 | Verifies `applyUpdate()` stores `_PWA_JUST_UPDATED` timestamp and active modal ID (`_PWA_ACTIVE_WINERY_ID`) in `sessionStorage` before posting `SKIP_WAITING`, while remaining completely decoupled from data stores (`fetchWineryData`). | **Permanent** (Retained) |
| 10 | [`components/modals/__tests__/authenticated-modal-host.test.tsx`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/modals/__tests__/authenticated-modal-host.test.tsx) | Phase 3 | Verifies idempotent mount effect in `AuthenticatedModalHost` that inspects `sessionStorage` for `_PWA_ACTIVE_WINERY_ID`, immediately cleanses the key, re-opens the winery modal via `openWineryModal(id)`, and initiates background hydration via `ensureWineryDetails(id)`. | **Permanent** (Retained) |
| 11 | [`e2e/winery-hours-resilience.spec.ts`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/e2e/winery-hours-resilience.spec.ts) | Phase 4 | **Target of this task:** Playwright E2E suite validating hours resilience across desktop dialog and mobile drawer viewports, loading skeleton behavior, website fallback links, and dynamic UI updates upon asynchronous enrichment arrival. | **Permanent** (New E2E Suite) |

### 2.2 Mock Hygiene & Cleanup Audit

Static audit of all created and modified test files confirms:
- **`jest.spyOn()` Cleanup:** Every spy created across unit and integration tests (e.g. `consoleWarnSpy`, `consoleErrorSpy`, `ensureWineryDetailsSpy`, `openWineryModalSpy`, `fetchWineryDataSpy`) explicitly invokes `.mockRestore()` in `finally` or test teardown blocks.
- **Timer Mock Cleanup:** In tests using fake timers (`winery-info-card.test.tsx`, `mobile-winery-drawer.test.tsx`, `winery-card-thumbnail.test.tsx`), every `jest.useFakeTimers()` invocation is paired with an immediate `jest.useRealTimers()` in the same test scope.
- **Store Reset Isolation:** Stores are reset in `beforeEach()` hooks (`useWineryStore.getState().reset()`, `useUIStore.getState().closeModal()`, `window.sessionStorage.clear()`), ensuring zero cross-test state leakage.
- **Zero Scratch Files:** No temporary scratch files, debug logs, or intermediate dump scripts exist in the repository tree.

---

## 3. Seam-Bounded Architecture & Invariants for Permanent E2E Coverage

To satisfy Phase 4 Task 2 (`./scripts/run-e2e-container.sh webkit e2e/winery-hours-resilience.spec.ts`) and guarantee permanent browser-level regression retention, `e2e/winery-hours-resilience.spec.ts` must enforce the following architectural invariants:

1. **Tri-State Operational Hours Representation Invariant:**
   - When a winery has `opening_hours: null` (or missing hours), desktop surfaces (`winery-modal-dialog`) MUST render `"Hours Unavailable"` and MUST NEVER display `"Closed"` or `"Open Now"`.
   - On mobile surfaces (`winery-modal-drawer`), the peek status tag MUST render `"⚪ HOURS UNAVAILABLE"` and MUST NEVER display `"🔴 CLOSED"` or `"🟢 OPEN NOW"`.
2. **Resilient Schedule Fallback Invariant:**
   - When hours are indeterminate and `winery.website` is present, render the `"Check website for hours"` link (`data-testid="schedule-fallback-website"`) with a valid `href`.
   - When hours are indeterminate and `winery.website` is `null` or missing, display only the subtext without rendering a broken button or link.
3. **Decoupled Loading & Animated Skeleton Invariant:**
   - When `loadingWineryId` matches the active winery or `isLoading: true`, the mobile peek badge displays an animated skeleton pill (`data-testid="peek-status-skeleton"`).
   - Layouts render cached data immediately rather than blocking behind full-screen skeletons.
4. **Dynamic Asynchronous Hydration Invariant:**
   - When an unenriched winery receives enriched hours data via background store update, the UI dynamically and seamlessly transitions from `"Hours Unavailable"` to `"Open Now"` (or `"Closed"`) with the weekly hours accordion toggle appearing without requiring a page reload.

---

## 4. Target File Modifications & Exact Drop-in Code Specifications

### Target File 1: [e2e/winery-hours-resilience.spec.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/e2e/winery-hours-resilience.spec.ts) (NEW FILE)
- **Path:** `e2e/winery-hours-resilience.spec.ts`
- **Action:** Create new Playwright E2E test file providing comprehensive end-to-end regression protection.

#### Complete Drop-in Code:
```typescript
import { test, expect } from './utils';
import {
  login,
  clearServiceWorkers,
  openWineryModalState,
} from './helpers';

test.describe('Winery Operational Hours Resilience & PWA Hydration Suite', () => {
  test.beforeEach(async ({ page, user, mockMaps }) => {
    await clearServiceWorkers(page);
    await page.addInitScript(() => {
      window._E2E_SKIP_DETAILS_MOCK = true;
    });
    await mockMaps.initDefaultMocks({ currentUserId: user.id });
    await login(page, user.email, user.password, { skipMapReady: true });
  });

  test.describe('Desktop Modal Tri-State Operational Hours & Fallbacks', () => {
    test('renders "Hours Unavailable" without defaulting to "Closed" when opening_hours is null', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });

      const wineryWithoutHours = {
        id: 2988,
        google_place_id: 'place_2988_resilience',
        name: "Anyela's Vineyards (Resilience Test)",
        address: '2433 W Lake Rd, Skaneateles, NY',
        latitude: 42.89,
        longitude: -76.41,
        rating: 4.6,
        user_rating_count: 85,
        website: null,
        opening_hours: null,
        enrichment_tier: 'basic',
      };

      await openWineryModalState(page, wineryWithoutHours);

      const dialog = page.getByTestId('winery-modal-dialog');
      await expect(dialog).toBeVisible();

      // Invariant: Missing hours must render "Hours Unavailable" and NEVER "Closed" or "Open Now"
      await expect(dialog.getByText('Hours Unavailable')).toBeVisible();
      await expect(dialog.getByText('Open Now')).not.toBeVisible();
      await expect(dialog.getByText('Closed', { exact: true })).not.toBeVisible();

      // No broken toggle or website fallback link when website is null
      await expect(dialog.getByTestId('hours-toggle')).not.toBeVisible();
      await expect(dialog.getByTestId('schedule-fallback-website')).not.toBeVisible();
    });

    test('renders direct website link fallback when opening_hours is null and website is present', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });

      const wineryWithWebsiteFallback = {
        id: 2989,
        google_place_id: 'place_2989_website_fallback',
        name: 'Six Eighty Cellars (Fallback Test)',
        address: '3050 Swick Rd, Ovid, NY',
        latitude: 42.66,
        longitude: -76.82,
        rating: 4.7,
        website: 'https://sixeightycellars.com',
        opening_hours: null,
        enrichment_tier: 'basic',
      };

      await openWineryModalState(page, wineryWithWebsiteFallback);

      const dialog = page.getByTestId('winery-modal-dialog');
      await expect(dialog).toBeVisible();

      await expect(dialog.getByText('Hours Unavailable')).toBeVisible();
      const websiteLink = dialog.getByTestId('schedule-fallback-website');
      await expect(websiteLink).toBeVisible();
      await expect(websiteLink).toHaveAttribute('href', 'https://sixeightycellars.com');
    });
  });

  test.describe('Mobile Drawer Tri-State Operational Hours & Peek Badge', () => {
    test('renders peek status badge as "⚪ HOURS UNAVAILABLE" and not "🔴 CLOSED" when hours are null', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });

      const mobileWinery = {
        id: 2990,
        google_place_id: 'place_2990_mobile_null',
        name: 'Silent Valley Cellars (Mobile Test)',
        address: '1000 Secret Hollow Rd, Hammondsport, NY',
        latitude: 42.45,
        longitude: -77.2,
        opening_hours: null,
        enrichment_tier: 'basic',
      };

      await openWineryModalState(page, mobileWinery);

      const drawer = page.getByTestId('winery-modal-drawer');
      await expect(drawer).toBeVisible();

      // Invariant: Mobile peek status tag must show "⚪ HOURS UNAVAILABLE"
      const peekBadge = page.getByTestId('peek-open-status-tag');
      await expect(peekBadge).toBeVisible();
      await expect(peekBadge).toHaveText('⚪ HOURS UNAVAILABLE');
      await expect(peekBadge).not.toHaveText(/🔴 CLOSED/);
      await expect(peekBadge).not.toHaveText(/🟢 OPEN NOW/);
    });

    test('renders animated skeleton pill in mobile peek badge when loading state is active', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });

      const loadingWinery = {
        id: 2991,
        google_place_id: 'place_2991_loading',
        name: 'Loading Vineyard',
        address: '500 Scenic Trail, Geneva, NY',
        latitude: 42.87,
        longitude: -76.98,
        opening_hours: null,
      };

      // Set loading state in UI/winery store before opening
      await page.evaluate((winery) => {
        window.useWineryDataStore?.getState().upsertWinery(winery as any);
        window.useWineryDataStore?.setState({ loadingWineryId: winery.id });
        window.useUIStore?.getState().openWineryModal(winery.id);
      }, loadingWinery);

      const drawer = page.getByTestId('winery-modal-drawer');
      await expect(drawer).toBeVisible();

      // Invariant: When loading, drawer peek badge displays skeleton
      const skeletonPill = page.getByTestId('peek-status-skeleton');
      await expect(skeletonPill).toBeVisible();
    });
  });

  test.describe('Decoupled Hydration & Dynamic Operational Hours Arrival', () => {
    test('renders cached content immediately and dynamically transitions from "Hours Unavailable" to "Open Now" with weekly hours on enrichment', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });

      const initialWinery = {
        id: 2992,
        google_place_id: 'place_2992_transition',
        name: 'Transition Test Cellars',
        address: '100 Riesling Way, Dundee, NY',
        latitude: 42.52,
        longitude: -76.95,
        rating: 4.8,
        opening_hours: null,
        enrichment_tier: 'basic',
      };

      await openWineryModalState(page, initialWinery);

      const dialog = page.getByTestId('winery-modal-dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText('Hours Unavailable')).toBeVisible();

      // Simulate background enrichment arrival
      await page.evaluate(() => {
        window.useWineryDataStore?.getState().upsertWinery({
          id: 'place_2992_transition',
          google_place_id: 'place_2992_transition',
          name: 'Transition Test Cellars',
          address: '100 Riesling Way, Dundee, NY',
          latitude: 42.52,
          longitude: -76.95,
          rating: 4.8,
          enrichment_tier: 'enriched',
          opening_hours: {
            open_now: true,
            weekday_text: [
              'Monday: 10:00 AM – 5:00 PM',
              'Tuesday: 10:00 AM – 5:00 PM',
              'Wednesday: 10:00 AM – 5:00 PM',
              'Thursday: 10:00 AM – 5:00 PM',
              'Friday: 10:00 AM – 5:00 PM',
              'Saturday: 10:00 AM – 6:00 PM',
              'Sunday: 11:00 AM – 5:00 PM',
            ],
          },
        } as any);
      });

      // Assert dynamic UI transition to "Open Now" and hours toggle becoming visible
      await expect(dialog.getByText('Open Now')).toBeVisible();
      await expect(dialog.getByTestId('hours-toggle')).toBeVisible();
    });
  });
});
```

---

### Target File 2: [conductor/tracks/winery-hours-resilience_20260930/plan.md](file:///home/byrnesjd4821/Git/finger-lakes-app-57/conductor/tracks/winery-hours-resilience_20260930/plan.md)

#### Anchor: Lines 45–50
**Existing Context (Lines 45–50):**
```markdown
## Phase 4: Test Retention Audit & Final Regression Verification (TDD)
- [ ] Task: Audit test suite and verify permanent regression retention
    - [ ] Review all test files created or modified during the track
    - [ ] Ensure all unit, integration, and E2E test suites created in Phases 1-3 are retained permanently as regression coverage
    - [ ] Clean up any temporary scratch files or redundant mock spies
- [ ] Task: Execute full automated test suite and type verification
```

**Replacement / Drop-in Chunk (upon execution):**
```markdown
## Phase 4: Test Retention Audit & Final Regression Verification (TDD)
- [x] Task: Audit test suite and verify permanent regression retention
    - [x] Review all test files created or modified during the track
    - [x] Ensure all unit, integration, and E2E test suites created in Phases 1-3 are retained permanently as regression coverage
    - [x] Clean up any temporary scratch files or redundant mock spies
- [ ] Task: Execute full automated test suite and type verification
```

---

## 5. Execution Verification Protocol

Following user confirmation, apply the target file creations and run the automated verification:

1. **Verify Unit & Integration Test Suites Permanently Retained:**
   ```bash
   ./scripts/run-jest-container.sh \
     components/winery/__tests__/winery-info-card.test.tsx \
     components/winery/__tests__/mobile-winery-drawer.test.tsx \
     components/winery/__tests__/desktop-winery-modal.test.tsx \
     components/__tests__/winery-card-thumbnail.test.tsx \
     lib/stores/__tests__/wineryStore.test.ts \
     lib/stores/__tests__/wineryStore.persist.test.ts \
     hooks/__tests__/use-pwa-update.test.ts \
     components/modals/__tests__/authenticated-modal-host.test.tsx
   ```

2. **Verify Playwright E2E Suite Syntax & Type Check:**
   ```bash
   npm run db:check-types:local
   ```

---

## 6. Halt Gate for User Approval

In strict adherence to the Conductor spec-driven workflow and AGENTS.md Invariant, this plan was formulated using static seam inspection without running commands or mutating source code.

Execution of file creation and plan updates requires explicit affirmative user approval via modal.
