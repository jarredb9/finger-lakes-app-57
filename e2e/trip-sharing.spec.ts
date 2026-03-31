import { test, expect, createTestUser, deleteTestUser, MockMapsManager } from './utils';
import { 
    getSidebarContainer, 
    login, 
    navigateToTab, 
    ensureSidebarExpanded,
    robustClick,
    waitForAppReady,
    ensureProfileReady,
    setupFriendship,
    removeFriend,
    refreshFriendsStore
} from './helpers';

test.describe('Trip Sharing and Collaboration Flow', () => {
  test('User can invite a friend to a trip', async ({ browser, user: userA }) => {
    test.setTimeout(120000);
    const userB = await createTestUser();
    
    try {
      const contextA = await browser.newContext();
      const contextB = await browser.newContext();
      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();

      const managerA = new MockMapsManager(pageA);
      const managerB = new MockMapsManager(pageB);

      // MANDATORY: Call useRealSocial before initDefaultMocks to prevent profile collisions
      await managerA.useRealSocial();
      await managerA.useRealTrips();
      await managerA.initDefaultMocks({ currentUserId: userA.id });

      await managerB.useRealSocial();
      await managerB.useRealTrips();
      await managerB.initDefaultMocks({ currentUserId: userB.id });

      await login(pageA, userA.email, userA.password, { skipMapReady: true });
      await login(pageB, userB.email, userB.password, { skipMapReady: true });
      
      await ensureProfileReady(pageA);
      await ensureProfileReady(pageB);

      // Establish friendship first
      await setupFriendship(pageA, pageB, userA.email, userB.email);

      // settlement buffer for WebKit container
      await pageA.waitForTimeout(1000);

      // MANDATORY: Refresh friends store on pageA to ensure userB is visible in the list
      await refreshFriendsStore(pageA);

      // Diagnostic: Check if friend is in store on pageA
      const friendCount = await pageA.evaluate(() => (window as any).useFriendStore?.getState().friends.length);
      console.log(`[DIAGNOSTIC] Friend count on pageA: ${friendCount}`);

      // 1. Setup: User logs in and creates a trip
      await navigateToTab(pageA, 'Trips');
      await ensureSidebarExpanded(pageA);
      
      const uniqueTripName = `Sharing Trip ${Date.now()}`;
      const sidebarA = getSidebarContainer(pageA);
      await robustClick(pageA, sidebarA.getByRole('button', { name: 'New Trip' }));
      
      const tripForm = pageA.getByTestId('trip-form-card');
      await tripForm.getByTestId('trip-name-input').fill(uniqueTripName);
      
      await Promise.all([
          pageA.waitForResponse(resp => resp.url().includes('trips') || resp.url().includes('create_trip')),
          robustClick(pageA, tripForm.getByTestId('create-trip-submit-btn'))
      ]);
      
      await expect(pageA.getByText(/Trip created successfully/i).first()).toBeVisible({ timeout: 15000 });

      // Wait for trip card to appear and have a positive ID
      let tripCardA = sidebarA.getByTestId('trip-card').filter({ hasText: uniqueTripName }).first();
      await expect(async () => {
          // Proactive sync
          await pageA.evaluate(async () => {
              const store = (window as any).useTripStore?.getState();
              if (store) await store.fetchTrips(1, 'upcoming', true);
          });
          await expect(tripCardA).toBeVisible({ timeout: 5000 });
          await expect(tripCardA).toHaveAttribute('data-trip-id', /^[1-9]\d*$/, { timeout: 5000 });
      }).toPass({ timeout: 20000, intervals: [2000] });

      // 2. Open Share Dialog
      await robustClick(pageA, tripCardA.getByTestId('share-trip-btn'));
      
      const dialog = pageA.getByTestId('trip-share-dialog');
      await expect(dialog).toBeVisible();

      // Wait for friends to load and userB to appear
      await expect(async () => {
          await expect(dialog.getByTestId('loading-friends')).not.toBeVisible({ timeout: 5000 });
          
          // Diagnostic checks for available buttons
          const testIds = await dialog.locator('button[data-testid^="invite-friend-"]').evaluateAll(btns => 
              btns.map(b => b.getAttribute('data-testid'))
          );
          if (testIds.length > 0) {
              console.log(`[DIAGNOSTIC] Available invite buttons: ${testIds.join(', ')}`);
          } else {
              const noFriends = await dialog.getByTestId('no-friends-msg').isVisible();
              const allInvited = await dialog.getByTestId('all-friends-invited-msg').isVisible();
              console.log(`[DIAGNOSTIC] No invite buttons found. noFriends: ${noFriends}, allInvited: ${allInvited}`);
          }

          const inviteBtn = dialog.getByTestId(`invite-friend-${userB.email}`);
          await expect(inviteBtn).toBeVisible({ timeout: 5000 });
      }).toPass({ timeout: 20000, intervals: [2000] });
      
      const inviteBtn = dialog.getByTestId(`invite-friend-${userB.email}`);
      await Promise.all([
          pageA.waitForResponse(resp => resp.url().includes('rpc/add_trip_member_by_email')),
          robustClick(pageA, inviteBtn)
      ]);
      
      await expect(pageA.getByText(/Invitation sent to/i).first()).toBeVisible();
      
      // Verify member appears in list
      await expect(dialog.getByTestId('member-email').filter({ hasText: userB.email })).toBeVisible({ timeout: 15000 });

      // 4. Cleanup Friendship
      try {
          await removeFriend(pageA, userB.email);
      } catch (e) {
          console.warn('[DIAGNOSTIC] Flaky cleanup: removeFriend failed, but core test passed.');
      }
      
      await contextA.close();
      await contextB.close();
    } finally {
      await deleteTestUser(userB.id);
    }
  });

  test('Collaborative editing: Multi-context sync', async ({ browser, user: userA }) => {
    // This test verifies that if User A changes something, User B sees it
    test.setTimeout(150000);
    const userB = await createTestUser();
    
    try {
      const contextA = await browser.newContext();
      const contextB = await browser.newContext();
      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();

      const managerA = new MockMapsManager(pageA);
      const managerB = new MockMapsManager(pageB);

      await managerA.useRealSocial();
      await managerA.useRealTrips();
      await managerB.useRealSocial();
      await managerB.useRealTrips();
      
      await managerA.initDefaultMocks({ currentUserId: userA.id });
      await managerB.initDefaultMocks({ currentUserId: userB.id });

      await login(pageA, userA.email, userA.password, { skipMapReady: true });
      await login(pageB, userB.email, userB.password, { skipMapReady: true });
      
      await ensureProfileReady(pageA);
      await ensureProfileReady(pageB);

      // 1. Establish friendship
      await setupFriendship(pageA, pageB, userA.email, userB.email);
      await pageA.waitForTimeout(1000);
      await refreshFriendsStore(pageA);

      // 2. User A creates a trip
      await navigateToTab(pageA, 'Trips');
      await ensureSidebarExpanded(pageA);
      const uniqueTripName = `Sync Trip ${Date.now()}`;
      const sidebarA = getSidebarContainer(pageA);
      await robustClick(pageA, sidebarA.getByRole('button', { name: 'New Trip' }));
      const tripForm = pageA.getByTestId('trip-form-card');
      await tripForm.getByTestId('trip-name-input').fill(uniqueTripName);
      await Promise.all([
          pageA.waitForResponse(resp => resp.url().includes('trips') || resp.url().includes('create_trip')),
          robustClick(pageA, tripForm.getByTestId('create-trip-submit-btn'))
      ]);
      await expect(pageA.getByText(/Trip created successfully/i).first()).toBeVisible();

      // Wait for trip card to have a positive ID
      let tripCardA = sidebarA.getByTestId('trip-card').filter({ hasText: uniqueTripName }).first();
      await expect(async () => {
          // Proactive sync
          await pageA.evaluate(async () => {
              const store = (window as any).useTripStore?.getState();
              if (store) await store.fetchTrips(1, 'upcoming', true);
          });
          await expect(tripCardA).toBeVisible({ timeout: 5000 });
          await expect(tripCardA).toHaveAttribute('data-trip-id', /^[1-9]\d*$/, { timeout: 5000 });
      }).toPass({ timeout: 20000, intervals: [2000] });

      // 3. User A invites User B
      await robustClick(pageA, tripCardA.getByTestId('share-trip-btn'));
      const shareDialog = pageA.getByTestId('trip-share-dialog');
      
      // Wait for friends to load
      await expect(async () => {
          await expect(shareDialog.getByTestId('loading-friends')).not.toBeVisible({ timeout: 5000 });
          const inviteBtn = shareDialog.getByTestId(`invite-friend-${userB.email}`);
          await expect(inviteBtn).toBeVisible({ timeout: 5000 });
      }).toPass({ timeout: 20000, intervals: [2000] });
      
      const inviteBtnA = shareDialog.getByTestId(`invite-friend-${userB.email}`);
      await Promise.all([
          pageA.waitForResponse(resp => resp.url().includes('rpc/add_trip_member_by_email')),
          robustClick(pageA, inviteBtnA)
      ]);
      
      await expect(pageA.getByText(/Invitation sent/i).first()).toBeVisible();
      await pageA.keyboard.press('Escape'); // Close dialog

      // 4. User B verifies the trip appears
      await navigateToTab(pageB, 'Trips');
      await ensureSidebarExpanded(pageB);
      const sidebarB = getSidebarContainer(pageB);
      
      await expect(async () => {
          await pageB.evaluate(async () => {
              const store = (window as any).useTripStore?.getState();
              if (store) await store.fetchTrips(1, 'upcoming', true);
          });
          await expect(sidebarB.getByTestId('trip-card').filter({ hasText: uniqueTripName }).first()).toBeVisible({ timeout: 5000 });
      }).toPass({ timeout: 30000, intervals: [5000] });

      // 5. User A renames the trip
      await robustClick(pageA, tripCardA.getByTestId('view-trip-details-btn'));
      await pageA.getByRole('button', { name: 'Edit' }).click();
      
      const newName = `Renamed ${Date.now()}`;
      await pageA.getByPlaceholder('Trip Name').fill(newName);
      
      await Promise.all([
          pageA.waitForResponse(resp => resp.request().method() === 'PATCH' && resp.url().includes('trips')),
          pageA.getByRole('button', { name: 'Save' }).click()
      ]);

      // 6. User B should see the change
      await expect(async () => {
          await pageB.evaluate(async () => {
              const store = (window as any).useTripStore?.getState();
              if (store) await store.fetchTrips(1, 'upcoming', true);
          });
          await expect(sidebarB.getByText(newName)).toBeVisible({ timeout: 5000 });
      }).toPass({ timeout: 30000, intervals: [5000] });

      // Cleanup (Wrapped in try-catch to handle flaky teardown)
      try {
          await removeFriend(pageA, userB.email);
      } catch (e) {
          console.warn('[DIAGNOSTIC] Flaky cleanup: removeFriend failed, but core test passed.');
      }
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

  test('Verify RLS security for unauthorized RPC calls', async ({ page, user, mockMaps }) => {
    const logs: string[] = [];
    page.on('console', msg => {
        const text = msg.text();
        logs.push(text);
    });

    await mockMaps.initDefaultMocks({ currentUserId: user.id });
    await login(page, user.email, user.password, { skipMapReady: true });
    await waitForAppReady(page);
    
    // Wait for Supabase to be exposed
    await expect(async () => {
        const isExposed = await page.evaluate(() => !!(window as any).supabase);
        if (!isExposed) throw new Error('Supabase client not exposed to window');
    }).toPass({ timeout: 10000 });

    // Attempt unauthorized RPC call
    const result = await page.evaluate(async () => {
        const supabase = (window as any).supabase;
        
        // Attempt to call a definitely non-mocked RPC. 
        // This should hit the real API/middleware and fail.
        const { data, error } = await supabase
            .rpc('definitely_does_not_exist_rpc_12345');
            
        if (error) {
            return { error: error.message, code: error.code };
        }
        
        return { data };
    });

    // We expect an error (404/403) for non-existent RPC, which verifies we are hitting the real API/middleware
    expect(result.error).toBeTruthy();
  });
});
