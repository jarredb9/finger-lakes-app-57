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
    robustClick,
    ensureProfileReady
} from './helpers';

test.describe('Item Privacy Flow (Favorites & Wishlist)', () => {
  test('Users can control privacy of their favorites and wishlist', async ({ browser, user: user1, viewport, userAgent }) => {
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

      // 3. Setup: Login and establish friendship
      await test.step('Initial Setup: Login & Friendship', async () => {
        await managerA.initDefaultMocks();
        await managerA.useRealSocial();
        await managerA.useRealFavorites();
        await login(pageA, user1.email, user1.password);
        await ensureProfileReady(pageA);

        await managerB.initDefaultMocks();
        await managerB.useRealSocial();
        await managerB.useRealFavorites();
        await login(pageB, user2.email, user2.password);
        await ensureProfileReady(pageB);

        await setupFriendship(pageA, pageB, user1.email, user2.email);
      });

      // 4. User A favorites and wishlists a winery
      await test.step('User A favorites and wishlists a winery', async () => {
        await managerA.useRealVisits(); 
        
        await navigateToTab(pageA, 'Explore');
        await waitForMapReady(pageA);
        await ensureSidebarExpanded(pageA);

        await openWineryDetails(pageA, 'Mock Winery One');
        
        const favBtn = pageA.getByRole('button', { name: /Favorite/i });
        await robustClick(pageA, favBtn);

        const wishBtn = pageA.getByRole('button', { name: /Want to Go/i });
        await robustClick(pageA, wishBtn);
        
        await closeWineryModal(pageA);
      });

      // 5. User B views User A's profile and sees the items
      await test.step('User B sees public items', async () => {
        await navigateToTab(pageB, 'Friends');
        await ensureSidebarExpanded(pageB);
        const sidebarB = getSidebarContainer(pageB);
        
        const userALink = sidebarB.locator('a', { hasText: user1.email.split('@')[0] });
        await robustClick(pageB, userALink);

        await expect(pageB.getByText('Favorites')).toBeVisible();
        await expect(pageB.getByTestId('favorite-count')).toHaveText('1');
        await expect(pageB.getByTestId('wishlist-count')).toHaveText('1');
      });

      // 6. User A makes the favorite and wishlist private
      await test.step('User A makes items private', async () => {
        await navigateToTab(pageA, 'Explore');
        await openWineryDetails(pageA, 'Mock Winery One');
        
        const favPrivacyToggle = pageA.getByLabel(/Make favorite private/i);
        
        await robustClick(pageA, favPrivacyToggle);
        await expect(pageA.getByText(/Favorite is now private/i).first()).toBeVisible();

        const wishPrivacyToggle = pageA.getByLabel(/Make wishlist item private/i);
        
        await robustClick(pageA, wishPrivacyToggle);
        await expect(pageA.getByText(/Wishlist item is now private/i).first()).toBeVisible();

        await closeWineryModal(pageA);
      });

      // 7. User B sees items are hidden
      await test.step('User B sees private items hidden', async () => {
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
        }).toPass({ timeout: 20000 });
      });

      await contextA.close();
      await contextB.close();
    } finally {
      await deleteTestUser(user2.id);
    }
  });
});
