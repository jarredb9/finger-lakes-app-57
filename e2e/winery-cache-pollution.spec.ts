import { test, expect } from './utils';
import { login, waitForAppReady } from './helpers';

test.describe('Winery Cache Pollution Prevention', () => {
  const TEST_WINERY_ID = 'ChIJwinery-cache-pollution-test-id';

  test('should verify details remain populated in store after map updates/panning', async ({ page, mockMaps, user }) => {
    // 1. Setup mock maps
    await mockMaps.initDefaultMocks({ currentUserId: user.id });

    // 2. Login & Wait for App
    await login(page, user.email, user.password);
    await waitForAppReady(page);

    // 3. Inject a fully enriched winery into the cache (Zustand store)
    const enrichedWinery = {
      id: TEST_WINERY_ID,
      dbId: 9999,
      name: 'Super Enriched Winery',
      address: '789 Vineyard Rd',
      latitude: 42.4406,
      longitude: -76.4966,
      phone: '607-555-0199',
      website: 'https://superenrichedwinery.com',
      rating: 4.9,
      userRatingCount: 200,
      enrichment_tier: 'enriched',
      last_enriched_at: new Date().toISOString(),
      openingHours: {
        open_now: true,
        periods: [{ open: { day: 0, time: '0000' } }],
        weekday_text: ['Monday: 9:00 AM – 5:00 PM']
      },
      reviews: [
        {
          author_name: 'Wine Lover',
          rating: 5,
          text: 'Spectacular wines and view!',
          time: Math.floor(Date.now() / 1000),
          relative_time_description: '2 days ago'
        }
      ],
      userVisited: true,
      visits: [{ id: 'visit-pollute-test', user_review: 'Loved the Riesling!' }]
    };

    await page.evaluate((winery) => {
      if ((window as any).useWineryDataStore) {
        (window as any).useWineryDataStore.getState().upsertWinery(winery);
      }
    }, enrichedWinery);

    // Verify it is in the store initially
    const initialWinery = await page.evaluate((id) => {
      return (window as any).useWineryDataStore.getState().getWinery(id);
    }, TEST_WINERY_ID);
    expect(initialWinery).toBeDefined();
    expect(initialWinery.phone).toBe('607-555-0199');
    expect(initialWinery.visits).toHaveLength(1);

    // 4. Simulate a map update / panning event that receives a basic marker for the same winery
    // Markers only have basic fields, e.g., name, coords, and nullable details.
    const basicMarker = {
      id: TEST_WINERY_ID,
      dbId: 9999,
      google_place_id: TEST_WINERY_ID,
      name: 'Super Enriched Winery (Updated Name)',
      latitude: 42.4406,
      longitude: -76.4966,
      user_visited: true,
      phone: null,
      website: null,
      rating: null,
      openingHours: null,
      reviews: null,
    };

    // Update the store using bulkUpsertWineries, simulating search/map updates
    await page.evaluate((marker) => {
      if ((window as any).useWineryDataStore) {
        (window as any).useWineryDataStore.getState().bulkUpsertWineries([marker as any]);
      }
    }, basicMarker);

    // 5. Verify details remain populated (i.e. not overwritten by basic marker update)
    const finalWinery = await page.evaluate((id) => {
      return (window as any).useWineryDataStore.getState().getWinery(id);
    }, TEST_WINERY_ID);

    expect(finalWinery).toBeDefined();
    expect(finalWinery.name).toBe('Super Enriched Winery (Updated Name)'); // Name can update
    expect(finalWinery.phone).toBe('607-555-0199'); // Phone MUST remain populated
    expect(finalWinery.website).toBe('https://superenrichedwinery.com'); // Website MUST remain populated
    expect(finalWinery.rating).toBe(4.9); // Rating MUST remain populated
    expect(finalWinery.enrichment_tier).toBe('enriched');
    expect(finalWinery.visits).toHaveLength(1); // Visits list MUST remain populated
    expect(finalWinery.visits[0].user_review).toBe('Loved the Riesling!');
  });
});
