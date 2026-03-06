import { test, expect } from './utils';
import { 
  login, 
  navigateToTab, 
  robustClick, 
  waitForToast,
  getSidebarContainer,
  ensureSidebarExpanded,
  waitForAppReady
} from './helpers';

test.describe('Trip Sharing Flow', () => {
  const mockTripId = 12345;
  const mockTripName = 'E2E Test Trip';

  test.beforeEach(async ({ page, user }) => {
    // 0. Clean state
    await page.unroute(/\/rest\/v1\/trips/);
    await page.unroute(/\/rpc\/get_upcoming_trips/);
    await page.unroute(/\/rpc\/get_trips_for_date/);
    await page.unroute(/\/rpc\/get_friends_and_requests/);
    await page.unroute(/\/rpc\/get_trip_details/);
    await page.unroute('**/rpc/add_trip_member_by_email');

    // 1. Setup network mocks for trips to ensure buttons are rendered
    // Use page.route to override context.route from MockMapsManager
    const today = new Date().toISOString().split('T')[0];
    const mockTrip = {
      id: mockTripId,
      name: mockTripName,
      trip_date: today,
      user_id: user.id,
      wineries: [],
      members: [user.id]
    };

    // Mock both REST and RPC versions of trip fetching
    // Priority: page.route > context.route
    await page.route(/\/rest\/v1\/trips/, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([mockTrip]),
        headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }
      });
    });

    await page.route(/\/rpc\/get_upcoming_trips/, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([mockTrip]),
        headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }
      });
    });

    await page.route(/\/rpc\/get_trips_for_date/, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([mockTrip]),
        headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }
      });
    });

    await page.route(/\/rpc\/get_friends_and_requests/, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ friends: [], pending_incoming: [], pending_outgoing: [] }),
        headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }
      });
    });

    await page.route(/\/rpc\/get_trip_details/, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...mockTrip, wineries: [], members: [user.id] }),
        headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }
      });
    });

    // 2. Log in
    await login(page, user.email, user.password);
    await page.waitForLoadState('networkidle');
    await waitForAppReady(page);
  });

  test('can open share dialog from Trips view (TripCardSimple)', async ({ page }) => {
    await navigateToTab(page, 'Trips');
    await ensureSidebarExpanded(page);
    const sidebar = getSidebarContainer(page);

    // Look for the trip card by testid
    const tripCard = sidebar.getByTestId('trip-card').filter({ hasText: mockTripName }).first();
    await expect(tripCard).toBeVisible({ timeout: 15000 });

    // Click the Share Trip button (using the new testid)
    const shareBtn = tripCard.getByTestId('share-trip-btn');
    await expect(async () => {
        await robustClick(page, shareBtn);
        // Verify dialog is open
        await page.waitForSelector('[data-testid="trip-share-dialog"]', { state: 'visible', timeout: 5000 });
    }).toPass({ timeout: 15000 });

    const dialog = page.getByTestId('trip-share-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(new RegExp(`Share "${mockTripName}"`, 'i'))).toBeVisible();
  });

  test('can open share dialog from Trip Detail view (TripCard)', async ({ page }) => {
    await navigateToTab(page, 'Trips');
    await ensureSidebarExpanded(page);
    const sidebar = getSidebarContainer(page);

    // Navigate to Trip Details
    const tripCard = sidebar.getByTestId('trip-card').filter({ hasText: mockTripName }).first();
    const viewDetailsBtn = tripCard.getByTestId('view-trip-details-btn');
    await robustClick(page, viewDetailsBtn);

    // Verify "Share Trip" button is visible in the detail view header (Main content, not sidebar)
    // Both TripCardSimple (sidebar) and TripCard (main) have this button, so we must scope it.
    const shareTripBtn = page.locator('main').getByTestId('share-trip-btn').first();
    await expect(shareTripBtn).toBeVisible({ timeout: 10000 });

    // Click Share Trip
    await expect(async () => {
        await robustClick(page, shareTripBtn);
        // Verify dialog is open
        await page.waitForSelector('[data-testid="trip-share-dialog"]', { state: 'visible', timeout: 5000 });
    }).toPass({ timeout: 15000 });

    const dialog = page.getByTestId('trip-share-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Share/i)).toBeVisible();
  });

  test('can invite a user by email', async ({ page }) => {
    await navigateToTab(page, 'Trips');
    await ensureSidebarExpanded(page);
    const sidebar = getSidebarContainer(page);
    
    // Navigate to Trip Details
    const tripCard = sidebar.getByTestId('trip-card').filter({ hasText: mockTripName }).first();
    const viewDetailsBtn = tripCard.getByTestId('view-trip-details-btn');
    await robustClick(page, viewDetailsBtn);
    
    const shareTripBtn = page.locator('main').getByTestId('share-trip-btn').first();
    await expect(async () => {
        await robustClick(page, shareTripBtn);
        // Wait for the dialog to be in the DOM first
        await page.waitForSelector('[data-testid="trip-share-dialog"]', { state: 'visible', timeout: 5000 });
    }).toPass({ timeout: 15000 });
    
    const dialog = page.getByTestId('trip-share-dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Fill email input
    const emailInput = page.getByTestId('invite-email-input');
    const testEmail = 'collaborator@example.com';
    await emailInput.fill(testEmail);

    // Intercept the RPC call for this specific test
    await page.route('**/rpc/add_trip_member_by_email', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
        headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }
      });
    });

    // Click Invite
    const inviteBtn = dialog.getByTestId('invite-by-email-btn');
    await robustClick(page, inviteBtn);

    // Verify success via toast
    await waitForToast(page, `Invitation sent to ${testEmail}`);
    
    // Verify input is cleared
    const input = dialog.getByTestId('invite-email-input');
    await expect(input).toBeEnabled({ timeout: 10000 });

    await expect(async () => {
        const val = await input.inputValue();
        expect(val).toBe('');
    }).toPass({ timeout: 5000, intervals: [500] });
  });
});
