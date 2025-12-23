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

    // Find "Want to Go" button (Wishlist)
    const wishlistBtn = modal.getByRole('button', { name: 'Want to Go' });
    await expect(wishlistBtn).toBeVisible();
    
    // Toggle ON
    await wishlistBtn.evaluate((node) => (node as HTMLElement).click());
    
    // Check for "On List" label
    await expect(modal.getByRole('button', { name: 'On List' })).toBeVisible();

    // Wait for store update
    await page.waitForFunction(() => {
        const store = (window as any).useWineryDataStore;
        return store.getState().persistentWineries[0].onWishlist === true;
    });

    // Toggle OFF
    await modal.getByRole('button', { name: 'On List' }).evaluate((node) => (node as HTMLElement).click());

    // Wait for store update
    await page.waitForFunction(() => {
        const store = (window as any).useWineryDataStore;
        return store.getState().persistentWineries[0].onWishlist === false;
    });

    // Find Favorite button
    const favoriteBtn = modal.getByRole('button', { name: 'Favorite' }).first();
    await expect(favoriteBtn).toBeVisible();

    // Toggle ON
    await favoriteBtn.evaluate((node) => (node as HTMLElement).click());

    // Wait for store update
    await page.waitForFunction(() => {
        const store = (window as any).useWineryDataStore;
        return store.getState().persistentWineries[0].isFavorite === true;
    });

    // Toggle OFF
    await favoriteBtn.evaluate((node) => (node as HTMLElement).click());

    // Wait for store update
    await page.waitForFunction(() => {
        const store = (window as any).useWineryDataStore;
        return store.getState().persistentWineries[0].isFavorite === false;
    });
  });
});
