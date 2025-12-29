import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, TestUser, mockGoogleMapsApi } from './utils';
import { login, navigateToTab } from './helpers';

test.describe('Visual Regression Testing', () => {
  let user: TestUser;

  test.afterEach(async () => {
    if (user) await deleteTestUser(user.id);
  });

  test('login page visual baseline', async ({ page }) => {
    await page.goto('/login');
    // Pre-emptively dismiss cookie banner using init script if not already set by helper
    // (Helper already does this, but for clarity:)
    await page.evaluate(() => window.localStorage.setItem('cookie-consent', 'true'));
    await page.reload();

    await expect(page).toHaveScreenshot('login-page.png', {
        maxDiffPixelRatio: 0.05 // Allow slight rendering differences
    });
  });

  test('main dashboard visual baseline', async ({ page }) => {
    user = await createTestUser();
    await mockGoogleMapsApi(page);
    await login(page, user.email, user.password);

    // Wait for markers to render
    await expect(page.locator('button[aria-label="Explore"]')).toBeVisible();
    
    await expect(page).toHaveScreenshot('dashboard-main.png', {
        mask: [
            page.locator('[data-testid="user-avatar"]'), // Mask dynamic user data if ID exists
            page.locator('text=/Trip \d+/') // Mask unique trip names if present
        ],
        maxDiffPixelRatio: 0.05
    });
  });

  test('winery modal visual baseline', async ({ page }) => {
    user = await createTestUser();
    await mockGoogleMapsApi(page);
    await login(page, user.email, user.password);

    await navigateToTab(page, 'Explore');

    // Open a winery modal
    const firstWinery = page.locator('text=Mock Winery One').first();
    await expect(firstWinery).toBeVisible();
    await firstWinery.click();

    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    
    // Wait for logical loading to finish
    await expect(modal.locator('svg.animate-spin')).not.toBeVisible();

    await expect(modal).toHaveScreenshot('winery-modal.png', {
        mask: [
            modal.locator('.text-muted-foreground') // Mask potentially dynamic distance/text
        ],
        maxDiffPixelRatio: 0.05
    });
  });
});
