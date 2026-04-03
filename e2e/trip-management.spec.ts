/* eslint-disable no-console */
import { test, expect } from './utils';
import { 
    getSidebarContainer, 
    login, 
    navigateToTab, 
    ensureSidebarExpanded,
    expectTripInStore,
    expectTripDeletedFromStore
} from './helpers';

test.describe('Trip Management Flow', () => {
  test.beforeEach(async ({ page, user, mockMaps }) => {
    // Re-initialize mocks with the actual user ID to ensure isOwner works
    await mockMaps.useRealVisits();
    await mockMaps.useRealTrips(); // Standard for management/sharing tests
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
    await newTripBtn.click({ force: true });
    
    const tripForm = page.getByTestId('trip-form-card');
    await tripForm.getByTestId('trip-name-input').fill(uniqueTripName);
    
    // Save and wait for the RPC response
    await Promise.all([
        page.waitForResponse(resp => resp.url().includes('rpc/create_trip') && resp.status() === 200),
        tripForm.getByTestId('create-trip-submit-btn').click({ force: true })
    ]);
    
    await expectTripInStore(page, uniqueTripName);
    
    // Ensure the dialog is gone before checking the sidebar
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Give the UI a moment to re-render the list with proactive sync
    const tripCard = sidebar.getByTestId('trip-card').filter({ hasText: uniqueTripName }).first();
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
    await viewDetailsBtn.click({ force: true });
    
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

            // Check for our custom error states
            const alertError = page.locator('[role="alert"]').first();
            if (await alertError.isVisible()) {
                const errorText = await alertError.innerText();
                const isRealError = errorText.includes('Error Loading Trip') || errorText.includes('Access denied');
                
                if (isRealError) {
                    console.log(`[DIAGNOSTIC] REAL TRIP ERROR ALERT SEEN: ${errorText}`);
                    // Proactive retry: refresh the store if it failed
                    await page.evaluate(async (id) => {
                        const store = (window as any).useTripStore?.getState();
                        if (store) await store.fetchTripById(id);
                    }, tripId);
                    throw new Error(`Trip Error Alert: ${errorText}`);
                } else {
                    console.log(`[DIAGNOSTIC] Ignoring unrelated alert: ${errorText.substring(0, 50)}...`);
                }
            }

            const notFoundTitle = page.getByText('Trip Not Found');
            if (await notFoundTitle.isVisible()) {
                console.log(`[DIAGNOSTIC] 'Trip Not Found' state seen for ID: ${tripId}`);
                
                // Proactive retry: refresh the store
                await page.evaluate(async (id) => {
                    const store = (window as any).useTripStore?.getState();
                    if (store) await store.fetchTripById(id);
                }, tripId);
                
                throw new Error('Trip Not Found state active');
            }

            // Ensure no skeleton is visible
            const skeleton = page.getByTestId('trip-details-skeleton');
            const isSkeletonVisible = await skeleton.isVisible();
            
            if (isSkeletonVisible) {
                console.log(`[DIAGNOSTIC] Loading skeleton still visible for trip ${tripId}`);
                
                // If it's been too long, try to poke the store
                await page.evaluate(async (id) => {
                    const store = (window as any).useTripStore?.getState();
                    if (store && !store.isLoading) await store.fetchTripById(id);
                }, tripId);
                
                throw new Error('Loading skeleton still visible');
            }
            
            // Find title in main area
            const mainContent = page.locator('main');
            const title = mainContent.getByText(uniqueTripName, { exact: false }).first();
            await expect(title).toBeVisible({ timeout: 2000 });
        }).toPass({ timeout: 30000, intervals: [3000] });
    } catch (e) {
        console.log(`[DIAGNOSTIC] FAILED to find trip name. Dumping page content...`);
        const content = await page.content();
        console.log(content.substring(0, 2000));
        throw e;
    }
    
    const editTripBtn = page.getByLabel('Edit Trip');
    await expect(editTripBtn).toBeVisible({ timeout: 15000 });
    await editTripBtn.click({ force: true });
    
    // Rename
    const editNameInput = page.getByPlaceholder('Trip Name');
    await expect(editNameInput).toBeVisible();
    const renamedTripName = `Renamed ${uniqueTripName}`;
    await editNameInput.fill(renamedTripName);
    
    // Click "Save" button
    await Promise.all([
        page.waitForResponse(resp => [200, 204].includes(resp.status()) && (resp.url().includes('trips') || resp.url().includes('rpc'))),
        page.getByRole('button', { name: /Save/i }).first().click({ force: true })
    ]);
    
    await expectTripInStore(page, renamedTripName);
    
    // Verify name changed on page
    await expect(page.getByText(renamedTripName, { exact: false }).first()).toBeVisible({ timeout: 10000 });
    
    // Navigate back to trips to verify deletion
    page.getByRole('link', { name: 'Back to Map' }).click({ force: true });
    await navigateToTab(page, 'Trips');
    await ensureSidebarExpanded(page);

    // 5. Delete Trip
    const updatedTripCard = sidebar.getByTestId('trip-card').filter({ hasText: renamedTripName }).first();
    
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
    await deleteBtn.click({ force: true });
    
    // Confirm deletion and wait for response
    await Promise.all([
        page.waitForResponse(resp => (resp.url().includes('delete_trip') || (resp.url().includes('trips') && resp.request().method() === 'DELETE')) && [200, 204].includes(resp.status())),
        page.getByTestId('confirm-delete-trip-btn').click({ force: true })
    ]);
    
    await expectTripDeletedFromStore(page, renamedTripName);
    
    // Verify deleted
    await expect(sidebar.getByText(renamedTripName)).not.toBeVisible();
  });
});
