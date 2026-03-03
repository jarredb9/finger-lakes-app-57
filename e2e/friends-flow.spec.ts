import { test, expect, createTestUser, deleteTestUser, MockMapsManager } from './utils';
import { getSidebarContainer, login, navigateToTab, robustClick, setupFriendship, ensureSidebarExpanded, ensureProfileReady } from './helpers';

test.describe('Friends Interaction Flow', () => {
  test('User A can send friend request and User B can accept it', async ({ browser, user: user1 }) => {
    test.setTimeout(90000);
    const user2 = await createTestUser();

    try {
      const contextA = await browser.newContext();
      const contextB = await browser.newContext();
      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();

      // 3. Login and establish friendship
      await test.step('Login & Establish Friendship', async () => {
        const managerA = new MockMapsManager(pageA);
        await managerA.useRealSocial();
        await managerA.initDefaultMocks();
        await login(pageA, user1.email, user1.password);
        await ensureProfileReady(pageA);

        const managerB = new MockMapsManager(pageB);
        await managerB.useRealSocial();
        await managerB.initDefaultMocks();
        await login(pageB, user2.email, user2.password);
        await ensureProfileReady(pageB);

        await setupFriendship(pageA, pageB, user1.email, user2.email);
      });

      // 4. Cleanup (User A removes User B)
      await test.step('Cleanup: User A removes User B', async () => {
        await navigateToTab(pageA, 'Friends');
        await ensureSidebarExpanded(pageA);
        
        const sidebar = getSidebarContainer(pageA);
        
        await expect(async () => {
            // Aggressive sync: reload and wait for network
            await pageA.reload();
            await pageA.waitForLoadState('networkidle');
            await navigateToTab(pageA, 'Friends');
            await ensureSidebarExpanded(pageA);

            const friendsCard = sidebar.locator('[data-testid="my-friends-card"]');
            const friendRow = friendsCard.locator('.flex.items-center', { hasText: user2.email }).first();
            
            if (!(await friendRow.isVisible())) {
                return; // Already removed or not visible
            }
            
            const removeBtn = friendRow.locator('button[aria-label="Remove friend"], [data-testid="remove-friend-btn"]').first();
            await robustClick(pageA, removeBtn);
            
            const confirmBtn = pageA.locator('button:has-text("Remove"), [data-testid="confirm-remove-btn"]').filter({ visible: true }).first();
            await robustClick(pageA, confirmBtn); 
            
            await expect(friendsCard.locator('text=' + user2.email)).not.toBeVisible({ timeout: 10000 });
        }).toPass({ timeout: 45000, intervals: [5000] });
      });

      await contextA.close();
      await contextB.close();
    } finally {
      await deleteTestUser(user2.id);
    }
  });
});
