import { test, expect, createTestUser, deleteTestUser, MockMapsManager } from './utils';
import { getSidebarContainer, login, navigateToTab, robustClick, setupFriendship, waitForMapReady } from './helpers';

test.describe('Privacy and Profile Flow', () => {
  test('Users can control visit and profile visibility', async ({ browser, user: user1 }) => {
    // 1. Create second ephemeral test user
    const user2 = await createTestUser();

    try {
      // 2. Create isolated contexts
      const contextA = await browser.newContext();
      const contextB = await browser.newContext();
      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();

      const managerA = new MockMapsManager(pageA);
      const managerB = new MockMapsManager(pageB);

      // 3. Setup: Login and establish friendship
      await test.step('Initial Setup: Login & Friendship', async () => {
        await managerA.initDefaultMocks();
        await managerA.useRealSocial();
        await login(pageA, user1.email, user1.password);

        await managerB.initDefaultMocks();
        await managerB.useRealSocial();
        await login(pageB, user2.email, user2.password);

        await setupFriendship(pageA, pageB, user1.email, user2.email);
      });

      // 4. User A logs one public and one private visit
      await test.step('User A logs public and private visits', async () => {
        await managerA.useRealVisits(); 
        
        await navigateToTab(pageA, 'Explore');
        await waitForMapReady(pageA);
        const sidebarA = getSidebarContainer(pageA);
        
        // Expand on mobile for interaction safety
        if (pageA.viewportSize()!.width < 768) {
            const expandBtn = pageA.getByRole('button', { name: 'Expand to full screen' });
            if (await expandBtn.isVisible()) await expandBtn.click();
        }

        // Use stable 'Mock Winery One' from default map markers
        const wineryItem = sidebarA.locator('text=Mock Winery One').first();
        await expect(wineryItem).toBeVisible({ timeout: 15000 });
        await robustClick(pageA, wineryItem);
        
        const modal = pageA.getByRole('dialog');
        await expect(modal).toBeVisible();

        // Log Public Visit - Interaction with the form at the bottom
        await modal.getByText('Add New Visit').scrollIntoViewIfNeeded();
        await pageA.getByLabel('Your Review').fill('This is a public review');
        await robustClick(pageA, pageA.getByRole('button', { name: 'Add Visit' }));
        await expect(pageA.getByText('Visit added successfully.').first()).toBeVisible();

        // Log Private Visit
        await modal.getByText('Add New Visit').scrollIntoViewIfNeeded();
        await pageA.getByLabel('Your Review').fill('This is a private review');
        await pageA.getByLabel('Make this visit private').check();
        await robustClick(pageA, pageA.getByRole('button', { name: 'Add Visit' }));
        await expect(pageA.getByText('Visit added successfully.').first()).toBeVisible();

        // 4.1 Close modal to prevent overlay conflicts on mobile
        const closeBtn = modal.getByRole('button', { name: 'Close' });
        if (await closeBtn.isVisible()) {
            await closeBtn.click();
        } else {
            await pageA.keyboard.press('Escape');
        }
        await expect(modal).not.toBeVisible();
      });

      // 5. User B views User A's profile
      await test.step('User B views User A profile', async () => {
        await navigateToTab(pageB, 'Friends');
        const sidebarB = getSidebarContainer(pageB);
        
        // Find User A in friends list
        const userALink = sidebarB.locator('a', { hasText: user1.email.split('@')[0] });
        await robustClick(pageB, userALink);

        // Verify on profile page
        await expect(pageB).toHaveURL(new RegExp(`/friends/${user1.id}`));
        
        // Check visits visibility: Public should be visible, Private should not
        await expect(pageB.getByText('This is a public review')).toBeVisible({ timeout: 10000 });
        await expect(pageB.getByText('This is a private review')).not.toBeVisible();
      });

      // 6. User A sets profile to Private
      await test.step('User A sets profile to Private', async () => {
        await navigateToTab(pageA, 'Friends');
        const sidebarA = getSidebarContainer(pageA);
        
        // Mobile guard: ensure sheet is expanded and stable
        if (pageA.viewportSize()!.width < 768) {
            await expect(sidebarA).toHaveAttribute('data-state', 'stable', { timeout: 15000 });
        }

        // Use robustClick for the Select trigger
        const privacySelect = sidebarA.getByRole('combobox').first();
        await expect(privacySelect).toBeVisible({ timeout: 10000 });
        await robustClick(pageA, privacySelect);
        
        // Radix portals options to the body - use a global text search for better WebKit compatibility
        const privateOption = pageA.locator('[role="option"], div').filter({ hasText: /^Private$/ }).last();
        await expect(privateOption).toBeVisible({ timeout: 10000 });
        await robustClick(pageA, privateOption);
        
        await expect(pageA.getByText('Privacy set to private.').first()).toBeVisible({ timeout: 10000 });
      });

      // 7. User B tries to view User A's profile again
      await test.step('User B profile access denied', async () => {
        await pageB.reload();
        
        // Mobile guard: Ensure sheet is expanded to see the error message
        if (pageB.viewportSize()!.width < 768) {
            const sidebarB = getSidebarContainer(pageB);
            const expandBtn = pageB.getByRole('button', { name: 'Expand to full screen' });
            if (await expandBtn.isVisible()) {
                await expandBtn.click();
                await expect(sidebarB).toHaveAttribute('data-state', 'stable', { timeout: 10000 });
            }
        }

        await expect(pageB.getByText('Access denied due to privacy settings')).toBeVisible({ timeout: 15000 });
      });

      await contextA.close();
      await contextB.close();
    } finally {
      await deleteTestUser(user2.id);
    }
  });
});
