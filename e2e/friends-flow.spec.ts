import { test, MockMapsManager, deleteTestUser } from './utils';
import { login, ensureProfileReady, setupFriendship, removeFriend } from './helpers';

test.describe('Friends Interaction Flow', () => {
  test('User A can send friend request and User B can accept it', async ({ browser, user: user1 }) => {
    test.setTimeout(90000);
    
    // User 2 is created via deprecated helper to maintain context isolation 
    // for this multi-user test until the fixture supports dual-user generation.
    const { createTestUser } = require('./utils');
    const user2 = await createTestUser();

    try {
      const contextA = await browser.newContext();
      const contextB = await browser.newContext();
      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();

      // Login and establish friendship
      await test.step('Establish Friendship', async () => {
        const managerA = new MockMapsManager(pageA);
        await managerA.useRealSocial();
        await managerA.initDefaultMocks({ currentUserId: user1.id });
        await login(pageA, user1.email, user1.password);
        await ensureProfileReady(pageA);

        const managerB = new MockMapsManager(pageB);
        await managerB.useRealSocial();
        await managerB.initDefaultMocks({ currentUserId: user2.id });
        await login(pageB, user2.email, user2.password);
        await ensureProfileReady(pageB);

        await setupFriendship(pageA, pageB, user1.email, user2.email);
      });

      // Cleanup: User A removes User B
      await test.step('Remove Friend', async () => {
        await removeFriend(pageA, user2.email);
      });

      await contextA.close();
      await contextB.close();
    } finally {
      await deleteTestUser(user2.id);
    }
  });
});
