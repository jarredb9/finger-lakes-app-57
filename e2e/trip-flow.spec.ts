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
    // Re-initialize mocks with the actual user ID to ensure isOwner works
    await mockMaps.useRealVisits();
    await mockMaps.initDefaultMocks({ currentUserId: user.id });
    await login(page, user.email, user.password);
  });

  test('can create a new trip from a winery', async ({ page }) => {
    await navigateToTab(page, 'Trips');
    await ensureSidebarExpanded(page);
    
    const sidebar = getSidebarContainer(page);
    
    // Check for the "New Trip" button directly in the main view
    const newTripButton = sidebar.getByRole('button', { name: 'New Trip' }).first();
    await newTripButton.scrollIntoViewIfNeeded();
    await expect(newTripButton).toBeVisible();
  });

  test('can create a new trip from winery details', async ({ page }) => {
    await navigateToTab(page, 'Explore');

    const uniqueTripName = `Flow Trip ${Date.now()}`;

    await openWineryDetails(page, 'Mock Winery One');

    const modal = page.getByRole('dialog');
    await expect(modal.getByRole('heading', { name: /Add to a Trip/i })).toBeVisible();

    await modal.getByRole('button', { name: 'Pick a date' }).click();
    
    // Select today's date - react-day-picker v9 puts data-today on the td cell
    const todayCell = page.locator('td[data-today="true"] button, button[aria-label*="Today"]').first();
    await expect(todayCell).toBeVisible({ timeout: 10000 });
    await todayCell.click();

    const planner = modal.getByTestId('trip-planner-section');
    await planner.getByTestId('new-trip-checkbox').check();
    await planner.getByTestId('new-trip-name-input').fill(uniqueTripName);
    
    // Wait for the RPC and the refresh calls
    await Promise.all([
        page.waitForResponse(resp => resp.url().includes('create_trip_with_winery') && resp.status() === 200),
        planner.getByTestId('add-to-trip-btn').click({ force: true })
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
            const store = (window as any).useTripStore?.getState();
            if (store) await store.fetchTrips(1, 'upcoming', true);
        });
        await expect(tripCard).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 20000, intervals: [2000] });

    await tripCard.scrollIntoViewIfNeeded();
    
    const deleteBtn = tripCard.getByTestId('delete-trip-btn');
    await deleteBtn.click({ force: true });

    // 4. Confirm deletion and wait for response
    await Promise.all([
        page.waitForResponse(resp => (resp.url().includes('delete_trip') || (resp.url().includes('trips') && resp.request().method() === 'DELETE')) && [200, 204].includes(resp.status())),
        page.getByTestId('confirm-delete-trip-btn').click({ force: true })
    ]);

    // 5. Verify it is gone
    await expect(sidebar.getByText(uniqueTripName)).not.toBeVisible();
  });
});
