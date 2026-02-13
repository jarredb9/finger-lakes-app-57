import { test, expect } from './utils';
import { login } from './helpers';

test.describe('Deep Linking & Redirection', () => {
  test('should redirect to login when accessing trip detail unauthenticated, then redirect back after login', async ({ page, user }) => {
    // 1. Try to access a trip page directly
    const tripId = '123';
    await page.goto(`/trips/${tripId}`);

    // 2. Expect redirect to login
    await expect(page).toHaveURL(/.*\/login/);

    // 3. Perform login
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign In' }).click();

    // 4. Expect to be redirected back to the trip page
    // Note: Next.js + Supabase Auth often handle the "next" or "redirectTo" param.
    // If the app doesn't implement this specifically, it might just go to /.
    // Let's see how it behaves.
    
    // We expect the trip detail page to load (it might show an error if trip 123 doesn't exist, but it should be at the URL)
    await expect(page).toHaveURL(new RegExp(`.*\/trips\/${tripId}`));
    
    // Since we are using mocks, the trip 123 won't exist in the database, 
    // but the client-page should show a "Trip not found" or similar if the RPC returns null.
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
