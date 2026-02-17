import { test, expect } from './utils';
import { login } from './helpers';

test.describe('Deep Linking & Redirection', () => {
  test('should redirect to login when accessing trip detail unauthenticated, then redirect back after login', async ({ page, user }) => {
    // 1. Try to access a trip page directly
    const tripId = '123';
    await page.goto(`/trips/${tripId}`);

    // 2. Expect redirect to login with redirectTo param
    // Next.js 16 might take a moment to process the redirect
    await page.waitForURL(new RegExp(`.*\\/login\\?redirectTo=.*trips.*${tripId}`));

    // 3. Perform login
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    
    await Promise.all([
        page.waitForResponse(resp => resp.url().includes('/auth/v1/user'), { timeout: 10000 }).catch(() => {}),
        page.getByRole('button', { name: 'Sign In' }).click()
    ]);

    // 4. Expect to be redirected back to the trip page
    await page.waitForURL(new RegExp(`.*\\/trips\\/${tripId}`));
    await expect(page).toHaveURL(new RegExp(`.*\\/trips\\/${tripId}`));
  });

  test('should handle navigation from a direct trip link back to the map', async ({ page, user }) => {
    // Mock the trip detail RPC to return a valid-ish trip so we don't just see an error
    await page.context().route(/\/rpc\/get_trip_details/, (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
              id: 999,
              name: 'Deep Link Trip',
              trip_date: '2025-12-25',
              user_id: user.id,
              members: [user.id],
              wineries: []
          }),
        });
    });

    await login(page, user.email, user.password);
    await page.goto('/trips/999');

    await expect(page.getByText('Deep Link Trip')).toBeVisible({ timeout: 15000 });

    // Click "Back to Map"
    await page.getByRole('link', { name: 'Back to Map' }).click();

    // Verify we are back on the homepage map
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('map-container')).toBeVisible();
  });
});
