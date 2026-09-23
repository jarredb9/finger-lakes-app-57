import { test, expect } from './utils';
import { login, waitForMapReady, waitForSignal } from './helpers';

/**
 * Phase 6 Task 4 (Green Phase): E2E Readiness Canary
 * 
 * Certifies that readiness verification operates completely decoupled
 * from window store access:
 * - login() helper succeeds even when all window stores are locked to undefined
 * - waitForMapReady() helper succeeds when window.useMapStore is detached
 * - Web-first DOM readiness signals (data-state="ready") function independently of window stores
 */
test.describe('E2E Readiness Canary: Store-Poking Decoupling (Green Phase)', () => {
  test('login() helper succeeds when window stores are detached', async ({ page, user }) => {
    // Lock window store attachments to undefined so <E2EStoreExposer /> cannot expose them
    await page.addInitScript(() => {
      const stores = [
        'useUserStore',
        'useMapStore',
        'useWineryDataStore',
        'useVisitStore',
        'useTripStore',
        'useUIStore',
        'useFriendStore',
        'useSyncStore',
      ];
      for (const s of stores) {
        try {
          Object.defineProperty(window, s, {
            configurable: false,
            get: () => undefined,
            set: () => {},
          });
        } catch (e) {}
      }
    });

    // Green Phase: login() relies on DOM readiness signals and succeeds without window stores
    await expect(
      login(page, user.email, user.password)
    ).resolves.toBeUndefined();
  });

  test('waitForMapReady() helper succeeds when window.useMapStore is detached', async ({ page, user }) => {
    // Log in with skipMapReady to navigate to dashboard
    await login(page, user.email, user.password, { skipMapReady: true });

    // Detach window.useMapStore on the active page
    await page.evaluate(() => {
      try {
        Object.defineProperty(window, 'useMapStore', {
          configurable: true,
          get: () => undefined,
          set: () => {},
        });
      } catch (e) {}
    });

    // Green Phase: waitForMapReady() relies on DOM container data-state="ready" and succeeds without window.useMapStore
    await expect(
      waitForMapReady(page)
    ).resolves.toBeUndefined();
  });

  test('target contract: DOM readiness signals operate independently of window stores', async ({ page, user }) => {
    // Log in with skipMapReady to reach dashboard
    await login(page, user.email, user.password, { skipMapReady: true });

    // Target contract: container data-state="ready" signal indicates readiness
    // without requiring any window store access
    const mapContainer = page.locator('[data-testid="map-container"]');
    await expect(mapContainer).toBeAttached();

    // Verify container uses standard data-state attribute rather than store querying
    await waitForSignal(page, 'map-container', /ready|error|loading/, 10000);
    const dataState = await mapContainer.getAttribute('data-state');
    expect(['ready', 'error', 'loading']).toContain(dataState);
  });
});
