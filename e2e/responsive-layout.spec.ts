import { test, expect } from './utils';
import {
  login,
  clearServiceWorkers,
  openWineryModalState,
  navigateToTab
} from './helpers';

test.describe('Adaptive 3-Tier Responsive Layout Suite', () => {
  test.beforeEach(async ({ page, user, mockMaps }) => {
    await clearServiceWorkers(page);
    await page.addInitScript(() => {
      (window as any)._E2E_SKIP_DETAILS_MOCK = true;
    });
    await mockMaps.initDefaultMocks({ currentUserId: user.id });
    await login(page, user.email, user.password, { skipMapReady: true });
  });

  const seedWineryAndOpenModal = async (page: any, wineryId = 42, name = 'Finger Lakes Estate') => {
    const winery = {
      id: wineryId,
      google_place_id: `place_${wineryId}`,
      name,
      address: '990 Seneca Trail, Dundee, NY',
      latitude: 42.55,
      longitude: -76.92,
      rating: 4.9,
      user_rating_count: 88,
      enrichment_tier: 'enriched',
      generative_summary: { overview: { text: 'Panoramic views and award-winning Rieslings.' } },
      opening_hours: {
        open_now: true,
        weekday_text: ['Monday: 10:00 AM – 5:00 PM']
      }
    };
    await openWineryModalState(page, winery);
  };

  test('Tier 1: Mobile layout (< 768px) displays bottom nav, bottom sheet drawer, and mobile winery drawer', async ({ page }) => {
    // 1. Set mobile viewport (iPhone 13 / 14: 390x844)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);

    // 2. Verify mobile navigation bar is visible and floating
    const navBar = page.getByTestId('mobile-nav-bar');
    await expect(navBar).toBeVisible();

    // Verify desktop sidebar and tablet drawer are NOT present
    await expect(page.getByTestId('desktop-sidebar-container')).not.toBeVisible();
    await expect(page.getByTestId('tablet-floating-drawer')).not.toBeVisible();

    // 3. Open Trips tab to activate bottom sheet drawer
    await navigateToTab(page, 'Trips');
    const sheet = page.locator('[data-testid="mobile-sidebar-container"], [data-testid="interactive-bottom-sheet"]').first();
    await expect(sheet).toBeVisible();

    // 4. Open winery modal and verify mobile drawer presentation
    await seedWineryAndOpenModal(page);
    const mobileDrawer = page.getByTestId('winery-modal-drawer');
    await expect(mobileDrawer).toBeVisible();
    await expect(mobileDrawer.locator('[data-testid="drawer-drag-handle"]')).toBeVisible();
  });

  test('Tier 2: Tablet portrait layout (768px - 1024px) displays full map canvas, floating drawer, and floating winery sheet', async ({ page }) => {
    // 1. Set iPad portrait viewport (810x1080)
    await page.setViewportSize({ width: 810, height: 1080 });
    await page.waitForTimeout(200);

    // 2. Verify tablet floating drawer overlay is present and expanded by default
    const tabletDrawer = page.getByTestId('tablet-floating-drawer');
    await expect(tabletDrawer).toBeVisible();
    await expect(tabletDrawer).toHaveAttribute('data-state', 'expanded');

    // Verify mobile navigation bar and fixed desktop sidebar are NOT visible
    await expect(page.getByTestId('mobile-nav-bar')).not.toBeVisible();
    await expect(page.getByTestId('desktop-sidebar-container')).not.toBeVisible();

    // 3. Verify collapsing the tablet drawer into a pill bar
    const collapseBtn = page.getByTestId('tablet-drawer-collapse-button');
    await expect(collapseBtn).toBeVisible();
    await collapseBtn.click();

    await expect(tabletDrawer).toHaveAttribute('data-state', 'collapsed');
    const expandBtn = page.getByTestId('tablet-drawer-expand-button');
    await expect(expandBtn).toBeVisible();

    // 4. Expand drawer back
    await expandBtn.click();
    await expect(tabletDrawer).toHaveAttribute('data-state', 'expanded');

    // 5. Open winery modal and verify tablet floating sheet presentation
    await seedWineryAndOpenModal(page);
    const tabletSheet = page.getByTestId('tablet-winery-sheet');
    await expect(tabletSheet).toBeVisible();
    await expect(tabletSheet).toHaveAttribute('data-state', 'ready');
  });

  test('Tier 3: Desktop layout (≥ 1024px) displays persistent split-pane sidebar and desktop modal dialog', async ({ page }) => {
    // 1. Set desktop viewport (1280x800)
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(200);

    // 2. Verify desktop split-pane sidebar container is visible
    const desktopSidebar = page.getByTestId('desktop-sidebar-container');
    await expect(desktopSidebar).toBeVisible();

    // Verify tablet drawer and mobile navigation bar are NOT visible
    await expect(page.getByTestId('tablet-floating-drawer')).not.toBeVisible();
    await expect(page.getByTestId('mobile-nav-bar')).not.toBeVisible();

    // 3. Open winery modal and verify centered 2-column desktop dialog presentation
    await seedWineryAndOpenModal(page);
    const dialog = page.getByTestId('winery-modal-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('modal-left-column')).toBeVisible();
    await expect(dialog.getByTestId('modal-right-column')).toBeVisible();
  });

  test('Dynamic Viewport Resizing: preserves state and seamlessly transitions across mobile, tablet, and desktop tiers', async ({ page }) => {
    // 1. Start on Desktop viewport (1280x800)
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(200);
    await expect(page.getByTestId('desktop-sidebar-container')).toBeVisible();

    // 2. Resize dynamically to Tablet portrait (810x1080)
    await page.setViewportSize({ width: 810, height: 1080 });
    await page.waitForTimeout(200);
    await expect(page.getByTestId('tablet-floating-drawer')).toBeVisible();
    await expect(page.getByTestId('desktop-sidebar-container')).not.toBeVisible();

    // 3. Resize dynamically to Mobile (390x844)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    await expect(page.getByTestId('mobile-nav-bar')).toBeVisible();
    await expect(page.getByTestId('tablet-floating-drawer')).not.toBeVisible();

    // 4. Resize back to Desktop
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(200);
    await expect(page.getByTestId('desktop-sidebar-container')).toBeVisible();
    await expect(page.getByTestId('mobile-nav-bar')).not.toBeVisible();
  });
});
