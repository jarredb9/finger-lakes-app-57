import { test, expect } from './utils';
import { login, navigateToTab, openWineryDetails } from './helpers';

test.describe('Deep PWA Offline Sync (Photos)', () => {
  let uploadCount = 0;
  let rpcCount = 0;

  test.beforeEach(async ({ page, user, mockMaps }) => {
    console.log('[beforeEach] Starting cleanup and setup...');
    
    // 0. Enable real visits FIRST so unrouting doesn't wipe out spec-level mocks
    mockMaps.useRealVisits();
    
    uploadCount = 0;
    rpcCount = 0;

    const context = page.context();

    // CRITICAL: Block Service Worker for this specific test to ensure 
    // network mocks are ALWAYS hit and not bypassed by SW cache.
    await context.route('**/sw.js', route => route.abort());
    
    // Setup global storage interception at context level
    await context.route(/.*visit-photos.*/, async route => {
        const method = route.request().method();
        console.log(`[INTERCEPT] Storage ${method}: ${route.request().url()}`);
        
        const commonHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
            'Access-Control-Allow-Headers': '*',
            'Cache-Control': 'no-store'
        };

        if (method === 'OPTIONS') {
            await route.fulfill({ status: 204, headers: commonHeaders });
            return;
        }

        if (method === 'POST' || method === 'PUT') {
            uploadCount++;
            console.log(`[Test] Incrementing uploadCount to: ${uploadCount}`);
            await route.fulfill({ 
                status: 200, 
                contentType: 'application/json',
                headers: commonHeaders,
                body: JSON.stringify({ path: 'mocked-path' }) 
            });
            return;
        }
        
        await route.fulfill({
            status: 200,
            contentType: 'image/jpeg',
            headers: commonHeaders,
            body: Buffer.from([0xFF, 0xD8, 0xFF, 0xE0])
        });
    });

    await context.route(/.*\/rpc\/log_visit.*/, async route => {
        rpcCount++;
        console.log(`[Test] Intercepted log_visit RPC (Count: ${rpcCount})`);
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: { 
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-store' 
            },
            body: JSON.stringify({ visit_id: 'deep-synced-visit-123' })
        });
    });

    await context.route(/.*\/rpc\/get_paginated_visits_with_winery_and_friends.*/, async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: { 
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-store' 
            },
            body: JSON.stringify([{
                visit_id: 'deep-synced-visit-123',
                user_id: 'mock-user-id',
                visit_date: new Date().toISOString().split('T')[0],
                user_review: 'Deep sync test injection',
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

    // Disable SW via init script as well
    await page.addInitScript(() => {
        if (navigator.serviceWorker) {
            (navigator.serviceWorker as any).register = () => Promise.reject(new Error('SW blocked'));
        }
    });

    await login(page, user.email, user.password);
    await navigateToTab(page, 'Explore');
  });

  test('should queue and sync visit creation with multiple photos when back online', async ({ page, context }) => {
    console.log('--- TEST START: should queue and sync visit creation ---');
    
    page.on('console', msg => {
        const t = msg.text();
        if (t.includes('[Sync]') || t.includes('[OfflineQueue]') || t.includes('Error')) {
            console.log(`[BROWSER DIAGNOSTIC] ${t}`);
        }
    });

    // 1. Setup: Already at Explore due to login helper
    console.log('[Test] Forcing winery visibility in list...');
    await page.evaluate(() => {
        const dataStore = (window as any).useWineryDataStore.getState();
        const mockWinery = dataStore.persistentWineries.find((w: any) => w.name === 'Mock Winery One');
        
        if (mockWinery) {
            const mockBounds = {
                contains: () => true,
                getNorthEast: () => ({ lat: () => 43, lng: () => -76 }),
                getSouthWest: () => ({ lat: () => 42, lng: () => -77 })
            };
            (window as any).useMapStore.setState({ 
                bounds: mockBounds,
                filter: ['all'] 
            });
        }
    });

    await openWineryDetails(page, 'Mock Winery One');

    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible({ timeout: 15000 });

    // 3. Prepare and Inject Visit (Offline)
    console.log('[Test] Injecting visit into store while offline...');
    const visitDate = new Date().toISOString().split('T')[0];
    const review = 'Deep sync test injection';
    
    await page.evaluate(async ({ date, review }) => {
        const b64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
        const winery = (window as any).useWineryDataStore.getState().persistentWineries.find((w: any) => w.name === 'Mock Winery One');
        
        if (winery) {
            const stablePhoto1 = { __isBase64: true, base64: b64, type: 'image/gif', name: 'photo1.gif' };
            const stablePhoto2 = { __isBase64: true, base64: b64, type: 'image/gif', name: 'photo2.gif' };

            await (window as any).useVisitStore.getState().injectVisitWithPhotos(winery, {
                visit_date: date,
                user_review: review,
                rating: 5,
                photos: [stablePhoto1, stablePhoto2]
            });
        }
    }, { date: visitDate, review: review });

    await expect(modal.getByText(review)).toBeVisible({ timeout: 10000 });

    // 4. Go Online & Trigger Sync
    console.log('[Test] Going online...');
    await context.setOffline(false);
    
    // WebKit needs time to settle
    await page.waitForTimeout(5000);

    console.log('Triggering manual syncOfflineVisits...');
    await page.evaluate(async () => {
        const store = (window as any).useVisitStore.getState();
        if (!store.isSyncing) await store.syncOfflineVisits();
    });

    // 5. Verify sync results
    console.log('[Test] Waiting for sync results...');
    
    await expect.poll(() => uploadCount, { timeout: 45000 }).toBeGreaterThanOrEqual(2);
    await expect.poll(() => rpcCount, { timeout: 25000 }).toBeGreaterThanOrEqual(1);

    console.log('--- TEST SUCCESS ---');
  });
});
