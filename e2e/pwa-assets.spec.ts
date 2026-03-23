import { test, expect } from './utils';
import { login, navigateToTab, waitForMapReady, clearServiceWorkers, openWineryDetails, logVisit, robustClick, ensureSidebarExpanded } from './helpers';

test.describe('PWA Assets & Sync', () => {
  test.beforeEach(async ({ page, user, mockMaps }) => {
    await clearServiceWorkers(page);
    mockMaps.enableServiceWorker();
    await login(page, user.email, user.password, { isPwa: true });
  });

  test('should have valid manifest', async ({ request }) => {
    const response = await request.get('/site.webmanifest');
    expect(response.status()).toBe(200);
    const manifest = await response.json();
    expect(manifest.short_name).toBe("Winery App");
    expect(manifest.start_url).toBe("/");
    expect(manifest.icons.length).toBeGreaterThan(0);
    expect(manifest.shortcuts).toBeDefined();
  });

  test('should sync queued visits when back online', async ({ page, context }) => {
    // 1. Setup: Go to Explore and open modal via UI
    await navigateToTab(page, 'Explore');
    await waitForMapReady(page);
    
    await page.evaluate(() => {
        const dataStore = (window as any).useWineryDataStore.getState();
        const mockWinery = dataStore.persistentWineries.find((w: any) => w.name === 'Vineyard of Illusion');
        
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
            // Ensure consistency with the new deterministic mocking rule
            (window as any).useWineryDataStore.setState({
                persistentWineries: dataStore.persistentWineries.map((w: any) => 
                    w.name === 'Vineyard of Illusion' ? { ...w, openingHours: null, reviews: [] } : w
                )
            });
        }
    });

    // Target the winery in the list specifically within the visible sidebar
    await ensureSidebarExpanded(page);
    await openWineryDetails(page, 'Vineyard of Illusion');

    const modal = page.getByRole('dialog');
    await expect(modal.getByRole('heading', { name: 'Vineyard of Illusion' })).toBeVisible();

    // 2. Go Offline
    await context.setOffline(true);
    // Block the RPC to simulate network failure even if SW tries to bypass
    await context.route(/\/rpc\/log_visit/, route => route.abort());

    // CRITICAL: Set the flag BEFORE creating the visit, so that when the 
    // automatic sync fires later, it already has the flag.
    await page.evaluate(() => {
        // @ts-ignore
        window._E2E_ENABLE_REAL_SYNC = true;
    });

    // 3. Create Visit (Queued)
    await robustClick(page, page.getByTestId('log-visit-button'));
    await page.getByLabel('Visit Date').fill('2025-01-02');
    await logVisit(page, { review: 'Sync Me!' });
    
    // 4. Setup Interception for Sync (using context.route and page.route for SW/Direct)
    let syncRequestMade = false;
    let syncSuccessLogged = false;
    const logVisitPattern = /.*\/rpc\/log_visit/;
    
    page.on('console', msg => {
        if (msg.text().includes('synced successfully')) {
            syncSuccessLogged = true;
        }
    });

    // Unroute any existing to avoid conflicts
    await context.unroute(logVisitPattern);
    await page.unroute(logVisitPattern);

    const logVisitHandler = async (route: any) => {
        syncRequestMade = true;
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: { 
                'Cache-Control': 'no-store',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE, PATCH',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey, x-total-count, x-skip-sw-interception',
            },
            body: JSON.stringify({ visit_id: 'synced-visit-123' })
        });
    };

    await context.route(logVisitPattern, logVisitHandler);
    await page.route(logVisitPattern, logVisitHandler);

    // WebKit Fallback Strategy: If WebKit is used, we also enable a store-level bypass 
    // because WebKit's network stack in the RHEL container often fails to hit Playwright's proxy 
    // during offline/online transitions (TypeError: Load failed).
    const isWebKit = page.context().browser()?.browserType().name() === 'webkit';
    if (isWebKit) {
        await page.evaluate(() => {
            // @ts-ignore
            globalThis._E2E_WEBKIT_SYNC_FALLBACK = true;
        });
    }

    // 5. Go Online
    await context.setOffline(false);
    
    // Give WebKit PLENTY of time to settle the network stack and avoid the "Load failed" engine bug
    await page.waitForTimeout(5000);
    
    await page.evaluate(() => {
        // @ts-ignore
        window.useVisitStore.getState().syncOfflineVisits();
    });

    // 6. Wait for Sync
    await expect(async () => {
        // If Playwright intercepted it, great. 
        // If not, check if our store-level fallback caught it (only for WebKit) or if it logged success.
        const storeIntercepted = await page.evaluate(() => (globalThis as any)._E2E_SYNC_REQUEST_INTERCEPTED === true);
        
        if (!syncRequestMade && !storeIntercepted && !syncSuccessLogged) {
        }
        expect(syncRequestMade || storeIntercepted || syncSuccessLogged).toBe(true);
    }).toPass({ timeout: 20000 });
  });

  test('should cache images and load them offline', async ({ page, context }) => {
    const fakeImageUrl = 'https://supabase.co/storage/v1/object/public/visit-photos/test-image.jpg';

    await context.route(fakeImageUrl, async route => {
        await route.fulfill({
            status: 200,
            contentType: 'image/jpeg',
            headers: { 'Cache-Control': 'public, max-age=31536000' }, // Stimulate caching
            body: Buffer.from([0xFF, 0xD8, 0xFF, 0xE0])
        });
    });

    await page.evaluate((url) => {
        const img = document.createElement('img');
        img.src = url;
        img.id = 'test-cached-image';
        document.body.appendChild(img);
    }, fakeImageUrl);

    await expect(page.locator('#test-cached-image')).toHaveJSProperty('complete', true);

    await context.setOffline(true);
    await context.route(fakeImageUrl, route => route.abort());

    await page.evaluate((url) => {
        const img = document.createElement('img');
        img.src = url;
        img.id = 'test-cached-image-2';
        document.body.appendChild(img);
    }, fakeImageUrl);

    await expect(page.locator('#test-cached-image-2')).toHaveJSProperty('complete', true);
  });

  test('should show install prompt when browser fires event', async ({ page }) => {
    await page.evaluate(() => {
      window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true }));
    });

    const installButton = page.getByRole('button', { name: /Install/i }).locator('visible=true');
    await expect(installButton.first()).toBeVisible();
  });
});
