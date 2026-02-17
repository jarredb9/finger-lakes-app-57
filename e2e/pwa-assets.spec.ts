import { test, expect } from './utils';
import { login, navigateToTab, getSidebarContainer, waitForMapReady, clearServiceWorkers } from './helpers';

test.describe('PWA Assets & Sync', () => {
  test.beforeEach(async ({ page, user }) => {
    await clearServiceWorkers(page);
    await login(page, user.email, user.password);
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
    
    // Target the winery in the list specifically within the visible sidebar
    const sidebar = getSidebarContainer(page);
    const resultsList = sidebar.getByTestId('winery-results-list');

    // Wait for the specific winery to appear, triggering search if needed
    await expect(async () => {
        const wineryItem = resultsList.getByText('Vineyard of Illusion').first();
        if (await wineryItem.isVisible()) return;

        // If not found, check if we need to trigger a manual search
        const noResults = await resultsList.getByText('No wineries found').isVisible();
        if (noResults) {
            await sidebar.getByRole('button', { name: 'Search This Area' }).click();
        }
        
        await expect(wineryItem).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 15000 });
    
    const wineryItem = resultsList.getByText('Vineyard of Illusion').first();
    await wineryItem.evaluate(el => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await expect(modal.getByRole('heading', { name: 'Vineyard of Illusion' })).toBeVisible();

    // 2. Go Offline
    await context.setOffline(true);
    // Block the RPC to simulate network failure even if SW tries to bypass
    await context.route(/\/rpc\/log_visit/, route => route.abort());

    // 3. Create Visit (Queued)
    await page.getByLabel('Visit Date').fill('2025-01-02');
    await page.getByLabel('Your Review').fill('Sync Me!');
    await page.getByRole('button', { name: 'Add Visit' }).click();
    
    // Verify toast says cached
    await expect(page.getByText(/Visit (Saved|cached)/).first()).toBeVisible();
    
    // 4. Setup Interception for Sync (using context.route for SW)
    let syncRequestMade = false;
    await context.unroute(/\/rpc\/log_visit/);
    await context.route(/\/rpc\/log_visit/, async route => {
        syncRequestMade = true;
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: { 'Cache-Control': 'no-store' },
            body: JSON.stringify({ visit_id: 'synced-visit-123' })
        });
    });

    // 5. Go Online
    await context.setOffline(false);

    // 6. Wait for Sync
    await expect(async () => {
        expect(syncRequestMade).toBe(true);
    }).toPass({ timeout: 10000 });
  });

  test('should cache images and load them offline', async ({ page, context }) => {
    const fakeImageUrl = 'https://supabase.co/storage/v1/object/public/visit-photos/test-image.jpg';

    await context.route(fakeImageUrl, route => {
        route.fulfill({
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
