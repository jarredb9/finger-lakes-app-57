import { test, expect } from './utils';
import { getSidebarContainer, login, navigateToTab } from './helpers';

test.describe('Visit Logging Flow', () => {
  test.beforeEach(async ({ page, user }) => {
    // mockMaps is auto-initialized by the fixture
    await login(page, user.email, user.password);
  });

  test('User can log, view, and delete a visit (Mocked $0 Cost)', async ({ page }) => {
    // 1. Open Explore (default)
    await navigateToTab(page, 'Explore');

    // Wait for wineries to appear in the UI
    const sidebar = getSidebarContainer(page);
    const firstWinery = sidebar.locator('text=Mock Winery One').first();
    await expect(firstWinery).toBeVisible({ timeout: 15000 });

    // Expand sheet on mobile to ensure visibility
    const expandButton = page.getByRole('button', { name: 'Expand to full screen' });
    if (await expandButton.isVisible()) {
        await expandButton.click();
        // Wait for expansion animation by checking the class
        await expect(page.getByTestId('mobile-sidebar-container')).toHaveClass(/h-\[calc\(100vh-4rem\)\]/); 
    }

    // 2. Open Winery Modal
    await firstWinery.scrollIntoViewIfNeeded();
    await expect(firstWinery).toBeVisible({ timeout: 15000 });
    await firstWinery.click();
    
    // 3. Fill Visit Form in Modal
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await expect(modal.getByText('Mock Winery One').first()).toBeVisible();

    await modal.getByLabel('Set rating to 5').click();
    await modal.getByLabel('Your Review').fill('Excellent wine and view!');
    
    await Promise.all([
        page.waitForResponse(resp => resp.url().includes('log_visit') && resp.status() === 200),
        modal.getByRole('button', { name: 'Add Visit' }).click()
    ]);

    await expect(page.getByText('Visit added successfully.').first()).toBeVisible();
    await modal.getByRole('button', { name: 'Close' }).click();

    // Navigate to History and verify
    await navigateToTab(page, 'History');
    
    // Ensure sheet is expanded on mobile for history view
    if (await page.getByRole('button', { name: 'Expand to full screen' }).isVisible()) {
        await page.getByRole('button', { name: 'Expand to full screen' }).click();
        await expect(page.getByTestId('mobile-sidebar-container')).toHaveClass(/h-\[calc\(100vh-4rem\)\]/);
    }

    // Verify the visit appears in history
    const historySidebar = getSidebarContainer(page);
    
    const historyItem = historySidebar.getByText('Excellent wine and view!').first();
    await expect(historyItem).toBeVisible({ timeout: 15000 });

    // 5. Delete Visit
    const deleteBtn = historySidebar.getByRole('button', { name: 'Delete visit' }).first();
    
    await Promise.all([
        page.waitForResponse(resp => resp.url().includes('delete_visit') && resp.status() === 200),
        deleteBtn.click()
    ]);
    
    await expect(page.getByText('Visit deleted successfully.').first()).toBeVisible();
  });
});
