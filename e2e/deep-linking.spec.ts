import { test, expect } from './utils';
import { login, waitForAppReady, robustClick, submitLoginForm, clearServiceWorkers } from './helpers';

test.describe('Deep Linking & Redirection', () => {
  const commonHeaders = { 
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE, PATCH',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey, x-total-count, x-skip-sw-interception',
    'Access-Control-Max-Age': '86400'
  };

  test.beforeEach(async ({ page, context, user }) => {
    // 1. CRITICAL: Clear SW and state to prevent cross-test interference in WebKit
    await clearServiceWorkers(page);
    await page.addInitScript(() => {
      window.localStorage.setItem('cookie-consent', 'true');
      (window as any)._DIAGNOSTIC_LOGGING = true;
    });

    // 2. Airtight Mock: Register on BOTH context and page with broad glob matching
    // This ensures that even if WebKit re-registers a SW or redirects, the mock persists.
    const tripDetailsHandler = async (route: any) => {
        const method = route.request().method();
        if (method === 'OPTIONS') {
            return route.fulfill({ status: 204, headers: commonHeaders });
        }

        // Determine which trip to return based on the request body or URL
        const payload = route.request().postDataJSON();
        const tripId = payload?.trip_id_param || 123;
        const tripName = tripId === 999 ? 'Deep Link Trip' : 'Redirected Trip';

        console.log(`[DIAGNOSTIC] Intercepted get_trip_details for trip ${tripId} (${method})`);
        
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

    // Use broad glob patterns for maximum compatibility with WebKit's URL reporting
    await context.route('**/rpc/get_trip_details*', tripDetailsHandler);
    await page.route('**/rpc/get_trip_details*', tripDetailsHandler);
  });

  test('should redirect to login when accessing trip detail unauthenticated, then redirect back after login', async ({ page, user }) => {
    const tripId = '123';
    const isWebKit = test.info().project.name.toLowerCase().includes('webkit') || test.info().project.name.toLowerCase().includes('safari');

    // 1. Try to access a trip page directly
    await page.goto(`/trips/${tripId}`);

    // 2. Expect redirect to login with redirectTo param
    await page.waitForURL(new RegExp(`.*\\/login\\?redirectTo=.*trips.*${tripId}`));

    // 3. Perform login
    await submitLoginForm(page, user.email, user.password);

    // 4. Expect to be redirected back to the trip page
    await page.waitForURL(new RegExp(`.*\\/trips\\/${tripId}`), { timeout: 15000 });
    
    // 5. Verify hydration and content
    // WebKit needs a settlement buffer after redirections to re-apply the network proxy reliably
    if (isWebKit) {
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000); 
    }
    
    await waitForAppReady(page);
    await expect(page).toHaveURL(new RegExp(`.*\\/trips\\/${tripId}`));
    await expect(page.getByText('Redirected Trip')).toBeVisible({ timeout: 10000 });
  });

  test('should handle navigation from a direct trip link back to the map', async ({ page, user }) => {
    const tripId = 999;
    const isWebKit = test.info().project.name.toLowerCase().includes('webkit') || test.info().project.name.toLowerCase().includes('safari');

    // 1. Login first
    await login(page, user.email, user.password);
    
    // 2. Navigate directly
    await page.goto(`/trips/${tripId}`);
    
    if (isWebKit) {
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000); 
    }
    await waitForAppReady(page);

    // 3. Verify content
    await expect(page.getByText('Deep Link Trip')).toBeVisible({ timeout: 15000 });

    // 4. Back to Map
    const backToMapLink = page.getByRole('link', { name: 'Back to Map' });
    await robustClick(page, backToMapLink);

    // 5. Verify Homepage
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('map-container')).toBeVisible();
  });
});
