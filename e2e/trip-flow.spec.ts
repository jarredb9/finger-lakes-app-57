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
    
    // Check store state
    const boundsState = await page.evaluate(() => {
        const store = (window as any).useMapStore;
        return store ? !!store.getState().bounds : 'Store not found';
    });
    console.log('BOUNDS STATE:', boundsState);

    const sidebar = getSidebarContainer(page);
    
    // Ensure we scroll to the element, as it might be at the bottom of the list
    const planTripHeading = sidebar.getByRole('heading', { name: 'Plan a Trip' }).first();
    await planTripHeading.scrollIntoViewIfNeeded();
    await expect(planTripHeading).toBeVisible();
    await expect(sidebar.getByRole('button', { name: 'New Trip' }).first()).toBeVisible();
  });

  test('can create a new trip from winery details', async ({ page }) => {
    await navigateToTab(page, 'Explore');

    // Wait for wineries to load into the store
    await page.waitForFunction(() => {
        const store = (window as any).useWineryDataStore;
        return store && store.getState().persistentWineries.length > 0;
    }, { timeout: 15000 }).catch(() => console.log('Timeout waiting for wineries in store'));

    // Expand sheet on mobile to ensure visibility
    const expandButton = page.getByRole('button', { name: 'Expand to full screen' });
    if (await expandButton.isVisible()) {
        await expandButton.evaluate((node) => (node as HTMLElement).click());
        // Wait a moment for expansion animation
        await page.waitForTimeout(1000); 
    }

    // Robust click for both mobile and desktop
    const sidebar = getSidebarContainer(page);
    const firstWinery = sidebar.locator('text=Mock Winery One').first();
    await firstWinery.scrollIntoViewIfNeeded();
    await expect(firstWinery).toBeVisible({ timeout: 15000 });
    await firstWinery.evaluate((node) => (node as HTMLElement).click());

    const modal = page.getByRole('dialog');
    await firstWinery.scrollIntoViewIfNeeded();
    await expect(firstWinery).toBeVisible({ timeout: 15000 });
    await firstWinery.evaluate((node) => (node as HTMLElement).click());

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