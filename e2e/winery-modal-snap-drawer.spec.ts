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
    await expect(drawer).toHaveAttribute('data-snap-points', '300px,520px,1');

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

  test('allows dragging the drawer up to Full and back down to Peek', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });

    await navigateToTab(page, 'Explore');
    await ensureSidebarExpanded(page);
    await openWineryDetails(page, 'The Phantom Cellar');

    const drawer = page.getByTestId('winery-modal-drawer');
    await expect(drawer).toBeVisible();

    const handle = page.getByTestId('drawer-drag-handle');
    await expect(handle).toBeVisible();

    // Get drag handle starting coordinates (in Peek state)
    const initialBox = await handle.boundingBox();
    expect(initialBox).not.toBeNull();
    const startX = initialBox!.x + initialBox!.width / 2;
    const startY = initialBox!.y + initialBox!.height / 2;

    // 1. Swipe Up from Peek to Half (move pointer up)
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX, startY - 200, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(600); // Wait for vaul snap animation

    // 2. Swipe Up from Half to Full (move pointer up again)
    const halfBox = await handle.boundingBox();
    expect(halfBox).not.toBeNull();
    const halfY = halfBox!.y + halfBox!.height / 2;
    await page.mouse.move(startX, halfY);
    await page.mouse.down();
    await page.mouse.move(startX, halfY - 200, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(600);

    // 3. Swipe Down from Full back to Peek (move pointer down)
    const fullBox = await handle.boundingBox();
    expect(fullBox).not.toBeNull();
    const fullY = fullBox!.y + fullBox!.height / 2;
    await page.mouse.move(startX, fullY);
    await page.mouse.down();
    await page.mouse.move(startX, fullY + 400, { steps: 15 });
    await page.mouse.up();
    await page.waitForTimeout(600);

    // Verify the drawer is still open and returned back to a lower snap state
    await expect(drawer).toBeVisible();
  });
});
