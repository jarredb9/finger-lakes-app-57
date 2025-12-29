import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, TestUser, mockGoogleMapsApi } from './utils';
import { getSidebarContainer, login, navigateToTab } from './helpers';

test.describe('Wishlist Flow', () => {
  let user: TestUser;

  test.beforeEach(async ({ page }) => {
    user = await createTestUser();
    await mockGoogleMapsApi(page);
    await login(page, user.email, user.password);
  });

  test.afterEach(async () => {
    if (user) await deleteTestUser(user.id);
  });

  test('can toggle winery on wishlist', async ({ page }) => {
    await navigateToTab(page, 'Explore');

    const sidebar = getSidebarContainer(page);
    const firstWinery = sidebar.locator('text=Mock Winery One').first();
    await expect(firstWinery).toBeVisible({ timeout: 15000 });

    // Expand sheet on mobile
    const expandButton = page.getByRole('button', { name: 'Expand to full screen' });
    if (await expandButton.isVisible()) {
        await expandButton.click();
        await expect(page.getByTestId('mobile-sidebar-container')).toHaveClass(/h-\[calc\(100vh-4rem\)\]/);
    }

    await firstWinery.click();

    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    // Get the winery ID from the store to be precise in our checks
    const wineryId = await page.evaluate(() => {
        const store = (window as any).useWineryDataStore;
        return store.getState().persistentWineries[0].id;
    });

    // 1. Wishlist Toggle ON
    const wishlistBtn = modal.getByRole('button', { name: 'Want to Go' });
    await expect(wishlistBtn).toBeVisible();
    
    // Wait for the RPC response AND the click
    await Promise.all([
        page.waitForResponse(resp => resp.url().includes('toggle_wishlist') && resp.status() === 200),
        wishlistBtn.click()
    ]);
    
    // Check UI update (label change)
    await expect(modal.getByRole('button', { name: 'On List' })).toBeVisible({ timeout: 10000 });

    // Verify Store state
    await page.waitForFunction((id) => {
        const store = (window as any).useWineryDataStore;
        const w = store.getState().persistentWineries.find((winery: any) => winery.id === id);
        return w?.onWishlist === true;
    }, wineryId, { timeout: 15000 });

    // 2. Wishlist Toggle OFF
    const onListBtn = modal.getByRole('button', { name: 'On List' });
    await Promise.all([
        page.waitForResponse(resp => resp.url().includes('toggle_wishlist') && resp.status() === 200),
        onListBtn.click()
    ]);

    // Check UI update back to "Want to Go"
    await expect(modal.getByRole('button', { name: 'Want to Go' })).toBeVisible({ timeout: 10000 });

    // Verify Store state
    await page.waitForFunction((id) => {
        const store = (window as any).useWineryDataStore;
        const w = store.getState().persistentWineries.find((winery: any) => winery.id === id);
        return w?.onWishlist === false;
    }, wineryId, { timeout: 15000 });

    // 3. Favorite Toggle ON
    const favoriteBtn = modal.getByRole('button', { name: 'Favorite' }).first();
    await expect(favoriteBtn).toBeVisible();
    await Promise.all([
        page.waitForResponse(resp => resp.url().includes('toggle_favorite') && resp.status() === 200),
        favoriteBtn.click()
    ]);

    // Wait for store update
    await page.waitForFunction((id) => {
        const store = (window as any).useWineryDataStore;
        const w = store.getState().persistentWineries.find((winery: any) => winery.id === id);
        return w?.isFavorite === true;
    }, wineryId, { timeout: 15000 });

    // 4. Favorite Toggle OFF
    await Promise.all([
        page.waitForResponse(resp => resp.url().includes('toggle_favorite') && resp.status() === 200),
        favoriteBtn.click()
    ]);

    // Verify Store state
    await page.waitForFunction((id) => {
        const store = (window as any).useWineryDataStore;
        const w = store.getState().persistentWineries.find((winery: any) => winery.id === id);
        return w?.isFavorite === false;
    }, wineryId, { timeout: 15000 });
  });
});
