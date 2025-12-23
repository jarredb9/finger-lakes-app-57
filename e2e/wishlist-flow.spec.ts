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

    // Wait for wineries to load into the store
    await page.waitForFunction(() => {
        const store = (window as any).useWineryDataStore;
        return store && store.getState().persistentWineries.length > 0;
    }, { timeout: 15000 });

    // Expand sheet on mobile
    const expandButton = page.getByRole('button', { name: 'Expand to full screen' });
    if (await expandButton.isVisible()) {
        await expandButton.evaluate((node) => (node as HTMLElement).click());
        await page.waitForTimeout(1000); 
    }

    const sidebar = getSidebarContainer(page);
    const firstWinery = sidebar.locator('text=Mock Winery One').first();
    await firstWinery.evaluate((node) => (node as HTMLElement).click());

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
    await wishlistBtn.click();
    
    // Check UI update (label change)
    await expect(modal.getByRole('button', { name: 'On List' })).toBeVisible({ timeout: 10000 });

    // Verify Store state
    await page.waitForFunction((id) => {
        const store = (window as any).useWineryDataStore;
        const w = store.getState().persistentWineries.find((winery: any) => winery.id === id);
        return w?.onWishlist === true;
    }, wineryId);

    // 2. Wishlist Toggle OFF
    const onListBtn = modal.getByRole('button', { name: 'On List' });
    await onListBtn.click();

    // Check UI update back to "Want to Go"
    await expect(modal.getByRole('button', { name: 'Want to Go' })).toBeVisible({ timeout: 10000 });

    // Verify Store state
    await page.waitForFunction((id) => {
        const store = (window as any).useWineryDataStore;
        const w = store.getState().persistentWineries.find((winery: any) => winery.id === id);
        return w?.onWishlist === false;
    }, wineryId);

    // 3. Favorite Toggle ON
    const favoriteBtn = modal.getByRole('button', { name: 'Favorite' }).first();
    await expect(favoriteBtn).toBeVisible();
    await favoriteBtn.click();

    // Wait for store update (Favorite label doesn't change text, but the variant/icon might)
    await page.waitForFunction((id) => {
        const store = (window as any).useWineryDataStore;
        const w = store.getState().persistentWineries.find((winery: any) => winery.id === id);
        return w?.isFavorite === true;
    }, wineryId);

    // 4. Favorite Toggle OFF
    await favoriteBtn.click();

    // Verify Store state
    await page.waitForFunction((id) => {
        const store = (window as any).useWineryDataStore;
        const w = store.getState().persistentWineries.find((winery: any) => winery.id === id);
        return w?.isFavorite === false;
    }, wineryId);
  });
});
