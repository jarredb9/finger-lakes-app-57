import { test, expect, createTestUser, deleteTestUser, MockMapsManager } from './utils';
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
    expectWineryStatusInStore
} from './helpers';

test.describe('Item Privacy Flow (Favorites & Wishlist)', () => {
  test('Users can control privacy of their favorites and wishlist', async ({ browser, user: user1, viewport, userAgent }) => {
    test.setTimeout(180000);
    // 1. Create second ephemeral test user
    const user2 = await createTestUser();

    try {
      // 2. Create isolated contexts using project defaults
      const contextA = await browser.newContext({ viewport, userAgent });
      const contextB = await browser.newContext({ viewport, userAgent });
      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();

      const managerA = new MockMapsManager(pageA);
      const managerB = new MockMapsManager(pageB);
      
      managerA.setupLogging();
      managerB.setupLogging();

      // 3. Setup: Login and establish friendship
      await test.step('Initial Setup: Login & Friendship', async () => {
        await managerA.useRealSocial();
        await managerA.useRealFavorites();
        await managerA.initDefaultMocks({ currentUserId: user1.id });
        await login(pageA, user1.email, user1.password);
        await pageA.evaluate((email) => { (window as any)._E2E_USER_EMAIL = email; }, user1.email);
        await ensureProfileReady(pageA);

        await managerB.useRealSocial();
        await managerB.useRealFavorites();
        await managerB.initDefaultMocks({ currentUserId: user2.id });
        await login(pageB, user2.email, user2.password);
        await pageB.evaluate((email) => { (window as any)._E2E_USER_EMAIL = email; }, user2.email);
        await ensureProfileReady(pageB);

        await setupFriendship(pageA, pageB, user1.email, user2.email);
      });

      // 4. User A favorites and wishlists a winery
      await test.step('User A favorites and wishlists a winery', async () => {
        await managerA.useRealVisits(); 
        
        await navigateToTab(pageA, 'Explore');
        await waitForMapReady(pageA);
        await ensureSidebarExpanded(pageA);

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
        
        await Promise.all([
            pageA.waitForResponse(resp => resp.url().includes('rpc/toggle_favorite') && resp.status() === 200),
            favBtn.click({ force: true })
        ]);
        await expectWineryStatusInStore(pageA, 'Mock Winery One', 'favorite', true);

        // Wait for any toast to disappear if it might block the next button
        await pageA.locator('[role="status"], [role="alert"]').isHidden().catch(() => null);

        // Wishlist
        const wishBtn = pageA.getByTestId('wishlist-button');
        await expect(wishBtn).toBeVisible({ timeout: 10000 });
        
        await Promise.all([
            pageA.waitForResponse(resp => resp.url().includes('rpc/toggle_wishlist') && resp.status() === 200),
            wishBtn.click({ force: true })
        ]);
        await expectWineryStatusInStore(pageA, 'Mock Winery One', 'wishlist', true);
        
        await closeWineryModal(pageA);
      });

      // 5. User B views User A's profile and sees the items
      await test.step('User B sees public items', async () => {
        await navigateToTab(pageB, 'Friends');
        await ensureSidebarExpanded(pageB);
        
        // Force a refresh of the friends store to ensure the new status is picked up
        await pageB.evaluate(async () => {
            // @ts-ignore
            const store = window.useFriendStore?.getState();
            if (store) await store.fetchFriends();
        });

        const sidebarB = getSidebarContainer(pageB);
        
        const userALink = sidebarB.locator('a', { hasText: user1.email.split('@')[0] });
        await userALink.scrollIntoViewIfNeeded();
        await userALink.click({ force: true });

        await expect(pageB.getByText('Favorites', { exact: false }).first()).toBeVisible();
        await expect(pageB.getByTestId('favorite-count')).toHaveText('1');
        await expect(pageB.getByTestId('wishlist-count')).toHaveText('1');
      });

      // 6. User A makes the favorite and wishlist private
      await test.step('User A makes items private', async () => {
        await navigateToTab(pageA, 'Explore');
        await ensureSidebarExpanded(pageA);
        await openWineryDetails(pageA, 'Mock Winery One');
        
        const favPrivacyToggle = pageA.getByTestId('favorite-privacy-toggle');
        await expect(favPrivacyToggle).toBeVisible();
        
        await Promise.all([
            pageA.waitForResponse(resp => resp.url().includes('rpc/toggle_favorite_privacy') && resp.status() === 200),
            favPrivacyToggle.click({ force: true })
        ]);
        
        await expectWineryPrivacyInStore(pageA, 'Mock Winery One', 'favorite', true);

        // Small delay to allow the first toast to settle/not overlap with the next toggle click if needed
        await pageA.waitForTimeout(1000);

        const wishPrivacyToggle = pageA.getByTestId('wishlist-privacy-toggle');
        await expect(wishPrivacyToggle).toBeVisible();
        
        await Promise.all([
            pageA.waitForResponse(resp => resp.url().includes('rpc/toggle_wishlist_privacy') && resp.status() === 200),
            wishPrivacyToggle.click({ force: true })
        ]);
        
        await expectWineryPrivacyInStore(pageA, 'Mock Winery One', 'wishlist', true);

        await closeWineryModal(pageA);
      });

      // 7. User B sees items are hidden
      await test.step('User B sees private items hidden', async () => {
        // Wait for potential backend/cache settlement
        await pageB.waitForTimeout(2000);
        
        await expect(async () => {
            await pageB.evaluate(async (friendId) => {
                // @ts-ignore
                const store = window.useFriendStore?.getState();
                if (store) {
                    await store.fetchFriendProfile(friendId);
                }
            }, user1.id);
            
            await expect(pageB.getByTestId('favorite-count')).toHaveText('0');
            await expect(pageB.getByTestId('wishlist-count')).toHaveText('0');
        }).toPass({ timeout: 30000 });
      });

      await contextA.close();
      await contextB.close();
    } finally {
      await deleteTestUser(user2.id);
    }
  });
});
