import { test, expect } from './utils';
import { getSidebarContainer, login, navigateToTab } from './helpers';

test.describe('Wishlist Flow', () => {
  test.beforeEach(async ({ page, user }) => {
    // mockMaps is auto-initialized by the fixture
    await login(page, user.email, user.password);
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

    // 2. Wishlist Toggle OFF
    const onListBtn = modal.getByRole('button', { name: 'On List' });
    await Promise.all([
        page.waitForResponse(resp => resp.url().includes('toggle_wishlist') && resp.status() === 200),
        onListBtn.click()
    ]);

    // Check UI update back to "Want to Go"
    await expect(modal.getByRole('button', { name: 'Want to Go' })).toBeVisible({ timeout: 10000 });

    // 3. Favorite Toggle ON
    const favoriteBtn = modal.getByRole('button', { name: 'Favorite' }).first();
    await expect(favoriteBtn).toBeVisible();
    await Promise.all([
        page.waitForResponse(resp => resp.url().includes('toggle_favorite') && resp.status() === 200),
        favoriteBtn.click()
    ]);

    // Verify UI reflects favorite status
    await expect(favoriteBtn.locator('svg')).toHaveClass(/text-yellow-400/);
    await expect(favoriteBtn.locator('svg')).toHaveClass(/fill-yellow-400/);

    // 4. Favorite Toggle OFF
    await Promise.all([
        page.waitForResponse(resp => resp.url().includes('toggle_favorite') && resp.status() === 200),
        favoriteBtn.click()
    ]);

    // Verify UI reflects non-favorite status
    await expect(favoriteBtn.locator('svg')).not.toHaveClass(/text-yellow-400/);
  });
});
