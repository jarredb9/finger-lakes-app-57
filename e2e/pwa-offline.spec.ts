import { test, expect } from './utils';
import { login, navigateToTab, waitForMapReady, clearServiceWorkers, openWineryDetails, logVisit, ensureSidebarExpanded } from './helpers';

test.describe('PWA Offline Functionality', () => {
  test.beforeEach(async ({ page, user, mockMaps }) => {
    await clearServiceWorkers(page);
    mockMaps.enableServiceWorker();
    await login(page, user.email, user.password, { isPwa: true });
  });

  test('should display offline indicator and allow cached navigation', async ({ page, context }) => {
    await navigateToTab(page, 'Trips');
    await waitForMapReady(page);
    await expect(page.locator('h2:has-text("My Trips")').locator('visible=true')).toBeVisible();

    await context.setOffline(true);
    // Primary offline indicator (Updated text)
    await expect(page.getByText('Offline: Map detail limited')).toBeVisible({ timeout: 10000 });

    await navigateToTab(page, 'Explore');
    if (page.viewportSize()?.width && page.viewportSize()!.width < 768) {
        await page.getByRole('button', { name: 'Map' }).click();
    }

    await expect(page.getByTestId('map-container')).toBeVisible();
    
    if (page.viewportSize()?.width && page.viewportSize()!.width < 768) {
        await navigateToTab(page, 'Explore');
    }

    await page.getByRole('button', { name: 'Visited' }).click();
    await expect(page.getByRole('button', { name: 'Visited' })).toHaveAttribute('data-state', 'on');
  });

  test('should queue visit creation when offline (Lie-Fi)', async ({ page, context }) => {
    await navigateToTab(page, 'Explore');
    await waitForMapReady(page);
    
    // Force winery visibility in list
    await page.evaluate(() => {
        const dataStore = (window as any).useWineryDataStore.getState();
        const mockWinery = dataStore.persistentWineries.find((w: any) => w.name === 'Vineyard of Illusion');
        
        if (mockWinery) {
            // Clear search and trip to ensure useWineryFilter falls back to persistentWineries
            (window as any).useMapStore.setState({ searchResults: [] });
            (window as any).useTripStore.setState({ selectedTrip: null });

            const mockBounds = {
                contains: () => true,
                getNorthEast: () => ({ lat: () => 43, lng: () => -76 }),
                getSouthWest: () => ({ lat: () => 42, lng: () => -77 })
            };
            (window as any).useMapStore.setState({ 
                bounds: mockBounds,
                filter: ['all'] 
            });
        }
    });

    await ensureSidebarExpanded(page);
    await openWineryDetails(page, 'Vineyard of Illusion');

    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Vineyard of Illusion' })).toBeVisible();

    await context.setOffline(true);
    // Use context.route + page.route to block Service Worker requests reliably
    const isWebKit = page.context().browser()?.browserType().name() === 'webkit';
    const blockHandler = (route: any) => {
        if (isWebKit) {
            return route.fulfill({ 
                status: 404, 
                body: 'Blocked',
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }
        return route.abort();
    };
    await context.route(/.*get_paginated_visits.*/, blockHandler);
    await page.route(/.*get_paginated_visits.*/, blockHandler);

    await page.getByTestId('log-visit-button').click({ force: true });
    await page.getByLabel('Visit Date').fill('2025-01-01');
    await logVisit(page, { review: 'Offline note test' });
    
    await expect(page.getByText('Offline note test').locator('visible=true')).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await navigateToTab(page, 'History');
    
    await expect(page.getByText('Vineyard of Illusion').locator('visible=true')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Offline note test').locator('visible=true')).toBeVisible();
  });
});
