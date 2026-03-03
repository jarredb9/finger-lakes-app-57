import { test, expect, createTestUser, deleteTestUser, MockMapsManager, supabase } from './utils';
import { getSidebarContainer, login, navigateToTab, waitForSearchComplete, openWineryDetails, logVisit, closeWineryModal, ensureProfileReady } from './helpers';

test.describe('Social Activity Feed Flow', () => {
  test("User B can see User A's visit in the social feed", async ({ browser, user: userA }) => {
    test.setTimeout(90000);
    const userB = await createTestUser();
    
    try {
      // 1. Forge backend friendship for total isolation and speed
      await test.step('Forge backend friendship', async () => {
          await supabase.from('friends').insert({
            user1_id: userA.id,
            user2_id: userB.id,
            status: 'accepted'
          });
          // Ensure profiles are public for the test
          await supabase.from('profiles').update({ privacy_level: 'public' }).eq('id', userA.id);
          await supabase.from('profiles').update({ privacy_level: 'public' }).eq('id', userB.id);
      });

      // 2. Contexts
      const contextA = await browser.newContext();
      const contextB = await browser.newContext();
      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();

      const managerA = new MockMapsManager(pageA);
      await managerA.useRealSocial();
      await managerA.useRealVisits();
      await managerA.initDefaultMocks();
      await login(pageA, userA.email, userA.password, { skipMapReady: true });
      await ensureProfileReady(pageA);

      const managerB = new MockMapsManager(pageB);
      await managerB.useRealSocial();
      await managerB.useRealVisits();
      await managerB.initDefaultMocks();
      await login(pageB, userB.email, userB.password, { skipMapReady: true });
      await ensureProfileReady(pageB);

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

      await contextA.close();
      await contextB.close();
    } finally {
      await deleteTestUser(userB.id);
    }
  });
});
