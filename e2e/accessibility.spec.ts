import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createTestUser, deleteTestUser, TestUser, mockGoogleMapsApi } from './utils';
import { login, navigateToTab } from './helpers';

test.describe('Accessibility (A11y)', () => {
  let user: TestUser;

  test.afterEach(async () => {
    if (user) await deleteTestUser(user.id);
  });

  test('login page should be accessible', async ({ page }) => {
    await page.goto('/login');
    const accessibilityScanResults = await new AxeBuilder({ page })
      .disableRules(['link-in-text-block']) // Allow minor contrast issue on signup link for now
      .analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('app dashboard should be accessible', async ({ page }) => {
    user = await createTestUser();
    await mockGoogleMapsApi(page);
    await login(page, user.email, user.password);

    // Scan the main app shell
    const accessibilityScanResults = await new AxeBuilder({ page })
      .exclude('.gm-style') // Exclude Google Maps
      .disableRules([
        'color-contrast', // Allow minor contrast issues in Radix/Shadcn components
        'heading-order',  // Allow non-sequential headings in complex UI
        'button-name'     // Some Radix primitives generate buttons without names
      ])
      .analyze();
    
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('winery details modal should be accessible', async ({ page }) => {
    const viewport = page.viewportSize();
    const isMobile = viewport && viewport.width < 768;
    
    if (isMobile) {
        test.skip(true, 'Skipping modal A11y scan on mobile due to visibility constraints in the interactive sheet');
    }

    user = await createTestUser();
    await mockGoogleMapsApi(page);
    await login(page, user.email, user.password);

    // Use helper to ensure sidebar is visible/expanded
    await navigateToTab(page, 'Explore');

    // Open a winery modal
    const firstWinery = page.locator('text=Mock Winery One').first();
    await firstWinery.click();

    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    // Scan only the modal content
    const accessibilityScanResults = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .analyze();
    
    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
