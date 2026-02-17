import { test, expect } from './utils';
import { login, navigateToTab } from './helpers';

test.describe('Error Handling (Unhappy Path)', () => {
  test('should show error alert when map markers fail to load', async ({ page, mockMaps, user }) => {
    // 1. Force a 500 error for markers
    await mockMaps.failMarkers();

    // 2. Login
    await login(page, user.email, user.password, { skipMapReady: true });

    // 3. Verify Error Alert is visible on the map area
    const errorAlert = page.getByRole('alert').filter({ hasText: 'Failed to load data' });
    await expect(errorAlert).toBeVisible({ timeout: 10000 });
  });

  test('should show error alert when trips fail to load', async ({ page, mockMaps, user }) => {
    // 1. Force a 500 error for trips
    await mockMaps.failTrips();

    // 2. Login
    await login(page, user.email, user.password, { skipMapReady: true });

    // 3. Navigate to Trips
    await navigateToTab(page, 'Trips');

    // 4. Verify Error Alert is visible in the sidebar
    const errorAlert = page.getByRole('alert').filter({ hasText: 'Database Connection Failed' });
    await expect(errorAlert).toBeVisible({ timeout: 10000 });
  });

  test('should handle failed login attempts gracefully', async ({ page, mockMaps }) => {
    // 1. Force a 400 error for login
    await mockMaps.failLogin();

    // 2. Attempt login
    // Pre-emptively dismiss cookie banner by setting localStorage before load
    await page.addInitScript(() => {
        window.localStorage.setItem('cookie-consent', 'true');
    });

    await page.goto('/login');

    await page.getByLabel('Email').fill('fail@example.com');
    await page.getByLabel('Password').fill('wrongpassword');
    await page.getByRole('button', { name: 'Sign In' }).click();

    // 3. Verify error message in the login card
    const errorAlert = page.getByRole('alert').filter({ hasText: 'Invalid login credentials' });
    await expect(errorAlert).toBeVisible();
  });
});
