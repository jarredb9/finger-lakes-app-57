import { test, expect } from './utils';
import { getSidebarContainer, login, navigateToTab } from './helpers';

test.describe('Trip Management Flow', () => {
  test.beforeEach(async ({ page, user }) => {
    // mockMaps is auto-initialized by the fixture
    await login(page, user.email, user.password);
  });

  test('User can create, rename, and delete a trip', async ({ page }) => {
    const sidebar = getSidebarContainer(page);
    
    // 1. Navigate to Trips
    await navigateToTab(page, 'Trips');
    
    // Expand sheet on mobile to ensure visibility
    const expandButton = page.getByRole('button', { name: 'Expand to full screen' });
    if (await expandButton.isVisible()) {
        await expandButton.click();
        await expect(page.getByTestId('mobile-sidebar-container')).toHaveClass(/h-\[calc\(100vh-4rem\)\]/);
    }
    
    await expect(sidebar.locator('.animate-spin')).not.toBeVisible({ timeout: 10000 });
    
    // 2. Create New Trip directly
    const newTripBtn = sidebar.getByRole('button', { name: 'New Trip' });
    await newTripBtn.click();
    
    const nameInput = page.getByPlaceholder('Trip Name');
    await expect(nameInput).toBeVisible();
    await nameInput.fill('Management Test Trip');
    
    // Save and wait for the refresh request to complete
    await Promise.all([
        page.waitForResponse(resp => resp.url().includes('rpc/get_paginated_wineries') || resp.url().includes('trips')),
        page.getByRole('button', { name: 'Create Trip' }).click()
    ]);
    
    // Ensure the dialog is gone before checking the sidebar
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Give the UI a moment to re-render the list
    const tripCard = sidebar.locator('div.rounded-lg.border', { hasText: 'Management Test Trip' }).first();
    await expect(tripCard).toBeVisible({ timeout: 20000 });
    await tripCard.scrollIntoViewIfNeeded();

    // 3. Rename Trip
    const viewDetailsBtn = tripCard.getByText('View Details');
    await viewDetailsBtn.click();
    
    // 4. On the details page
    const editTripBtn = page.getByRole('button', { name: 'Edit Trip' });
    await expect(editTripBtn).toBeVisible({ timeout: 15000 });
    await editTripBtn.click();
    
    // Rename
    const editNameInput = page.getByPlaceholder('Trip Name');
    await expect(editNameInput).toBeVisible();
    await editNameInput.fill('Renamed Test Trip');
    
    await Promise.all([
        page.waitForResponse(resp => [200, 201, 204].includes(resp.status()) && (resp.url().includes('trips') || resp.url().includes('rpc'))),
        page.getByRole('button', { name: 'Save Changes' }).click()
    ]);
    
    await expect(page.getByText('Trip updated successfully.').first()).toBeVisible();
    
    // Navigate back to trips to verify deletion
    await page.getByRole('link', { name: 'Back to Map' }).click();
    await navigateToTab(page, 'Trips');

    // 5. Delete Trip
    const updatedTripCard = sidebar.locator('div.rounded-lg.border', { hasText: 'Renamed Test Trip' }).first();
    await updatedTripCard.scrollIntoViewIfNeeded();
    
    const deleteBtn = updatedTripCard.getByRole('button').filter({ has: page.locator('svg.lucide-trash2') });
    await deleteBtn.click();
    
    // Confirm deletion and wait for response
    await Promise.all([
        page.waitForResponse(resp => resp.url().includes('rpc/delete_trip') || (resp.url().includes('trips') && resp.request().method() === 'DELETE')),
        page.getByRole('button', { name: 'Delete' }).click()
    ]);
    
    // Verify deleted
    await expect(sidebar.getByText('Renamed Test Trip')).not.toBeVisible();
  });
});
