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

  test('User can log, view, and delete a visit (Mocked $0 Cost)', async ({ page }) => {
    // 1. Open Explore (default)
    await navigateToTab(page, 'Explore');

    // Wait for wineries to load into the store
    await page.waitForFunction(() => {
        const store = (window as any).useWineryDataStore;
        return store && store.getState().persistentWineries.length > 0;
    }, { timeout: 15000 }).catch(() => console.log('Timeout waiting for wineries in store'));

    // Expand sheet on mobile to ensure visibility
    const expandButton = page.getByRole('button', { name: 'Expand to full screen' });
    if (await expandButton.isVisible()) {
        await expandButton.evaluate((node) => (node as HTMLElement).click());
        // Wait a moment for expansion animation
        await page.waitForTimeout(500); 
    }

    // 2. Open Winery Modal
    // Use a robust locator for the winery name
    const sidebar = getSidebarContainer(page);
    const firstWinery = sidebar.locator('text=Mock Winery One').first();
    
    // On mobile, the sheet might hide the element below the fold. 
    // evaluate click ensures we trigger the event even if Playwright thinks it is "hidden".
    await firstWinery.scrollIntoViewIfNeeded();
    await expect(firstWinery).toBeVisible({ timeout: 15000 });
    await firstWinery.evaluate((node) => (node as HTMLElement).click());
    
    // 3. Fill Visit Form in Modal
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await expect(modal.getByText('Mock Winery One').first()).toBeVisible();

    await modal.getByLabel('Set rating to 5').click();
    await modal.getByLabel('Your Review').fill('Excellent wine and view!');
    await modal.getByRole('button', { name: 'Add Visit' }).click();

    await expect(page.getByText('Visit added successfully.').first()).toBeVisible();
    await modal.getByRole('button', { name: 'Close' }).click();

    // 4. Navigate to History and verify
    await navigateToTab(page, 'History');
    
    // Ensure sheet is expanded on mobile for history view
    if (await page.getByRole('button', { name: 'Expand to full screen' }).isVisible()) {
        await page.getByRole('button', { name: 'Expand to full screen' }).evaluate(node => (node as HTMLElement).click());
        await page.waitForTimeout(1000);
    }

    // Verify the visit appears in history
    const historySidebar = getSidebarContainer(page);
    
    const historyItem = historySidebar.getByText('Excellent wine and view!').first();
    await historyItem.scrollIntoViewIfNeeded();
    await expect(historyItem).toBeVisible({ timeout: 15000 });

    // 5. Delete Visit
    const deleteBtn = historySidebar.getByRole('button', { name: 'Delete visit' }).first();
    await deleteBtn.scrollIntoViewIfNeeded();
    await deleteBtn.click();
    
    await expect(page.getByText('Visit deleted successfully.').first()).toBeVisible();
  });
});