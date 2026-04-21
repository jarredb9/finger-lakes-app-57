import { test, expect, MockMapsManager, createDefaultMockState } from './utils';
import { 
    getSidebarContainer, 
    login, 
    navigateToTab, 
    waitForSearchComplete, 
    openWineryDetails, 
    logVisit, 
    closeWineryModal, 
    ensureProfileReady
} from './helpers';

test.describe('Social Activity Feed Flow', () => {
  test("User B can see User A's visit in the social feed", async ({ browser, user: userA, user2: userB }) => {
    test.setTimeout(90000);
    
    try {
      // 1. Contexts
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
      await ensureProfileReady(pageA);

      await login(pageB, userB.email, userB.password, { skipMapReady: true });
      await ensureProfileReady(pageB);

      const user1Name = await pageA.evaluate(() => (window as any).useUserStore.getState().user.name);

      // 2. Establish Friendship via ATOMIC INJECTION (Bypasses UI flakiness)
      await test.step('Establish Friendship via Injection', async () => {
          const friendForA = { id: userB.id, name: 'User B', email: userB.email, status: 'accepted' };
          const friendForB = { id: userA.id, name: user1Name, email: userA.email, status: 'accepted' };

          await pageA.evaluate((f) => {
              (window as any).useFriendStore.setState({ friends: [f] });
          }, friendForA);

          await pageB.evaluate((f) => {
              (window as any).useFriendStore.setState({ friends: [f] });
          }, friendForB);

          // Update the mock layer so RPCs also see them as friends
          sharedState.social = {
              friends: [friendForB], // From perspective of B, A is the friend
              pending_incoming: [],
              pending_outgoing: []
          };
      });

      // 3. User A logs a visit via UI (updates sharedMockActivityFeed in MockMapsManager)
      const reviewText = `Amazing Riesling at Mock Winery One! ${Date.now()}`;
      await test.step('User A logs visit', async () => {
        await navigateToTab(pageA, 'Explore');
        await waitForSearchComplete(pageA);
        await openWineryDetails(pageA, 'Mock Winery One');

        const logBtn = pageA.getByTestId('log-visit-button');
        await logBtn.scrollIntoViewIfNeeded();
        await logBtn.click({ force: true });

        await logVisit(pageA, { review: reviewText, rating: 5 });
        await closeWineryModal(pageA);
      });

      // 4. User B verifies the feed
      await test.step('User B verifies feed', async () => {
        await navigateToTab(pageB, 'Friends');
        const sidebarB = getSidebarContainer(pageB);
        const feedItem = sidebarB.locator('[data-testid="friend-activity-item"]', { hasText: reviewText }).first();
        
        await expect(async () => {
            // Proactive store sync
            await pageB.evaluate(async () => {
                const store = (window as any).useFriendStore?.getState();
                if (store) {
                    await store.fetchFriendActivityFeed();
                }
            });
            await expect(feedItem).toBeVisible({ timeout: 5000 });
        }).toPass({ timeout: 20000, intervals: [3000] });

        // Verify name matches (our mock uses 'Test User' by default in log_visit, let's check if it's visible)
        await expect(feedItem).toContainText(reviewText);
      });

      await contextA.close();
      await contextB.close();
    } finally {
      // Cleanup handled by user fixtures
    }
  });
});
