import { test, expect, Locator, Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// Helper function to get the appropriate sidebar container based on viewport
function getSidebarContainer(page: Page): Locator {
  const viewport = page.viewportSize();
  const isMobileViewport = viewport && viewport.width < 768;
  if (isMobileViewport) {
    return page.getByTestId('mobile-sidebar-container');
  }
  return page.getByTestId('desktop-sidebar-container');
}

// Helper to navigate to Friends tab
async function navigateToFriends(page: Page) {
  // Use direct URL navigation for robustness
  // This ensures initialTab="friends" is set correctly by the page component
  await page.goto('/friends');
  
  // Wait for the view to be ready
  const viewport = page.viewportSize();
  const isMobile = viewport && viewport.width < 768;
  
  if (isMobile) {
      await expect(page.getByTestId('mobile-sidebar-container')).toBeVisible({ timeout: 10000 });
  }
}

async function login(page: Page, email: string, pass: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(pass);
  // Force click to bypass overlays (toasts/cookie banners) on mobile
  await page.getByRole('button', { name: 'Sign In' }).click({ force: true });
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

    // 2.5 DB Cleanup
    await test.step('DB Cleanup', async () => {
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.warn("Skipping DB Cleanup: Missing Supabase keys.");
        return;
      }

      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

      const { data: u1 } = await supabase.from('profiles').select('id').eq('email', user1.email).single();
      const { data: u2 } = await supabase.from('profiles').select('id').eq('email', user2.email).single();

      if (u1 && u2) {
        console.log(`Cleaning up friends between ${u1.id} and ${u2.id}`);
        const { error } = await supabase.from('friends').delete()
          .or(`and(user1_id.eq.${u1.id},user2_id.eq.${u2.id}),and(user1_id.eq.${u2.id},user2_id.eq.${u1.id})`);

        if (error) console.error("DB Cleanup failed:", error);
      }
    });

    // 3. User A sends request to User B
    await test.step('User A sends request', async () => {
      // Dismiss cookie banner
      const gotItBtn = pageA.getByRole('button', { name: 'Got it' });
      if (await gotItBtn.isVisible()) {
        await gotItBtn.click();
      }

      // Navigate to Friends
      await navigateToFriends(pageA);

      // Explicitly wait for the Friends view to load
      // Scope to sidebar to avoid finding hidden desktop element on mobile
      const sidebar = getSidebarContainer(pageA);
      await expect(sidebar.getByText('Add a Friend').first()).toBeVisible({ timeout: 10000 });

      const emailInput = sidebar.getByPlaceholder("Enter friend's email");
      await emailInput.fill(user2.email);
      await expect(emailInput).toHaveValue(user2.email);
      await emailInput.blur(); // Close keyboard on mobile

      // Wait for loading to finish
      await expect(sidebar.locator('.animate-spin')).not.toBeVisible({ timeout: 10000 });

      const addBtn = sidebar.getByRole('button', { name: 'Add friend' });
      await expect(addBtn).toBeEnabled({ timeout: 10000 });
      // Use JS click to bypass persistent viewport/overlay issues on mobile sheet
      await addBtn.evaluate(node => (node as HTMLElement).click());

      // Verify Sent
      const successToast = pageA.getByText('Friend request sent!').first();
      const errorToast = pageA.locator('.destructive');

      try {
        await expect(successToast).toBeVisible({ timeout: 5000 });
      } catch (e) {
        if (await errorToast.isVisible()) {
          const errorText = await errorToast.textContent();
          throw new Error(`Friend request failed: ${errorText}`);
        }
        throw e;
      }

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
      await navigateToFriends(pageB);
      // Scope to sidebar to avoid finding hidden desktop element on mobile
      await expect(sidebar.getByText('Add a Friend').first()).toBeVisible({ timeout: 10000 });

      // Wait for loading to finish
      await expect(sidebar.locator('.animate-spin')).not.toBeVisible({ timeout: 10000 });

      // Should see request from User A

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
      
      await navigateToFriends(pageA);
      // Scope to sidebar to avoid finding hidden desktop element on mobile
      await expect(sidebar.getByText('Add a Friend').first()).toBeVisible({ timeout: 10000 });

      // Wait for loading to finish
      await expect(sidebar.locator('.animate-spin')).not.toBeVisible({ timeout: 10000 });

      // Should see request from User A

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
});
