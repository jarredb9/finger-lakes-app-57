import { test, expect, mockGoogleMapsApi } from './utils';
import { getSidebarContainer, login, navigateToTab } from './helpers';

test.describe('Visual Regression Testing', () => {

  test.beforeEach(({ browserName }) => {
    // Only run visual tests on chromium to avoid maintaining multiple sets of snapshots
    // and because different engines render slightly differently.
    test.skip(browserName !== 'chromium', 'Visual tests are chromium-only');
  });

  test('login page visual baseline', async ({ page }) => {
    await page.goto('/login');
    // Pre-emptively dismiss cookie banner using init script if not already set by helper
    // (Helper already does this, but for clarity:)
    await page.evaluate(() => window.localStorage.setItem('cookie-consent', 'true'));
    await page.reload();

    await expect(page).toHaveScreenshot('login-page.png', {
        maxDiffPixelRatio: 0.05 // Allow slight rendering differences
    });
  });

  test('main dashboard visual baseline', async ({ page, user }) => {
    await mockGoogleMapsApi(page, user.id, true);
    await login(page, user.email, user.password);

    // Ensure we are on Explore and the sidebar/sheet is active
    await navigateToTab(page, 'Explore');

    // Wait for content to render
    const sidebar = getSidebarContainer(page);
    await expect(sidebar.getByText('Wineries in View')).toBeVisible();
    
    await expect(page).toHaveScreenshot('dashboard-main.png', {
        mask: [
            page.locator('[data-testid="user-avatar"]'), 
            page.locator('text=/Trip \d+/') 
        ],
        maxDiffPixelRatio: 0.05
    });
  });

  test('winery modal visual baseline', async ({ page, user }) => {
    const viewport = page.viewportSize();
    const isMobile = viewport && viewport.width < 768;

    if (isMobile) {
        test.skip(true, 'Skipping modal visual scan on mobile due to visibility constraints in the interactive sheet');
    }

    await mockGoogleMapsApi(page, user.id, true);
    await login(page, user.email, user.password);

    await navigateToTab(page, 'Explore');

    // Open a winery modal
    const firstWinery = page.getByTestId('winery-card-Mock Winery One').first();
    await firstWinery.click();

    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    
    // Wait for logical loading to finish
    await expect(modal.locator('svg.animate-spin')).not.toBeVisible();

    await expect(modal).toHaveScreenshot('winery-modal.png', {
        mask: [
            modal.locator('.text-muted-foreground') // Mask potentially dynamic distance/text
        ],
        maxDiffPixelRatio: 0.05
    });
  });
});
