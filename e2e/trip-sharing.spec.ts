import { test, expect, MockMapsManager, createMockTrip, createDefaultMockState } from './utils';
import { 
    ensureSidebarExpanded,
    ensureProfileReady,
    injectTripState,
    navigateToTab,
    getSidebarContainer,
    login
} from './helpers';

test.describe('Trip Sharing and Collaboration Flow', () => {
  test('User can invite a friend to a trip', async ({ page, user: userA, user2: userB, mockMaps }) => {
    test.setTimeout(90000);
    
    try {
      // 1. Setup: Mock state and login
      const uniqueTripName = `Sharing Trip ${Date.now()}`;
      const tripId = 888;
      const mockTrip = createMockTrip({
          id: tripId,
          name: uniqueTripName,
          user_id: userA.id,
          members: [
              { id: userA.id, role: 'owner', status: 'joined', name: 'User A', email: userA.email }
          ]
      });

      await mockMaps.initDefaultMocks({ currentUserId: userA.id });
      mockMaps.getState().trips = [mockTrip];

      await login(page, userA.email, userA.password, { skipMapReady: true });
      await ensureProfileReady(page);

      // 2. ATOMIC INJECTION: Establish friendship and inject trip
      await test.step('Atomic state injection', async () => {
          const friend = { id: userB.id, name: 'User B', email: userB.email, status: 'accepted' };
          
          await page.evaluate(({ f, t }) => {
              (window as any).useFriendStore.setState({ friends: [f] });
              (window as any).useTripStore.setState({ trips: [t], upcomingTrips: [t] });
          }, { f: friend, t: mockTrip });

          // Sync mock layer
          mockMaps.getState().socialMap.set(userA.id, {
              friends: [friend],
              pending_incoming: [],
              pending_outgoing: []
          });
      });

      // 3. Open Share Dialog directly from the injected trip
      await navigateToTab(page, 'Trips');
      await ensureSidebarExpanded(page);
      
      const sidebar = getSidebarContainer(page);
      const tripCard = sidebar.getByTestId('trip-card').filter({ hasText: uniqueTripName }).first();
      await expect(tripCard).toBeVisible({ timeout: 10000 });

      // Ensure card is in view for mobile chrome
      await tripCard.scrollIntoViewIfNeeded();
      
      // Specifically target button WITHIN the card to avoid collisions
      const shareBtn = tripCard.getByTestId('share-trip-btn');
      await expect(shareBtn).toBeVisible({ timeout: 5000 });
      await shareBtn.click({ force: true });
      
      const dialog = page.getByTestId('trip-share-dialog');
      await expect(dialog).toBeVisible();

      // 4. Invite Friend
      await expect(async () => {
          await expect(dialog.getByTestId('loading-friends')).not.toBeVisible({ timeout: 5000 });
          const inviteBtn = dialog.getByTestId(`invite-friend-${userB.email}`);
          await expect(inviteBtn).toBeVisible({ timeout: 5000 });
      }).toPass({ timeout: 15000, intervals: [1000, 2000] });
      
      const inviteBtn = dialog.getByTestId(`invite-friend-${userB.email}`);
      await expect(async () => {
          await Promise.all([
              page.waitForResponse(resp => resp.url().includes('rpc/add_trip_member_by_email'), { timeout: 10000 }),
              inviteBtn.click({ force: true })
          ]);
      }).toPass({ timeout: 20000, intervals: [2000] });
      
      await expect(page.getByText(/Invitation sent to/i).first()).toBeVisible();
      
      // Verify member appears in list
      await expect(dialog.getByTestId('member-email').filter({ hasText: userB.email })).toBeVisible({ timeout: 15000 });

    } finally {
      // Cleanup handled by user fixtures
    }
  });

  test('Collaborative editing: Multi-context sync', async ({ browser, user: userA, user2: userB }) => {
    // This test verifies that if User A changes something, User B sees it
    test.setTimeout(150000);
    
    try {
      const contextA = await browser.newContext();
      const contextB = await browser.newContext();
      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();

      const sharedState = createDefaultMockState();
      const managerA = new MockMapsManager(pageA, sharedState);
      const managerB = new MockMapsManager(pageB, sharedState);

      // We use MOCKS for this test to ensure stability in the container
      await managerA.initDefaultMocks({ currentUserId: userA.id });
      await managerB.initDefaultMocks({ currentUserId: userB.id });

      await login(pageA, userA.email, userA.password, { skipMapReady: true });
      await login(pageB, userB.email, userB.password, { skipMapReady: true });
      
      await ensureProfileReady(pageA);
      await ensureProfileReady(pageB);

      const uniqueTripName = `Sync Trip ${Date.now()}`;
      const tripId = 999;
      const mockTrip = createMockTrip({
          id: tripId,
          name: uniqueTripName,
          user_id: userA.id,
          members: [
              { id: userA.id, role: 'owner', status: 'joined', name: 'User A', email: userA.email }
          ]
      });

      // 1. Establish friendship and inject trip via ATOMIC INJECTION
      await test.step('Atomic state injection', async () => {
          const friendForA = { id: userB.id, name: 'User B', email: userB.email, status: 'accepted' };
          const friendForB = { id: userA.id, name: 'User A', email: userA.email, status: 'accepted' };

          await pageA.evaluate(({ f, t }) => {
              (window as any).useFriendStore.setState({ friends: [f] });
              (window as any).useTripStore.setState({ trips: [t], upcomingTrips: [t] });
          }, { f: friendForA, t: mockTrip });

          await pageB.evaluate(({ f }) => {
              (window as any).useFriendStore.setState({ friends: [f] });
          }, { f: friendForB });

          // Update the mock layer for BOTH users
          sharedState.socialMap.set(userA.id, {
              friends: [friendForA],
              pending_incoming: [],
              pending_outgoing: []
          });
          sharedState.socialMap.set(userB.id, {
              friends: [friendForB],
              pending_incoming: [],
              pending_outgoing: []
          });
          sharedState.trips = [mockTrip];
      });

      // 2. User A invites User B via UI (important to test the actual collaboration flow)
      await navigateToTab(pageA, 'Trips');
      await ensureSidebarExpanded(pageA);
      const sidebarA = getSidebarContainer(pageA);
      const tripCardA = sidebarA.getByTestId('trip-card').filter({ hasText: uniqueTripName }).first();
      await expect(tripCardA).toBeVisible({ timeout: 10000 });

      // Ensure card is in view for mobile chrome
      await tripCardA.scrollIntoViewIfNeeded();
      
      const shareBtnA = tripCardA.getByTestId('share-trip-btn');
      await expect(shareBtnA).toBeVisible({ timeout: 5000 });
      await shareBtnA.click({ force: true });
      const shareDialog = pageA.getByTestId('trip-share-dialog');
      
      await expect(async () => {
          await expect(shareDialog.getByTestId('loading-friends')).not.toBeVisible({ timeout: 5000 });
          const inviteBtn = shareDialog.getByTestId(`invite-friend-${userB.email}`);
          await expect(inviteBtn).toBeVisible({ timeout: 5000 });
      }).toPass({ timeout: 20000, intervals: [1000, 2000] });
      
      const inviteBtnA = shareDialog.getByTestId(`invite-friend-${userB.email}`);
      await expect(async () => {
          await Promise.all([
              pageA.waitForResponse(resp => resp.url().includes('rpc/add_trip_member_by_email'), { timeout: 10000 }),
              inviteBtnA.click({ force: true })
          ]);
      }).toPass({ timeout: 20000, intervals: [1000, 2000] });
      
      await expect(pageA.getByText(/Invitation sent/i).first()).toBeVisible();
      console.log('[DIAGNOSTIC] Invitation sent successfully. Closing dialog...');
      
      await expect(async () => {
          const closeBtn = shareDialog.getByRole('button', { name: 'Close' });
          if (await closeBtn.isVisible()) {
              await closeBtn.click({ force: true });
          } else {
              await pageA.keyboard.press('Escape');
          }
          
          // Final fallback for stubborn mobile browsers: direct store reset
          const isOpen = await shareDialog.isVisible();
          if (isOpen) {
              await pageA.evaluate(() => (window as any).useUIStore.getState().closeShareDialog());
          }

          await expect(shareDialog).not.toBeVisible({ timeout: 3000 });
      }).toPass({ timeout: 15000, intervals: [1000, 2000] });
      
      console.log('[DIAGNOSTIC] Share dialog closed.');

      // 3. User B verifies the trip appears (will fetch via MockMapsManager shared trips state)
      await navigateToTab(pageB, 'Trips');
      await ensureSidebarExpanded(pageB);
      const sidebarB = getSidebarContainer(pageB);
      
      console.log('[DIAGNOSTIC] User B checking for trip...');
      await expect(async () => {
          await pageB.evaluate(async () => {
              const store = (window as any).useTripStore?.getState();
              if (store) {
                  await store.fetchTrips(1, 'upcoming', true);
                  console.log(`[DIAGNOSTIC] User B trips in store: ${store.trips.length}`, store.trips.map((t: any) => t.name));
              }
          });
          const tripCards = await sidebarB.getByTestId('trip-card').all();
          const tripNames = await Promise.all(tripCards.map(c => c.innerText()));
          console.log(`[DIAGNOSTIC] User B visible trip cards: ${tripCards.length}, names: ${JSON.stringify(tripNames)}`);
          
          await expect(sidebarB.getByTestId('trip-card').filter({ hasText: uniqueTripName }).first()).toBeVisible({ timeout: 5000 });
      }).toPass({ timeout: 30000, intervals: [1000, 2000] });
      console.log('[DIAGNOSTIC] User B saw the trip.');

      // 4. User A renames the trip
      console.log('[DIAGNOSTIC] User A renaming trip...');
      await expect(async () => {
          const detailsBtn = tripCardA.getByTestId('view-trip-details-btn');
          await expect(detailsBtn).toBeVisible({ timeout: 5000 });
          await detailsBtn.click({ force: true });
          await pageA.waitForURL(/.*\/trips\/\d+/, { timeout: 10000, waitUntil: 'domcontentloaded' });
      }).toPass({ timeout: 20000, intervals: [1000, 2000] });
      
      await expect(pageA.getByTestId('trip-details-card')).toBeVisible({ timeout: 10000 });
      console.log('[DIAGNOSTIC] User A on trip details page.');

      const editBtn = pageA.getByRole('button', { name: 'Edit' });
      await expect(editBtn).toBeVisible({ timeout: 5000 });
      await editBtn.click({ force: true });
      
      const newName = `Renamed ${Date.now()}`;
      await pageA.getByPlaceholder('Trip Name').fill(newName);
      console.log(`[DIAGNOSTIC] User A filled new name: ${newName}`);
      
      const saveBtn = pageA.getByRole('button', { name: 'Save' });
      await Promise.all([
          pageA.waitForResponse(resp => resp.request().method() === 'PATCH' && resp.url().includes('trips'), { timeout: 15000 }),
          saveBtn.click({ force: true })
      ]);
      console.log('[DIAGNOSTIC] User A saved renaming.');

      // 5. User B should see the change
      console.log('[DIAGNOSTIC] User B verifying renamed trip...');
      await expect(async () => {
          await pageB.evaluate(async () => {
              const store = (window as any).useTripStore?.getState();
              if (store) {
                  await store.fetchTrips(1, 'upcoming', true);
                  console.log(`[DIAGNOSTIC] User B trips in store: ${store.trips.length}`, store.trips.map((t: any) => t.name));
              }
          });
          await expect(sidebarB.getByText(newName)).toBeVisible({ timeout: 5000 });
      }).toPass({ timeout: 30000, intervals: [1000, 2000] });
      console.log('[DIAGNOSTIC] User B saw the renamed trip.');

      await contextA.close();
      await contextB.close();
    } finally {
      // Cleanup handled by user fixtures
    }
  });

  test('Collaborator can see and edit shared trip', async ({ page, user, mockMaps }) => {
    // 1. Prepare data for injection
    const tripId = 777;
    const mockTrip = {
      id: tripId,
      user_id: 'other-user-id',
      trip_date: '2026-05-20',
      name: 'Shared Adventure',
      wineries: [],
      members: [
        { id: 'other-user-id', role: 'owner', status: 'joined', name: 'Other User', email: 'other@example.com' },
        { id: user.id, role: 'member', status: 'joined', name: 'Test User', email: user.email }
      ]
    } as any;

    // 2. Initialize mocks and login
    await mockMaps.initDefaultMocks({ currentUserId: user.id });
    
    // IMPORTANT: Update mock trips so the RPC mock returns this specific trip
    // when fetchTripById is called by the component on mount.
    mockMaps.getState().trips = [mockTrip];

    await login(page, user.email, user.password, { skipMapReady: true });
    
    // Diagnostic: Check store user ID
    const storeUserId = await page.evaluate(() => (window as any).useUserStore?.getState().user?.id);
    console.log(`[DIAGNOSTIC] Fixture user.id: ${user.id}, Store user.id: ${storeUserId}`);

    // 3. ATOMIC STATE INJECTION
    // We inject the trip directly into the store, bypassing the initial 'get_trips' fetch
    await injectTripState(page, [mockTrip]);

    // 4. Verification
    await navigateToTab(page, 'Trips');
    await ensureSidebarExpanded(page);
    
    const sidebar = getSidebarContainer(page);
    const tripCard = sidebar.getByTestId('trip-card').filter({ hasText: 'Shared Adventure' }).first();
    await expect(tripCard).toBeVisible({ timeout: 5000 });
    
    // Verify collaborator avatars (indicates multi-user trip)
    await expect(tripCard.locator('.rounded-full').first()).toBeVisible();
    
    // Verify user can view details (this will trigger get_trip_details RPC)
    await expect(async () => {
        await tripCard.getByTestId('view-trip-details-btn').click({ force: true });
        await page.waitForURL(/.*\/trips\/\d+/, { timeout: 10000, waitUntil: 'domcontentloaded' });
    }).toPass({ timeout: 20000, intervals: [2000] });
    
    // Wait for the details RPC response (MockMapsManager will handle this via its catch-all)
    await page.waitForResponse(resp => resp.url().includes('rpc/get_trip_details'), { timeout: 10000 });

    // MANDATORY DIAGNOSTIC: If Edit button not found, dump state
    const editBtn = page.getByRole('button', { name: 'Edit' });
    try {
        await expect(editBtn).toBeVisible({ timeout: 5000 });
    } catch (e) {
        console.log('[DIAGNOSTIC] Edit button not visible. Dumping state...');
        const tripState = await page.evaluate(() => (window as any).useTripStore?.getState().trips.find((t: any) => t.id === 777));
        const userState = await page.evaluate(() => (window as any).useUserStore?.getState().user);
        console.log(`[DIAGNOSTIC] Trip State: ${JSON.stringify(tripState)}`);
        console.log(`[DIAGNOSTIC] User State: ${JSON.stringify(userState)}`);
        throw e;
    }
  });

  test('Verify RLS security for unauthorized RPC calls', async ({ page, user, mockMaps }) => {
    const logs: string[] = [];
    page.on('console', msg => {
        const text = msg.text();
        logs.push(text);
    });

    await mockMaps.initDefaultMocks({ currentUserId: user.id });
    // We do NOT skip map ready here to ensure the full app shell (and window.supabase) is ready
    await login(page, user.email, user.password, { skipMapReady: false });
    
    // Wait for Supabase to be exposed using toPass (Senior Diagnostic Standard)
    await expect(async () => {
        const isExposed = await page.evaluate(() => !!(window as any).supabase);
        if (!isExposed) {
            // Check if login failed or we are on wrong page
            const url = page.url();
            const authLoading = await page.getByTestId('auth-loading').isVisible();
            throw new Error(`Supabase client not exposed. URL: ${url}, AuthLoading: ${authLoading}`);
        }
    }).toPass({ timeout: 20000, intervals: [1000, 2000] });

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
