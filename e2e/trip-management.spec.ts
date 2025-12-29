import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, TestUser, mockGoogleMapsApi } from './utils';
import { getSidebarContainer, login, navigateToTab } from './helpers';

test.describe('Trip Management Flow', () => {
  let user: TestUser;

  test.beforeEach(async ({ page }) => {
    user = await createTestUser();
    await mockGoogleMapsApi(page);
    await login(page, user.email, user.password);
  });

  test.afterEach(async () => {
    if (user) await deleteTestUser(user.id);
  });

  // Unskipped: Overlay issue is resolved.
  test('User can create, rename, and delete a trip', async ({ page }) => {
    const sidebar = getSidebarContainer(page);
    
    // 1. Navigate to Trips
    await navigateToTab(page, 'Trips');
    
    await expect(sidebar.locator('.animate-spin')).not.toBeVisible({ timeout: 10000 });
    
    // 2. Create New Trip directly
    const newTripBtn = sidebar.getByRole('button', { name: 'New Trip' });
    // Use standard click to verify accessibility
    await newTripBtn.click();
    
    // The Dialog renders in a Portal, so we check the global page
    const nameInput = page.getByPlaceholder('Trip Name');
    await expect(nameInput).toBeVisible();
    await nameInput.fill('Management Test Trip');
    
    // Save and wait for the refresh request to complete
    await Promise.all([
        page.waitForResponse(resp => resp.url().includes('rpc/get_paginated_wineries') || resp.url().includes('trips')),
        page.getByRole('button', { name: 'Create Trip' }).click()
    ]);
    
    // Ensure the dialog is gone
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Now check for the card - allow extra time for slower CI runners (Firefox)
    const tripCard = sidebar.locator('div.rounded-lg.border', { hasText: 'Management Test Trip' }).first();
    await expect(tripCard).toBeVisible({ timeout: 15000 });
    await tripCard.scrollIntoViewIfNeeded();

    // 3. Rename Trip
    // Use "View Details" to go to the full detail page
    // The button has an icon, so we use text matching
    const viewDetailsBtn = tripCard.getByText('View Details');
    await viewDetailsBtn.click();
    
    // 4. On the details page (Standalone, no sidebar)
    // Wait for the detailed view to load
    const editTripBtn = page.getByRole('button', { name: 'Edit Trip' });
    await expect(editTripBtn).toBeVisible({ timeout: 15000 });
    await editTripBtn.click();
    
    // Rename
    const editNameInput = page.getByPlaceholder('Trip Name');
    await expect(editNameInput).toBeVisible();
    await editNameInput.fill('Renamed Test Trip');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    
    await expect(page.getByText('Trip updated successfully.').first()).toBeVisible();
    
    // Navigate back to trips to verify deletion
    await page.getByRole('link', { name: 'Back to Map' }).click();
    await navigateToTab(page, 'Trips');

    // 5. Delete Trip
    // The delete button is on the TripCardSimple
    const updatedTripCard = sidebar.locator('div.rounded-lg.border', { hasText: 'Renamed Test Trip' }).first();
    await updatedTripCard.scrollIntoViewIfNeeded();
    
    // Use role and icon filter instead of CSS classes
    const deleteBtn = updatedTripCard.getByRole('button').filter({ has: page.locator('svg.lucide-trash2') });
    await deleteBtn.click();
    
    // Confirm deletion in the alert dialog
    await page.getByRole('button', { name: 'Delete' }).click();
    
    // Verify deleted
    await expect(sidebar.getByText('Renamed Test Trip')).not.toBeVisible();
  });
});