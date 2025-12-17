import { test, expect, Locator, Page } from '@playwright/test';

// Helper function to get the appropriate sidebar container based on viewport
function getSidebarContainer(page: Page): Locator {
  const viewport = page.viewportSize();
  const isMobileViewport = viewport && viewport.width < 768;
  if (isMobileViewport) {
    return page.getByTestId('mobile-sidebar-container');
  }
  return page.getByTestId('desktop-sidebar-container');
}

async function login(page: Page, email: string, pass: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(pass);
  await page.getByRole('button', { name: 'Sign In' }).click();
  // Wait for login to complete
  await expect(page.getByRole('heading', { name: 'Winery Tracker' }).first()).toBeVisible({ timeout: 20000 });
}

test.describe('Friends Interaction Flow', () => {
  // Skip if 2nd user is not configured
  test.skip(!process.env.TEST_USER_2_EMAIL, 'TEST_USER_2_EMAIL not configured');

  test('User A can send friend request and User B can accept it', async ({ browser }) => {
    // 1. Create two isolated browser contexts
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    const user1 = {
      email: process.env.TEST_USER_EMAIL || 'alice@example.com',
      password: process.env.TEST_USER_PASSWORD || 'password'
    };
    const user2 = {
      email: process.env.TEST_USER_2_EMAIL || 'bob@example.com',
      password: process.env.TEST_USER_2_PASSWORD || 'password'
    };

    // 2. Login both users
    await test.step('Login User A', async () => await login(pageA, user1.email, user1.password));
    await test.step('Login User B', async () => await login(pageB, user2.email, user2.password));

    // 3. User A sends request to User B
    await test.step('User A sends request', async () => {
      const sidebar = getSidebarContainer(pageA);
      await sidebar.getByRole('tab', { name: 'Friends' }).click();
      // Wait for the initial friends fetch to complete
      try {
        await pageA.waitForResponse(resp => resp.url().includes('get_friends_and_requests') && resp.status() === 200, { timeout: 10000 });
      } catch (e) {
        console.log("RPC wait timeout or skipped");
      }
      // RESET STATE: Check if already sent and cancel if so
      // This ensures the test works even if previous runs failed cleanup

      // 1. Check Sent Requests
      if (await sidebar.getByRole('heading', { name: 'Sent Requests' }).isVisible()) {
        const sentCard = sidebar.locator('.rounded-lg.border', { has: pageA.getByRole('heading', { name: 'Sent Requests' }) });
        // Use looser matching
        if (await sentCard.getByText(user2.email).count() > 0) {
          const existingRequest = sentCard.locator('.flex.items-center', { hasText: user2.email }).first();
          if (await existingRequest.isVisible()) {
            console.log("Found lingering sent request, cancelling...");
            await existingRequest.getByRole('button', { name: 'Cancel request' }).click();
            await expect(pageA.getByText('Removed successfully.')).toBeVisible();
            await expect(existingRequest).not.toBeVisible();
          }
        }
      }

      // 2. Check My Friends
      // Use page locator to be safe against container issues
      if (await pageA.getByRole('heading', { name: 'My Friends' }).isVisible()) {
        // Find the card that contains this specific heading
        const friendsCard = pageA.locator('.rounded-lg.border', { has: pageA.getByRole('heading', { name: 'My Friends' }) });
        if (await friendsCard.getByText(user2.email).count() > 0) {
          const existingFriend = friendsCard.locator('.flex.items-center', { hasText: user2.email }).first();
          if (await existingFriend.isVisible()) {
            console.log("Found existing friend relation, removing...");
            await existingFriend.getByRole('button', { name: 'Remove friend' }).click();
            await pageA.getByRole('button', { name: 'Remove' }).click(); // Confirm dialog
            await expect(pageA.getByText('Removed successfully.')).toBeVisible();
            await expect(existingFriend).not.toBeVisible();
          }
        }
      }
      
      // 3. Check Incoming Friend Requests
      if (await pageA.getByRole('heading', { name: 'Friend Requests' }).isVisible()) {
        const requestsCard = pageA.locator('.rounded-lg.border', { has: pageA.getByRole('heading', { name: 'Friend Requests' }) });
        if (await requestsCard.getByText(user2.email).count() > 0) {
          const incomingRequest = requestsCard.locator('.flex.items-center', { hasText: user2.email }).first();
          if (await incomingRequest.isVisible()) {
            console.log(`Found incoming request from ${user2.email}, rejecting to clean state...`);
            await incomingRequest.getByRole('button', { name: 'Reject request' }).click();
            await expect(pageA.getByText('Friend request rejected.')).toBeVisible();
            await expect(incomingRequest).not.toBeVisible();
          }
        }
      }

      const emailInput = sidebar.getByPlaceholder("Enter friend's email");
      await emailInput.fill(user2.email);

      const addBtn = sidebar.getByRole('button', { name: 'Add' });
      await expect(addBtn).toBeEnabled();
      await addBtn.click();

      // Verify Sent
      await expect(pageA.getByText('Friend request sent!')).toBeVisible();

      // Verify Sent Request appears in the list
      // Scope to the "Sent Requests" card to avoid matching other lists
      const sentRequestsCard = sidebar.locator('.rounded-lg.border', { has: pageA.getByRole('heading', { name: 'Sent Requests' }) });
      await expect(sentRequestsCard).toBeVisible();
      await expect(sentRequestsCard.getByText(user2.email).first()).toBeVisible();
    });

    // 4. User B accepts request
    await test.step('User B accepts request', async () => {
      const sidebar = getSidebarContainer(pageB);
      await sidebar.getByRole('tab', { name: 'Friends' }).click();

      // Should see request from User A
      await expect(sidebar.getByText('Friend Requests')).toBeVisible();
      // Look for the specific row with User A's email, then find the accept button
      // Or simpler: just find the accept button near User A's text

      // This locator finds the container having user1's email, then the accept button inside it
      const requestRow = sidebar.locator('.flex.items-center', { hasText: user1.email });
      const acceptBtn = requestRow.getByRole('button', { name: 'Accept request' });

      await expect(acceptBtn).toBeVisible();
      await acceptBtn.click();

      await expect(pageB.locator('.text-sm.opacity-90').getByText('Friend request accepted.')).toBeVisible();

      // Verify moved to My Friends
      await expect(sidebar.getByText('My Friends')).toBeVisible();
      // Ensure user1 is in the friends list (might need a reload if RPC is slow, but optimistic UI should handle it)
      await expect(sidebar.locator('text=' + user1.email)).toBeVisible();
    });

    // 5. Cleanup (User A removes User B) - Keeps the test repeatable!
    await test.step('Cleanup: User A removes User B', async () => {
      // User A might need a refresh to see the acceptance if not using realtime subscriptions
      await pageA.reload();
      const sidebar = getSidebarContainer(pageA);
      await sidebar.getByRole('tab', { name: 'Friends' }).click();

      const friendRow = sidebar.locator('.flex.items-center', { hasText: user2.email });
      const removeBtn = friendRow.getByRole('button', { name: 'Remove friend' });

      await removeBtn.click();

      // Confirm dialog
      await pageA.getByRole('button', { name: 'Remove' }).click(); // The 'Remove' action in AlertDialog

      await expect(pageA.locator('.text-sm.opacity-90').getByText('Removed successfully.')).toBeVisible();
    });

    await contextA.close();
    await contextB.close();
  });
});