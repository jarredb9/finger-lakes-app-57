import { test, expect } from './utils';
import { 
    getSidebarContainer, 
    login, 
    navigateToTab, 
    openWineryDetails, 
    logVisit, 
    closeWineryModal, 
    ensureSidebarExpanded,
    robustClick
} from './helpers';

test.describe('Visit Logging Flow', () => {
  test.beforeEach(async ({ page, user }) => {
    // mockMaps is auto-initialized by the fixture
    await login(page, user.email, user.password);
  });

  test('User can log, view, and delete a visit (Mocked $0 Cost)', async ({ page }) => {
    // 1. Open Explore and open winery
    await navigateToTab(page, 'Explore');
    await openWineryDetails(page, 'Mock Winery One');
    
    // 2. Open Log Visit modal
    await robustClick(page, page.getByTestId('log-visit-button'));

    // 3. Log Visit
    await logVisit(page, { review: 'Excellent wine and view!', rating: 5 });
    await closeWineryModal(page);

    // 3. Navigate to History and verify
    await navigateToTab(page, 'History');
    await ensureSidebarExpanded(page);

    // Verify the visit appears in history
    const historySidebar = getSidebarContainer(page);
    const historyItem = historySidebar.getByText('Excellent wine and view!').first();
    await expect(historyItem).toBeVisible({ timeout: 15000 });

    // 4. Delete Visit
    const deleteBtn = historySidebar.getByRole('button', { name: 'Delete visit' }).first();
    
    await Promise.all([
        page.waitForResponse(resp => resp.url().includes('delete_visit') && resp.status() === 200),
        robustClick(page, deleteBtn)
    ]);
    
    await expect(page.getByText('Visit deleted successfully.').first()).toBeVisible();
  });
});
