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
        
                // RESET STATE: Check if already sent and cancel if so
                // This ensures the test works even if previous runs failed cleanup
                
                // 1. Check Sent Requests
                const sentRequestsSection = sidebar.locator('.space-y-6', { has: pageA.getByRole('heading', { name: 'Sent Requests' }) });
                // We use a looser check first to see if the header exists
                if (await sidebar.getByRole('heading', { name: 'Sent Requests' }).isVisible()) {
                     // Now find the specific row inside the sent requests section (if it exists)
                     // We need to be careful not to match the "Add Friend" input or "My Friends" list
                     // We'll traverse up from the header to the card, then find the item
                     const sentCard = sidebar.locator('.rounded-lg.border', { has: pageA.getByRole('heading', { name: 'Sent Requests' }) });
                     const existingRequest = sentCard.locator('.flex.items-center', { hasText: user2.email });
                     
                     if (await existingRequest.isVisible()) {
                         console.log("Found lingering sent request, cancelling...");
                         await existingRequest.getByRole('button', { name: 'Cancel request' }).click();
                         // Wait for success toast (using visual selector)
                         await expect(pageA.locator('.text-sm.opacity-90').getByText('Removed successfully.')).toBeVisible();
                         await expect(existingRequest).not.toBeVisible();
                     }
                }
        
                // 2. Check My Friends (in case they are already friends from a previous run)
                if (await sidebar.getByRole('heading', { name: 'My Friends' }).isVisible()) {
                     const friendsCard = sidebar.locator('.rounded-lg.border', { has: pageA.getByRole('heading', { name: 'My Friends' }) });
                     const existingFriend = friendsCard.locator('.flex.items-center', { hasText: user2.email });
                     
                     if (await existingFriend.isVisible()) {
                         console.log("Found existing friend relation, removing...");
                         await existingFriend.getByRole('button', { name: 'Remove friend' }).click();
                         await pageA.getByRole('button', { name: 'Remove' }).click(); // Confirm dialog
                         await expect(pageA.locator('.text-sm.opacity-90').getByText('Removed successfully.')).toBeVisible();
                         await expect(existingFriend).not.toBeVisible();
                     }
                }
        
                const emailInput = sidebar.getByPlaceholder("Enter friend's email");        await emailInput.fill(user2.email);
        await sidebar.getByRole('button', { name: 'Add' }).click();
        
        // Verify Sent
        // Wait for ANY toast first to debug what's happening
        const toastDescription = pageA.locator('.text-sm.opacity-90').first();
        await expect(toastDescription).toBeVisible();
        
        const toastText = await toastDescription.textContent();
        console.log(`Add Friend Toast Message: "${toastText}"`);

        // Accept either success or "already sent" (idempotent check)
        expect(toastText).toMatch(/Friend request sent!|Friend request already sent/);
        
        await expect(sidebar.getByText('Sent Requests')).toBeVisible();
        await expect(sidebar.getByText(user2.email)).toBeVisible();
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
