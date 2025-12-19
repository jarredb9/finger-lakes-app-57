import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, TestUser, mockGoogleMapsApi } from './utils';
import { getSidebarContainer, login, navigateToTab } from './helpers';

test.describe('Visit Logging Flow', () => {
  let user: TestUser;

  test.beforeEach(async ({ page }) => {
    user = await createTestUser();
    // This blocks ALL outgoing data calls to Google and provides a local mock script.
    await mockGoogleMapsApi(page);
    await login(page, user.email, user.password);
  });

  test.afterEach(async () => {
    if (user) await deleteTestUser(user.id);
  });

  test('User can log, view, and delete a visit (Mocked $0 Cost)', async ({ page }) => {
    const sidebar = getSidebarContainer(page);
    const viewport = page.viewportSize();
    const isMobile = viewport && viewport.width < 768;

    // 1. Open Explore (default)
    await navigateToTab(page, 'Explore');
    
    // The list should load our MOCK data because the mock script 'importLibrary'
    // ALWAYS returns our mock wineries and ALWAYS says they are within bounds.
    await expect(sidebar.getByText('Wineries in View')).toBeVisible({ timeout: 15000 });
    
    // Verify the mock winery is present
    const firstWinery = sidebar.getByText('Mock Winery One').first();
    await expect(firstWinery).toBeVisible({ timeout: 15000 });
    
    await firstWinery.scrollIntoViewIfNeeded();
    
    // Use force click or evaluate for mobile if standard click fails due to sheet positioning
    if (isMobile) {
        await firstWinery.evaluate(node => (node as HTMLElement).click());
    } else {
        await firstWinery.click();
    }
    
    // 2. Fill Visit Form in Modal
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    // The modal name should match mock
    await expect(modal.getByText('Mock Winery One').first()).toBeVisible();

    // Fill rating (5 stars)
    await modal.getByLabel('Set rating to 5').click();
    
    // Fill review
    await modal.getByLabel('Your Review').fill('Excellent wine and view!');

    // Submit
    await modal.getByRole('button', { name: 'Add Visit' }).click();

    // Verify Success Toast
    await expect(page.getByText('Visit added successfully.').first()).toBeVisible();

    // Close the modal
    await modal.getByRole('button', { name: 'Close' }).click();
    await expect(modal).not.toBeVisible();

    // 3. Navigate to History and verify
    await navigateToTab(page, 'History');
    
    // Wait for potential loading spinner
    await expect(sidebar.locator('.animate-spin')).not.toBeVisible({ timeout: 10000 });
    
    // Find the card container
    const editBtn = sidebar.getByRole('button', { name: 'Edit visit' }).first();
    const cardWithText = editBtn.locator('xpath=./ancestor::div[contains(@class, "rounded-lg")][1]');
    
    await expect(cardWithText).toBeVisible({ timeout: 10000 });
    await expect(cardWithText.getByText('Excellent wine and view!')).toBeVisible();

    // 4. Delete Visit
    const deleteBtn = cardWithText.getByRole('button', { name: 'Delete visit' });
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();
    
    // Verify toast
    await expect(page.getByText('Visit deleted successfully.').first()).toBeVisible();
    
    // Verify it's gone after reload
    await page.reload();
    await navigateToTab(page, 'History');
    await expect(sidebar.locator('.animate-spin')).not.toBeVisible({ timeout: 10000 });
    await expect(sidebar.getByText('Mock Winery One')).not.toBeVisible();
  });
});