import { test, expect, Locator, Page } from '@playwright/test';
import { createTestUser, deleteTestUser, TestUser } from './utils';

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
  // Dismiss cookie banner if present, as it might block bottom nav
  const gotItBtn = page.getByRole('button', { name: 'Got it' });
  if (await gotItBtn.isVisible()) {
    await gotItBtn.click();
  }

  const viewport = page.viewportSize();
  const isMobile = viewport && viewport.width < 768;
  
  if (isMobile) {
      // Mobile: Click the bottom nav button
      // Use force: true to bypass potential overlapping toasts/banners
      await page.getByRole('button', { name: 'Friends' }).click({ force: true });
      await expect(page.getByTestId('mobile-sidebar-container')).toBeVisible({ timeout: 10000 });
  } else {
      // Desktop: Scope to desktop container to avoid ambiguity
      await page.getByTestId('desktop-sidebar-container')
          .getByRole('tab', { name: 'Friends' })
          .click();
  }
}

async function login(page: Page, email: string, pass: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(pass);
  
  // Use Enter key to submit, which is often more reliable on Mobile Safari than clicking
  await page.getByLabel('Password').press('Enter');
  
  // Fallback: If button is still 'Sign In' after 500ms, click it
  try {
    const btn = page.getByRole('button', { name: 'Sign In' });
    if (await btn.isVisible({ timeout: 500 })) {
        await btn.click({ force: true });
    }
  } catch (e) {
    // Ignore timeout, meaning it likely transitioned to 'Signing in...'
  }

  // Wait for login to complete with mobile-aware check
  const viewport = page.viewportSize();
  const isMobile = viewport && viewport.width < 768;

  if (isMobile) {
      // Verify Bottom Nav is visible
      await expect(page.locator('div.fixed.bottom-0')).toBeVisible({ timeout: 20000 });
  } else {
      await expect(page.getByRole('heading', { name: 'Winery Tracker' }).first()).toBeVisible({ timeout: 20000 });
  }
}

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
    await test.step('Login User A', async () => await login(pageA, user1.email, user1.password));
    await test.step('Login User B', async () => await login(pageB, user2.email, user2.password));

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

  test.afterEach(async () => {
    if (user1) await deleteTestUser(user1.id);
    if (user2) await deleteTestUser(user2.id);
  });
});
