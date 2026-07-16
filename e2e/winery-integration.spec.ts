import { test, expect } from './utils';
import { login, waitForAppReady } from './helpers';

test.describe('Winery Integration and Hydration Flow', () => {
  test.beforeEach(async ({ page }) => {
    // 1. Disable store bypass injection to force a real DB fetch cycle
    await page.addInitScript(() => {
      (window as any)._E2E_SKIP_WINERY_INJECTION = true;
      localStorage.setItem('_E2E_SKIP_WINERY_INJECTION', 'true');
    });
  });

  test.afterEach(async ({ page }) => {
    await page.evaluate(() => {
      delete (window as any)._E2E_SKIP_WINERY_INJECTION;
      localStorage.removeItem('_E2E_SKIP_WINERY_INJECTION');
    });
  });

  test('successfully fetches map markers from the database and hydrates the store on page mount', async ({ page, mockMaps, user }) => {
    // 2. Mock database map markers RPC response
    const mockMarkers = [
      {
        id: 123,
        google_place_id: 'google-winery-visited',
        name: 'Visited Winery Corp',
        latitude: 42.4406,
        longitude: -76.5025,
        is_favorite: false,
        is_favorite_private: false,
        on_wishlist: false,
        on_wishlist_private: false,
        user_visited: true,
      },
      {
        id: 124,
        google_place_id: 'google-winery-favorited',
        name: 'Favorited Winery Corp',
        latitude: 42.4506,
        longitude: -76.5125,
        is_favorite: true,
        is_favorite_private: false,
        on_wishlist: false,
        on_wishlist_private: false,
        user_visited: false,
      }
    ];

    // Setup base map mocks but bypass real server requests
    await mockMaps.initDefaultMocks({ currentUserId: user.id });

    // Intercept get_map_markers RPC
    await page.route(/.*rpc\/get_map_markers/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockMarkers)
      });
    });

    // 3. Login and wait for hydration
    await login(page, user.email, user.password);
    await waitForAppReady(page);

    // 4. Assert that the store has been hydrated with standardized data from the RPC
    const storedWineries = await page.evaluate(() => {
      if ((window as any).useWineryDataStore) {
        return (window as any).useWineryDataStore.getState().persistentWineries;
      }
      return [];
    });

    // We expect the store to contain our database-hydrated wineries. 
    // It may also contain default mock search wineries injected by the framework.
    expect(storedWineries.length).toBeGreaterThanOrEqual(2);

    // Verify the visited winery is standardized correctly
    const visited = storedWineries.find((w: any) => w.id === 'google-winery-visited');
    expect(visited).toBeDefined();
    expect(visited.userVisited).toBe(true);
    expect(visited.isFavorite).toBe(false);
    expect(visited.dbId).toBe(123);

    // Verify the favorited winery is standardized correctly
    const favorited = storedWineries.find((w: any) => w.id === 'google-winery-favorited');
    expect(favorited).toBeDefined();
    expect(favorited.userVisited).toBe(false);
    expect(favorited.isFavorite).toBe(true);
    expect(favorited.dbId).toBe(124);
  });
});
