import { test, expect } from './utils';
import { getSidebarContainer, login, navigateToTab } from './helpers';

test.describe('Visual Regression Testing', () => {

  test.beforeEach(async ({ page }, testInfo) => {
    // Run visual tests across desktop (chromium), mobile drawer (Mobile Chrome), and tablet (Mobile Safari (Tablet))
    const allowedProjects = ['chromium', 'Mobile Chrome', 'Mobile Safari (Tablet)'];
    test.skip(!allowedProjects.includes(testInfo.project.name), 'Visual tests run on chromium, Mobile Chrome, and Mobile Safari (Tablet)');

    // Reduce motion natively in browser
    await page.emulateMedia({ reducedMotion: 'reduce' });

    // Neutralize all CSS animations, transitions, and layout jitter globally before navigation
    await page.addInitScript(() => {
      const injectStyles = () => {
        if (document.getElementById('__visual-test-overrides')) return;
        const style = document.createElement('style');
        style.id = '__visual-test-overrides';
        style.textContent = `
          *, *::before, *::after {
            -webkit-transition-duration: 0s !important;
            transition-duration: 0s !important;
            -webkit-animation-duration: 0s !important;
            animation-duration: 0s !important;
            -webkit-animation-delay: 0s !important;
            animation-delay: 0s !important;
          }
          [data-testid="trip-badge"] { display: none !important; }
          [data-testid*="winery-modal"] h2 {
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            max-width: 320px !important;
          }
        `;
        (document.head || document.documentElement).appendChild(style);
      };

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectStyles);
      } else {
        injectStyles();
      }
    });
  });

  test('login page visual baseline', async ({ page }) => {
    await page.goto('/login');
    // Pre-emptively dismiss cookie banner using init script if not already set by helper
    await page.evaluate(() => window.localStorage.setItem('cookie-consent', 'true'));
    await page.reload();
    await page.evaluate(() => document.fonts.ready);

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
    await page.evaluate(() => document.fonts.ready);
    
    await expect(page).toHaveScreenshot('dashboard-main.png', {
        mask: [
            page.locator('[data-testid="user-avatar"]'), 
            page.locator('text=/Trip \\d+/') 
        ],
        maxDiffPixelRatio: 0.05
    });
  });

  test('winery modal visual baseline', async ({ page, user, mockMaps }) => {
    const width = page.viewportSize()?.width ?? 1280;
    const isMobile = width < 768;
    const isTablet = width >= 768 && width < 1024;

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
      await page.evaluate(() => document.fonts.ready);

      // 1. Peek Snap State (~300px)
      await expect(drawer).toHaveScreenshot('winery-modal-mobile-peek.png', {
          mask: [
              drawer.locator('.text-muted-foreground'),
              drawer.locator('[data-testid="winery-weather-widget"]')
          ],
          maxDiffPixelRatio: 0.10,
          animations: 'disabled'
      });

      // 2. Half Snap State (~520px) - Click title card to snap
      await drawer.getByText('Mock Winery One').last().click();
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      await expect(drawer).toHaveScreenshot('winery-modal-mobile-half.png', {
          mask: [
              drawer.locator('.text-muted-foreground'),
              drawer.locator('[data-testid="winery-weather-widget"]')
          ],
          maxDiffPixelRatio: 0.10,
          animations: 'disabled'
      });

      // 3. Full Snap State (100%) - Click title card to snap
      await drawer.getByText('Mock Winery One').last().click();
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      await expect(drawer).toHaveScreenshot('winery-modal-mobile-full.png', {
          mask: [
              drawer.locator('.text-muted-foreground'),
              drawer.locator('[data-testid="winery-weather-widget"]')
          ],
          maxDiffPixelRatio: 0.10,
          animations: 'disabled'
      });
    } else if (isTablet) {
      const sheet = page.getByTestId('tablet-winery-sheet');
      await expect(sheet).toBeVisible();
      await expect(sheet).toHaveAttribute('data-state', 'ready');
      await page.evaluate(() => document.fonts.ready);

      await expect(sheet).toHaveScreenshot('winery-modal-tablet.png', {
          mask: [
              sheet.locator('.text-muted-foreground'),
              sheet.locator('[data-testid="winery-weather-widget"]')
          ],
          maxDiffPixelRatio: 0.10,
          animations: 'disabled'
      });
    } else {
      const modal = page.getByRole('dialog');
      await expect(modal).toBeVisible();
      await expect(modal).toHaveAttribute('data-state', 'ready');
      await page.evaluate(() => document.fonts.ready);

      await expect(modal).toHaveScreenshot('winery-modal.png', {
          mask: [
              modal.locator('.text-muted-foreground'),
              modal.locator('[data-testid="visit-date"]'),
              modal.locator('[data-testid="winery-weather-widget"]')
          ],
          maxDiffPixelRatio: 0.10,
          animations: 'disabled'
      });
    }
  });
});

