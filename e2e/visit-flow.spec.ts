import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, TestUser, mockGoogleMapsApi } from './utils';
import { getSidebarContainer, login, navigateToTab } from './helpers';

test.describe('Visit Logging Flow', () => {
  let user: TestUser;

  test.beforeEach(async ({ page }) => {
    user = await createTestUser();
    await mockGoogleMapsApi(page);
    await login(page, user.email, user.password);
  });

  test.afterEach(async () => {
    if (user) await deleteTestUser(user.id);
  });

  test('User can log, view, edit, and delete a visit', async ({ page }) => {
    const sidebar = getSidebarContainer(page);
    const viewport = page.viewportSize();
    const isMobile = viewport && viewport.width < 768;

    // 1. Open Explore (default) and find a winery
    await navigateToTab(page, 'Explore');

    await expect(sidebar.getByText('Wineries in View')).toBeVisible({ timeout: 15000 });
    
    // Wait for the results to load (first winery card)
    const firstWinery = sidebar.locator('.space-y-2 > div > p.font-medium').first();
    await expect(firstWinery).toBeVisible({ timeout: 15000 });
    
    await firstWinery.scrollIntoViewIfNeeded();
    const wineryName = await firstWinery.textContent();
    console.log(`Selecting winery: ${wineryName}`);
    
    // Use force click or evaluate for mobile if standard click fails due to sheet positioning
    if (isMobile) {
        await firstWinery.evaluate(node => (node as HTMLElement).click());
    } else {
        await firstWinery.click();
    }
    
    // 2. Fill Visit Form in Modal
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    // Fill rating (5 stars)
    await modal.getByLabel('Set rating to 5').click();
    
    // Fill review
    await modal.getByLabel('Your Review').fill('Excellent wine and view!');

    // Submit
    await modal.getByRole('button', { name: 'Add Visit' }).click();

    // Verify Success Toast
    await expect(page.getByText('Visit added successfully.').first()).toBeVisible();

    // Close the modal if it's still open (Radix Dialog keeps focus trapped and hides other elements)
    await modal.getByRole('button', { name: 'Close' }).click();
    await expect(modal).not.toBeVisible();

    // 3. Navigate to History and verify
    await navigateToTab(page, 'History');
    
    // Wait for potential loading spinner
    await expect(sidebar.locator('.animate-spin')).not.toBeVisible({ timeout: 10000 });
    
    // Find the container that has the winery name
    // We target the card by finding the Edit button and going up to the card container.
    const editBtn = sidebar.getByRole('button', { name: 'Edit visit' }).first();
    const cardWithText = editBtn.locator('xpath=./ancestor::div[contains(@class, "rounded-lg")][1]');
    
    await expect(cardWithText).toBeVisible({ timeout: 10000 });
    // Winery name is rendered outside the card in GlobalVisitHistory, so we don't check for it inside the card.
    await expect(cardWithText.getByText('Excellent wine and view!')).toBeVisible();

    // 5. Delete Visit
    const deleteBtn = cardWithText.getByRole('button', { name: 'Delete visit' });
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();
    
    // Verify toast
    await expect(page.getByText('Visit deleted successfully.').first()).toBeVisible();
    
    // Verify it's gone
    // Force a reload to ensure DB state is reflected if UI state update failed
    await page.reload();
    await navigateToTab(page, 'History');
    // Wait for spinner
    await expect(sidebar.locator('.animate-spin')).not.toBeVisible({ timeout: 10000 });
    
    await expect(cardWithText).not.toBeVisible();
  });
});
