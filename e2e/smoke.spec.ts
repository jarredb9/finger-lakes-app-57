import { test, expect } from '@playwright/test';
import { login, waitForAppReady } from './helpers';

test('unauthenticated user is redirected to login', async ({ page }) => {
  await page.goto('/');
  
  // Expect to be redirected to the login page
  await expect(page).toHaveURL(/.*\/login/);
  
  // Expect to see the login header
  await expect(page.getByRole('heading', { name: 'Sign in to your account' })).toBeVisible();
});

test('authenticated user can reach the app', async ({ page }) => {
  const rawEmail = process.env.TEST_USER_EMAIL || 'tester@mail.com';
  const rawPassword = process.env.TEST_USER_PASSWORD || 'password';

  const email = rawEmail.trim().replace(/^["']|["']$/g, '');
  const password = rawPassword.trim().replace(/^["']|["']$/g, '');

  const maskedEmail = email ? email.replace(/(^.{2})(.*)(@.*)$/, '$1***$3') : '(empty)';
  console.log(`[Smoke Test] Authenticating user: ${maskedEmail}`);

  // We use a static test user.
  // The login helper handles hydration guards and wait logic.
  await login(page, email, password);
  
  await waitForAppReady(page);
  
  // Verify core UI presence (Desktop or Mobile)
  const isMobile = (page.viewportSize()?.width ?? 0) < 1024;
  if (isMobile) {
    await expect(page.getByTestId('mobile-nav-bar')).toBeVisible();
  } else {
    await expect(page.getByTestId('desktop-sidebar-container')).toBeVisible();
  }
});
