import { test, expect } from './utils';
import { 
    login, 
    navigateToTab, 
    ensureSidebarExpanded,
    getSidebarContainer
} from './helpers';

test.describe('Sync Lock (Revision Control)', () => {
  test.beforeEach(async ({ page, user, mockMaps }) => {
    // We'll use the default mocks but override the trips part specifically
    await mockMaps.initDefaultMocks({ currentUserId: user.id });
    await login(page, user.email, user.password);
  });

  test('optimistic update is not overwritten by stale background refresh', async ({ page, user }) => {
    await navigateToTab(page, 'Trips');
    await ensureSidebarExpanded(page);

    const sidebar = getSidebarContainer(page);
    const originalName = 'Collaboration Trip';
    const newName = 'Optimistic Rename';

    // 1. Setup our own local mock state for this test to control "staleness"
    // Set updated_at to 5 seconds ago to ensure it's "stale"
    const staleTime = new Date(Date.now() - 5000).toISOString();
    let mockTripData = {
        id: 999,
        name: originalName,
        trip_date: new Date().toLocaleDateString('en-CA'),
        user_id: user.id,
        updated_at: staleTime,
        wineries: [],
        members: []
    };

    const commonHeaders = { 
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE, PATCH',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey, x-total-count, x-skip-sw-interception',
    };

    // 2. Intercept the trips API
    let resolveUpdate: (value: unknown) => void;
    const updatePromise = new Promise(resolve => { resolveUpdate = resolve; });

    await page.route(/\/rest\/v1\/trips/, async (route) => {
        const method = route.request().method();
        if (method === 'PATCH') {
            console.log('[DIAGNOSTIC] Intercepted PATCH, waiting...');
            await updatePromise;
            const postData = JSON.parse(route.request().postData() || '{}');
            Object.assign(mockTripData, postData);
            console.log('[DIAGNOSTIC] PATCH updated mock data to:', mockTripData.name);
            await route.fulfill({ status: 204, headers: commonHeaders });
        } else if (method === 'GET') {
            // Return current mock state (which might be stale)
            // TripService expects an array, and wraps it with metadata in utils.ts mock, 
            // but here we can just return what the store expects after transformation.
            const transformed = [{
                ...mockTripData,
                trip_wineries: [{ count: 0 }],
                trip_members: [{ user_id: user.id }]
            }];
            await route.fulfill({ 
                status: 200, 
                contentType: 'application/json', 
                headers: { ...commonHeaders, 'x-total-count': '1' },
                body: JSON.stringify(transformed)
            });
        } else {
            await route.fallback();
        }
    });

    // 3. Ensure the trip is visible initially
    await expect(sidebar.getByText(originalName)).toBeVisible();

    // 4. Trigger rename (Optimistic Update)
    console.log('[DIAGNOSTIC] Triggering optimistic rename...');
    await page.evaluate(({ originalName, newName }) => {
        const store = (window as any).useTripStore.getState();
        const trip = store.trips.find((t: any) => t.name === originalName);
        if (trip) {
            store.updateTrip(trip.id.toString(), { name: newName });
        }
    }, { originalName, newName });

    // Verify UI shows the new name optimistically
    await expect(sidebar.getByText(newName)).toBeVisible();

    // 5. Simulate a background refresh (like a Realtime event would trigger)
    // This will hit our GET handler, which still has originalName because the PATCH is waiting.
    console.log('[DIAGNOSTIC] Triggering background refresh (simulating stale Realtime)...');
    await page.evaluate(async () => {
        const store = (window as any).useTripStore.getState();
        await store.fetchTrips(1, 'upcoming', true);
    });

    // --- THIS IS THE CRITICAL CHECK ---
    // EXPECTATION: The UI should STILL show newName.
    // REALITY (CURRENT): It will flicker back to originalName.
    await expect(sidebar.getByText(newName)).toBeVisible({ timeout: 2000 });
    await expect(sidebar.getByText(originalName)).not.toBeVisible();

    // 6. Finally resolve the update
    console.log('[DIAGNOSTIC] Resolving PATCH...');
    resolveUpdate!({});

    // Verify it's still correct after the real update finishes
    await expect(sidebar.getByText(newName)).toBeVisible();
  });
});
