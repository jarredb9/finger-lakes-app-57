import { test, expect } from './utils';
import { 
    login, 
    navigateToTab, 
    openWineryDetails, 
    closeWineryModal,
    expectWineryStatusInStore
} from './helpers';

test.describe('Wishlist Flow', () => {
  test.beforeEach(async ({ page, user, mockMaps }) => {
    // Re-initialize mocks with correct user ID to avoid profile mismatch
    await mockMaps.initDefaultMocks({ currentUserId: user.id });
    await login(page, user.email, user.password);
  });

  test('can toggle winery on wishlist', async ({ page }) => {
    test.setTimeout(120000);
    await navigateToTab(page, 'Explore');
    await openWineryDetails(page, 'Mock Winery One');

    const modal = page.getByRole('dialog');

    // 1. Wishlist Toggle ON
    const wishlistBtn = modal.getByTestId('wishlist-button');
    await expect(wishlistBtn).toBeVisible();
    await expect(wishlistBtn).toHaveText(/Want to Go/i);
    
    await Promise.all([
        page.waitForResponse(resp => resp.url().includes('rpc/toggle_wishlist') && resp.status() === 200),
        wishlistBtn.click({ force: true })
    ]);
    
    // Check UI update (label change)
    await expect(wishlistBtn).toHaveText(/On List/i, { timeout: 10000 });
    await expectWineryStatusInStore(page, 'Mock Winery One', 'wishlist', true);

    await page.waitForTimeout(1000);

    // 2. Wishlist Toggle OFF
    await Promise.all([
        page.waitForResponse(resp => resp.url().includes('rpc/toggle_wishlist') && resp.status() === 200),
        wishlistBtn.click({ force: true })
    ]);

    // Check UI update back to "Want to Go"
    await expect(wishlistBtn).toHaveText(/Want to Go/i, { timeout: 10000 });
    await expectWineryStatusInStore(page, 'Mock Winery One', 'wishlist', false);

    await page.waitForTimeout(1000);

    // 3. Favorite Toggle ON
    const favoriteBtn = modal.getByTestId('favorite-button');
    await expect(favoriteBtn).toBeVisible();
    
    await Promise.all([
        page.waitForResponse(resp => resp.url().includes('rpc/toggle_favorite') && resp.status() === 200),
        favoriteBtn.click({ force: true })
    ]);

    // Verify UI reflects favorite status
    await expect(favoriteBtn.locator('svg')).toHaveClass(/text-yellow-400/);
    await expect(favoriteBtn.locator('svg')).toHaveClass(/fill-yellow-400/);
    await expectWineryStatusInStore(page, 'Mock Winery One', 'favorite', true);

    await page.waitForTimeout(1000);

    // 4. Favorite Toggle OFF
    await Promise.all([
        page.waitForResponse(resp => resp.url().includes('rpc/toggle_favorite') && resp.status() === 200),
        favoriteBtn.click({ force: true })
    ]);

    // Verify UI reflects non-favorite status
    await expect(favoriteBtn.locator('svg')).not.toHaveClass(/text-yellow-400/);
    await expectWineryStatusInStore(page, 'Mock Winery One', 'favorite', false);
    
    await closeWineryModal(page);
  });
});
