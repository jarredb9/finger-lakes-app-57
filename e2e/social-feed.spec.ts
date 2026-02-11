import { test, expect, createTestUser, deleteTestUser } from './utils';
import { getSidebarContainer, login, navigateToTab } from './helpers';

test.describe('Social Activity Feed Flow', () => {
  test('User B can see User A\'s visit in the social feed after becoming friends', async ({ browser, user: userA }) => {
    // 1. Create second ephemeral test user
    const userB = await createTestUser();

    try {
      const contextA = await browser.newContext();
      const contextB = await browser.newContext();
      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();

      // 2. Setup Hybrid Mocks for both pages
      for (const page of [pageA, pageB]) {
          await test.step('Init Mocks', async () => {
              const { MockMapsManager } = await import('./utils');
              const manager = new MockMapsManager(page);
              await manager.initDefaultMocks();
              await manager.useRealSocial();
              await manager.useRealVisits();
          });
      }

      // 3. Login both users
      await login(pageA, userA.email, userA.password);
      await login(pageB, userB.email, userB.password);

      // 4. Make them friends
      await test.step('Make users friends', async () => {
        await navigateToTab(pageA, 'Friends');
        const sidebarA = getSidebarContainer(pageA);
        const emailInput = sidebarA.getByPlaceholder("Enter friend's email");
        await emailInput.fill(userB.email);
        await sidebarA.getByRole('button', { name: 'Add friend' }).click();
        await expect(pageA.getByText('Friend request sent!', { exact: true }).first()).toBeVisible();

        await pageB.reload();
        await navigateToTab(pageB, 'Friends');
        const sidebarB = getSidebarContainer(pageB);
        const acceptBtn = sidebarB.getByRole('button', { name: 'Accept request' });
        await expect(acceptBtn).toBeVisible();
        await acceptBtn.click();
        await expect(sidebarB.locator('.rounded-lg.border').filter({ hasText: 'My Friends' }).getByText(userA.email)).toBeVisible();
      });

      // 5. User A logs a visit
      const reviewText = `Great wine at this place! ${Math.random()}`;
      await test.step('User A logs a visit', async () => {
        await navigateToTab(pageA, 'Explore');
        const sidebarA = getSidebarContainer(pageA);
        
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
        
        await Promise.all([
            pageA.waitForResponse(resp => resp.url().includes('log_visit') && resp.status() === 200),
            modal.getByRole('button', { name: 'Add Visit' }).click()
        ]);
        
        await expect(pageA.getByText('Visit added successfully.', { exact: true }).first()).toBeVisible();
        await modal.getByRole('button', { name: 'Close' }).click();

        await navigateToTab(pageA, 'History');
        const sidebarA_History = getSidebarContainer(pageA);
        await expect(sidebarA_History.getByText(reviewText)).toBeVisible({ timeout: 10000 });
      });

      // 6. User B checks social feed
      await test.step('User B verifies social feed', async () => {
        await pageB.reload();
        await navigateToTab(pageB, 'Friends');
        const sidebarB = getSidebarContainer(pageB);
        
        const expandButton = pageB.getByRole('button', { name: 'Expand to full screen' });
        if (await expandButton.isVisible()) {
            await expandButton.click();
        }

        const feedItem = sidebarB.locator('div.rounded-lg.border', { hasText: reviewText }).first();
        await expect(feedItem).toBeVisible({ timeout: 20000 });
        await expect(feedItem).toContainText('visited');
      });

      await contextA.close();
      await contextB.close();
    } finally {
      await deleteTestUser(userB.id);
    }
  });
});
