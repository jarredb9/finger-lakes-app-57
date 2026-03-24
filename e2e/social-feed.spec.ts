import { test, expect, createTestUser, deleteTestUser, MockMapsManager } from './utils';
import { 
    getSidebarContainer, 
    login, 
    navigateToTab, 
    waitForSearchComplete, 
    openWineryDetails, 
    logVisit, 
    closeWineryModal, 
    ensureProfileReady,
    setupFriendship,
    removeFriend
} from './helpers';

test.describe('Social Activity Feed Flow', () => {
  test("User B can see User A's visit in the social feed", async ({ browser, user: userA }) => {
    test.setTimeout(90000);
    const userB = await createTestUser();
    
    try {
      // 1. Contexts
      const contextA = await browser.newContext();
      const contextB = await browser.newContext();
      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();

      const managerA = new MockMapsManager(pageA);
      const managerB = new MockMapsManager(pageB);

      // MANDATORY: Call useRealSocial before initDefaultMocks to prevent profile collisions
      await managerA.useRealSocial();
      await managerA.useRealVisits();
      await managerA.initDefaultMocks({ currentUserId: userA.id });

      await managerB.useRealSocial();
      await managerB.useRealVisits();
      await managerB.initDefaultMocks({ currentUserId: userB.id });

      await login(pageA, userA.email, userA.password, { skipMapReady: true });
      await ensureProfileReady(pageA);

      await login(pageB, userB.email, userB.password, { skipMapReady: true });
      await ensureProfileReady(pageB);

      // 2. Establish Friendship via UI helper
      await setupFriendship(pageA, pageB, userA.email, userB.email);

      const user1Name = await pageA.evaluate(() => (window as any).useUserStore.getState().user.name);

      // 3. User A logs a visit via UI
      const reviewText = `Amazing Riesling at Mock Winery One! ${Date.now()}`;
      await test.step('User A logs visit', async () => {
        await navigateToTab(pageA, 'Explore');
        await waitForSearchComplete(pageA);
        await openWineryDetails(pageA, 'Mock Winery One');
        await logVisit(pageA, { review: reviewText, rating: 5 });
        await closeWineryModal(pageA);
      });

      // 4. User B verifies the feed
      await test.step('User B verifies feed', async () => {
        await navigateToTab(pageB, 'Friends');
        const sidebarB = getSidebarContainer(pageB);
        
        await expect(async () => {
            // Proactive store sync
            await pageB.evaluate(async () => {
                const store = (window as any).useFriendStore?.getState();
                if (store) {
                    await store.fetchFriends();
                    await store.fetchFriendActivityFeed();
                }
            });
            const feedItem = sidebarB.locator('[data-testid="friend-activity-item"]', { hasText: reviewText }).first();
            await expect(feedItem).toBeVisible({ timeout: 5000 });
        }).toPass({ timeout: 45000, intervals: [5000] });

        await expect(sidebarB.getByText(user1Name).first()).toBeVisible();
      });

      // 5. Cleanup: Remove friendship via UI
      await removeFriend(pageA, userB.email);

      await contextA.close();
      await contextB.close();
    } finally {
      await deleteTestUser(userB.id);
    }
  });
});
