import { test, expect } from './utils';
import { login, waitForAppReady, submitLoginForm, clearServiceWorkers, waitForSignal } from './helpers';

test.describe('Deep Linking & Redirection', () => {
  const commonHeaders = { 
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE, PATCH',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey, x-total-count, x-skip-sw-interception',
    'Access-Control-Max-Age': '86400'
  };

  test.beforeEach(async ({ page, context, user }) => {
    // 1. Clear SW and cookies for clean session state
    await clearServiceWorkers(page);
    await page.addInitScript(() => {
      window.localStorage.setItem('cookie-consent', 'true');
      (window as any)._DIAGNOSTIC_LOGGING = true;
    });

    // 2. Airtight Mock: Register RPC handler on both context and page
    const tripDetailsHandler = async (route: any) => {
      const method = route.request().method();
      if (method === 'OPTIONS') {
        return route.fulfill({ status: 204, headers: commonHeaders });
      }

      const payload = route.request().postDataJSON();
      const tripId = payload?.p_trip_id || 123;
      const tripName = tripId === 999 ? 'Deep Link Trip' : 'Redirected Trip';

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: commonHeaders,
        body: JSON.stringify({
          id: tripId,
          name: tripName,
          trip_date: new Date().toISOString().split('T')[0],
          user_id: user.id,
          members: [{
            id: user.id,
            name: 'Test User',
            email: user.email,
            role: 'owner',
            status: 'joined'
          }],
          wineries: []
        }),
      });
    };

    await context.route('**/rpc/get_trip_details*', tripDetailsHandler);
    await page.route('**/rpc/get_trip_details*', tripDetailsHandler);
  });

  test('should redirect to login when accessing trip detail unauthenticated, then redirect back after login', async ({ page, user }) => {
    const tripId = '123';

    // 1. Unauthenticated direct access
    await page.goto(`/trips/${tripId}`);

    // 2. Expect redirect to login with redirectTo query param
    await page.waitForURL(new RegExp(`.*\\/login\\?redirectTo=.*trips.*${tripId}`), { waitUntil: 'commit', timeout: 15000 });

    // 3. Authenticate
    await submitLoginForm(page, user.email, user.password);

    // 4. Expect client redirect back to trip page
    await page.waitForURL(new RegExp(`.*\\/trips\\/${tripId}`), { waitUntil: 'commit', timeout: 15000 });
    await waitForAppReady(page);

    // 5. Verify Content Rendered
    await expect(page.getByTestId('trip-details-skeleton')).not.toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Redirected Trip')).toBeVisible({ timeout: 10000 });
  });

  test('should handle navigation from a direct trip link back to the map', async ({ page, user }) => {
    const tripId = 999;

    // 1. Authenticate first
    await login(page, user.email, user.password);
    
    // 2. Navigate directly to trip
    await page.goto(`/trips/${tripId}`);
    await waitForAppReady(page);

    // 3. Verify Trip Details rendered
    await expect(page.getByTestId('trip-details-skeleton')).not.toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Deep Link Trip')).toBeVisible({ timeout: 10000 });

    // 4. Navigate Back to Map (native click, no force: true)
    const backToMapLink = page.getByRole('link', { name: 'Back to Map' });
    await expect(backToMapLink).toBeVisible({ timeout: 5000 });
    await backToMapLink.click();

    // 5. Deterministically wait for client-side navigation commit and app hydration
    await page.waitForURL((url) => url.pathname === '/', { waitUntil: 'commit', timeout: 15000 });
    await waitForAppReady(page);
    await waitForSignal(page, 'map-container', 'ready', 15000);

    // 6. Verify Homepage & Map Container
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('map-container')).toBeVisible();
  });
});
