import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, TestUser, mockGoogleMapsApi } from './utils';
import { getSidebarContainer, login, navigateToTab } from './helpers';

test.describe('Social Activity Feed Flow', () => {
  let userA: TestUser;
  let userB: TestUser;

  test.beforeEach(async () => {
    // We use a HYBRID approach: Mock Google APIs (Zero Cost) but use REAL Supabase RPCs
    // to verify the complex social database logic.
    userA = await createTestUser();
    userB = await createTestUser();
  });

  test.afterEach(async () => {
    if (userA) await deleteTestUser(userA.id);
    if (userB) await deleteTestUser(userB.id);
  });

  test('User B can see User A\'s visit in the social feed after becoming friends', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    // Setup Hybrid Mocks for both pages
    // 1. Block Google Maps & Edge Functions (Zero Cost)
    // 2. Allow specific Friend/Visit RPCs (Real Logic)
    for (const page of [pageA, pageB]) {
        await mockGoogleMapsApi(page);
        
        // OVERRIDE: Allow these specific RPCs to hit the real DB
        await page.route(/\/rpc\/get_friends_and_requests/, async route => await route.continue());
        await page.route(/\/rpc\/send_friend_request/, async route => await route.continue());
        await page.route(/\/rpc\/respond_to_friend_request/, async route => await route.continue());
        await page.route(/\/rpc\/get_friend_activity_feed/, async route => await route.continue());
        await page.route(/\/rpc\/log_visit/, async route => await route.continue());
        // We leave get_map_markers MOCKED. This means the UI will show "Mock Winery One".
        // When we log a visit, it will send the mock winery data to the Real DB.
        // The real DB's log_visit -> ensure_winery logic will create/update this mock winery row.
    }

    // 1. Login both users
    await login(pageA, userA.email, userA.password);
    await login(pageB, userB.email, userB.password);

    // 2. Make them friends
    await test.step('Make users friends', async () => {
      // User A sends request to User B
      await navigateToTab(pageA, 'Friends');
      const sidebarA = getSidebarContainer(pageA);
      const emailInput = sidebarA.getByPlaceholder("Enter friend's email");
      await emailInput.fill(userB.email);
      await sidebarA.getByRole('button', { name: 'Add friend' }).click();
      await expect(pageA.getByText('Friend request sent!', { exact: true }).first()).toBeVisible();

      // User B accepts request
      await pageB.reload(); // Refresh to see request
      await navigateToTab(pageB, 'Friends');
      const sidebarB = getSidebarContainer(pageB);
      const acceptBtn = sidebarB.getByRole('button', { name: 'Accept request' });
      await expect(acceptBtn).toBeVisible();
      await acceptBtn.click();
      await expect(sidebarB.locator('.rounded-lg.border').filter({ hasText: 'My Friends' }).getByText(userA.email)).toBeVisible();
    });

    // 3. User A logs a visit
    const reviewText = `Great wine at this place! ${Math.random()}`;
    await test.step('User A logs a visit', async () => {
      await navigateToTab(pageA, 'Explore');
      const sidebarA = getSidebarContainer(pageA);
      
      // Wait for search to finish
      await expect.poll(async () => {
        return await pageA.evaluate(() => (window as any).useMapStore?.getState().isSearching);
      }, { timeout: 15000 }).toBe(false);

      const wineryCard = sidebarA.locator('[data-testid="winery-card"]').first();
      await expect(wineryCard).toBeVisible({ timeout: 15000 });
      await wineryCard.click();
      
      const modal = pageA.getByRole('dialog');
      await expect(modal).toBeVisible();
      
      await modal.getByLabel('Set rating to 5').click();
      await modal.getByLabel('Your Review').fill(reviewText);
      await modal.getByRole('button', { name: 'Add Visit' }).click();
      await expect(pageA.getByText('Visit added successfully.', { exact: true }).first()).toBeVisible();
      await modal.getByRole('button', { name: 'Close' }).click();

      // Verify User A can see it in their own history
      await navigateToTab(pageA, 'History');
      const sidebarA_History = getSidebarContainer(pageA);
      await expect(sidebarA_History.getByText(reviewText)).toBeVisible({ timeout: 10000 });
      console.log('User A successfully verified their own visit in history.');
    });

    // 4. User B checks social feed
    await test.step('User B verifies social feed', async () => {
      // Refresh to ensure we get the latest feed
      await pageB.reload();
      await navigateToTab(pageB, 'Friends');
      const sidebarB = getSidebarContainer(pageB);
      
      // Expand on mobile if needed
      const expandButton = pageB.getByRole('button', { name: 'Expand to full screen' });
      if (await expandButton.isVisible()) {
          await expandButton.click();
      }

      // Check for the visit in the activity feed
      const feedItem = sidebarB.locator('div.rounded-lg.border', { hasText: reviewText }).first();
      await expect(feedItem).toBeVisible({ timeout: 20000 });
      
      // Also verify winery name is present in that card
      await expect(feedItem).toContainText('visited');
    });

    await contextA.close();
    await contextB.close();
  });
});
