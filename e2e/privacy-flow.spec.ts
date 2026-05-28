import { test, expect, MockMapsManager, createDefaultMockState } from './utils';
import { 
    getSidebarContainer, 
    login, 
    navigateToTab, 
    setupFriendship, 
    waitForMapReady, 
    openWineryDetails, 
    logVisit, 
    closeWineryModal,
    selectPrivacyOption,
    ensureSidebarExpanded
} from './helpers';

test.describe('Privacy and Profile Flow', () => {
  test('Users can control visit and profile visibility', async ({ browser, user: user1, user2, viewport, userAgent }) => {
    test.slow();
    
    try {
      // 2. Create isolated contexts using project defaults
      const contextA = await browser.newContext({ viewport, userAgent });
      const contextB = await browser.newContext({ viewport, userAgent });
      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();

      const sharedState = createDefaultMockState();
      const managerA = new MockMapsManager(pageA, sharedState);
      const managerB = new MockMapsManager(pageB, sharedState);

      // 3. Setup: Login and establish friendship
      await test.step('Initial Setup: Login & Friendship', async () => {
        await managerA.useRealSocial();
        await managerA.initDefaultMocks({ currentUserId: user1.id });
        await login(pageA, user1.email, user1.password);

        await managerB.useRealSocial();
        await managerB.initDefaultMocks({ currentUserId: user2.id });
        await login(pageB, user2.email, user2.password);

        await setupFriendship(pageA, pageB, user1.email, user2.email);
      });

      // 4. User A logs one public and one private visit
      await test.step('User A logs public and private visits', async () => {
        await managerA.useRealVisits(); 
        
        // Ensure Explore tab is active after setupFriendship (which navigates to Friends)
        await navigateToTab(pageA, 'Explore');
        await waitForMapReady(pageA);
        
        // Expand on mobile for interaction safety
        await ensureSidebarExpanded(pageA);

        await openWineryDetails(pageA, 'Mock Winery One');
        
        // Log Public Visit
        const logBtn = pageA.getByTestId('log-visit-button');
        await logBtn.scrollIntoViewIfNeeded();
        await logBtn.click({ force: true });
        await logVisit(pageA, { review: 'This is a public review' });

        // Log Private Visit
        await pageA.waitForTimeout(1000); // Buffer for scroll and animations to settle
        await logBtn.scrollIntoViewIfNeeded();
        
        // Hybrid click strategy for cross-engine stability
        await logBtn.click({ force: true });
        const isModalOpen = await pageA.evaluate(() => (window as any).useUIStore?.getState().isModalOpen);
        if (!isModalOpen) {
            await logBtn.click({ force: true });
        }
        
        await logVisit(pageA, { review: 'This is a private review', isPrivate: true });

        await closeWineryModal(pageA);
      });

      // 5. User B views User A's profile
      await test.step('User B views User A profile', async () => {
        await navigateToTab(pageB, 'Friends');
        await ensureSidebarExpanded(pageB);
        const sidebarB = getSidebarContainer(pageB);
        
        // Find User A in friends list
        const userALink = sidebarB.locator('a', { hasText: user1.email.split('@')[0] });
        await expect(userALink).toBeVisible({ timeout: 15000 });
        await userALink.click({ force: true });

        // Verify on profile page
        await expect(pageB).toHaveURL(new RegExp(`/friends/${user1.id}`));
        
        // Check visits visibility: Public should be visible, Private should not
        await expect(pageB.getByText('This is a public review')).toBeVisible({ timeout: 10000 });
        await expect(pageB.getByText('This is a private review')).not.toBeVisible();
      });

      // 6. User A sets profile to Private
      await test.step('User A sets profile to Private', async () => {
        await navigateToTab(pageA, 'Friends');
        await selectPrivacyOption(pageA, 'Private');
        await expect(pageA.getByText('Privacy set to private.').first()).toBeVisible({ timeout: 10000 });
      });

      // 7. User B tries to view User A's profile again
      await test.step('User B profile access denied', async () => {
        await pageB.reload();
        
        // Mobile guard: Ensure sheet is expanded to see the error message if we are in a context that has it
        if (await pageB.getByTestId('mobile-sidebar-container').isVisible()) {
            await ensureSidebarExpanded(pageB);
        }

        await expect(pageB.getByText('Access denied due to privacy settings')).toBeVisible({ timeout: 15000 });
      });

      await contextA.close();
      await contextB.close();
    } finally {
      // Cleanup handled by user fixtures
    }
  });
});
