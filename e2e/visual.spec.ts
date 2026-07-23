import { test, expect } from './utils';
import { getSidebarContainer, login, navigateToTab } from './helpers';

test.describe('Visual Regression Testing', () => {

  test.beforeEach(({}, testInfo) => {
    // Only run visual tests on the desktop chromium project to avoid maintaining multiple sets of snapshots
    // and because different devices render slightly differently.
    test.skip(testInfo.project.name !== 'chromium', 'Visual tests are chromium-only');
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

  test('main dashboard visual baseline', async ({ page, user, mockMaps }) => {
    await mockMaps.initDefaultMocks({ currentUserId: user.id, forceMocks: true });
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

  test('winery modal visual baseline', async ({ page, user, mockMaps }) => {
    const viewport = page.viewportSize();
    const isMobile = viewport && viewport.width < 768;

    if (isMobile) {
        test.skip(true, 'Skipping modal visual scan on mobile due to visibility constraints in the interactive sheet');
    }

    await mockMaps.initDefaultMocks({ currentUserId: user.id, forceMocks: true });
    await login(page, user.email, user.password);

    await navigateToTab(page, 'Explore');

    // Open a winery modal - click the title to avoid MapNavigation intercepting card clicks
    const firstWinery = page.getByTestId('winery-card-Mock Winery One').first();
    await firstWinery.locator('h3').click();

    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    
    // Wait for logical loading to finish using the data-state attribute
    await expect(modal).toHaveAttribute('data-state', 'ready');

    // Stabilize layout: hide trip badge and prevent title from wrapping which causes 28px height jumps in CI
    await page.addStyleTag({ content: `
        [data-testid="trip-badge"] { display: none !important; }
        [data-testid*="winery-modal"] h2 { white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; max-width: 320px !important; }
    ` });

    await expect(modal).toHaveScreenshot('winery-modal.png', {
        mask: [
            modal.locator('.text-muted-foreground'), // Mask dynamic distance/text
            modal.locator('[data-testid="visit-date"]') // Mask dates if they are dynamic
        ],
        maxDiffPixelRatio: 0.05
    });
  });
});
