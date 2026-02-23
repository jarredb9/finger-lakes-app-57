 
import { test, expect, createTestUser, deleteTestUser, MockMapsManager, supabase } from './utils';
import { getSidebarContainer, login, navigateToTab, robustClick, waitForSearchComplete } from './helpers';

test.describe('Social Activity Feed Flow', () => {
  test("User B can see User A's visit in the social feed after becoming friends", async ({ browser, user: user1 }) => {
    // Increased timeout for multi-context flow
    test.setTimeout(90000);
    
    // 1. Create User B
    const user2 = await createTestUser();

    try {
      const contextA = await browser.newContext();
      const contextB = await browser.newContext();
      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();

      const waitForStores = async (page: any) => {
          await expect.poll(async () => {
              return await page.evaluate(() => !!(window as any).useFriendStore);
          }, { timeout: 10000 }).toBeTruthy();
      };

      // 2. Setup Mocks and Login both
      // We use Real Social and Real Visits to hit the actual DB loop
      const managerA = new MockMapsManager(pageA);
      await managerA.useRealSocial();
      await managerA.useRealVisits();
      await managerA.initDefaultMocks();
      await login(pageA, user1.email, user1.password, { skipMapReady: true });

      const managerB = new MockMapsManager(pageB);
      await managerB.useRealSocial();
      await managerB.useRealVisits();
      await managerB.initDefaultMocks();
      await login(pageB, user2.email, user2.password, { skipMapReady: true });

      // Stabilization: Ensure both profiles are fully initialized with names
      await Promise.all([
          supabase.from('profiles').update({ name: 'User A' }).eq('id', user1.id),
          supabase.from('profiles').update({ name: 'User B' }).eq('id', user2.id)
      ]);

      await Promise.all([
          expect.poll(async () => {
              const { data } = await supabase.from('profiles').select('name').eq('id', user1.id).single();
              return data?.name;
          }, { timeout: 15000 }).toBe('User A'),
          expect.poll(async () => {
              const { data } = await supabase.from('profiles').select('name').eq('id', user2.id).single();
              return data?.name;
          }, { timeout: 15000 }).toBe('User B')
      ]);

      // 3. Establish Friendship
      await test.step('Establish Friendship', async () => {
        await navigateToTab(pageA, 'Friends');
        const sidebarA = getSidebarContainer(pageA);
        
        const emailInput = sidebarA.getByPlaceholder("Enter friend's email");
        await emailInput.fill(user2.email);
        
        const addBtn = sidebarA.locator('button').filter({ hasText: /^Add$/ }).first();
        await addBtn.waitFor({ state: 'visible', timeout: 15000 });
        await expect(addBtn).toBeEnabled({ timeout: 15000 });
        await robustClick(pageA, addBtn);
        
        const toast = pageA.locator('[role="status"]').filter({ hasText: /Friend request sent/i }).first();
        await expect(toast).toBeVisible({ timeout: 15000 });

        // User B reloads manually via evaluate to avoid session wiping
        await expect(async () => {
            await waitForStores(pageB);
            await pageB.evaluate(async () => {
                // @ts-ignore
                const store = window.useFriendStore && window.useFriendStore.getState();
                if (store) await store.fetchFriends();
            });

            await navigateToTab(pageB, 'Friends');
            const sidebarB = getSidebarContainer(pageB);
            const acceptBtn = sidebarB.getByRole('button', { name: 'Accept request' });
            
            // If not visible, try a manual refresh
            if (!await acceptBtn.isVisible()) {
                await pageB.evaluate(async () => {
                    // @ts-ignore
                    const store = window.useFriendStore && window.useFriendStore.getState();
                    if (store) await store.fetchFriends();
                });
            }

            await expect(acceptBtn).toBeVisible({ timeout: 5000 });
        }).toPass({ timeout: 30000, intervals: [3000, 5000] });

        const sidebarB = getSidebarContainer(pageB);
        const acceptBtn = sidebarB.getByRole('button', { name: 'Accept request' });
        
        const respondPromise = pageB.waitForResponse(resp => resp.url().includes('respond_to_friend_request') && resp.status() === 204);
        await acceptBtn.evaluate(el => (el as HTMLElement).click());
        await respondPromise;
        
        await expect(sidebarB.locator('text=' + user1.email)).toBeVisible({ timeout: 10000 });
        await pageB.waitForTimeout(2000);

        // Verify User A also sees User B as friend
        await expect(async () => {
            await pageA.evaluate(async () => {
                // @ts-ignore
                const store = window.useFriendStore && window.useFriendStore.getState();
                if (store) await store.fetchFriends();
            });
            await navigateToTab(pageA, 'Friends');
            const sidebarA_retry = getSidebarContainer(pageA);
            await expect(sidebarA_retry.locator('text=' + user2.email)).toBeVisible({ timeout: 5000 });
        }).toPass({ timeout: 15000, intervals: [3000, 5000] });
      });

      // 4. User A logs a visit
      const reviewText = `Amazing Riesling at Mock Winery One! ${Date.now()}`;
      await test.step('User A logs visit', async () => {
        await navigateToTab(pageA, 'Explore');
        const sidebarA = getSidebarContainer(pageA);
        await waitForSearchComplete(pageA);

        const wineryItem = sidebarA.getByText('Mock Winery One').first();
        await robustClick(pageA, wineryItem);

        const modal = pageA.getByRole('dialog');
        await robustClick(pageA, modal.getByLabel('Set rating to 5'));
        await modal.getByLabel('Your Review').fill(reviewText);
        
        const logResponsePromise = pageA.waitForResponse(resp => resp.url().includes('log_visit') && resp.status() === 200);
        await robustClick(pageA, modal.getByRole('button', { name: 'Add Visit' }));
        await logResponsePromise;

        const historyItem = modal.getByText(reviewText).first();
        await expect(historyItem).toBeVisible({ timeout: 10000 });
        
        const closeBtn = modal.getByRole('button', { name: /close/i });
        if (await closeBtn.isVisible()) {
            await robustClick(pageA, closeBtn);
        } else {
            await pageA.keyboard.press('Escape');
        }
        await expect(modal).not.toBeVisible({ timeout: 10000 });
      });

      // 5. User B sees it in the feed
      await test.step('User B verifies feed', async () => {
        await navigateToTab(pageB, 'Friends');
        const sidebarB = getSidebarContainer(pageB);
        
        await expect(async () => {
            await waitForStores(pageB);
            await pageB.evaluate(async () => {
                // @ts-ignore
                const store = window.useFriendStore && window.useFriendStore.getState();
                if (store) {
                    await store.fetchFriends();
                    await store.fetchFriendActivityFeed();
                }
            });

            const feedItem = sidebarB.getByText(reviewText).first();
            await expect(feedItem).toBeVisible({ timeout: 5000 });
        }).toPass({ timeout: 45000, intervals: [5000] });

        await expect(sidebarB.getByText(user1.email.split('@')[0]).first()).toBeVisible();
      });

      await contextA.close();
      await contextB.close();
    } finally {
      await deleteTestUser(user2.id);
    }
  });
});
