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
    if (user) {
      await deleteTestUser(user.id);
    }
  });

  test('can create a new trip from a winery', async ({ page }) => {
    const sidebarContainer = getSidebarContainer(page);
    await navigateToTab(page, 'Trips');
    await expect(sidebarContainer.getByRole('heading', { name: 'Plan a Trip' })).toBeVisible();
    await expect(sidebarContainer.getByRole('button', { name: 'New Trip' })).toBeVisible();
  });

  test('can create a new trip from winery details', async ({ page }) => {
    const sidebarContainer = getSidebarContainer(page);
    await navigateToTab(page, 'Explore');

    await expect(sidebarContainer.getByText('Wineries in View')).toBeVisible({ timeout: 15000 });
    
    // Wait for results
    const firstWinery = sidebarContainer.locator('.space-y-2 > div > p.font-medium').first();
    await expect(firstWinery).toBeVisible({ timeout: 15000 });
    await firstWinery.click();

    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await expect(modal.getByRole('heading', { name: /Add to a Trip/i })).toBeVisible();

    await modal.getByRole('button', { name: 'Pick a date' }).click();
    await page.getByRole('gridcell', { disabled: false }).first().click();

    const createCheckbox = modal.getByLabel('Create a new trip...');
    await createCheckbox.check();

    const nameInput = modal.getByPlaceholder('New trip name...');
    await nameInput.fill('Playwright Test Trip');

    await modal.getByRole('button', { name: 'Add to Trip' }).click();

    await expect(page.getByText('Winery added to trip(s).').first()).toBeVisible();
    await expect(modal.getByText(/On Trip: Playwright Test Trip/)).toBeVisible();
  });
});
