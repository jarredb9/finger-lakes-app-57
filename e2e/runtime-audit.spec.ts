/* eslint-disable no-console */
import { test, expect } from './utils';
import { login, getSidebarContainer } from './helpers';

test.describe('Runtime & Performance Audit', () => {
  test('should login and check for hydration/console errors', async ({ page, user }) => {
    const consoleMessages: string[] = [];
    
    // Listen for hydration errors specifically
    page.on('console', msg => {
      const text = msg.text();
      if (msg.type() === 'error' || text.toLowerCase().includes('hydration') || text.includes('React')) {
        // Filter out known noise if necessary
        if (!text.includes('Vector Map')) {
             consoleMessages.push(`[${msg.type()}] ${text}`);
        }
      }
    });

    // 3. Robust Login
    await login(page, user.email, user.password);

    // 4. Wait for the map/wineries to load
    const viewport = page.viewportSize();
    const isMobile = viewport && viewport.width < 768;
    
    if (isMobile) {
        const exploreBtn = page.getByRole('button', { name: 'Explore' });
        if (await exploreBtn.isVisible()) {
            await exploreBtn.click();
        }
    }

    const sidebar = getSidebarContainer(page);
    await expect(sidebar.getByText(/Wineries/i).first()).toBeVisible({ timeout: 20000 });

    // 5. Deep State Verification (Exposed Stores)
    await expect(async () => {
        const state = await page.evaluate(() => {
            return {
                wineriesLoaded: (window as any).useWineryDataStore?.getState().persistentWineries.length > 0,
                wineriesHydrated: (window as any).useWineryDataStore?.persist?.hasHydrated(),
                userLoaded: !!(window as any).useUserStore?.getState().user,
                userLoading: (window as any).useUserStore?.getState().isLoading,
                tripsHydrated: (window as any).useTripStore?.persist?.hasHydrated(),
                visitsHydrated: (window as any).useVisitStore?.persist?.hasHydrated()
            };
        });
        
        expect(state.wineriesLoaded, 'Winery data should be loaded into store').toBe(true);
        expect(state.wineriesHydrated, 'Winery store should be hydrated from storage').toBe(true);
        expect(state.userLoaded, 'User session should be in store').toBe(true);
        expect(state.userLoading, 'User store should have finished loading').toBe(false);
        expect(state.tripsHydrated, 'Trip store should be hydrated').toBe(true);
        expect(state.visitsHydrated, 'Visit store should be hydrated').toBe(true);
    }).toPass({ timeout: 10000 });

    // 6. Performance Check
    const wineries = await page.locator('[data-testid="winery-card"]').count();
    console.log(`[Audit] Loaded ${wineries} winery cards.`);
    
    // 7. Fail if critical errors occurred
    const hydrationErrors = consoleMessages.filter(m => 
        m.toLowerCase().includes('hydration') || 
        m.includes('Minified React error')
    );
    
    if (hydrationErrors.length > 0) {
        console.error('Hydration Errors Detected:', hydrationErrors);
    }
    
    expect(hydrationErrors.length).toBe(0);
  });
});
