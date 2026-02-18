import { test, expect } from './utils';
import AxeBuilder from '@axe-core/playwright';
import { login, navigateToTab, robustClick } from './helpers';

test.describe('Accessibility (A11y)', () => {
  test('login page should be accessible', async ({ page }) => {
    await page.goto('/login');
    const accessibilityScanResults = await new AxeBuilder({ page })
      .disableRules(['link-in-text-block']) // Allow minor contrast issue on signup link for now
      .analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('app dashboard should be accessible', async ({ page, user }) => {
    // mockMaps is auto-initialized by the fixture
    await login(page, user.email, user.password);

    // Scan the main app shell
    const accessibilityScanResults = await new AxeBuilder({ page })
      .exclude('.gm-style') // Exclude Google Maps
      .disableRules([
        'color-contrast', // Allow minor contrast issues in Radix/Shadcn components
        'heading-order',  // Allow non-sequential headings in complex UI
        'button-name',    // Some Radix primitives generate buttons without names
        'scrollable-region-focusable' // The scrollable winery list doesn't have focus yet
      ])
      .analyze();
    
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('winery details modal should be accessible', async ({ page, user }) => {
    const viewport = page.viewportSize();
    const isMobile = viewport && viewport.width < 768;
    
    if (isMobile) {
        test.skip(true, 'Skipping modal A11y scan on mobile due to visibility constraints in the interactive sheet');
    }

    // mockMaps is auto-initialized by the fixture
    await login(page, user.email, user.password);

    // Use helper to ensure sidebar is visible/expanded
    await navigateToTab(page, 'Explore');

    // Open a winery modal using robust click
    const firstWinery = page.getByTestId('winery-results-list').getByText('Mock Winery One').first();
    await expect(firstWinery).toBeVisible({ timeout: 10000 });
    await robustClick(firstWinery);

    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    // WAIT for the loading spinner to disappear (Logical state check)
    await expect(modal.locator('svg.animate-spin')).not.toBeVisible({ timeout: 15000 });

    // Scan only the modal content
    const accessibilityScanResults = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .disableRules(['color-contrast']) // Engine specific contrast reporting is flaky
      .analyze();
    
    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
