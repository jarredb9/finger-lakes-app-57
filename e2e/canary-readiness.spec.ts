import { test, expect } from './utils';
import { login, waitForMapReady, waitForSignal } from './helpers';

/**
 * Phase 6 Task 1 (Red Phase): E2E Readiness Canary
 * 
 * Verifies and establishes the failing baseline for readiness verification
 * without window store access.
 * 
 * Target Architecture (Phase 6 Task 4):
 * - Eliminate store-poking in login() and waitForMapReady()
 * - Replace window store hydration polling with web-first DOM signals (data-state="ready")
 * 
 * Current Red Phase Behavior:
 * - When window.use*Store is locked to undefined (preventing exposer re-attachment),
 *   current login() throws "Stores not hydrated"
 * - When window.useMapStore is detached, current waitForMapReady() throws "Map bounds not initialized"
 */
test.describe('E2E Readiness Canary: Store-Poking Decoupling (Red Phase)', () => {
  test('canary: current login() helper fails when window stores are detached', async ({ page, user }) => {
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

    // Current login() helper relies on window.useUserStore.getState().user and hasHydrated()
    // This proves empirically that current helpers fail in the Red Phase without store poking.
    await expect(
      login(page, user.email, user.password)
    ).rejects.toThrow(/Stores not hydrated/);
  });

  test('canary: current waitForMapReady() helper fails when window.useMapStore is detached', async ({ page, user }) => {
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

    // Current waitForMapReady() helper polls window.useMapStore.getState().bounds
    // This proves that map readiness helper fails in the Red Phase without store poking.
    await expect(
      waitForMapReady(page)
    ).rejects.toThrow(/Map bounds not initialized/);
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
