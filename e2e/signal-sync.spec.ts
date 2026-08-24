import { test, expect } from './utils';
import { login, navigateToTab } from './helpers';

test.describe('Signal-Based Synchronization', () => {
  test.beforeEach(async ({ page, mockMaps, user }) => {
    // Standard setup with mock data linked to test user
    await mockMaps.initDefaultMocks({ currentUserId: user.id });
    // Use the login helper with skipMapReady to allow isolated container signal verification
    await login(page, user.email, user.password, { skipMapReady: true });
  });

  test('TripList should have data-state="ready" after loading', async ({ page }) => {
    // Use navigateToTab to handle both mobile and desktop robustly
    await navigateToTab(page, 'Trips');
    const container = page.locator('[data-testid="trip-list-container"]');
    await expect(container).toBeVisible();
    await expect(container).toHaveAttribute('data-state', 'ready');
  });

  test('WineryMap should have data-state="ready" after loading', async ({ page }) => {
    await navigateToTab(page, 'Explore');
    const container = page.locator('[data-testid="map-container"]');
    await expect(container).toBeVisible();
    await expect(container).toHaveAttribute('data-state', 'ready');
  });

  test('FriendActivityFeed should have data-state="ready" after loading', async ({ page }) => {
    await navigateToTab(page, 'Friends');
    const container = page.locator('[data-testid="friend-activity-feed"]');
    await expect(container).toBeVisible();
    await expect(container).toHaveAttribute('data-state', 'ready');
  });

  test('GlobalVisitHistory should have data-state="ready" after loading', async ({ page }) => {
    await navigateToTab(page, 'History');
    const container = page.locator('[data-testid="visit-history-container"]');
    await expect(container).toBeVisible();
    await expect(container).toHaveAttribute('data-state', 'ready');
  });
});
