import { test, expect } from './utils';
import { login, navigateToTab, waitForMapReady, clearServiceWorkers, openWineryDetails, logVisit } from './helpers';

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
    
    await openWineryDetails(page, 'Vineyard of Illusion');

    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Vineyard of Illusion' })).toBeVisible();

    await context.setOffline(true);
    // Use context.route to block Service Worker requests
    await context.route(/\/rpc\/get_paginated_visits/, route => route.abort());

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
