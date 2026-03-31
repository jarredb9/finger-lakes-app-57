/* eslint-disable no-console */
import { test, expect } from './utils';

import { robustClick, clearServiceWorkers } from './helpers';

test.describe('Auth Recovery (Password Reset)', () => {
  test.beforeEach(async ({ page }) => {
    // Standard: Clean state to avoid SW/Cache interference
    await clearServiceWorkers(page);
    await page.addInitScript(() => {
        window.localStorage.setItem('cookie-consent', 'true');
        (window as any)._DIAGNOSTIC_LOGGING = true;
    });
  });

  test('should allow user to request a reset link and then reset the password', async ({ page }) => {
    const context = page.context();
    const commonHeaders = { 
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE, PATCH',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey, x-total-count, x-skip-sw-interception',
      'Access-Control-Max-Age': '86400'
    };

    // Airtight: Combined handler for all auth endpoints
    const authHandler = async (route: any) => {
      const url = route.request().url();
      const method = route.request().method();

      if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: commonHeaders });

      if (url.includes('/api/auth/forgot-password')) {
        console.log('[DIAGNOSTIC] Intercepted forgot-password API');
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: commonHeaders,
          body: JSON.stringify({ message: 'Password reset email sent' }),
        });
      }

      if (url.includes('/api/auth/reset-password')) {
        console.log('[DIAGNOSTIC] Intercepted reset-password API');
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: commonHeaders,
          body: JSON.stringify({ message: 'Password updated successfully' }),
        });
      }

      return route.continue();
    };

    await context.route('**/api/auth/**', authHandler);
    await page.route('**/api/auth/**', authHandler);

    // 2. Request Reset Link
    await page.goto('/login');
    // 4. Simulate clicking the link in the email (navigate to /reset-password?code=mock-code)
    await page.goto('/reset-password?code=mock-code');
    await expect(page.getByText('Reset Your Password', { exact: false })).toBeVisible();

    await page.getByLabel('New Password', { exact: true }).fill('new-password-123');
    await page.getByLabel('Confirm New Password', { exact: true }).fill('new-password-123');

    const resetBtn = page.getByRole('button', { name: 'Reset Password' });
    await robustClick(page, resetBtn);

    // 5. Verify Success and Redirection
    // Standard: Use the data-testid from the component
    const successAlert = page.getByTestId('reset-password-success');
    await expect(successAlert).toBeVisible({ timeout: 15000 });
    await expect(successAlert).toContainText('successfully');

    // Wait for navigation back to login
    await expect(page).toHaveURL(/.*\/login/, { timeout: 15000 });
  });

  test('should show error when passwords do not match', async ({ page }) => {
    await page.goto('/reset-password?code=mock-code');
    await expect(page.getByText('Reset Your Password', { exact: false })).toBeVisible();

    await page.getByLabel('New Password', { exact: true }).fill('password123');
    await page.getByLabel('Confirm New Password', { exact: true }).fill('password456');

    const resetBtn = page.getByRole('button', { name: 'Reset Password' });
    await robustClick(page, resetBtn);

    await expect(page.getByTestId('reset-password-error')).toContainText('Passwords do not match');
  });

  test('should show error when API reset fails', async ({ page }) => {
    const context = page.context();
    const commonHeaders = { 
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE, PATCH',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey, x-total-count, x-skip-sw-interception',
      'Access-Control-Max-Age': '86400'
    };
    const resetPattern = /.*\/api\/auth\/reset-password/;

    // Standard: Mock API failure with WebKit-compatible headers
    await context.unroute(resetPattern);
    await page.unroute(resetPattern);

    const errorHandler = async (route: any) => {
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({ status: 204, headers: commonHeaders });
      }
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        headers: commonHeaders,
        body: JSON.stringify({ error: 'Invalid or expired reset token.' }),
      });
    };
    await context.route(resetPattern, errorHandler);
    await page.route(resetPattern, errorHandler);

    await page.goto('/reset-password?code=invalid-code');

    await page.getByLabel('New Password', { exact: true }).fill('new-password-123');
    await page.getByLabel('Confirm New Password', { exact: true }).fill('new-password-123');

    const resetBtn = page.getByRole('button', { name: 'Reset Password' });
    await robustClick(page, resetBtn);

    await expect(page.getByTestId('reset-password-error')).toContainText('Invalid or expired reset token');
  });

  test('should show error when no code is present', async ({ page }) => {
    await page.goto('/reset-password');
    // Standard: Verify error message
    await expect(page.getByTestId('reset-password-error')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reset Password' })).toBeDisabled();
  });
});


