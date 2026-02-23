import { test, expect } from './utils';
import { login, navigateToTab, getSidebarContainer, waitForMapReady, clearServiceWorkers, robustClick } from './helpers';

test.describe('Deep PWA Offline Sync (Photos)', () => {
  test.beforeEach(async ({ page, user, mockMaps }) => {
    await clearServiceWorkers(page);
    mockMaps.enableServiceWorker();
    // CRITICAL: Use real social/visits for deep sync verification
    await mockMaps.useRealVisits();
    await login(page, user.email, user.password);
  });

  test('should queue and sync visit creation with multiple photos when back online', async ({ page, context }) => {
    console.log('--- TEST START: should queue and sync visit creation ---');
    // 1. Setup: Go to Explore
    await navigateToTab(page, 'Explore');
    await waitForMapReady(page);
    
    // Ensure stores are exposed before proceeding
    console.log('[Test] Waiting for stores to be exposed...');
    await expect.poll(async () => {
        return await page.evaluate(() => !!(window as any).useVisitStore);
    }, { timeout: 10000 }).toBe(true);

    // Force markers to load and be visible in list by mocking the map state
    console.log('[Test] Forcing winery visibility in list...');
    await page.evaluate(() => {
        const dataStore = (window as any).useWineryDataStore.getState();
        
        // Find our mock winery
        const mockWinery = dataStore.persistentWineries.find((w: any) => w.name === 'Mock Winery One');
        
        if (mockWinery) {
            // 1. Mock bounds that 'contain' the winery
            const mockBounds = {
                contains: () => true,
                getNorthEast: () => ({ lat: () => 43, lng: () => -76 }),
                getSouthWest: () => ({ lat: () => 42, lng: () => -77 })
            };
            
            // 2. Update MapStore to trigger listResultsInView calculation
            (window as any).useMapStore.setState({ 
                bounds: mockBounds,
                filter: ['all'] 
            });
            
            console.log('[Test] MapStore bounds/filter updated.');
        }
    });

    // On mobile, expand the sheet FIRST to ensure the visible container is stable
    if (page.viewportSize()!.width < 768) {
        console.log('[Test] Mobile detected, expanding sheet...');
        const expandButton = page.getByRole('button', { name: 'Expand to full screen' });
        if (await expandButton.isVisible()) {
            await expandButton.click();
            // Wait for stability on the container we are about to query
            await expect(page.locator('[data-testid="mobile-sidebar-container"]').filter({ visible: true })).toHaveAttribute('data-state', 'stable', { timeout: 10000 });
        }
    }

    const sidebar = getSidebarContainer(page);
    const wineryItem = sidebar.getByTestId('winery-results-list').getByText('Mock Winery One').first();
    await expect(wineryItem).toBeVisible({ timeout: 15000 });
    
    console.log('[Test] Selecting Mock Winery One...');
    await robustClick(wineryItem);

    // Wait for the modal to open
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible({ timeout: 15000 });
    await expect(modal.getByText('Mock Winery One').first()).toBeVisible({ timeout: 10000 });

    // 2. Go Offline
    console.log('[Test] Going offline...');
    await context.setOffline(true);

    // 3. Inject Visit Directly into Store
    const visitDate = new Date().toISOString().split('T')[0];
    const review = 'Deep sync test with multiple photos';
    
    console.log('[Test] Injecting visit into store...');
    await page.evaluate(async ({ date, review }) => {
        const b64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
        const winery = (window as any).useWineryDataStore.getState().persistentWineries.find((w: any) => w.name === 'Mock Winery One');
        
        if (winery) {
            await (window as any).useVisitStore.getState().injectVisitWithPhotos(winery, {
                visit_date: date,
                user_review: review,
                rating: 5,
                photos: [
                    { base64: b64, type: 'image/gif', name: 'photo1.gif' },
                    { base64: b64, type: 'image/gif', name: 'photo2.gif' }
                ]
            });
        }
    }, { date: visitDate, review: review });

    // Verify UI reflects the injected visit (optimistic)
    await expect(modal.getByText(review)).toBeVisible({ timeout: 10000 });

    // 4. Setup Listeners for Re-Online Sync
    let uploadCount = 0;
    let rpcCount = 0;

    await context.route(/\/rpc\/log_visit/, async route => {
        console.log('[Test] Intercepted log_visit RPC');
        rpcCount++;
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ visit_id: 'deep-synced-visit-123' })
        });
    });

    await context.route(/\/storage\/v1\/object\/(public\/)?visit-photos/, async route => {
        console.log('[Test] Intercepted photo upload');
        uploadCount++;
        await route.fulfill({ status: 200, body: JSON.stringify({ path: 'mocked-path' }) });
    });

    await context.route(/\/rpc\/get_paginated_visits_with_winery_and_friends/, async route => {
        console.log('[Test] Intercepted get_paginated_visits RPC');
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([{
                visit_id: 'deep-synced-visit-123',
                user_id: 'mock-user-id',
                visit_date: visitDate,
                user_review: review,
                rating: 5,
                photos: ['mocked-path', 'mocked-path'],
                winery_id: 1,
                winery_name: 'Mock Winery One',
                google_place_id: 'ch-12345-mock-winery-1',
                winery_address: '123 Mockingbird Lane',
                friend_visits: []
            }])
        });
    });

    // 5. Go Online & Trigger Sync
    console.log('[Test] Going online...');
    await context.setOffline(false);
    
    // Explicit wait for network/online transition to settle
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    console.log('Triggering manual syncOfflineVisits if needed...');
    await page.evaluate(async () => {
        const store = (window as any).useVisitStore.getState();
        if (!store.isSyncing) {
            await store.syncOfflineVisits();
        }
    });

    // Wait for the sync to complete
    console.log('[Test] Waiting for sync counts...');
    await expect.poll(() => uploadCount, { timeout: 30000 }).toBeGreaterThanOrEqual(2);
    await expect.poll(() => rpcCount, { timeout: 20000 }).toBeGreaterThanOrEqual(1);

    // 6. Close Modal
    console.log('[Test] Closing modal...');
    const closeBtn = modal.locator('button[aria-label*="lose" i], button:has-text("Close")').first();
    if (await closeBtn.isVisible()) {
        await robustClick(closeBtn);
    }
    await expect(modal).not.toBeVisible({ timeout: 10000 });

    // 7. Verify History
    console.log('[Test] Navigating to History tab...');
    if (page.viewportSize()!.width < 768) {
        await page.getByRole('button', { name: 'History' }).click();
        const sheet = page.getByTestId('mobile-sidebar-container').filter({ visible: true });
        await expect(sheet).toBeVisible({ timeout: 5000 });
        
        const expandButton = page.getByRole('button', { name: 'Expand to full screen' });
        if (await expandButton.isVisible()) {
            await expandButton.click();
            await expect(sheet).toHaveAttribute('data-state', 'stable', { timeout: 10000 });
        }
        await expect(sheet.locator(`text=${review}`).first()).toBeVisible({ timeout: 15000 });
    } else {
        await navigateToTab(page, 'History');
        const historyContainer = getSidebarContainer(page);
        await expect(historyContainer.locator(`text=${review}`).first()).toBeVisible({ timeout: 15000 });
    }
    console.log('--- TEST SUCCESS ---');
  });
});
