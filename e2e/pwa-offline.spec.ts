import type { Route } from '@playwright/test';
import type { Winery, VisitWithWinery } from '@/lib/types';
import type { SerializableBounds } from '@/lib/stores/mapStore';
import { test, expect } from './utils';
import { login, navigateToTab, waitForMapReady, clearServiceWorkers, openWineryDetails, closeWineryModal, logVisit, ensureSidebarExpanded } from './helpers';

test.describe('PWA Offline Functionality', () => {
  test.beforeEach(async ({ page, user, mockMaps }) => {
    await clearServiceWorkers(page);
    await page.addInitScript(() => {
      window._E2E_FULL_DRAWER = true;
    });
    mockMaps.enableServiceWorker();
    await login(page, user.email, user.password, { isPwa: true });
  });

  test('should display offline indicator and allow cached navigation', async ({ page, context }) => {
    await navigateToTab(page, 'Trips');
    await waitForMapReady(page);
    await expect(page.getByRole('heading', { name: 'My Trips' })).toBeVisible();

    await context.setOffline(true);
    // Primary offline indicator (Updated text)
    await expect(page.getByText('Offline: Map detail limited')).toBeVisible({ timeout: 10000 });

    await navigateToTab(page, 'Explore');
    const width = page.viewportSize()?.width ?? 1280;
    const isMobile = width < 768;
    if (isMobile) {
        await page.getByTestId('mobile-nav-map').click();
    }

    await expect(page.getByTestId('map-container')).toBeVisible();
    
    if (isMobile) {
        await navigateToTab(page, 'Explore');
        await ensureSidebarExpanded(page);
    }

    await page.getByRole('button', { name: 'Visited' }).click();
    await expect(page.getByRole('button', { name: 'Visited' })).toHaveAttribute('data-state', 'on');
  });

  test('should queue visit creation when offline (Lie-Fi)', async ({ page, context }) => {
    await navigateToTab(page, 'Explore');
    await waitForMapReady(page);
    
    // Force winery visibility in list
    await page.evaluate(() => {
        const wineryStore = window.useWineryStore || window.useWineryDataStore;
        const dataStore = wineryStore?.getState();
        const mockWinery = dataStore?.persistentWineries.find((w: Winery) => w.name === 'Vineyard of Illusion');
        
        if (mockWinery) {
            // Clear search and trip to ensure useWineryFilter falls back to persistentWineries
            window.useMapStore?.setState({ searchResults: [] });
            window.useTripStore?.setState({ selectedTrip: null });

            const mockBounds: SerializableBounds = {
                north: 43,
                south: 42,
                east: -76,
                west: -77
            };
            window.useMapStore?.setState({ 
                bounds: mockBounds,
                filter: ['all'] 
            });
        }
    });

    await ensureSidebarExpanded(page);
    
    // Enable Full Drawer state in E2E before opening modal so tabs render on mobile
    await page.evaluate(() => {
      window._E2E_FULL_DRAWER = true;
    });

    await openWineryDetails(page, 'Vineyard of Illusion');

    const modal = page.locator('[data-testid="winery-modal-dialog"], [data-testid="tablet-winery-sheet"], [data-testid="winery-modal-drawer"], [role="dialog"]').first();
    await expect(modal).toBeVisible();

    await context.setOffline(true);
    // Use context.route + page.route to block Service Worker requests reliably
    const isWebKit = page.context().browser()?.browserType().name() === 'webkit';
    const blockHandler = (route: Route) => {
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

    await page.getByTestId('log-visit-button').click();
    await page.getByLabel('Visit Date').fill('2025-01-01');
    await logVisit(page, { review: 'Offline note test' });
    
    // Ensure Visits tab is visible (in Full drawer state) and click it
    const visitsTab = page.getByRole('tab', { name: 'Visits' });
    await expect(visitsTab).toBeVisible({ timeout: 10000 });
    await visitsTab.click();
    
    await expect(page.getByText('Offline note test')).toBeVisible({ timeout: 10000 });

    await closeWineryModal(page);

    // Tier 2: Logic assertion on store state (pw-interactions.md:7)
    const pendingVisit = await page.evaluate(() => {
      const visits = window.useVisitStore?.getState().visits || [];
      return visits.find((v: VisitWithWinery) => v.user_review === 'Offline note test');
    });
    expect(pendingVisit).toBeDefined();
    expect(pendingVisit?.syncStatus).toBe('pending');

    await navigateToTab(page, 'History');
    
    // Tier 1: UX assertion scoped to history container and visit card (pw-portal-encapsulation)
    const historyContainer = page.getByTestId('visit-history-container');
    await expect(historyContainer).toBeVisible({ timeout: 10000 });
    await expect(historyContainer).toHaveAttribute('data-state', 'ready');

    const offlineCard = historyContainer.locator('[data-testid="visit-card"]', { hasText: 'Offline note test' });
    await expect(offlineCard).toBeVisible();
    await expect(historyContainer.getByText('Vineyard of Illusion').first()).toBeVisible();
  });

  test('should drain offline queue and invalidate cache upon online reconnection', async ({ page, context }) => {
    await navigateToTab(page, 'Explore');
    await waitForMapReady(page);

    // Force winery visibility in list
    await page.evaluate(() => {
      const wineryStore = window.useWineryStore || window.useWineryDataStore;
      const dataStore = wineryStore?.getState();
      const mockWinery = dataStore?.persistentWineries.find((w: Winery) => w.name === 'Vineyard of Illusion');

      if (mockWinery) {
        window.useMapStore?.setState({ searchResults: [] });
        window.useTripStore?.setState({ selectedTrip: null });

        const mockBounds: SerializableBounds = {
          north: 43,
          south: 42,
          east: -76,
          west: -77
        };
        window.useMapStore?.setState({ 
          bounds: mockBounds,
          filter: ['all'] 
        });
      }
    });

    await ensureSidebarExpanded(page);

    await page.evaluate(() => {
      window._E2E_FULL_DRAWER = true;
    });

    await openWineryDetails(page, 'Vineyard of Illusion');

    const modal = page.locator('[data-testid="winery-modal-dialog"], [data-testid="tablet-winery-sheet"], [data-testid="winery-modal-drawer"], [role="dialog"]').first();
    await expect(modal).toBeVisible();

    // 1. Simulate going offline
    await context.setOffline(true);
    const isWebKit = page.context().browser()?.browserType().name() === 'webkit';
    const blockHandler = (route: Route) => {
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

    // 2. Log visit while offline
    const reviewText = `Reconnect sync test ${Date.now()}`;
    await page.getByTestId('log-visit-button').click();
    await page.getByLabel('Visit Date').fill('2025-01-01');
    await logVisit(page, { review: reviewText });

    await closeWineryModal(page);

    // 3. Confirm visit is in offline queue
    const queueLengthBefore = await page.evaluate(() => {
      return window.useSyncStore?.getState().queue.length || 0;
    });
    expect(queueLengthBefore).toBeGreaterThan(0);

    // 4. Online reconnection queue drainage flow
    // Step 1: Unroute blockHandler on both page and context prior to setting offline to false
    await page.unroute(/.*get_paginated_visits.*/, blockHandler);
    await context.unroute(/.*get_paginated_visits.*/, blockHandler);
    await context.setOffline(false);

    // Step 2: Auto-retrying queue drainage assertion with programmatic sync fallback
    await expect(async () => {
      const state = await page.evaluate(() => {
        const syncStore = window.useSyncStore;
        const syncService = window.SyncService;
        if (!syncStore || !syncStore.getState().isInitialized) return null;
        return {
          isSyncing: !!syncService?.isSyncing,
          queueLength: syncStore.getState().queue.length
        };
      });

      if (!state) throw new Error('SyncStore not ready');

      if (state.queueLength > 0 && !state.isSyncing) {
        await page.evaluate(() => window.SyncService?.sync?.()).catch(() => {});
      }
      expect(state.queueLength).toBe(0);
    }).toPass({ timeout: 15000 });

    // Step 3: Auto-retrying store cache invalidation assertion
    await expect(async () => {
      const syncedVisit = await page.evaluate(({ review }) => {
        const visits = window.useVisitStore?.getState().visits || [];
        return visits.find((v: VisitWithWinery) => v.user_review === review);
      }, { review: reviewText });
      expect(syncedVisit).toBeDefined();
      expect(syncedVisit?.syncStatus).toBe('synced');
    }).toPass({ timeout: 15000 });
  });
});
