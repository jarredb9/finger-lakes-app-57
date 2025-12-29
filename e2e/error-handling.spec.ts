import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, TestUser, mockGoogleMapsApi } from './utils';
import { login, navigateToTab } from './helpers';

test.describe('Error Handling (Unhappy Path)', () => {
  let user: TestUser;

  test.beforeEach(async ({ page }) => {
    user = await createTestUser();
    // Start with basic mocks
    await mockGoogleMapsApi(page);
  });

  test.afterEach(async () => {
    if (user) await deleteTestUser(user.id);
  });

  test('should show error alert when map markers fail to load', async ({ page }) => {
    // 1. Intercept the marker RPC and force a 500 error
    await page.route(/\/rpc\/get_map_markers/, (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Internal Server Error' }),
      });
    });

    // 2. Login
    await login(page, user.email, user.password);

    // 3. Verify Error Alert is visible on the map area
    const errorAlert = page.getByRole('alert').filter({ hasText: 'Failed to load data' });
    await expect(errorAlert).toBeVisible({ timeout: 10000 });
  });

  test('should show error alert when trips fail to load', async ({ page }) => {
    // 1. Intercept the trips REST/RPC call and force a 500 error
    await page.route(/\/rest\/v1\/trips/, (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Database Connection Failed' }),
      });
    });

    // 2. Login
    await login(page, user.email, user.password);

    // 3. Navigate to Trips
    await navigateToTab(page, 'Trips');

    // 4. Verify Error Alert is visible in the sidebar
    const errorAlert = page.getByRole('alert').filter({ hasText: 'Database Connection Failed' });
    await expect(errorAlert).toBeVisible({ timeout: 10000 });
  });

  test('should handle failed login attempts gracefully', async ({ page }) => {
    // 1. Intercept the auth call
    await page.route('**/auth/v1/token**', (route) => {
        route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }),
        });
    });

    // 2. Attempt login
    await page.goto('/login');

    // Dismiss cookie banner as it blocks the 'Sign In' button on mobile
    const cookieBanner = page.getByText('Cookie Notice');
    if (await cookieBanner.isVisible()) {
        await page.getByRole('button', { name: 'Got it' }).click();
        await expect(cookieBanner).not.toBeVisible();
    }

    await page.getByLabel('Email').fill('fail@example.com');
    await page.getByLabel('Password').fill('wrongpassword');
    await page.getByRole('button', { name: 'Sign In' }).click();

    // 3. Verify error message in the login card
    const errorAlert = page.getByRole('alert').filter({ hasText: 'Invalid login credentials' });
    await expect(errorAlert).toBeVisible();
  });
});
