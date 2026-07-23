import { test, expect } from './utils';
import { login, clearServiceWorkers } from './helpers';

test.describe('Winery Data Hydration & Integrity Consolidated Suite', () => {
  test.beforeEach(async ({ page, user, mockMaps }) => {
    await clearServiceWorkers(page);
    await page.addInitScript(() => {
      (window as any)._E2E_SKIP_DETAILS_MOCK = true;
    });
    await mockMaps.initDefaultMocks({ currentUserId: user.id });
    await login(page, user.email, user.password);
  });

  test('Map markers RPC hydration into persistentWineries store', async ({ page }) => {
    await page.evaluate(() => {
      const dataStore = (window as any).useWineryDataStore?.getState();
      dataStore.hydrateWineries([
        {
          id: 101,
          google_place_id: 'place_101',
          name: 'RPC Hydrated Winery',
          latitude: 42.65,
          longitude: -76.88,
          user_visited: true,
          is_favorite: true
        }
      ]);
    });

    await expect.poll(async () => {
      return page.evaluate(() => {
        const store = (window as any).useWineryDataStore?.getState();
        return store?.persistentWineries?.some((w: any) => (w.name === 'RPC Hydrated Winery' || w.id === 'place_101') && w.userVisited === true);
      });
    }).toBe(true);
  });

  test('Cache pollution merge guard (bulkUpsertWineries retains enriched details)', async ({ page }) => {
    const isPreserved = await page.evaluate(() => {
      const store = (window as any).useWineryDataStore.getState();

      store.upsertWinery({
        id: 50,
        google_place_id: 'place_50',
        name: 'Full Winery',
        latitude: 42.7,
        longitude: -76.9,
        phone: '555-0199',
        website: 'https://fullwinery.com',
        rating: 4.9,
        enrichment_tier: 'enriched'
      });

      store.bulkUpsertWineries([
        {
          id: 50,
          google_place_id: 'place_50',
          name: 'Full Winery Updated',
          latitude: 42.7,
          longitude: -76.9
        }
      ]);

      const updatedStore = (window as any).useWineryDataStore.getState();
      const resultingWinery = updatedStore.persistentWineries.find((w: any) => w.id === 'place_50' || w.dbId === 50);
      return (
        resultingWinery?.phone === '555-0199' &&
        resultingWinery?.website === 'https://fullwinery.com' &&
        resultingWinery?.rating === 4.9 &&
        resultingWinery?.enrichment_tier === 'enriched'
      );
    });

    expect(isPreserved).toBe(true);
  });
});
