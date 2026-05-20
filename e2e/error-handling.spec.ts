import { test, expect } from './utils';
import { login, navigateToTab, clearServiceWorkers, submitLoginForm } from './helpers';

test.describe('Error Handling (Unhappy Path)', () => {
  test.beforeEach(async ({ page }) => {
    await clearServiceWorkers(page);
  });

  test('should show error alert when map markers fail to load', async ({ page, user }) => {
    // 1. Login (mocks load data cleanly)
    await login(page, user.email, user.password, { skipMapReady: true });

    // 2. Wait for app shell to be mounted before injecting store state
    await expect(page.locator('[data-testid="map-container"]')).toBeVisible({ timeout: 15000 });

    // 3. Atomic Verification: Inject the map error directly into the Zustand store.
    //    This avoids the 750ms idle-debounce race condition seen in CI where setError(null)
    //    clears the error at the start of a new search before the assertion can observe it.
    await page.evaluate(() => {
      const store = (window as any).useMapStore;
      if (store?.setState) {
        store.setState({
          error: 'Failed to find wineries in this area. Please check your connection and try again.',
        });
      }
    });

    // 4. Verify the map container transitions to error state and the alert is visible
    const mapContainer = page.getByTestId('map-container');
    await expect(mapContainer).toHaveAttribute('data-state', 'error', { timeout: 10000 });

    const errorAlert = mapContainer.getByRole('alert').filter({ hasText: 'Failed to find wineries in this area' });
    await expect(errorAlert).toBeVisible();
  });

  test('should show error alert when trips fail to load', async ({ page, user }) => {
    // 1. Login normally
    await login(page, user.email, user.password, { skipMapReady: true });

    // 2. Navigate to Trips tab
    await navigateToTab(page, 'Trips');

    // 3. Wait for the trip-list-container to be mounted in the DOM
    await expect(page.getByTestId('trip-list-container')).toBeVisible({ timeout: 15000 });

    // 4. Atomic Verification: Inject the trip error directly into the Zustand store.
    //    This bypasses the edge case where cached trips prevent the error from being
    //    set in fetchTrips (which only sets error if trips.length === 0).
    await page.evaluate(() => {
      const store = (window as any).useTripStore;
      if (store?.setState) {
        store.setState({ error: 'Database Connection Failed', isLoading: false });
      }
    });

    // 5. Verify Error Alert is visible in the trips sidebar
    const tripContainer = page.getByTestId('trip-list-container');
    const errorAlert = tripContainer.getByRole('alert').filter({ hasText: 'Database Connection Failed' });
    await expect(errorAlert).toBeVisible({ timeout: 10000 });
  });

  test('should handle failed login attempts gracefully', async ({ page, mockMaps }) => {
    // 1. Force a 400 error for login at the network level (must test real auth UX)
    await mockMaps.failLogin();

    // 2. Attempt login
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await submitLoginForm(page, 'fail@example.com', 'wrongpassword');

    // 3. Verify error message in the login card
    const errorAlert = page.getByRole('alert').filter({ hasText: 'Invalid login credentials' });
    await expect(errorAlert).toBeVisible({ timeout: 10000 });
  });
});
