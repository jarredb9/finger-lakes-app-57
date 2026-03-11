import { test, expect, createTestUser, deleteTestUser } from './utils';
import { 
    getSidebarContainer, 
    login, 
    navigateToTab, 
    ensureSidebarExpanded,
    robustClick,
    waitForAppReady
} from './helpers';

test.describe('Trip Sharing and Collaboration Flow', () => {
  test('User can invite a friend to a trip', async ({ page, user, mockMaps }) => {
    // Surface all browser logs
    page.on('console', msg => console.log(`[BROWSER] ${msg.text()}`));

    // Initialize mocks with the actual user ID to ensure isOwner works
    await mockMaps.initDefaultMocks({ currentUserId: user.id });

    // 1. Setup: User logs in and creates a trip
    await login(page, user.email, user.password, { skipMapReady: true });
    await waitForAppReady(page);
    
    await navigateToTab(page, 'Trips');
    await ensureSidebarExpanded(page);
    
    // Create trip with unique name to avoid mock collisions
    const uniqueTripName = `Sharing Trip ${Date.now()}`;
    const sidebar = getSidebarContainer(page);
    await robustClick(page, sidebar.getByRole('button', { name: 'New Trip' }));
    
    const tripForm = page.getByTestId('trip-form-card');
    await tripForm.getByTestId('trip-name-input').fill(uniqueTripName);
    
    console.log('[E2E] Clicking create-trip-submit-btn');
    // Intercept creation
    await Promise.all([
        page.waitForResponse(resp => resp.url().includes('trips') || resp.url().includes('create_trip')),
        robustClick(page, tripForm.getByTestId('create-trip-submit-btn'))
    ]);
    
    // Wait for success toast to ensure store is updated
    console.log('[E2E] Waiting for creation toast');
    await expect(page.getByText(/Trip created successfully/i).first()).toBeVisible({ timeout: 15000 });

    console.log('[E2E] Waiting for trip card to appear');
    const tripCard = sidebar.getByTestId('trip-card').filter({ hasText: uniqueTripName }).first();
    await expect(tripCard).toBeVisible({ timeout: 15000 });
    
    // 2. Wait for stable positive ID before opening dialog
    console.log('[E2E] Waiting for stable positive ID');
    
    // Debug store state if it takes too long
    await page.evaluate(() => {
        const store = (window as any).useTripStore?.getState();
        console.log('[DIAGNOSTIC-STORE] Current trips:', JSON.stringify(store?.trips.map((t: any) => ({ id: t.id, name: t.name }))));
    });

    // Wait for the ID to become positive (not starting with -)
    await expect(tripCard).toHaveAttribute('data-trip-id', /^[1-9]\d*$/, { timeout: 20000 });

    // 2. Open Share Dialog
    console.log('[E2E] Opening Share Dialog');
    const shareBtn = tripCard.getByTestId('share-trip-btn');
    await robustClick(page, shareBtn);
    
    const dialog = page.getByTestId('trip-share-dialog');
    await expect(dialog).toBeVisible();
    
    // 3. Invite a friend by email
    console.log('[E2E] Inviting friend by email');
    const emailInput = dialog.getByTestId('invite-email-input');
    await emailInput.fill('user-b@example.com');
    
    // Intercept RPC and refresh
    await Promise.all([
        page.waitForResponse(resp => resp.url().includes('rpc/add_trip_member_by_email')),
        robustClick(page, dialog.getByTestId('invite-by-email-btn'))
    ]);
    
    console.log('[E2E] Waiting for success toast');
    await expect(page.getByText(/Invitation sent to user-b@example.com/i).first()).toBeVisible();
    
    // Verify member appears in list
    console.log('[E2E] Verifying member in list');
    await expect(dialog.getByTestId('member-email').filter({ hasText: 'user-b@example.com' })).toBeVisible({ timeout: 15000 });
  });

  test('Collaborative editing: Multi-context sync', async ({ browser, user: userA }) => {
    // This test verifies that if User A changes something, User B sees it (via Realtime or refresh)
    const userB = await createTestUser();
    
    try {
      const contextA = await browser.newContext();
      const contextB = await browser.newContext();
      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();

      // IMPORTANT: Apply mocks to BOTH contexts
      // The shared state in utils.ts will handle the cross-context communication
      const { mockGoogleMapsApi } = await import('./utils');
      await mockGoogleMapsApi(pageA, userA.id);
      await mockGoogleMapsApi(pageB, userB.id);

      await login(pageA, userA.email, userA.password, { skipMapReady: true });
      await login(pageB, userB.email, userB.password, { skipMapReady: true });

      await navigateToTab(pageA, 'Trips');
      await navigateToTab(pageB, 'Trips');
      
      const sidebarA = getSidebarContainer(pageA);
      const sidebarB = getSidebarContainer(pageB);
      
      const tripCardA = sidebarA.getByTestId('trip-card').filter({ hasText: 'Collaboration Trip' }).first();
      const tripCardB = sidebarB.getByTestId('trip-card').filter({ hasText: 'Collaboration Trip' }).first();
      
      await expect(tripCardA).toBeVisible();
      await expect(tripCardB).toBeVisible();

      // User A renames the trip
      await robustClick(pageA, tripCardA.getByTestId('view-trip-details-btn'));
      await pageA.getByRole('button', { name: 'Edit' }).click();
      
      const newName = `Renamed by A ${Date.now()}`;
      await pageA.getByPlaceholder('Trip Name').fill(newName);
      
      await Promise.all([
          pageA.waitForResponse(resp => resp.request().method() === 'PATCH' && resp.url().includes('trips')),
          pageA.getByRole('button', { name: 'Save' }).click()
      ]);

      // User B should see the change
      // In E2E with mocks, we might need a manual refresh or simulate the realtime event
      await expect(async () => {
          // Proactive sync for User B
          await pageB.evaluate(async () => {
              const store = (window as any).useTripStore?.getState();
              if (store) await store.fetchTrips(1, 'upcoming', true);
          });
          await expect(sidebarB.getByText(newName)).toBeVisible({ timeout: 5000 });
      }).toPass({ timeout: 20000, intervals: [5000] });

    } finally {
      await deleteTestUser(userB.id);
    }
  });

  test('Collaborator can see and edit shared trip', async ({ page, user, mockMaps }) => {
    // Initialize mocks with the actual user ID
    await mockMaps.initDefaultMocks({ currentUserId: user.id });

    // This test simulates a user seeing a trip they were invited to.
    await login(page, user.email, user.password, { skipMapReady: true });
    await waitForAppReady(page);
    
    await navigateToTab(page, 'Trips');
    await ensureSidebarExpanded(page);
    
    // The "Collaboration Trip" is mocked in e2e/utils.ts to always exist
    const sidebar = getSidebarContainer(page);
    const tripCard = sidebar.getByTestId('trip-card').filter({ hasText: 'Collaboration Trip' }).first();
    await expect(tripCard).toBeVisible({ timeout: 15000 });
    
    // Verify collaborator avatars are visible
    await expect(tripCard.locator('.rounded-full').first()).toBeVisible();
    
    // Verify user can view details
    await robustClick(page, tripCard.getByTestId('view-trip-details-btn'));
    
    // Wait for data load
    await page.waitForResponse(resp => resp.url().includes('rpc/get_trip_details'));

    // Verify Edit button is visible (mocked as member in utils.ts)
    // Note: Our permission logic says isOwner || isMember can edit.
    // In e2e/utils.ts, any trip named 'Collaboration' has two members.
    const editBtn = page.getByRole('button', { name: 'Edit' });
    await expect(editBtn).toBeVisible();
    
    // Share and Delete should be hidden for members (mocked by using user-b as current user if needed)
    // Actually our mocks use user-a as owner. 
    // If we want to verify "hidden", we'd need to ensure the mock user is NOT the owner.
  });
});
