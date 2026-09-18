import { expect, Locator, Page } from '@playwright/test';

/**
 * E2E CORE UTILITIES & DRIVER PRIMITIVES
 */

export function getSidebarContainer(page: Page): Locator {
  return page.locator('[data-testid="desktop-sidebar-container"], [data-testid="tablet-floating-drawer"], [data-testid="mobile-sidebar-container"], [data-testid="interactive-bottom-sheet"], [data-testid="app-sidebar"], [data-testid="trip-list-container"]').filter({ visible: true }).first();
}

/**
 * Waits for a specific container to reach a signal state.
 */
export async function waitForSignal(page: Page, testId: string, state: 'ready' | 'loading' | 'stable' | 'error' | RegExp = 'ready', timeout = 15000) {
    const container = page.locator(`[data-testid*="${testId}"]`).first();
    if (state instanceof RegExp) {
        await expect(container).toHaveAttribute('data-state', state, { timeout });
    } else {
        await expect(container).toHaveAttribute('data-state', state, { timeout });
    }
}

/**
 * Waits for the application to be fully loaded and hydrated.
 */
export async function waitForAppReady(page: Page, options: { skipMapReady?: boolean } = {}) {
    const width = page.viewportSize()?.width ?? 1280;
    const isMobile = width < 768;
    const isTablet = width >= 768 && width < 1024;
    
    // First ensure the core shell or the page content is visible
    // For mobile, the navigation bar is a reliable indicator that the shell is ready
    const shellSelector = isMobile 
      ? '[data-testid="mobile-sidebar-container"], [data-testid="settings-page-container"], [data-testid="trip-details-card"], [data-testid="trip-details-skeleton"], [data-testid="mobile-nav-explore"], [data-testid="app-sidebar"]' 
      : isTablet
      ? '[data-testid="tablet-floating-drawer"], [data-testid="app-sidebar"], [data-testid="settings-page-container"], [data-testid="trip-details-card"], [data-testid="trip-details-skeleton"]'
      : '[data-testid="desktop-sidebar-container"], [data-testid="settings-page-container"], [data-testid="trip-details-card"], [data-testid="trip-details-skeleton"]';
    
    await expect(page.locator(shellSelector).first()).toBeVisible({ timeout: 25000 });

    // Ensure hydration signal is set on the shell if the shell is present
    const hasShell = await page.locator('[data-hydrated]').count() > 0;
    if (hasShell) {
        await expect(page.locator('[data-hydrated="true"]').first()).toBeVisible({ timeout: 15000 });
    }

    // Then wait for the primary feature container to be ready if we're on a main page
    if (!options.skipMapReady) {
        if (page.url().endsWith('/') || page.url().includes('?')) {
            await waitForSignal(page, 'map-container', /ready|error/, 5000).catch(() => null);
        } else if (page.url().includes('/trips/')) {
            await waitForSignal(page, 'trip-details-card', /ready|error/, 5000).catch(() => null);
        } else if (page.url().includes('/trips')) {
            await waitForSignal(page, 'trip-list-container', /ready|error/, 5000).catch(() => null);
        }
    }
}

/**
 * Waits for the map container to reach the ready state.
 */
export async function waitForMapReady(page: Page) {
    const mapContainer = page.locator('[data-testid="map-container"]').first();
    await expect(mapContainer).toHaveAttribute('data-state', 'ready', { timeout: 15000 });
}

/**
 * Dismisses the cookie consent banner if visible.
 */
export async function dismissCookieConsent(page: Page) {
    const banner = page.locator('[aria-label="Cookie consent"]');
    try {
        if (await banner.isVisible()) {
            const btn = banner.getByRole('button', { name: /Got it/i });
            if (await btn.isVisible()) {
                await btn.click();
                await expect(banner).not.toBeVisible({ timeout: 5000 });
            }
        }
    } catch (e) {}
}

/**
 * Clears service workers and related caches for a fresh test state.
 */
export async function clearServiceWorkers(page: Page) {
    // 1. Clear cookies across context
    await page.context().clearCookies().catch(() => {});

    // 2. Navigate to about:blank first to ensure all app-level IndexedDB connections are closed.
    // This prevents deleteDatabase calls from being 'blocked' by open connections.
    await page.goto('about:blank').catch(() => {});

    // 3. Proactively set flags that MUST survive across the cleanup navigations
    // We add them as init script for the NEXT navigation (to /)
    await page.addInitScript(() => {
        (window as any)._E2E_ENABLE_REAL_SYNC = true;
        window.localStorage.setItem('_E2E_ENABLE_REAL_SYNC', 'true');
    });

    // 4. Navigate to /login to clear the actual app origin storage without triggering auth redirects
    await page.goto('/login').catch(() => {});
    await page.waitForLoadState('domcontentloaded');

    try {
        await page.evaluate(async () => {
            try {
                if ('serviceWorker' in navigator) {
                    const registrations = await navigator.serviceWorker.getRegistrations();
                    for (const registration of registrations) {
                        await registration.unregister();
                    }
                }
            } catch (e) {}

            try {
                const cacheNames = await caches.keys();
                for (const cacheName of cacheNames) {
                    await caches.delete(cacheName);
                }
            } catch (e) {}

            try {
                // Force delete IndexedDB for winery storage
                if (window.indexedDB && window.indexedDB.databases) {
                    const dbs = await window.indexedDB.databases();
                    for (const db of dbs) {
                        if (db.name) {
                            window.indexedDB.deleteDatabase(db.name);
                        }
                    }
                }
                // Standard LocalStorage/SessionStorage cleanup
                window.localStorage.clear();
                window.localStorage.setItem('_E2E_ENABLE_REAL_SYNC', 'true');
                window.sessionStorage.clear();
            } catch (e) {}
        });
    } catch (e) {
        // Ignore execution context destruction during cleanup navigations
    }

    // 5. Clear cookies again to ensure any set during /login navigation are removed
    await page.context().clearCookies().catch(() => {});

    // 6. Navigate back to about:blank to ENSURE all connections are closed after cleanup
    // so the deletions can actually finish before the next test step starts.
    await page.goto('about:blank').catch(() => {});
}
