import { test, expect } from './utils';

test.describe('Auth Recovery (Password Reset)', () => {
  test('should allow user to request a reset link and then reset the password', async ({ page, context }) => {
    // 1. Mock the forgot-password API
    await context.route('**/api/auth/forgot-password', async (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Password reset email sent' }),
      });
    });

    // 2. Request Reset Link
    await page.goto('/login');
    // Pre-emptively dismiss cookie banner
    await page.addInitScript(() => {
        window.localStorage.setItem('cookie-consent', 'true');
    });
    
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    await expect(page).toHaveURL(/.*\/forgot-password/);
    await expect(page.getByRole('heading', { name: 'Forgot Password' })).toBeVisible();

    await page.getByLabel('Email').fill('test@example.com');
    await page.getByRole('button', { name: 'Send Reset Link' }).click();

    await expect(page.getByText('If an account with this email exists, a password reset link has been sent.')).toBeVisible();

    // 3. Mock the reset-password API
    await context.route('**/api/auth/reset-password', async (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Password updated successfully' }),
      });
    });

    // 4. Simulate clicking the link in the email (navigate to /reset-password?code=mock-code)
    await page.goto('/reset-password?code=mock-code');
    await expect(page.getByRole('heading', { name: 'Reset Your Password' })).toBeVisible();

    await page.getByLabel('New Password', { exact: true }).fill('new-password-123');
    await page.getByLabel('Confirm New Password', { exact: true }).fill('new-password-123');
    await page.getByRole('button', { name: 'Reset Password' }).click();

    // 5. Verify Success and Redirection
    await expect(page.getByText('Your password has been reset successfully.')).toBeVisible();
    // Increase timeout for the redirect
    await expect(page).toHaveURL(/.*\/login/, { timeout: 10000 });
  });

  test('should show error when passwords do not match', async ({ page }) => {
    await page.goto('/reset-password?code=mock-code');
    
    await page.getByLabel('New Password', { exact: true }).fill('password123');
    await page.getByLabel('Confirm New Password', { exact: true }).fill('password456');
    await page.getByRole('button', { name: 'Reset Password' }).click();

    await expect(page.getByText('Passwords do not match.')).toBeVisible();
  });

  test('should show error when no code is present', async ({ page }) => {
    await page.goto('/reset-password');
    await expect(page.getByText('No reset token found.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reset Password' })).toBeDisabled();
  });
});
