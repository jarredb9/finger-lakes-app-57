import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, TestUser, mockGoogleMapsApi } from './utils';
import { getSidebarContainer, login, navigateToTab } from './helpers';

test.describe('Friends Interaction Flow', () => {
  let user1: TestUser;
  let user2: TestUser;

  test('User A can send friend request and User B can accept it', async ({ browser }) => {
    // 1. CreateEphemeral test users
    user1 = await createTestUser();
    user2 = await createTestUser();

    // 2. Create two isolated browser contexts
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    // 3. Login both users
    await test.step('Login User A', async () => {
      await mockGoogleMapsApi(pageA);
      await login(pageA, user1.email, user1.password);
    });
    await test.step('Login User B', async () => {
      await mockGoogleMapsApi(pageB);
      await login(pageB, user2.email, user2.password)
    });

    // 3. User A sends request to User B
    await test.step('User A sends request', async () => {
      // Navigate to Friends
      await navigateToTab(pageA, 'Friends');

      // Explicitly wait for the Friends view to load
      const sidebar = getSidebarContainer(pageA);
      await expect(sidebar.getByText('Add a Friend').first()).toBeVisible({ timeout: 10000 });

      const emailInput = sidebar.getByPlaceholder("Enter friend's email");
      await emailInput.fill(user2.email);
      await expect(emailInput).toHaveValue(user2.email);
      await emailInput.blur(); // Close keyboard on mobile

      // Wait for loading to finish
      await expect(sidebar.locator('.animate-spin')).not.toBeVisible({ timeout: 20000 });

      const addBtn = sidebar.getByRole('button', { name: 'Add friend' });
      await expect(addBtn).toBeEnabled({ timeout: 10000 });
      // Use JS click to bypass persistent viewport/overlay issues on mobile sheet
      await addBtn.evaluate(node => (node as HTMLElement).click());

      // Verify Sent
      const successToast = pageA.getByText('Friend request sent!').first();
      await expect(successToast).toBeVisible({ timeout: 5000 });

      // Verify Sent Request appears in the list
      const sentRequestsCard = sidebar.locator('.rounded-lg.border').filter({ hasText: 'Sent Requests' });
      await expect(sentRequestsCard).toBeVisible();
      await expect(sentRequestsCard.getByText(user2.email).first()).toBeVisible();
    });

    // 4. User B accepts request
    await test.step('User B accepts request', async () => {
      const sidebar = getSidebarContainer(pageB);
      // Reload page B
      await pageB.reload();
      
      // Navigate to Friends
      await navigateToTab(pageB, 'Friends');
      // Scope to sidebar to avoid finding hidden desktop element on mobile
      await expect(sidebar.getByText('Add a Friend').first()).toBeVisible({ timeout: 10000 });

      // Wait for loading to finish
      await expect(sidebar.locator('.animate-spin')).not.toBeVisible({ timeout: 10000 });

      // Should see request from User A
      const requestsCard = sidebar.locator('.rounded-lg.border').filter({ hasText: 'Friend Requests' });
      await expect(requestsCard).toBeVisible();

      const requestRow = requestsCard.locator('.flex.items-center', { hasText: user1.email });
      const acceptBtn = requestRow.getByRole('button', { name: 'Accept request' });

      await expect(acceptBtn).toBeVisible();
      await acceptBtn.evaluate(node => (node as HTMLElement).click());

      // Verify moved to My Friends
      const myFriendsCard = sidebar.locator('.rounded-lg.border').filter({ hasText: 'My Friends' });
      await expect(myFriendsCard).toBeVisible();
      await expect(myFriendsCard.locator('text=' + user1.email)).toBeVisible();
    });

    // 5. Cleanup (User A removes User B)
    await test.step('Cleanup: User A removes User B', async () => {
      // User A might need a refresh
      await pageA.reload();
      const sidebar = getSidebarContainer(pageA);
      
      await navigateToTab(pageA, 'Friends');
      // Scope to sidebar to avoid finding hidden desktop element on mobile
      await expect(sidebar.getByText('Add a Friend').first()).toBeVisible({ timeout: 10000 });

      // Wait for loading to finish
      await expect(sidebar.locator('.animate-spin')).not.toBeVisible({ timeout: 10000 });

      const friendsCard = sidebar.locator('.rounded-lg.border').filter({ hasText: 'My Friends' });
      const friendRow = friendsCard.locator('.flex.items-center', { hasText: user2.email });
      const removeBtn = friendRow.getByRole('button', { name: 'Remove friend' });

      await removeBtn.evaluate(node => (node as HTMLElement).click());

      // Confirm dialog
      await pageA.getByRole('button', { name: 'Remove' }).click(); 
    });

    await contextA.close();
    await contextB.close();
  });

  test.afterEach(async () => {
    if (user1) await deleteTestUser(user1.id);
    if (user2) await deleteTestUser(user2.id);
  });
});