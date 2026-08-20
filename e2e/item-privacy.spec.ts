import { test, expect, MockMapsManager, createDefaultMockState } from './utils';
import { 
    getSidebarContainer, 
    login, 
    navigateToTab, 
    setupFriendship, 
    waitForMapReady, 
    openWineryDetails, 
    closeWineryModal,
    ensureSidebarExpanded,
    ensureProfileReady,
    expectWineryPrivacyInStore,
    expectWineryStatusInStore,
    waitForSignal,
    refreshFriendsStore
} from './helpers';

test.describe('Item Privacy Flow (Favorites & Wishlist)', () => {
  test('Users can control privacy of their favorites and wishlist', async ({ browser, user: user1, user2, viewport, userAgent }) => {
    test.setTimeout(180000);
    
    try {
      // 2. Create isolated contexts using project defaults
      const contextA = await browser.newContext({ viewport, userAgent });
      const contextB = await browser.newContext({ viewport, userAgent });
      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();

      await pageA.addInitScript(() => { (window as any)._E2E_FULL_DRAWER = true; });
      await pageB.addInitScript(() => { (window as any)._E2E_FULL_DRAWER = true; });

      const sharedState = createDefaultMockState();
      const managerA = new MockMapsManager(pageA, sharedState);
      const managerB = new MockMapsManager(pageB, sharedState);
      
      managerA.setupLogging();
      managerB.setupLogging();

      // 3. Setup: Login and establish friendship
      await test.step('Initial Setup: Login & Friendship', async () => {
        await managerA.useRealSocial();
        await managerA.useRealFavorites();
        await managerA.useRealVisits();
        await managerA.initDefaultMocks({ currentUserId: user1.id });
        await login(pageA, user1.email, user1.password);
        await pageA.evaluate((email) => { (window as any)._E2E_USER_EMAIL = email; }, user1.email);
        await ensureProfileReady(pageA);

        await managerB.useRealSocial();
        await managerB.useRealFavorites();
        await managerB.useRealVisits();
        await managerB.initDefaultMocks({ currentUserId: user2.id });
        await login(pageB, user2.email, user2.password);
        await pageB.evaluate((email) => { (window as any)._E2E_USER_EMAIL = email; }, user2.email);
        await ensureProfileReady(pageB);

        await setupFriendship(pageA, pageB, user1.email, user2.email);
      });

      // 4. User A favorites and wishlists a winery
      await test.step('User A favorites and wishlists a winery', async () => {
        await navigateToTab(pageA, 'Explore');
        await waitForMapReady(pageA);

        // Ensure sidebar is populated with markers
        await pageA.evaluate(() => {
            const win = window as any;
            if (win.useWineryStore) {
                const userId = win.useUserStore?.getState().user?.id;
                if (userId) win.useWineryStore.getState().fetchWineryData(userId);
            }
        });

        await openWineryDetails(pageA, 'Mock Winery One');
        
        // Favorite
        const favBtn = pageA.getByTestId('favorite-button');
        await expect(favBtn).toBeVisible({ timeout: 10000 });
        await favBtn.scrollIntoViewIfNeeded();
        
        await Promise.all([
            pageA.waitForResponse(resp => resp.url().includes('rpc/toggle_favorite') && resp.status() === 200),
            favBtn.click()
        ]);
        await expectWineryStatusInStore(pageA, 'Mock Winery One', 'favorite', true);

        // Wait for any toast to disappear if it might block the next button
        await expect(pageA.locator('[role="status"], [role="alert"]')).not.toBeVisible({ timeout: 10000 }).catch(() => null);

        // Wishlist
        const wishBtn = pageA.getByTestId('wishlist-button');
        await expect(wishBtn).toBeVisible({ timeout: 10000 });
        await wishBtn.scrollIntoViewIfNeeded();
        
        await Promise.all([
            pageA.waitForResponse(resp => resp.url().includes('rpc/toggle_wishlist') && resp.status() === 200),
            wishBtn.click()
        ]);
        await expectWineryStatusInStore(pageA, 'Mock Winery One', 'wishlist', true);
        
        await closeWineryModal(pageA);
      });

      // 5. User B views User A's profile and sees the items
      await test.step('User B sees public items', async () => {
        await navigateToTab(pageB, 'Friends');
        await ensureSidebarExpanded(pageB);
        
        // Force a refresh of the friends store to ensure the new status is picked up
        await refreshFriendsStore(pageB);

        const sidebarB = getSidebarContainer(pageB);
        
        const userARow = sidebarB.locator(`[data-testid="friend-row-${user1.email}"]`).first();
        await expect(userARow).toBeVisible({ timeout: 10000 });
        
        const userALink = userARow.locator('a').first();
        await userALink.scrollIntoViewIfNeeded();
        await userALink.click();

        // Readiness gate: Wait for friend profile component to complete loading
        await waitForSignal(pageB, 'friend-profile-container', 'ready', 15000);

        const profileContainer = pageB.locator('[data-testid="friend-profile-container"]');
        await expect(profileContainer.getByText('Favorites', { exact: false }).first()).toBeVisible();
        await expect(profileContainer.getByTestId('favorite-count')).toHaveText('1');
        await expect(profileContainer.getByTestId('wishlist-count')).toHaveText('1');
      });

      // 6. User A makes the favorite and wishlist private
      // NOTE: User A is already on Explore tab from step 4 — do NOT re-navigate,
      // as that triggers get_map_markers re-fetch which overwrites store state.
      await test.step('User A makes items private', async () => {
        await openWineryDetails(pageA, 'Mock Winery One');
        
        const favPrivacyToggle = pageA.getByTestId('favorite-privacy-toggle');
        await expect(favPrivacyToggle).toBeVisible({ timeout: 10000 });
        await favPrivacyToggle.scrollIntoViewIfNeeded();
        
        await Promise.all([
            pageA.waitForResponse(resp => resp.url().includes('rpc/toggle_favorite_privacy') && resp.status() === 200),
            favPrivacyToggle.click()
        ]);
        
        await expectWineryPrivacyInStore(pageA, 'Mock Winery One', 'favorite', true);

        // Wait for any toast to disappear if needed before next interaction
        await expect(pageA.locator('[role="status"], [role="alert"]')).not.toBeVisible({ timeout: 10000 }).catch(() => null);

        const wishPrivacyToggle = pageA.getByTestId('wishlist-privacy-toggle');
        await expect(wishPrivacyToggle).toBeVisible({ timeout: 10000 });
        await wishPrivacyToggle.scrollIntoViewIfNeeded();
        
        await Promise.all([
            pageA.waitForResponse(resp => resp.url().includes('rpc/toggle_wishlist_privacy') && resp.status() === 200),
            wishPrivacyToggle.click()
        ]);
        
        await expectWineryPrivacyInStore(pageA, 'Mock Winery One', 'wishlist', true);

        await closeWineryModal(pageA);
      });

      // 7. User B sees items are hidden
      await test.step('User B sees private items hidden', async () => {
        await pageB.reload();
        if (await pageB.getByTestId('mobile-sidebar-container').isVisible().catch(() => false)) {
            await ensureSidebarExpanded(pageB);
        }
        await waitForSignal(pageB, 'friend-profile-container', 'ready', 15000);

        const profileContainer = pageB.locator('[data-testid="friend-profile-container"]');
        await expect(profileContainer.getByTestId('favorite-count')).toHaveText('0');
        await expect(profileContainer.getByTestId('wishlist-count')).toHaveText('0');
      });

      await contextA.close();
      await contextB.close();
    } finally {
      // Cleanup handled by user fixtures
    }
  });
});

