import { test, expect } from '@playwright/test';

test('unauthenticated user is redirected to login', async ({ page }) => {
  await page.goto('/');
  
  // Expect to be redirected to the login page
  await expect(page).toHaveURL(/.*\/login/);
  
  // Expect to see the login header
  await expect(page.getByRole('heading', { name: 'Sign in to your account' })).toBeVisible();
});
