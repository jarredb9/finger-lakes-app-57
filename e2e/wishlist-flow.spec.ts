import { test, expect } from './utils';
import { 
    login, 
    navigateToTab, 
    openWineryDetails, 
    closeWineryModal,
    robustClick 
} from './helpers';

test.describe('Wishlist Flow', () => {
  test.beforeEach(async ({ page, user }) => {
    // mockMaps is auto-initialized by the fixture
    await login(page, user.email, user.password);
  });

  test('can toggle winery on wishlist', async ({ page }) => {
    await navigateToTab(page, 'Explore');
    await openWineryDetails(page, 'Mock Winery One');

    const modal = page.getByRole('dialog');

    // 1. Wishlist Toggle ON
    const wishlistBtn = modal.getByRole('button', { name: 'Want to Go' });
    await expect(wishlistBtn).toBeVisible();
    
    // Wait for the RPC response AND the click
    await Promise.all([
        page.waitForResponse(resp => resp.url().includes('toggle_wishlist') && resp.status() === 200),
        robustClick(page, wishlistBtn)
    ]);
    
    // Check UI update (label change)
    await expect(modal.getByRole('button', { name: 'On List' })).toBeVisible({ timeout: 10000 });

    // 2. Wishlist Toggle OFF
    const onListBtn = modal.getByRole('button', { name: 'On List' });
    await Promise.all([
        page.waitForResponse(resp => resp.url().includes('toggle_wishlist') && resp.status() === 200),
        robustClick(page, onListBtn)
    ]);

    // Check UI update back to "Want to Go"
    await expect(modal.getByRole('button', { name: 'Want to Go' })).toBeVisible({ timeout: 10000 });

    // 3. Favorite Toggle ON
    const favoriteBtn = modal.getByRole('button', { name: 'Favorite' }).first();
    await expect(favoriteBtn).toBeVisible();
    await Promise.all([
        page.waitForResponse(resp => resp.url().includes('toggle_favorite') && resp.status() === 200),
        robustClick(page, favoriteBtn)
    ]);

    // Verify UI reflects favorite status
    await expect(favoriteBtn.locator('svg')).toHaveClass(/text-yellow-400/);
    await expect(favoriteBtn.locator('svg')).toHaveClass(/fill-yellow-400/);

    // 4. Favorite Toggle OFF
    await Promise.all([
        page.waitForResponse(resp => resp.url().includes('toggle_favorite') && resp.status() === 200),
        robustClick(page, favoriteBtn)
    ]);

    // Verify UI reflects non-favorite status
    await expect(favoriteBtn.locator('svg')).not.toHaveClass(/text-yellow-400/);
    
    await closeWineryModal(page);
  });
});
