import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, mockGoogleMapsApi } from './utils';
import { login, navigateToTab } from './helpers';

test.describe('PWA Offline Functionality', () => {
  let user: { id: string; email: string; password: string };

  test.beforeEach(async ({ page }) => {
    await mockGoogleMapsApi(page);
    user = await createTestUser();
    await login(page, user.email, user.password);
  });

  test.afterEach(async () => {
    await deleteTestUser(user.id);
  });

  test('should display offline indicator and allow cached navigation', async ({ page, context }) => {
    // 1. Initial Load & Cache (Online)
    await navigateToTab(page, 'Trips');
    await expect(page.locator('h2:has-text("My Trips")').locator('visible=true')).toBeVisible();
    await expect(page.getByText('You have no upcoming trips').locator('visible=true')).toBeVisible();

    // 2. Go Offline
    await context.setOffline(true);
    await page.waitForTimeout(1000); // Wait for event to propagate

    // 3. Verify Offline Indicator
    // The indicator is global, so it should be visible
    await expect(page.locator('text=Offline: Map detail limited').first()).toBeVisible();

    // 4. Verify Navigation (Cache) works
    await navigateToTab(page, 'Explore');
    
    // Close the sheet to see the map (Mobile behavior)
    if (page.viewportSize()?.width && page.viewportSize()!.width < 768) {
        await page.getByRole('button', { name: 'Map' }).click();
    }

    // The map view should still load (cached shell)
    await expect(page.getByTestId('map-container')).toBeVisible();
    
    // 5. Verify Offline Interaction (Toggle a Filter)
    // Re-open the sheet to access filters on mobile
    if (page.viewportSize()?.width && page.viewportSize()!.width < 768) {
        await navigateToTab(page, 'Explore');
    }

    await page.getByRole('button', { name: 'Visited' }).click();
    await expect(page.getByRole('button', { name: 'Visited' })).toHaveAttribute('data-state', 'on');
  });

  test('should queue visit creation when offline (Lie-Fi)', async ({ page, context }) => {
    // 1. Setup: Go to Explore and open a winery modal
    await navigateToTab(page, 'Explore');
    
    // Force open a known winery modal (mocked data)
    await page.evaluate(() => {
        // Upsert to Data Store first
        (window as any).useWineryDataStore.getState().upsertWinery({
            id: 'ch-mock-winery-1',
            google_place_id: 'ch-mock-winery-1',
            name: 'Test Winery',
            address: '123 Vine St',
            lat: 42.0,
            lng: -76.0
        });
        // Open via UI Store
        (window as any).useUIStore.getState().openWineryModal('ch-mock-winery-1');
    });

    // Verify winery is loaded and modal is open
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Test Winery' })).toBeVisible();

    // 2. Go Offline
    await context.setOffline(true);
    // FORCE ABORT network requests to Supabase to simulate true offline for RPCs
    await page.route('**/rest/v1/rpc/get_paginated_visits*', route => route.abort());

    // 3. Fill out Visit Form
    await page.getByLabel('Visit Date').fill('2025-01-01');
    await page.getByLabel('Your Review').fill('Offline note test');
    
    // 4. Submit
    await page.getByRole('button', { name: 'Add Visit' }).click();

    // 5. Verify Optimistic UI Update
    await expect(page.getByText(/Visit (Saved|cached)/).first()).toBeVisible();
    
    // Give a small cushion for IndexedDB write
    await page.waitForTimeout(500);

    // 6. Verify Data in UI (Optimistic)
    // The visit should appear in the history list within the modal
    await expect(page.getByText('Offline note test').locator('visible=true')).toBeVisible();

    // 7. Verify Data Persists on Navigation
    // Close modal and check history tab
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await navigateToTab(page, 'History');
    
    // Use locator('visible=true') to handle potential duplicates in responsive DOM (desktop sidebar vs mobile sheet)
    await expect(page.getByText('Test Winery').locator('visible=true')).toBeVisible();
    await expect(page.getByText('Offline note test').locator('visible=true')).toBeVisible();
  });
});
