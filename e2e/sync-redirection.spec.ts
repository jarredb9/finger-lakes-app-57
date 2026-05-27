import { test, expect } from './utils';
import { clearServiceWorkers, waitForAppReady } from './helpers';

test.describe('SyncService Redirection Race', () => {
  test.beforeEach(async ({ page }) => {
    await clearServiceWorkers(page);
    await page.addInitScript(() => {
      window.localStorage.setItem('cookie-consent', 'true');
      (window as any)._DIAGNOSTIC_LOGGING = true;
    });

    const commonHeaders = { 
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE, PATCH',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey, x-total-count, x-skip-sw-interception',
    };

    await page.route('**/rpc/get_trip_details*', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: commonHeaders,
        body: JSON.stringify({
          id: 123,
          name: 'Redirected Trip',
          trip_date: new Date().toISOString().split('T')[0],
          user_id: 'any',
          members: [],
          wineries: []
        }),
      });
    });
  });

  test('should redirect quickly even if SyncService is initializing', async ({ page }) => {
    // 1. Inject a delay into SyncStore.initialize via proxy or monkeypatch if possible
    // For now, let's just see the current behavior and logs
    
    const startTime = Date.now();
    await page.goto('/'); // Should redirect to /login
    
    await page.waitForURL(/\/login/);
    const endTime = Date.now();
    
    expect(page.url()).toContain('/login');
    console.log(`Redirection to login took ${endTime - startTime}ms`);
    
    // Check logs for SyncService activity during redirection
  });

  test('should handle rapid login and redirection back to deep link', async ({ page, user }) => {
    const tripId = '123';
    await page.goto(`/trips/${tripId}`);
    
    await page.waitForURL(/\/login/);
    
    // Login rapidly
    await page.fill('input[name="email"]', user.email);
    await page.fill('input[name="password"]', user.password);
    
    const loginStartTime = Date.now();
    await page.click('button[type="submit"]');
    
    // It should redirect back to the trip page
    await page.waitForURL(new RegExp(`.*\\/trips\\/${tripId}`));
    const loginEndTime = Date.now();
    
    console.log(`Login and redirect back took ${loginEndTime - loginStartTime}ms`);
    
    await waitForAppReady(page);
  });
});
