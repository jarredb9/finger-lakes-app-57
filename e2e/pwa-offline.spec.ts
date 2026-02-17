import { test, expect } from './utils';
import { login, navigateToTab, getSidebarContainer, waitForMapReady, clearServiceWorkers } from './helpers';

test.describe('PWA Offline Functionality', () => {
  test.beforeEach(async ({ page, user, mockMaps }) => {
    await clearServiceWorkers(page);
    mockMaps.enableServiceWorker();
    await login(page, user.email, user.password);
  });

  test('should display offline indicator and allow cached navigation', async ({ page, context }) => {
    await navigateToTab(page, 'Trips');
    await waitForMapReady(page);
    await expect(page.locator('h2:has-text("My Trips")').locator('visible=true')).toBeVisible();

    await context.setOffline(true);
    await expect(page.locator('text=Offline: Map detail limited').first()).toBeVisible({ timeout: 10000 });

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
    
    const sidebar = getSidebarContainer(page);
    const resultsList = sidebar.getByTestId('winery-results-list');

    // Wait for the specific winery to appear, triggering search if needed
    await expect(async () => {
        const wineryItem = resultsList.getByText('Vineyard of Illusion').first();
        if (await wineryItem.isVisible()) return;

        // If not found, check if we need to trigger a manual search
        const noResults = await resultsList.getByText('No wineries found').isVisible();
        if (noResults) {
            await sidebar.getByRole('button', { name: 'Search This Area' }).click();
        }
        
        await expect(wineryItem).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 10000 });

    const wineryItem = resultsList.getByText('Vineyard of Illusion').first();
    await wineryItem.evaluate(el => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Vineyard of Illusion' })).toBeVisible();

    await context.setOffline(true);
    // Use context.route to block Service Worker requests
    await context.route(/\/rpc\/get_paginated_visits/, route => route.abort());

    await page.getByLabel('Visit Date').fill('2025-01-01');
    await page.getByLabel('Your Review').fill('Offline note test');
    
    await page.getByRole('button', { name: 'Add Visit' }).click();

    await expect(page.getByText(/Visit (Saved|cached)/).first()).toBeVisible();
    
    await expect(page.getByText('Offline note test').locator('visible=true')).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await navigateToTab(page, 'History');
    
    await expect(page.getByText('Vineyard of Illusion').locator('visible=true')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Offline note test').locator('visible=true')).toBeVisible();
  });
});
