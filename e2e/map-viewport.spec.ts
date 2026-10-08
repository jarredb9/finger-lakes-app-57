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
