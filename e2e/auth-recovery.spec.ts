import { test, expect } from './utils';
import { dismissErrorOverlay } from './helpers';

test.describe('Auth Recovery (Password Reset)', () => {
  test('should allow user to request a reset link and then reset the password', async ({ page }) => {
    // 1. Mock the forgot-password API
    await page.route('**/api/auth/forgot-password', async (route) => {
      console.log('Intercepted forgot-password');
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Cache-Control': 'no-store' },
        body: JSON.stringify({ message: 'Password reset email sent' }),
      });
    });

    // 2. Request Reset Link
    await page.addInitScript(() => {
        window.localStorage.setItem('cookie-consent', 'true');
    });
    await page.goto('/login');
    await dismissErrorOverlay(page);
    
    const forgotLink = page.getByRole('link', { name: 'Forgot password?' });
    await expect(forgotLink).toBeVisible();
    await forgotLink.click();
    
    await page.waitForURL(/.*\/forgot-password/);
    await expect(page.getByText('Forgot Password', { exact: false })).toBeVisible();

    await page.getByLabel('Email').fill('test@example.com');
    await page.getByRole('button', { name: 'Send Reset Link' }).click();

    await expect(page.getByRole('alert').filter({ hasText: 'password reset link has been sent' })).toBeVisible();

    // 3. Mock the reset-password API
    await page.route('**/api/auth/reset-password', async (route) => {
      console.log('Intercepted reset-password');
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Cache-Control': 'no-store' },
        body: JSON.stringify({ message: 'Password updated successfully' }),
      });
    });

    // 4. Simulate clicking the link in the email (navigate to /reset-password?code=mock-code)
    await page.goto('/reset-password?code=mock-code');
    await dismissErrorOverlay(page);
    await expect(page.getByText('Reset Your Password', { exact: false })).toBeVisible();

    await page.getByLabel('New Password', { exact: true }).fill('new-password-123');
    await page.getByLabel('Confirm New Password', { exact: true }).fill('new-password-123');
    await page.getByRole('button', { name: 'Reset Password' }).click();

    // 5. Verify Success and Redirection
    const successAlert = page.getByRole('alert').filter({ hasText: 'successfully' });
    await expect(successAlert).toBeVisible({ timeout: 15000 });
    
    // Wait for the alert to be removed or navigation to occur
    await expect(page).toHaveURL(/.*\/login/, { timeout: 15000 });
  });

  test('should show error when passwords do not match', async ({ page }) => {
    await page.route('**/api/auth/reset-password', async (route) => {
        route.fulfill({ status: 400, body: JSON.stringify({ error: 'Passwords do not match' }) });
    });
    await page.goto('/reset-password?code=mock-code');
    await dismissErrorOverlay(page);
    await expect(page.getByText('Reset Your Password', { exact: false })).toBeVisible();
    
    await page.getByLabel('New Password', { exact: true }).fill('password123');
    await page.getByLabel('Confirm New Password', { exact: true }).fill('password456');
    await page.getByRole('button', { name: 'Reset Password' }).click();

    await expect(page.getByRole('alert').filter({ hasText: 'do not match' })).toBeVisible();
  });

  test('should show error when no code is present', async ({ page }) => {
    await page.goto('/reset-password');
    await dismissErrorOverlay(page);
    await expect(page.getByText('No reset token found.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reset Password' })).toBeDisabled();
  });
});
