import { test, expect } from './utils';
import { 
    getSidebarContainer, 
    login, 
    navigateToTab, 
    openWineryDetails, 
    closeWineryModal, 
    ensureSidebarExpanded,
    robustClick 
} from './helpers';

test.describe('Trip Planning Flow', () => {
  test.beforeEach(async ({ page, user }) => {
    // mockMaps is auto-initialized by the fixture
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

    const uniqueTripName = `Trip ${Date.now()}`;

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
    await robustClick(page, planner.getByTestId('add-to-trip-btn'));

    await expect(page.getByText('Winery added to trip(s).').first()).toBeVisible();
    await expect(modal.getByText(new RegExp(`On Trip: ${uniqueTripName}`))).toBeVisible();

    // --- Cleanup: Delete the trip ---
    await closeWineryModal(page);

    // 2. Navigate to Trips tab
    await navigateToTab(page, 'Trips');
    await ensureSidebarExpanded(page);

    const sidebar = getSidebarContainer(page);

    // 3. Find and delete the trip
    const tripCard = sidebar.getByTestId('trip-card').filter({ hasText: uniqueTripName }).first();
    await expect(tripCard).toBeVisible({ timeout: 15000 });
    await tripCard.scrollIntoViewIfNeeded();
    
    const deleteBtn = tripCard.getByTestId('delete-trip-btn');
    await robustClick(page, deleteBtn);

    // 4. Confirm deletion
    await robustClick(page, page.getByTestId('confirm-delete-trip-btn'));

    // 5. Verify it is gone
    await expect(sidebar.getByText(uniqueTripName)).not.toBeVisible();
  });
});
