import { test, expect } from './utils';
import { login, navigateToTab, openWineryDetails, clearServiceWorkers, waitForAppReady } from './helpers';

test.describe('PWA Resilience & Offline Integrity', () => {
  test.beforeEach(async ({ page, user, mockMaps }) => {
    // 0. Ensure fresh start and enable Service Worker for PWA test
    await clearServiceWorkers(page);
    mockMaps.enableServiceWorker();
    mockMaps.useRealVisits();
    
    // Login with PWA flag to set ?pwa=true
    await login(page, user.email, user.password, { isPwa: true });
    await waitForAppReady(page);

    // Wait for store exposure and user hydration
    await page.waitForFunction(() => {
        const uStore = (window as any).useUserStore;
        const sStore = (window as any).useSyncStore;
        const uState = uStore?.getState?.();
        const sState = sStore?.getState?.();
        
        return !!uState?.user && !!sState?.isInitialized;
    }, { timeout: 30000 });

    await navigateToTab(page, 'Explore');
  });

  test('should handle offline visit creation with multiple photos, encryption, and sync', async ({ page, context }) => {
    let uploadCount = 0;
    let rpcCount = 0;

    // 1. Prepare Winery Context
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
    
    // Enable Real Sync mode
    await page.evaluate(() => {
        localStorage.setItem('_E2E_ENABLE_REAL_SYNC', 'true');
        (globalThis as any)._E2E_ENABLE_REAL_SYNC = true;
    });

    // 3. Inject Visit (Offline) with multiple photos
    const visitDate = new Date().toISOString().split('T')[0];
    const review = 'Resilience integration test with multiple photos';
    
    await page.evaluate(async ({ date, review }) => {
        const b64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
        const winery = (window as any).useWineryDataStore.getState().persistentWineries.find((w: any) => w.name === 'Mock Winery One');
        
        if (winery) {
            // Reconstitution Rule: Photos stored as base64 in the queue
            const stablePhoto1 = { __isBase64: true, base64: b64, type: 'image/gif', name: 'photo1.gif' };
            const stablePhoto2 = { __isBase64: true, base64: b64, type: 'image/gif', name: 'photo2.gif' };

            // Use the internal syncStore directly for the test to ensure we test the queue directly
            const user = (window as any).useUserStore.getState().user;
            await (window as any).useSyncStore.getState().addMutation({
                type: 'log_visit',
                userId: user.id,
                payload: {
                    wineryId: winery.id,
                    wineryDbId: winery.dbId,
                    wineryName: winery.name,
                    wineryAddress: winery.address,
                    lat: winery.lat,
                    lng: winery.lng,
                    visit_date: date,
                    user_review: review,
                    rating: 5,
                    photos: [stablePhoto1, stablePhoto2]
                }
            });
        }
    }, { date: visitDate, review: review });

    // 4. Verify Persistence (Reset memory state and re-hydrate from IDB while offline)
    await page.evaluate(async () => {
        const store = (window as any).useSyncStore;
        store.setState({ queue: [], isInitialized: false });
        await store.getState().initialize();
    });

    const queueLengthAfterHydration = await page.evaluate(() => (window as any).useSyncStore.getState().queue.length);
    expect(queueLengthAfterHydration).toBe(1);

    // 5. Verify Encryption (Read from IDB directly)
    const isEncrypted = await page.evaluate(async () => {
        return new Promise((resolve) => {
            const request = indexedDB.open('keyval-store');
            request.onsuccess = (event: any) => {
                const db = event.target.result;
                const transaction = db.transaction(['keyval'], 'readonly');
                const store = transaction.objectStore('keyval');
                const getRequest = store.get('encrypted-offline-queue');
                getRequest.onsuccess = () => {
                    const val = getRequest.result;
                    if (Array.isArray(val) && val.length > 0) {
                        const firstItem = val[0];
                        if (typeof firstItem.encryptedPayload === 'string' && firstItem.encryptedPayload.length > 50) {
                            resolve(true);
                        } else {
                            resolve(false);
                        }
                    } else {
                        resolve(false);
                    }
                };
            };
            request.onerror = () => resolve(false);
        });
    });
    expect(isEncrypted).toBe(true);

    // 6. Setup Interception and Sync
    const storagePattern = /.*visit-photos.*/;
    const rpcPattern = /.*\/rpc\/log_visit.*/;
    const commonHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey, x-total-count, x-skip-sw-interception',
        'Cache-Control': 'no-store'
    };

    const storageHandler = async (route: any) => {
        const method = route.request().method();
        if (method === 'OPTIONS') {
            await route.fulfill({ status: 204, headers: commonHeaders });
            return;
        }
        if (method === 'POST' || method === 'PUT') {
            uploadCount++;
            await route.fulfill({ 
                status: 200, 
                contentType: 'application/json', 
                headers: commonHeaders, 
                body: JSON.stringify({ path: 'resilient-path' }) 
            });
            return;
        }
        await route.continue();
    };

    const rpcHandler = async (route: any) => {
        rpcCount++;
        await route.fulfill({ 
            status: 200, 
            contentType: 'application/json', 
            headers: commonHeaders, 
            body: JSON.stringify({ visit_id: 'synced-123' }) 
        });
    };

    await page.route(storagePattern, storageHandler);
    await page.route(rpcPattern, rpcHandler);

    // Enable WebKit Sync Fallback (Airtight Proxy Rule)
    await page.evaluate(() => {
        localStorage.setItem('_E2E_WEBKIT_SYNC_FALLBACK', 'true');
        (globalThis as any)._E2E_WEBKIT_SYNC_FALLBACK = true;
    });

    await context.setOffline(false);
    
    // Settlement wait
    await page.waitForTimeout(5000);

    // Trigger manual sync if not already triggered by online event
    await page.evaluate(async () => {
        // @ts-ignore
        if (!window.SyncService.isSyncing) {
            // @ts-ignore
            await window.SyncService.sync();
        }
    });

    // 7. Verify sync results
    await expect(async () => {
        const storeIntercepted = await page.evaluate(() => {
            return localStorage.getItem('_E2E_SYNC_REQUEST_INTERCEPTED') === 'true' || 
                   (globalThis as any)._E2E_SYNC_REQUEST_INTERCEPTED === true;
        });

        const uploaded = uploadCount >= 2 || storeIntercepted;
        const rpcCalled = rpcCount >= 1 || storeIntercepted;
        
        expect(uploaded).toBe(true);
        expect(rpcCalled).toBe(true);
    }).toPass({ timeout: 25000 });
    
    // Ensure queue is cleared
    const queueLength = await page.evaluate(() => (window as any).useSyncStore.getState().queue.length);
    expect(queueLength).toBe(0);
  });
});
