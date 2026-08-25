/* eslint-disable no-console */
import { test, expect } from './utils';
import { 
    getSidebarContainer, 
    login, 
    navigateToTab, 
    ensureSidebarExpanded,
    expectTripInStore,
    expectTripDeletedFromStore,
    waitForSignal,
    waitForAppReady,
    clearServiceWorkers
} from './helpers';

test.describe('Trip Management Flow', () => {
  test.beforeEach(async ({ page, user, mockMaps }) => {
    await page.addInitScript(() => {
      (window as any)._E2E_FULL_DRAWER = true;
    });
    await clearServiceWorkers(page);

    // Re-initialize mocks with the actual user ID to ensure isOwner works
    await mockMaps.useRealVisits();
    await mockMaps.useRealTrips();
    await mockMaps.initDefaultMocks({ currentUserId: user.id });
    await login(page, user.email, user.password, { skipMapReady: true });
  });

  test('User can create, rename, and delete a trip', async ({ page }) => {
    test.setTimeout(180000);
    
    // 1. Navigate to Trips
    await navigateToTab(page, 'Trips');
    await ensureSidebarExpanded(page);
    
    // Use signal-based synchronization
    await waitForSignal(page, 'trip-list-container', 'ready');
    
    // 2. Open Create Trip Dialog (Self-healing & resilient without force: true)
    const uniqueTripName = `Mgmt Trip ${Date.now()}`;
    await expect(async () => {
        const tripForm = page.getByTestId('trip-form-card');
        if (!(await tripForm.isVisible())) {
            const activeSidebar = getSidebarContainer(page);
            const newTripBtn = activeSidebar.getByRole('button', { name: /New Trip/i }).first();
            await expect(newTripBtn).toBeVisible({ timeout: 3000 });
            await newTripBtn.click();
        }
        await expect(tripForm).toBeVisible({ timeout: 5000 });
        await expect(tripForm).toHaveAttribute('data-state', 'ready', { timeout: 5000 });
    }).toPass({ timeout: 20000, intervals: [1000] });

    // Fill form
    const tripForm = page.getByTestId('trip-form-card');
    await tripForm.getByTestId('trip-name-input').fill(uniqueTripName);
    
    // Ensure button is enabled (isValid should be true after filling name)
    const submitBtn = tripForm.getByTestId('create-trip-submit-btn');
    await expect(submitBtn).toBeEnabled({ timeout: 10000 });

    // Save and wait for the RPC response
    await Promise.all([
        page.waitForResponse(resp => resp.url().includes('rpc/create_trip') && resp.status() >= 200 && resp.status() < 300),
        submitBtn.click()
    ]);
    
    await expectTripInStore(page, uniqueTripName);
    
    // Ensure the dialog is gone before checking the sidebar
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 });

    // Re-fetch sidebar after navigation/dialog closure for stability
    const activeSidebar = getSidebarContainer(page);

    // Give the UI a moment to re-render the list with proactive sync
    const tripCard = activeSidebar.getByTestId('trip-card').filter({ hasText: uniqueTripName }).first();
    await expect(async () => {
        await page.evaluate(async () => {
            const store = (window as any).useTripStore?.getState();
            if (store) await store.fetchTrips(1, 'upcoming', true);
        });
        await expect(tripCard).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 20000, intervals: [2000] });
    
    const tripId = (await tripCard.getAttribute('data-trip-id')) || '';
    console.log(`[DIAGNOSTIC] Trip created with ID: ${tripId}, Name: ${uniqueTripName}`);

    // 3. Rename Trip
    const viewDetailsBtn = tripCard.getByTestId('view-trip-details-btn');
    await viewDetailsBtn.click();
    
    // 4. On the details page
    await expect(page).toHaveURL(new RegExp(`/trips/${tripId}`), { timeout: 15000 });
    await waitForSignal(page, 'trip-details-card', 'ready');
    await expect(page.locator('main').getByText(uniqueTripName, { exact: false }).first()).toBeVisible({ timeout: 15000 });
    
    const editTripBtn = page.getByLabel('Edit Trip');
    await expect(editTripBtn).toBeVisible({ timeout: 15000 });
    await editTripBtn.click();
    
    // Rename
    const editNameInput = page.getByPlaceholder('Trip Name');
    await expect(editNameInput).toBeVisible({ timeout: 5000 });
    const renamedTripName = `Renamed ${uniqueTripName}`;
    await editNameInput.fill(renamedTripName);
    
    // Click "Save" button
    const saveBtn = page.getByRole('button', { name: /Save/i }).first();
    await expect(saveBtn).toBeEnabled({ timeout: 5000 });
    await Promise.all([
        page.waitForResponse(resp => resp.status() < 300 && (resp.url().includes('trips') || resp.url().includes('rpc'))),
        saveBtn.click()
    ]);
    
    await expectTripInStore(page, renamedTripName);
    
    // Verify name changed on page
    await expect(page.getByText(renamedTripName, { exact: false }).first()).toBeVisible({ timeout: 10000 });
    
    // Navigate back to trips to verify deletion
    await page.goto('/');
    await waitForAppReady(page);
    await navigateToTab(page, 'Trips');
    await ensureSidebarExpanded(page);
    
    // 5. Delete Trip
    const finalSidebar = getSidebarContainer(page);
    const updatedTripCard = finalSidebar.getByTestId('trip-card').filter({ hasText: renamedTripName }).first();
    
    await expect(async () => {
        // Proactive sync to ensure rename is reflected in the list
        await page.evaluate(async () => {
            const store = (window as any).useTripStore?.getState();
            if (store) await store.fetchTrips(1, 'upcoming', true);
        });
        await expect(updatedTripCard).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 20000, intervals: [2000] });

    await updatedTripCard.scrollIntoViewIfNeeded();
    
    const deleteBtn = updatedTripCard.getByTestId('delete-trip-btn');
    
    await expect(async () => {
        const dialog = page.locator('[role="alertdialog"]');
        if (!(await dialog.isVisible())) {
            await deleteBtn.click();
            await expect(dialog).toBeVisible({ timeout: 5000 });
        }
        
        const confirmBtn = page.getByTestId('confirm-delete-trip-btn');
        await expect(confirmBtn).toBeVisible({ timeout: 5000 });

        await Promise.all([
            page.waitForResponse(resp => (resp.url().includes('delete_trip') || (resp.url().includes('trips') && resp.request().method() === 'DELETE')) && resp.status() < 300, { timeout: 15000 }),
            confirmBtn.click()
        ]);
    }).toPass({ timeout: 30000, intervals: [2000] });
    
    await expectTripDeletedFromStore(page, renamedTripName);
    
    // Verify deleted from UI using fresh container lookup
    await expect(finalSidebar.getByText(renamedTripName)).not.toBeVisible({ timeout: 10000 });
  });
});
