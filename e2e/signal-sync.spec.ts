import { test, expect } from './utils';
import { login } from './helpers';

test.describe('Signal-Based Synchronization', () => {
  test.beforeEach(async ({ page, mockMaps, user }) => {
    // Standard setup with mock data
    await mockMaps.initDefaultMocks();
    // Use the login helper
    await login(page, user.email, user.password);
  });

  test('TripList should have data-state="ready" after loading', async ({ page }) => {
    await page.goto('/trips');
    const container = page.locator('[data-testid="trip-list-container"]');
    await expect(container).toBeVisible();
    await expect(container).toHaveAttribute('data-state', 'ready');
  });

  test('WineryMap should have data-state="ready" after loading', async ({ page }) => {
    await page.goto('/');
    const container = page.locator('[data-testid="map-container"]');
    await expect(container).toBeVisible();
    await expect(container).toHaveAttribute('data-state', 'ready');
  });

  test('FriendActivityFeed should have data-state="ready" after loading', async ({ page }) => {
    await page.goto('/');
    const friendsTab = page.locator('[data-testid="tab-friends"], [role="tab"]:has-text("Friends")');
    await friendsTab.click();
    const container = page.locator('[data-testid="friend-activity-feed"]');
    await expect(container).toBeVisible();
    await expect(container).toHaveAttribute('data-state', 'ready');
  });

  test('GlobalVisitHistory should have data-state="ready" after loading', async ({ page }) => {
    await page.goto('/');
    // Switch to history tab in sidebar if needed
    const historyTab = page.locator('[data-testid="tab-history"], [role="tab"]:has-text("History")');
    await historyTab.click(); 
    const container = page.locator('[data-testid="visit-history-container"]');
    await expect(container).toBeVisible();
    await expect(container).toHaveAttribute('data-state', 'ready');
  });
});
