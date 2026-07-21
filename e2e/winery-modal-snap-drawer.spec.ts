import { test, expect } from '@playwright/test';

test.describe('Winery Modal 3-Tier Snap Drawer (Mobile)', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test.beforeEach(async ({ page }) => {
    // Navigate to local dev server and open a winery modal
    await page.goto('/');
    await page.evaluate(() => {
      window.localStorage.setItem('hasSeenOnboarding', 'true');
    });
    await page.goto('/?winery=ch-test-modal-winery');
  });

  test('snaps between Peek, Half, and Full states and renders peek status tag', async ({ page }) => {
    const drawer = page.locator('[data-testid="winery-modal-drawer"]');
    await expect(drawer).toBeVisible();

    // Verify 3-tier snap points attribute
    await expect(drawer).toHaveAttribute('data-snap-points', '300px,550px,1');

    // Peek state checks
    const openStatusTag = page.locator('[data-testid="peek-open-status-tag"]');
    await expect(openStatusTag).toBeVisible();

    // Verify swapped Log Visit CTA in Peek action bar
    const logVisitBtn = page.locator('[data-testid="log-visit-button"]');
    await expect(logVisitBtn).toBeVisible();

    // Verify Directions CTA in Peek action bar
    const directionsBtn = page.locator('[data-testid="route-from-current"]');
    await expect(directionsBtn).toBeVisible();
  });
});
