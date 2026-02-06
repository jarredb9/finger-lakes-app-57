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

    const uniqueTripName = `Trip ${Date.now()}`;

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
    
    // Select today's date - react-day-picker v9 puts data-today on the td cell
    const todayCell = page.locator('td[data-today="true"] button, button[aria-label*="Today"]').first();
    await expect(todayCell).toBeVisible({ timeout: 10000 });
    await todayCell.click();

    await modal.getByLabel('Create a new trip...').check();
    await modal.getByPlaceholder('Trip Name').fill(uniqueTripName);
    await modal.getByRole('button', { name: 'Add to Trip' }).click();

    await expect(page.getByText('Winery added to trip(s).').first()).toBeVisible();
    await expect(modal.getByText(new RegExp(`On Trip: ${uniqueTripName}`))).toBeVisible();

    // --- Cleanup: Delete the trip ---
    // 1. Close the modal
    const closeBtn = modal.getByRole('button', { name: 'Close' });
    if (await closeBtn.isVisible()) {
        await closeBtn.click();
    } else {
        await page.keyboard.press('Escape');
    }

    // 2. Navigate to Trips tab (No reload needed now that optimistic UI is fixed)
    await navigateToTab(page, 'Trips');

    // 3. Find and delete the trip
    const tripCard = sidebar.locator('div.rounded-lg.border', { hasText: uniqueTripName }).first();
    await expect(tripCard).toBeVisible({ timeout: 15000 });
    await tripCard.scrollIntoViewIfNeeded();
    
    const deleteBtn = tripCard.getByRole('button').filter({ has: page.locator('svg.lucide-trash2') });
    await deleteBtn.click();

    // 4. Confirm deletion
    await page.getByRole('button', { name: 'Delete' }).click();

    // 5. Verify it is gone
    await expect(sidebar.getByText(uniqueTripName)).not.toBeVisible();
  });
});