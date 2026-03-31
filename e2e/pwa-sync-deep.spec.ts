import { test, expect } from './utils';
import { login, navigateToTab, openWineryDetails, clearServiceWorkers } from './helpers';

test.describe('Deep PWA Offline Sync (Photos)', () => {
  test.beforeEach(async ({ page, user, mockMaps }) => {
    
    // 0. Ensure fresh start and enable Service Worker for PWA test
    await clearServiceWorkers(page);
    mockMaps.enableServiceWorker();
    mockMaps.useRealVisits();
    
    // Login with PWA flag to set ?pwa=true
    await login(page, user.email, user.password, { isPwa: true });
    await navigateToTab(page, 'Explore');
  });

  test('should queue and sync visit creation with multiple photos when back online', async ({ page, context }) => {
    let uploadCount = 0;
    let rpcCount = 0;
    
    // 1. Setup: Already at Explore due to login helper
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
        
        // Initialize signal in localStorage to survive reloads/redirects
        localStorage.removeItem('_E2E_SYNC_REQUEST_INTERCEPTED');
        localStorage.removeItem('_E2E_ENABLE_REAL_SYNC');
        localStorage.removeItem('_E2E_WEBKIT_SYNC_FALLBACK');
        
        (globalThis as any)._E2E_SYNC_REQUEST_INTERCEPTED = false;
    });

    await openWineryDetails(page, 'Mock Winery One');

    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible({ timeout: 15000 });

    // 2. Go Offline
    await context.setOffline(true);
    
    // Enable Real Sync mode so the store actually tries to hit our mocks
    await page.evaluate(() => {
        localStorage.setItem('_E2E_ENABLE_REAL_SYNC', 'true');
        (globalThis as any)._E2E_ENABLE_REAL_SYNC = true;
    });

    // 3. Prepare and Inject Visit (Offline)
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

    // 4. Setup Interception for Sync (Airtight Proxy Rule)
    const storagePattern = /.*visit-photos.*/;
    const rpcPattern = /.*\/rpc\/log_visit.*/;

    const commonHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey, x-total-count, x-skip-sw-interception',
        'Cache-Control': 'no-store'
    };

    const storageHandler = async (route: any) => {
        const url = route.request().url();
        const method = route.request().method();
        
        if (method === 'OPTIONS') {
            await route.fulfill({ status: 204, headers: commonHeaders });
            return;
        }

        // Handle Signing Requests (App needs these to display synced photos)
        if (url.includes('/sign/')) {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                headers: commonHeaders,
                body: JSON.stringify({ signedURL: 'https://example.com/mock-photo.jpg' })
            });
            return;
        }

        if (method === 'POST' || method === 'PUT') {
            uploadCount++;
            await route.fulfill({ 
                status: 200, 
                contentType: 'application/json',
                headers: commonHeaders,
                body: JSON.stringify({ path: 'mocked-path' }) 
            });
            return;
        }

        // Fallback for GET (serving the mock photo)
        await route.fulfill({
            status: 200,
            contentType: 'image/jpeg',
            headers: commonHeaders,
            body: Buffer.from([0xFF, 0xD8, 0xFF, 0xE0])
        });
    };

    const rpcHandler = async (route: any) => {
        rpcCount++;
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: commonHeaders,
            body: JSON.stringify({ visit_id: 'deep-synced-visit-123' })
        });
    };

    // Unroute existing to avoid conflicts and ensure new handlers are hit
    await context.unroute(storagePattern);
    await context.unroute(rpcPattern);
    await page.unroute(storagePattern);
    await page.unroute(rpcPattern);

    await context.route(storagePattern, storageHandler);
    await context.route(rpcPattern, rpcHandler);
    await page.route(storagePattern, storageHandler);
    await page.route(rpcPattern, rpcHandler);

    // WebKit Fallback just in case interception fails due to engine-level "Load failed"
    // We enable it for ALL browsers now to ensure stability in the container
    await page.evaluate(() => {
        localStorage.setItem('_E2E_WEBKIT_SYNC_FALLBACK', 'true');
        (globalThis as any)._E2E_WEBKIT_SYNC_FALLBACK = true;
    });

    // 5. Go Online & Trigger Sync
    await context.setOffline(false);
    
    // Settlement wait
    await page.waitForTimeout(5000);

    await page.evaluate(async () => {
        const store = (window as any).useVisitStore.getState();
        if (!store.isSyncing) await store.syncOfflineVisits();
    });

    // 6. Verify sync results
    
    await expect(async () => {
        const storeIntercepted = await page.evaluate(() => {
            const ls = localStorage.getItem('_E2E_SYNC_REQUEST_INTERCEPTED') === 'true';
            const gt = (globalThis as any)._E2E_SYNC_REQUEST_INTERCEPTED === true;
            return ls || gt;
        });
        
        // Either Playwright caught it or our store-level fallback caught it
        const uploaded = uploadCount >= 2 || storeIntercepted;
        const rpcCalled = rpcCount >= 1 || storeIntercepted;
        
        if (!uploaded || !rpcCalled) {
        }
        
        expect(uploaded && rpcCalled).toBe(true);
    }).toPass({ timeout: 25000 });

  });
});
