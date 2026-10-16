import { BrowserContext } from '@playwright/test';
import { test, expect, createMockTrip } from './utils';
import { createMockWinery } from '@/lib/test-utils/fixtures';
import { GooglePlaceId, WineryDbId } from '@/lib/types';
import {
  login,
  navigateToTab,
  ensureSidebarExpanded,
  waitForSignal,
} from './helpers';
import { getTodayLocal } from '@/lib/utils';

/**
 * Route handler for external navigation providers to prevent DNS timeouts
 * in rootless container environments.
 */
export async function setupExternalNavigationRouteInterceptors(
  context: BrowserContext
): Promise<void> {
  await context.route(/maps\.apple\.com/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!DOCTYPE html><html><body><div id="mock-apple-maps">Apple Maps Mock</div></body></html>',
    });
  });

  await context.route(/google\.com\/maps\/dir/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!DOCTYPE html><html><body><div id="mock-google-maps">Google Maps Mock</div></body></html>',
    });
  });

  await context.route(/waze\.com\/ul/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!DOCTYPE html><html><body><div id="mock-waze">Waze Mock</div></body></html>',
    });
  });
}

test.describe('Mobile Safari PWA Standalone Trip Navigation', () => {
  test.beforeEach(async ({ standalonePage, mockMaps, user }) => {
    // 1. Configure full drawer layout to eliminate sheet drag animation races
    await standalonePage.addInitScript(() => {
      window._E2E_FULL_DRAWER = true;
    });

    // 2. Register BrowserContext route intercepts for external navigation providers
    await setupExternalNavigationRouteInterceptors(standalonePage.context());

    // 3. Pre-seed mock trips in mockMaps.state.trips
    const stop1 = createMockWinery({
      id: 'ch-stop-1' as GooglePlaceId,
      dbId: 101 as WineryDbId,
      name: 'First Stop Vineyard',
      address: '100 Vineyard Rd, Geneva, NY 14456',
      latitude: 42.868,
      longitude: -76.985,
    });

    const stop2 = createMockWinery({
      id: 'ch-stop-2' as GooglePlaceId,
      dbId: 102 as WineryDbId,
      name: 'Destination Cellars',
      address: '200 Seneca Way, Watkins Glen, NY 14891',
      latitude: 42.38,
      longitude: -76.87,
    });

    const activeTrip = createMockTrip({
      id: 881,
      name: 'PWA Standalone Navigation Tour',
      trip_date: getTodayLocal(),
      user_id: user.id,
      wineries: [stop1, stop2],
      wineries_count: 2,
    });

    const emptyTrip = createMockTrip({
      id: 882,
      name: 'Empty PWA Navigation Trip',
      trip_date: getTodayLocal(),
      user_id: user.id,
      wineries: [],
      wineries_count: 0,
    });

    mockMaps.state.trips = [activeTrip, emptyTrip];

    // 4. Initialize default mocks with active user
    await mockMaps.initDefaultMocks({ currentUserId: user.id });

    // 5. Log in, navigate to Trips tab, expand sidebar, and wait for readiness signal
    await login(standalonePage, user.email, user.password, { skipMapReady: true });
    await navigateToTab(standalonePage, 'Trips');
    await ensureSidebarExpanded(standalonePage);
    await waitForSignal(standalonePage, 'trip-list-container', 'ready', 15000);
  });

  test('dispatches Apple Maps navigation popup preserving transient gestures and query parameters', async ({ standalonePage }) => {
    const tripCard = standalonePage.locator('[data-testid="trip-card"][data-trip-id="881"]').first();
    await expect(tripCard).toBeVisible({ timeout: 10000 });

    const navTrigger = tripCard.getByRole('button', { name: 'Trip Navigation' });
    await expect(navTrigger).toBeVisible();
    await expect(navTrigger).toBeEnabled();
    await navTrigger.click();

    const [popup] = await Promise.all([
      standalonePage.waitForEvent('popup'),
      standalonePage.getByRole('menuitem', { name: 'Apple Maps' }).click(),
    ]);

    try {
      await expect(popup).toHaveURL(/maps\.apple\.com\/directions/);
      const url = new URL(popup.url());
      expect(url.pathname).toBe('/directions');
      expect(url.searchParams.get('mode')).toBe('driving');
      expect(url.searchParams.get('destination')).toContain('Destination Cellars');
      expect(url.searchParams.get('waypoint')).toContain('First Stop Vineyard');
    } finally {
      await popup.close();
    }
  });

  test('dispatches Google Maps navigation popup preserving transient gestures and query parameters', async ({ standalonePage }) => {
    const tripCard = standalonePage.locator('[data-testid="trip-card"][data-trip-id="881"]').first();
    await expect(tripCard).toBeVisible({ timeout: 10000 });

    const navTrigger = tripCard.getByRole('button', { name: 'Trip Navigation' });
    await expect(navTrigger).toBeVisible();
    await expect(navTrigger).toBeEnabled();
    await navTrigger.click();

    const [popup] = await Promise.all([
      standalonePage.waitForEvent('popup'),
      standalonePage.getByRole('menuitem', { name: 'Google Maps' }).click(),
    ]);

    try {
      await expect(popup).toHaveURL(/google\.com\/maps\/dir/);
      const url = new URL(popup.url());
      expect(url.pathname).toContain('/maps/dir');
      expect(url.searchParams.get('api')).toBe('1');
      expect(url.searchParams.get('destination')).toContain('Destination Cellars');
      expect(url.searchParams.get('waypoints')).toContain('First Stop Vineyard');
    } finally {
      await popup.close();
    }
  });

  test('dispatches Waze navigation popup preserving transient gestures and query parameters', async ({ standalonePage }) => {
    const tripCard = standalonePage.locator('[data-testid="trip-card"][data-trip-id="881"]').first();
    await expect(tripCard).toBeVisible({ timeout: 10000 });

    const navTrigger = tripCard.getByRole('button', { name: 'Trip Navigation' });
    await expect(navTrigger).toBeVisible();
    await expect(navTrigger).toBeEnabled();
    await navTrigger.click();

    const [popup] = await Promise.all([
      standalonePage.waitForEvent('popup'),
      standalonePage.getByRole('menuitem', { name: 'Waze' }).click(),
    ]);

    try {
      await expect(popup).toHaveURL(/waze\.com\/ul/);
      const url = new URL(popup.url());
      expect(url.pathname).toBe('/ul');
      expect(url.searchParams.get('navigate')).toBe('yes');
      expect(url.searchParams.get('ll')).toBe('42.868,-76.985');
    } finally {
      await popup.close();
    }
  });

  test('enforces standalone mode signals and disables navigation on zero-stop trips', async ({ standalonePage }) => {
    const isStandaloneNavigator = await standalonePage.evaluate(
      () => (window.navigator as unknown as { standalone?: boolean }).standalone
    );
    expect(isStandaloneNavigator).toBe(true);

    const isStandaloneDisplayMode = await standalonePage.evaluate(
      () => window.matchMedia('(display-mode: standalone)').matches
    );
    expect(isStandaloneDisplayMode).toBe(true);

    const emptyTripCard = standalonePage.locator('[data-testid="trip-card"][data-trip-id="882"]').first();
    await expect(emptyTripCard).toBeVisible({ timeout: 10000 });

    const emptyNavTrigger = emptyTripCard.getByRole('button', { name: 'Trip Navigation' });
    await expect(emptyNavTrigger).toBeVisible();
    await expect(emptyNavTrigger).toBeDisabled();
  });
});
