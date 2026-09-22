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
    clearServiceWorkers,
    openWineryDetails,
    closeWineryModal,
    waitForMapReady
} from './helpers';

test.describe('Trip Management Flow', () => {
  test.beforeEach(async ({ page, user, mockMaps }) => {
    await page.addInitScript(() => {
      window._E2E_FULL_DRAWER = true;
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
            const store = window.useTripStore?.getState();
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
            const store = window.useTripStore?.getState();
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

  test('User can reorder trip stops using drag-and-drop', async ({ page }) => {
    test.setTimeout(180000);

    const uniqueTripName = `Reorder Trip ${Date.now()}`;

    // 1. Multi-Stop Trip Initialization:
    // Navigate to Explore tab to add two stops to the itinerary
    await navigateToTab(page, 'Explore');
    await waitForMapReady(page);

    // Stop 0: Add Mock Winery One to a new trip
    await openWineryDetails(page, 'Mock Winery One');
    const modal1 = page.locator('[data-testid="winery-modal-dialog"], [data-testid="tablet-winery-sheet"], [data-testid="winery-modal-drawer"], [role="dialog"]').first();
    await modal1.getByRole('tab', { name: /Trip/i }).click();
    await expect(modal1.getByRole('heading', { name: /Add to a Trip/i })).toBeVisible();

    await modal1.getByRole('button', { name: 'Pick a date' }).click();
    const todayCell1 = page.locator('td[data-today="true"] button, button[aria-label*="Today"]').first();
    await expect(todayCell1).toBeVisible({ timeout: 10000 });
    await todayCell1.click();

    const planner1 = modal1.getByTestId('trip-planner-section');
    await planner1.getByTestId('new-trip-checkbox').check();
    await planner1.getByTestId('new-trip-name-input').fill(uniqueTripName);

    const addBtn1 = planner1.getByTestId('add-to-trip-btn');
    await expect(addBtn1).toBeVisible({ timeout: 5000 });
    await expect(addBtn1).toBeEnabled({ timeout: 5000 });

    const [createTripResp] = await Promise.all([
      page.waitForResponse(resp => resp.url().includes('create_trip_with_winery') && resp.status() >= 200 && resp.status() < 300),
      addBtn1.click()
    ]);
    const createTripData = await createTripResp.json();
    const winery1Id = createTripData.winery_id;

    await expectTripInStore(page, uniqueTripName);
    await expect(modal1.getByText(new RegExp(`On Trip: ${uniqueTripName}`))).toBeVisible();
    await closeWineryModal(page);

    // Stop 1: Add Vineyard of Illusion to the same trip
    await openWineryDetails(page, 'Vineyard of Illusion');
    const modal2 = page.locator('[data-testid="winery-modal-dialog"], [data-testid="tablet-winery-sheet"], [data-testid="winery-modal-drawer"], [role="dialog"]').first();
    await modal2.getByRole('tab', { name: /Trip/i }).click();
    await expect(modal2.getByRole('heading', { name: /Add to a Trip/i })).toBeVisible();

    await modal2.getByRole('button', { name: 'Pick a date' }).click();
    const todayCell2 = page.locator('td[data-today="true"] button, button[aria-label*="Today"]').first();
    await expect(todayCell2).toBeVisible({ timeout: 10000 });
    await todayCell2.click();

    const planner2 = modal2.getByTestId('trip-planner-section');
    const tripOption = planner2.locator('[data-testid^="trip-option-"]').filter({ hasText: uniqueTripName }).first();
    await expect(tripOption).toBeVisible({ timeout: 10000 });
    const tripCheckbox = tripOption.getByRole('checkbox');
    await tripCheckbox.click();
    await expect(tripCheckbox).toBeChecked();

    const addBtn2 = planner2.getByTestId('add-to-trip-btn');
    await expect(addBtn2).toBeVisible({ timeout: 5000 });
    await expect(addBtn2).toBeEnabled({ timeout: 5000 });

    const [addWineryResp] = await Promise.all([
      page.waitForResponse(resp => resp.url().includes('add_winery_to_trip') && resp.status() >= 200 && resp.status() < 300),
      addBtn2.click()
    ]);
    const addWineryData = await addWineryResp.json();
    const winery2Id = addWineryData.winery_id;

    await expect(modal2.getByText(new RegExp(`On Trip: ${uniqueTripName}`))).toBeVisible();
    await closeWineryModal(page);

    // 2. Navigate to Trip Details
    await navigateToTab(page, 'Trips');
    await ensureSidebarExpanded(page);
    await waitForSignal(page, 'trip-list-container', 'ready');

    const sidebar = getSidebarContainer(page);
    const tripCard = sidebar.getByTestId('trip-card').filter({ hasText: uniqueTripName }).first();
    await expect(async () => {
      await page.evaluate(async () => {
        const store = window.useTripStore?.getState();
        if (store) await store.fetchTrips(1, 'upcoming', true);
      });
      await expect(tripCard).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 20000, intervals: [2000] });

    const tripId = (await tripCard.getAttribute('data-trip-id')) || '';
    const viewDetailsBtn = tripCard.getByTestId('view-trip-details-btn');
    await viewDetailsBtn.click();

    await expect(page).toHaveURL(new RegExp(`/trips/${tripId}`), { timeout: 15000 });
    await waitForSignal(page, 'trip-details-card', 'ready');

    const wineryList = page.getByTestId('winery-list');
    await expect(wineryList).toBeVisible({ timeout: 10000 });

    const stops = wineryList.locator('[data-rfd-draggable-id]');
    await expect(stops).toHaveCount(2, { timeout: 10000 });
    await expect(stops.nth(0)).toContainText('Mock Winery One');
    await expect(stops.nth(1)).toContainText('Vineyard of Illusion');

    // 3. Simulate Drag-and-Drop Reordering via Accessible Keyboard Sensors
    // @hello-pangea/dnd drives drag-and-drop via handle.focus() -> Space (lift) -> ArrowDown (move) -> Space (drop)
    const dragHandle0 = wineryList.locator('[data-rfd-drag-handle-draggable-id]').first();
    await expect(dragHandle0).toBeVisible({ timeout: 5000 });

    const reorderRpcPromise = page.waitForResponse(
      resp => resp.url().includes('reorder_trip_wineries') && resp.status() < 300,
      { timeout: 15000 }
    );

    await dragHandle0.focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Space');

    // 4. Verify RPC Payload & Transient DOM Update
    const reorderResponse = await reorderRpcPromise;
    const postData = JSON.parse(reorderResponse.request().postData() || '{}');
    expect(Number(postData.p_trip_id)).toBe(Number(tripId));
    expect(postData.p_winery_ids).toEqual([winery2Id, winery1Id]);

    // Verify DOM re-render with inverted stop positions
    await expect(stops.nth(0)).toContainText('Vineyard of Illusion');
    await expect(stops.nth(1)).toContainText('Mock Winery One');

    // 5. Verify Persistence Across Reload
    await page.reload();
    await waitForAppReady(page);
    await waitForSignal(page, 'trip-details-card', 'ready');

    const reloadedWineryList = page.getByTestId('winery-list');
    await expect(reloadedWineryList).toBeVisible({ timeout: 10000 });
    const reloadedStops = reloadedWineryList.locator('[data-rfd-draggable-id]');
    await expect(reloadedStops).toHaveCount(2, { timeout: 10000 });
    await expect(reloadedStops.nth(0)).toContainText('Vineyard of Illusion');
    await expect(reloadedStops.nth(1)).toContainText('Mock Winery One');

    // 6. Cleanup: Delete the trip
    await page.goto('/');
    await waitForAppReady(page);
    await navigateToTab(page, 'Trips');
    await ensureSidebarExpanded(page);

    const finalSidebar = getSidebarContainer(page);
    const finalTripCard = finalSidebar.getByTestId('trip-card').filter({ hasText: uniqueTripName }).first();

    await expect(async () => {
      await page.evaluate(async () => {
        const store = window.useTripStore?.getState();
        if (store) await store.fetchTrips(1, 'upcoming', true);
      });
      await expect(finalTripCard).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 20000, intervals: [2000] });

    await finalTripCard.scrollIntoViewIfNeeded();
    const deleteBtn = finalTripCard.getByTestId('delete-trip-btn');

    await expect(async () => {
      const dialog = page.locator('[role="alertdialog"]');
      if (!(await dialog.isVisible())) {
        await expect(deleteBtn).toBeVisible({ timeout: 5000 });
        await expect(deleteBtn).toBeEnabled({ timeout: 5000 });
        await deleteBtn.click();
        await expect(dialog).toBeVisible({ timeout: 5000 });
      }

      const confirmBtn = page.getByTestId('confirm-delete-trip-btn');
      await expect(confirmBtn).toBeVisible({ timeout: 5000 });
      await expect(confirmBtn).toBeEnabled({ timeout: 5000 });

      await Promise.all([
        page.waitForResponse(
          resp => (resp.url().includes('delete_trip') || (resp.url().includes('trips') && resp.request().method() === 'DELETE')) && resp.status() < 300,
          { timeout: 15000 }
        ),
        confirmBtn.click()
      ]);
    }).toPass({ timeout: 30000, intervals: [2000] });

    await expectTripDeletedFromStore(page, uniqueTripName);
    await expect(finalSidebar.getByText(uniqueTripName)).not.toBeVisible({ timeout: 10000 });
  });
});
