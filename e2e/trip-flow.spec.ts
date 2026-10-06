import { test, expect } from './utils';
import { 
    getSidebarContainer, 
    login, 
    navigateToTab, 
    openWineryDetails, 
    closeWineryModal, 
    ensureSidebarExpanded,
    expectTripInStore
} from './helpers';

test.describe('Trip Planning Flow', () => {
  test.beforeEach(async ({ page, user, mockMaps }) => {
    await page.addInitScript(() => { window._E2E_FULL_DRAWER = true; });
    // Re-initialize mocks with the actual user ID to ensure isOwner works
    await mockMaps.useRealVisits();
    await mockMaps.initDefaultMocks({ currentUserId: user.id });
    await login(page, user.email, user.password);
  });

  test('can create a new trip with initial winery stops from dialog', async ({ page }) => {
    await navigateToTab(page, 'Trips');
    await ensureSidebarExpanded(page);

    const sidebar = getSidebarContainer(page);

    // 1. Open "New Trip" dialog from sidebar
    const newTripButton = sidebar.getByRole('button', { name: 'New Trip' }).first();
    await newTripButton.scrollIntoViewIfNeeded();
    await expect(newTripButton).toBeVisible();
    await newTripButton.click();

    // 2. Assert dialog is visible
    const dialog = page.locator('[role="dialog"]').first();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: /Create a New Trip/i })).toBeVisible();

    const uniqueTripName = `E2E Multi-Stop Trip ${Date.now()}`;
    const nameInput = page.getByTestId('trip-name-input');
    await expect(nameInput).toBeVisible();
    await nameInput.fill(uniqueTripName);

    // 3. Search and select first winery via PlaceAutocomplete
    const autocompleteInput = page.getByTestId('place-autocomplete-input');
    await expect(autocompleteInput).toBeVisible();
    await autocompleteInput.fill('Mock Winery');

    const results = page.getByTestId('place-autocomplete-results');
    await expect(results).toBeVisible({ timeout: 10000 });

    const option1 = results.getByRole('option', { name: /Mock Winery One/i }).first();
    await expect(option1).toBeVisible();
    await option1.click();

    // 4. Assert clearOnSelect: clears input and closes results
    await expect(autocompleteInput).toHaveValue('');
    await expect(results).not.toBeVisible();

    // 5. Assert selected winery badge renders with removal button
    const wineriesList = page.getByTestId('selected-wineries-list');
    await expect(wineriesList).toBeVisible();
    const badge1 = wineriesList.getByTestId('selected-winery-ch-12345-mock-winery-1');
    await expect(badge1).toBeVisible();
    await expect(badge1).toContainText('Mock Winery One');
    const removeBadge1Btn = badge1.getByRole('button', { name: /Remove Mock Winery One/i });
    await expect(removeBadge1Btn).toBeVisible();

    // 6. Assert deduplication: re-selecting same winery does not duplicate badge
    await autocompleteInput.fill('Mock Winery');
    await expect(results).toBeVisible({ timeout: 10000 });
    await option1.click();
    await expect(autocompleteInput).toHaveValue('');
    await expect(wineriesList.locator('[data-testid^="selected-winery-"]')).toHaveCount(1);

    // 7. Assert badge removal and re-addition
    await removeBadge1Btn.click();
    await expect(wineriesList).not.toBeVisible();

    await autocompleteInput.fill('Mock Winery');
    await expect(results).toBeVisible({ timeout: 10000 });
    await option1.click();
    await expect(autocompleteInput).toHaveValue('');
    await expect(wineriesList).toBeVisible();
    await expect(badge1).toBeVisible();

    // 8. Search and select second winery
    await autocompleteInput.fill('Vineyard of Illusion');
    await expect(results).toBeVisible({ timeout: 10000 });

    const option2 = results.getByRole('option', { name: /Vineyard of Illusion/i }).first();
    await expect(option2).toBeVisible();
    await option2.click();

    // Assert second clearOnSelect and 2 badges present
    await expect(autocompleteInput).toHaveValue('');
    await expect(results).not.toBeVisible();

    const badge2 = wineriesList.getByTestId('selected-winery-ch-67890-mock-winery-2');
    await expect(badge2).toBeVisible();
    await expect(badge2).toContainText('Vineyard of Illusion');
    await expect(wineriesList.locator('[data-testid^="selected-winery-"]')).toHaveCount(2);

    // 9. Submit the form
    const submitBtn = page.getByTestId('create-trip-submit-btn');
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toBeEnabled();

    await Promise.all([
      page.waitForResponse(resp => (resp.url().includes('create_trip_with_winery') || resp.url().includes('create_trip')) && resp.status() === 200),
      submitBtn.click()
    ]);

    // 10. Assert dialog closes and trip appears in store
    await expect(dialog).not.toBeVisible({ timeout: 10000 });
    await expectTripInStore(page, uniqueTripName);

    // 11. Assert trip card displays correct pluralized badge ("2 Wineries") and enabled "Export to Google Maps" button (AC 15)
    const tripCard = sidebar.getByTestId('trip-card').filter({ hasText: uniqueTripName }).first();
    await expect(async () => {
      await page.evaluate(async () => {
        const store = window.useTripStore?.getState();
        if (store) await store.fetchTrips(1, 'upcoming', true);
      });
      await expect(tripCard).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 20000, intervals: [2000] });

    await tripCard.scrollIntoViewIfNeeded();
    await expect(tripCard.getByText('2 Wineries')).toBeVisible();

    const exportBtn = tripCard.getByRole('button', { name: 'Export to Google Maps' });
    await expect(exportBtn).toBeVisible();
    await expect(exportBtn).toBeEnabled();

    // 12. Cleanup: delete trip to maintain test isolation
    const deleteBtn = tripCard.getByTestId('delete-trip-btn');
    await expect(async () => {
      const alertDialog = page.locator('[role="alertdialog"]');
      if (!(await alertDialog.isVisible())) {
        await expect(deleteBtn).toBeVisible({ timeout: 5000 });
        await expect(deleteBtn).toBeEnabled({ timeout: 5000 });
        await deleteBtn.click();
        await expect(alertDialog).toBeVisible({ timeout: 5000 });
      }

      const confirmBtn = page.getByTestId('confirm-delete-trip-btn');
      await expect(confirmBtn).toBeVisible({ timeout: 5000 });
      await expect(confirmBtn).toBeEnabled({ timeout: 5000 });

      await Promise.all([
        page.waitForResponse(
          resp => (resp.url().includes('delete_trip') || (resp.url().includes('trips') && resp.request().method() === 'DELETE')) && [200, 204].includes(resp.status()),
          { timeout: 15000 }
        ),
        confirmBtn.click()
      ]);
    }).toPass({ timeout: 30000, intervals: [2000] });

    await expect(sidebar.getByText(uniqueTripName)).not.toBeVisible();
  });

  test('can create a new trip from winery details', async ({ page }) => {
    await navigateToTab(page, 'Explore');

    const uniqueTripName = `Flow Trip ${Date.now()}`;

    await openWineryDetails(page, 'Mock Winery One');

    const modal = page.locator('[data-testid="winery-modal-dialog"], [data-testid="tablet-winery-sheet"], [data-testid="winery-modal-drawer"], [role="dialog"]').first();
    await modal.getByRole('tab', { name: /Trip/i }).click();
    await expect(modal.getByRole('heading', { name: /Add to a Trip/i })).toBeVisible();

    await modal.getByRole('button', { name: 'Pick a date' }).click();
    
    // Select today's date - react-day-picker v9 puts data-today on the td cell
    const todayCell = page.locator('td[data-today="true"] button, button[aria-label*="Today"]').first();
    await expect(todayCell).toBeVisible({ timeout: 10000 });
    await todayCell.click();

    const planner = modal.getByTestId('trip-planner-section');
    await planner.getByTestId('new-trip-checkbox').check();
    await planner.getByTestId('new-trip-name-input').fill(uniqueTripName);
    
    const addBtn = planner.getByTestId('add-to-trip-btn');
    await expect(addBtn).toBeVisible({ timeout: 5000 });
    await expect(addBtn).toBeEnabled({ timeout: 5000 });
    
    // Wait for the RPC and the refresh calls
    await Promise.all([
        page.waitForResponse(resp => resp.url().includes('create_trip_with_winery') && resp.status() === 200),
        addBtn.click()
    ]);

    await expectTripInStore(page, uniqueTripName);
    await expect(modal.getByText(new RegExp(`On Trip: ${uniqueTripName}`))).toBeVisible();

    // --- Cleanup: Delete the trip ---
    await closeWineryModal(page);

    // 2. Navigate to Trips tab
    await navigateToTab(page, 'Trips');
    await ensureSidebarExpanded(page);

    const sidebar = getSidebarContainer(page);

    // 3. Find and delete the trip
    const tripCard = sidebar.getByTestId('trip-card').filter({ hasText: uniqueTripName }).first();
    
    await expect(async () => {
        // Proactive sync
        await page.evaluate(async () => {
            const store = window.useTripStore?.getState();
            if (store) await store.fetchTrips(1, 'upcoming', true);
        });
        await expect(tripCard).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 20000, intervals: [2000] });

    await tripCard.scrollIntoViewIfNeeded();
    
    const deleteBtn = tripCard.getByTestId('delete-trip-btn');
    
    // Firefox Stability: Use toPass for the whole deletion sequence to handle flaky dialogs/clicks
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
            page.waitForResponse(resp => (resp.url().includes('delete_trip') || (resp.url().includes('trips') && resp.request().method() === 'DELETE')) && [200, 204].includes(resp.status()), { timeout: 15000 }),
            confirmBtn.click()
        ]);
    }).toPass({ timeout: 30000, intervals: [2000] });

    // 5. Verify it is gone
    await expect(sidebar.getByText(uniqueTripName)).not.toBeVisible();
  });
});
