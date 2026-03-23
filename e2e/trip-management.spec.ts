/* eslint-disable no-console */
import { test, expect } from './utils';
import { 
    getSidebarContainer, 
    login, 
    navigateToTab, 
    ensureSidebarExpanded,
    robustClick,
    waitForToast
} from './helpers';

test.describe('Trip Management Flow', () => {
  test.beforeEach(async ({ page, user, mockMaps }) => {
    // Re-initialize mocks with the actual user ID to ensure isOwner works
    await mockMaps.useRealVisits();
    await mockMaps.initDefaultMocks({ currentUserId: user.id });
    await login(page, user.email, user.password);
  });

  test('User can create, rename, and delete a trip', async ({ page }) => {
    const sidebar = getSidebarContainer(page);
    
    // 1. Navigate to Trips
    await navigateToTab(page, 'Trips');
    await ensureSidebarExpanded(page);
    
    await expect(sidebar.locator('.animate-spin')).not.toBeVisible({ timeout: 10000 });
    
    // 2. Create New Trip directly
    const uniqueTripName = `Mgmt Trip ${Date.now()}`;
    const newTripBtn = sidebar.getByRole('button', { name: 'New Trip' });
    await robustClick(page, newTripBtn);
    
    const tripForm = page.getByTestId('trip-form-card');
    await tripForm.getByTestId('trip-name-input').fill(uniqueTripName);
    
    // Save and wait for the RPC response
    await Promise.all([
        page.waitForResponse(resp => resp.url().includes('rpc/create_trip') && resp.status() === 200),
        robustClick(page, tripForm.getByTestId('create-trip-submit-btn'))
    ]);
    
    await waitForToast(page, 'Trip created successfully!');
    
    // Ensure the dialog is gone before checking the sidebar
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Give the UI a moment to re-render the list
    const tripCard = sidebar.getByTestId('trip-card').filter({ hasText: uniqueTripName }).first();
    await expect(tripCard).toBeVisible({ timeout: 20000 });
    
    const tripId = (await tripCard.getAttribute('data-trip-id')) || '';
    console.log(`[DIAGNOSTIC] Trip created with ID: ${tripId}, Name: ${uniqueTripName}`);

    // 3. Rename Trip
    const viewDetailsBtn = tripCard.getByTestId('view-trip-details-btn');
    await robustClick(page, viewDetailsBtn);
    
    // 4. On the details page
    await expect(page).toHaveURL(new RegExp(`/trips/${tripId}`), { timeout: 15000 });
    try {
        await expect(async () => {
            // Check for Next.js error page
            const errorPage = page.locator('#__next_error__');
            if (await errorPage.isVisible()) {
                const errorTitle = await page.locator('h2, h1').first().innerText().catch(() => 'No title');
                const errorMsg = await page.locator('p').first().innerText().catch(() => 'No message');
                console.log(`[DIAGNOSTIC] Next.js ERROR PAGE: ${errorTitle} - ${errorMsg}`);
                throw new Error(`Next.js Error Page: ${errorTitle}`);
            }

            // Ensure no skeleton is visible
            const skeleton = page.locator('.animate-pulse, .bg-muted').first();
            const isSkeletonVisible = await skeleton.isVisible();
            
            const storeTrips = await page.evaluate(() => {
                // @ts-ignore
                return window.useTripStore.getState().trips.map(t => ({ id: t.id, name: t.name }));
            });
            
            if (isSkeletonVisible) {
                console.log(`[DIAGNOSTIC] Skeleton still visible. Store has ${storeTrips.length} trips.`);
                throw new Error('Loading skeleton still visible');
            }
            
            // Find title in main area
            const mainContent = page.locator('main');
            const title = mainContent.getByText(uniqueTripName, { exact: false }).first();
            await expect(title).toBeVisible({ timeout: 2000 });
        }).toPass({ timeout: 20000, intervals: [2000] });
    } catch (e) {
        console.log(`[DIAGNOSTIC] FAILED to find trip name. Dumping page content...`);
        const content = await page.content();
        console.log(content.substring(0, 2000)); // Log first 2000 chars
        throw e;
    }
    
    const editTripBtn = page.getByLabel('Edit Trip');
    await expect(editTripBtn).toBeVisible({ timeout: 15000 });
    await robustClick(page, editTripBtn);
    
    // Rename
    const editNameInput = page.getByPlaceholder('Trip Name');
    await expect(editNameInput).toBeVisible();
    const renamedTripName = `Renamed ${uniqueTripName}`;
    await editNameInput.fill(renamedTripName);
    
    // Click "Save" button
    await Promise.all([
        page.waitForResponse(resp => [200, 204].includes(resp.status()) && (resp.url().includes('trips') || resp.url().includes('rpc'))),
        robustClick(page, page.getByRole('button', { name: /Save/i }).first())
    ]);
    
    await waitForToast(page, 'Trip updated successfully.');
    
    // Verify name changed on page
    await expect(page.getByText(renamedTripName, { exact: false }).first()).toBeVisible({ timeout: 10000 });
    
    // Navigate back to trips to verify deletion
    await robustClick(page, page.getByRole('link', { name: 'Back to Map' }));
    await navigateToTab(page, 'Trips');
    await ensureSidebarExpanded(page);

    // 5. Delete Trip
    const updatedTripCard = sidebar.getByTestId('trip-card').filter({ hasText: renamedTripName }).first();
    await expect(updatedTripCard).toBeVisible({ timeout: 15000 });
    await updatedTripCard.scrollIntoViewIfNeeded();
    
    const deleteBtn = updatedTripCard.getByTestId('delete-trip-btn');
    await robustClick(page, deleteBtn);
    
    // Confirm deletion and wait for response
    await Promise.all([
        page.waitForResponse(resp => (resp.url().includes('delete_trip') || (resp.url().includes('trips') && resp.request().method() === 'DELETE')) && [200, 204].includes(resp.status())),
        robustClick(page, page.getByTestId('confirm-delete-trip-btn'))
    ]);
    
    await waitForToast(page, 'Trip deleted successfully.');
    
    // Verify deleted
    await expect(sidebar.getByText(renamedTripName)).not.toBeVisible();
  });
});
