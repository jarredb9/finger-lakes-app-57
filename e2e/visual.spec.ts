import { test, expect } from './utils';
import { getSidebarContainer, login, navigateToTab } from './helpers';

test.describe('Visual Regression Testing', () => {

  test.beforeEach(({}, testInfo) => {
    // Run visual tests across desktop (chromium), mobile drawer (Mobile Chrome), and tablet (Mobile Safari (Tablet))
    const allowedProjects = ['chromium', 'Mobile Chrome', 'Mobile Safari (Tablet)'];
    test.skip(!allowedProjects.includes(testInfo.project.name), 'Visual tests run on chromium, Mobile Chrome, and Mobile Safari (Tablet)');
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

    await mockMaps.initDefaultMocks({ currentUserId: user.id, forceMocks: true });
    await login(page, user.email, user.password);

    await navigateToTab(page, 'Explore');

    // Open a winery modal - click the title to avoid MapNavigation intercepting card clicks
    const firstWinery = page.getByTestId('winery-card-Mock Winery One').first();
    await firstWinery.locator('h3').click();

    if (isMobile) {
      const drawer = page.getByTestId('winery-modal-drawer');
      await expect(drawer).toBeVisible();
      await expect(drawer).toHaveAttribute('data-state', 'ready');

      // Stabilize dynamic content
      await page.addStyleTag({ content: `
          [data-testid="trip-badge"] { display: none !important; }
          [data-testid*="winery-modal"] h2 { white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; max-width: 240px !important; }
      ` });

      // 1. Peek Snap State (~300px)
      await expect(drawer).toHaveScreenshot('winery-modal-mobile-peek.png', {
          mask: [drawer.locator('.text-muted-foreground')],
          maxDiffPixelRatio: 0.05
      });

      // 2. Half Snap State (~520px) - Click title card to snap
      await drawer.getByText('Mock Winery One').last().click();
      await page.waitForTimeout(300);
      await expect(drawer).toHaveScreenshot('winery-modal-mobile-half.png', {
          mask: [drawer.locator('.text-muted-foreground')],
          maxDiffPixelRatio: 0.05
      });

      // 3. Full Snap State (100%) - Click title card to snap
      await drawer.getByText('Mock Winery One').last().click();
      await page.waitForTimeout(300);
      await expect(drawer).toHaveScreenshot('winery-modal-mobile-full.png', {
          mask: [drawer.locator('.text-muted-foreground')],
          maxDiffPixelRatio: 0.05
      });
    } else {
      const modal = page.getByRole('dialog');
      await expect(modal).toBeVisible();
      await expect(modal).toHaveAttribute('data-state', 'ready');

      // Stabilize layout
      await page.addStyleTag({ content: `
          [data-testid="trip-badge"] { display: none !important; }
          [data-testid*="winery-modal"] h2 { white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; max-width: 320px !important; }
      ` });

      await expect(modal).toHaveScreenshot('winery-modal.png', {
          mask: [
              modal.locator('.text-muted-foreground'),
              modal.locator('[data-testid="visit-date"]')
          ],
          maxDiffPixelRatio: 0.05
      });
    }
  });
});
