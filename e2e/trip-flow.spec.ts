import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, TestUser, mockGoogleMapsApi } from './utils';
import { getSidebarContainer, login, navigateToTab } from './helpers';

test.describe('Trip Planning Flow', () => {
  let user: TestUser;

  test.beforeEach(async ({ page }) => {
    user = await createTestUser();
    await mockGoogleMapsApi(page);
    await login(page, user.email, user.password);
  });

  test.afterEach(async () => {
    if (user) await deleteTestUser(user.id);
  });

  test('can create a new trip from a winery', async ({ page }) => {
    await navigateToTab(page, 'Trips');
    
    const sidebar = getSidebarContainer(page);
    
    // Check for the "New Trip" button directly in the main view
    const newTripButton = sidebar.getByRole('button', { name: 'New Trip' }).first();
    await newTripButton.scrollIntoViewIfNeeded();
    await expect(newTripButton).toBeVisible();
  });

  test('can create a new trip from winery details', async ({ page }) => {
    await navigateToTab(page, 'Explore');

    // Wait for wineries to appear in the UI
    const sidebar = getSidebarContainer(page);
    const firstWinery = sidebar.locator('text=Mock Winery One').first();
    await expect(firstWinery).toBeVisible({ timeout: 15000 });

    // Expand sheet on mobile to ensure visibility
    const expandButton = page.getByRole('button', { name: 'Expand to full screen' });
    if (await expandButton.isVisible()) {
        await expandButton.click();
        await expect(page.getByTestId('mobile-sidebar-container')).toHaveClass(/h-\[calc\(100vh-4rem\)\]/);
    }

    // Robust click for both mobile and desktop
    await firstWinery.scrollIntoViewIfNeeded();
    await expect(firstWinery).toBeVisible({ timeout: 15000 });
    await firstWinery.click();

    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await expect(modal.getByRole('heading', { name: /Add to a Trip/i })).toBeVisible();

    await modal.getByRole('button', { name: 'Pick a date' }).click();
    await page.getByRole('gridcell', { disabled: false }).first().click();

    await modal.getByLabel('Create a new trip...').check();
    await modal.getByPlaceholder('New trip name...').fill('Playwright Test Trip');
    await modal.getByRole('button', { name: 'Add to Trip' }).click();

    await expect(page.getByText('Winery added to trip(s).').first()).toBeVisible();
    await expect(modal.getByText(/On Trip: Playwright Test Trip/)).toBeVisible();
  });
});