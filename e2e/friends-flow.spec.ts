import { test, MockMapsManager, createDefaultMockState } from './utils';
import { login, ensureProfileReady, setupFriendship, removeFriend } from './helpers';

test.describe('Friends Interaction Flow', () => {
  test('User A can send friend request and User B can accept it', async ({ browser, user: user1, user2, viewport, userAgent }) => {
    test.setTimeout(90000);
    
    try {
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

      // Login and establish friendship
      await test.step('Establish Friendship', async () => {
        await managerA.useRealSocial();
        await managerA.initDefaultMocks({ currentUserId: user1.id });
        await login(pageA, user1.email, user1.password);
        await ensureProfileReady(pageA);

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
      // Cleanup handled by user fixtures
    }
  });
});


