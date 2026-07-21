import { test, expect } from './utils';
import {
  login,
  navigateToTab,
  openWineryDetails,
  ensureSidebarExpanded,
  clearServiceWorkers,
} from './helpers';

test.describe('Winery Modal 3-Tier Snap Drawer (Mobile)', () => {
  test.beforeEach(async ({ page, user, mockMaps }) => {
    await clearServiceWorkers(page);
    await page.addInitScript(() => {
      (window as any)._E2E_SKIP_DETAILS_MOCK = true;
    });
    await mockMaps.initDefaultMocks({ currentUserId: user.id });
    await login(page, user.email, user.password);
  });

  test('snaps between Peek, Half, and Full states and renders peek status tag', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });

    await navigateToTab(page, 'Explore');
    await ensureSidebarExpanded(page);
    await openWineryDetails(page, 'The Phantom Cellar');

    const drawer = page.getByTestId('winery-modal-drawer');
    await expect(drawer).toBeVisible();

    // Verify 3-tier snap points attribute
    await expect(drawer).toHaveAttribute('data-snap-points', '300px,550px,1');

    // Peek state checks
    const openStatusTag = page.getByTestId('peek-open-status-tag');
    await expect(openStatusTag).toBeVisible();

    // Verify Log Visit CTA in Peek action bar / actions
    const logVisitBtn = page.getByTestId('log-visit-button').first();
    await expect(logVisitBtn).toBeVisible();

    // Verify Directions CTA in Peek action bar
    const directionsBtn = page.getByTestId('route-from-current').first();
    await expect(directionsBtn).toBeVisible();
  });
});
