import { test, expect, createTestUser, deleteTestUser, MockMapsManager } from './utils';
import { getSidebarContainer, login, navigateToTab, robustClick, setupFriendship, ensureSidebarExpanded } from './helpers';

test.describe('Friends Interaction Flow', () => {
  test('User A can send friend request and User B can accept it', async ({ browser, user: user1 }) => {
    // 1. Create second ephemeral test user
    const user2 = await createTestUser();

    try {
      // 2. Create isolated contexts
      const contextA = await browser.newContext();
      const contextB = await browser.newContext();
      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();

      // 3. Login and establish friendship using high-level helper
      await test.step('Login & Establish Friendship', async () => {
        const managerA = new MockMapsManager(pageA);
        await managerA.initDefaultMocks();
        await managerA.useRealSocial();
        await login(pageA, user1.email, user1.password);

        const managerB = new MockMapsManager(pageB);
        await managerB.initDefaultMocks();
        await managerB.useRealSocial();
        await login(pageB, user2.email, user2.password);

        await setupFriendship(pageA, pageB, user1.email, user2.email);
      });

      // 4. Cleanup (User A removes User B)
      await test.step('Cleanup: User A removes User B', async () => {
        await pageA.reload();
        await navigateToTab(pageA, 'Friends');
        await ensureSidebarExpanded(pageA);
        
        const sidebar = getSidebarContainer(pageA);
        const friendsCard = sidebar.locator('.rounded-lg.border').filter({ hasText: 'My Friends' });
        const friendRow = friendsCard.locator('.flex.items-center', { hasText: user2.email });
        const removeBtn = friendRow.getByRole('button', { name: 'Remove friend' });

        await robustClick(pageA, removeBtn);
        await robustClick(pageA, pageA.getByRole('button', { name: 'Remove' })); 
        
        await expect(friendsCard.locator('text=' + user2.email)).not.toBeVisible({ timeout: 10000 });
      });

      await contextA.close();
      await contextB.close();
    } finally {
      await deleteTestUser(user2.id);
    }
  });
});
