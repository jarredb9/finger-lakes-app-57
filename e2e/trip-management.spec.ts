import { test, expect } from './utils';
import { 
    getSidebarContainer, 
    login, 
    navigateToTab, 
    ensureSidebarExpanded,
    robustClick 
} from './helpers';

test.describe('Trip Management Flow', () => {
  test.beforeEach(async ({ page, user }) => {
    // mockMaps is auto-initialized by the fixture
    await login(page, user.email, user.password);
  });

  test('User can create, rename, and delete a trip', async ({ page }) => {
    const sidebar = getSidebarContainer(page);
    
    // 1. Navigate to Trips
    await navigateToTab(page, 'Trips');
    await ensureSidebarExpanded(page);
    
    await expect(sidebar.locator('.animate-spin')).not.toBeVisible({ timeout: 10000 });
    
    // 2. Create New Trip directly
    const newTripBtn = sidebar.getByRole('button', { name: 'New Trip' });
    await robustClick(page, newTripBtn);
    
    const tripForm = page.getByTestId('trip-form-card');
    await tripForm.getByTestId('trip-name-input').fill('Management Test Trip');
    
    // Save and wait for the refresh request to complete
    await Promise.all([
        page.waitForResponse(resp => resp.url().includes('rpc/get_paginated_wineries') || resp.url().includes('trips')),
        robustClick(page, tripForm.getByTestId('create-trip-submit-btn'))
    ]);
    
    // Ensure the dialog is gone before checking the sidebar
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Give the UI a moment to re-render the list
    const tripCard = sidebar.getByTestId('trip-card').filter({ hasText: 'Management Test Trip' }).first();
    await expect(tripCard).toBeVisible({ timeout: 20000 });
    await tripCard.scrollIntoViewIfNeeded();

    // 3. Rename Trip
    const viewDetailsBtn = tripCard.getByTestId('view-trip-details-btn');
    await robustClick(page, viewDetailsBtn);
    
    // 4. On the details page
    const editTripBtn = page.getByRole('button', { name: 'Edit Trip' });
    await expect(editTripBtn).toBeVisible({ timeout: 15000 });
    await robustClick(page, editTripBtn);
    
    // Rename
    const editNameInput = page.getByPlaceholder('Trip Name');
    await expect(editNameInput).toBeVisible();
    await editNameInput.fill('Renamed Test Trip');
    
    await Promise.all([
        page.waitForResponse(resp => [200, 201, 204].includes(resp.status()) && (resp.url().includes('trips') || resp.url().includes('rpc'))),
        robustClick(page, page.getByRole('button', { name: 'Save Changes' }))
    ]);
    
    await expect(page.getByText('Trip updated successfully.').first()).toBeVisible();
    
    // Navigate back to trips to verify deletion
    await robustClick(page, page.getByRole('link', { name: 'Back to Map' }));
    await navigateToTab(page, 'Trips');
    await ensureSidebarExpanded(page);

    // 5. Delete Trip
    const updatedTripCard = sidebar.getByTestId('trip-card').filter({ hasText: 'Renamed Test Trip' }).first();
    await updatedTripCard.scrollIntoViewIfNeeded();
    
    const deleteBtn = updatedTripCard.getByTestId('delete-trip-btn');
    await robustClick(page, deleteBtn);
    
    // Confirm deletion and wait for response
    await Promise.all([
        page.waitForResponse(resp => resp.url().includes('rpc/delete_trip') || (resp.url().includes('trips') && resp.request().method() === 'DELETE')),
        robustClick(page, page.getByTestId('confirm-delete-trip-btn'))
    ]);
    
    // Verify deleted
    await expect(sidebar.getByText('Renamed Test Trip')).not.toBeVisible();
  });
});
