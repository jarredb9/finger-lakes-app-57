import { test, expect } from './utils';
import { login, waitForAppReady } from './helpers';

test('unauthenticated user is redirected to login', async ({ page }) => {
  await page.goto('/');
  
  // Expect to be redirected to the login page
  await expect(page).toHaveURL(/.*\/login/);
  
  // Expect to see the login header
  await expect(page.getByRole('heading', { name: 'Sign in to your account' })).toBeVisible();
});

test('authenticated user can reach the app', async ({ page }) => {
  // We use a test user from the environment or a mock if necessary.
  // The login helper handles hydration guards and wait logic.
  await login(page, 'test@example.com', 'password123');
  
  await waitForAppReady(page);
  
  // Verify core UI presence (Desktop or Mobile)
  const isMobile = page.viewportSize()?.width! < 768;
  if (isMobile) {
    await expect(page.locator('div.fixed.bottom-0')).toBeVisible();
  } else {
    await expect(page.getByTestId('desktop-sidebar-container')).toBeVisible();
  }
});
