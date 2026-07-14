import { test, expect } from './utils';
import { login, navigateToTab, waitForAppReady } from './helpers';

test.describe('Mobile Navigation & Bottom Sheet Drawer Layout', () => {

  test.beforeEach(async ({ page, user, mockMaps }) => {
    // 1. Force mobile viewport size
    await page.setViewportSize({ width: 375, height: 667 });

    // 2. Initialize mock data and login
    await mockMaps.initDefaultMocks({ currentUserId: user.id, forceMocks: true });
    await login(page, user.email, user.password);
    await waitForAppReady(page);
  });

  test('Mobile Navigation Bar is rendered as a floating pill', async ({ page }) => {
    // Locate the mobile navigation bar container
    const navBar = page.getByTestId('mobile-nav-bar');
    await expect(navBar).toBeVisible();

    // Verify visual design properties (glassmorphism/pill styling)
    const className = await navBar.getAttribute('class');
    expect(className).toContain('rounded-');
    expect(className).toContain('backdrop-blur-');
    expect(className).toContain('border');

    // Verify bounds to check that it floats detached from the screen boundaries
    const box = await navBar.boundingBox();
    expect(box).not.toBeNull();

    const viewport = page.viewportSize()!;
    // Inset from sides (horizontal margins)
    expect(box!.x).toBeGreaterThan(0);
    expect(box!.x + box!.width).toBeLessThan(viewport.width);
    // Detached from the extreme bottom edge
    expect(box!.y + box!.height).toBeLessThan(viewport.height);
  });

  test('Active tab shows highlight and micro-interaction scaling', async ({ page }) => {
    // Click on the Trips tab
    await navigateToTab(page, 'Trips');

    const tripsTab = page.getByTestId('mobile-nav-trips');

    // Verify active icon has scaling classes applied
    const activeIcon = tripsTab.locator('svg');
    const activeIconClass = await activeIcon.getAttribute('class');
    expect(activeIconClass).toContain('scale-'); // scale-105 or scale-110

    // Verify active tab container highlights via styling class (e.g. background change)
    const activeBtnClass = await tripsTab.getAttribute('class');
    expect(activeBtnClass).toContain('bg-'); // active pill color highlight
  });

  test('InteractiveBottomSheet docks immediately above the floating pill', async ({ page }) => {
    // Navigate to a tab that activates the bottom drawer
    await navigateToTab(page, 'Trips');

    const sheet = page.locator('[data-testid="interactive-bottom-sheet"]').first();
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute('data-state', 'stable');

    const sheetBox = await sheet.boundingBox();
    const navBarBox = await page.getByTestId('mobile-nav-bar').boundingBox();

    expect(sheetBox).not.toBeNull();
    expect(navBarBox).not.toBeNull();

    const viewport = page.viewportSize()!;

    // 1. Verify bottom sheet is docked above bottom-24 position (96px from screen bottom)
    expect(sheetBox!.y + sheetBox!.height).toBeCloseTo(viewport.height - 96, 0);

    // 2. Verify there is no layout overlap (bottom of sheet remains above top of navigation bar)
    expect(sheetBox!.y + sheetBox!.height).toBeLessThanOrEqual(navBarBox!.y);
  });
});
