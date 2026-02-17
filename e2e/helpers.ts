import { expect, Locator, Page } from '@playwright/test';

/**
 * A centralized container for common test helper functions.
 */

// --- Reusable Locators ---

export function getSidebarContainer(page: Page): Locator {
  const viewport = page.viewportSize();
  const isMobile = viewport && viewport.width < 768;
  
  // Explicitly target either desktop OR mobile, ensuring we don't pick a hidden element.
  const container = isMobile 
    ? page.locator('[data-testid="mobile-sidebar-container"]')
    : page.locator('[data-testid="desktop-sidebar-container"]');
    
  return container.filter({ visible: true }).first();
}

/**
 * Wait for the winery search list to finish loading.
 */
export async function waitForSearchComplete(page: Page) {
  const sidebar = getSidebarContainer(page);
  const resultsList = sidebar.getByTestId('winery-results-list');
  
  // Wait for searching loader to disappear and data-loaded to be true
  await expect(resultsList).toHaveAttribute('data-loaded', 'true', { timeout: 15000 });
}

// --- Common Actions ---

/**
 * Wait for Google Maps and internal state to be ready.
 */
export async function waitForMapReady(page: Page) {
    // Wait for the map container to be in DOM
    await page.waitForSelector('[data-testid="map-container"]', { state: 'attached', timeout: 10000 });
    
    // Wait for internal state bounds to be set via store
    await expect(async () => {
        const hasBounds = await page.evaluate(() => {
            // @ts-ignore
            return !!(window.useMapStore?.getState?.().bounds);
        });
        if (!hasBounds) throw new Error('Map bounds not yet initialized');
    }).toPass({ timeout: 10000 });
}

/**
 * Forcefully unregisters all service workers and clears all caches.
 * Essential for testing mocks in PWA environments.
 */
export async function clearServiceWorkers(page: Page) {
    await page.evaluate(async () => {
        try {
            if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (const registration of registrations) {
                    await registration.unregister();
                }
                const cacheNames = await caches.keys();
                for (const cacheName of cacheNames) {
                    await caches.delete(cacheName);
                }
            }
            // Also clear IndexedDB which might hold stale offline queue data
            const dbs = await window.indexedDB.databases();
            dbs.forEach(db => {
                if (db.name) window.indexedDB.deleteDatabase(db.name);
            });
        } catch (e) {
            console.error('Error clearing SW/Caches:', e);
        }
    });
}

export async function login(page: Page, email: string, pass: string, options: { skipMapReady?: boolean } = {}) {
  // Pre-emptively dismiss cookie banner by setting localStorage before load
  await page.addInitScript(() => {
    window.localStorage.setItem('cookie-consent', 'true');
  });

  const isMobile = page.viewportSize()?.width! < 768;
  const successSelector = isMobile ? 'div.fixed.bottom-0' : 'h1:has-text("Winery Tracker")';

  // Retry logic for occasional Supabase Auth consistency delays
  await expect(async () => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    const emailInput = page.getByLabel('Email');
    await expect(emailInput).toBeVisible({ timeout: 5000 });
    await emailInput.fill(email);
    
    const passInput = page.getByLabel('Password');
    await passInput.fill(pass);
    
    // Use click instead of press Enter for better reliability across Safari/Browsers
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Check if we reached the dashboard
    const dashboard = page.locator(successSelector).first();
    await expect(dashboard).toBeVisible({ timeout: 10000 });
    await page.waitForLoadState('networkidle');
  }).toPass({
    intervals: [2000, 5000],
    timeout: 30000
  });
  
  // Wait for critical initial data fetches to stabilize
  await Promise.all([
    page.waitForResponse(resp => resp.url().includes('/auth/v1/user'), { timeout: 10000 }).catch(() => {}),
    page.waitForResponse(resp => resp.url().includes('get_map_markers'), { timeout: 10000 }).catch(() => {})
  ]);

  // Ensure map is functional before returning
  if (!options.skipMapReady) {
    await waitForMapReady(page);
  }

  // IMPORTANT: On mobile, the sheet is closed by default. Open Explore so subsequent tests can find wineries.
  if (isMobile) {
      await navigateToTab(page, 'Explore');
  }

}

export async function navigateToTab(page: Page, tabName: 'Explore' | 'Trips' | 'Friends' | 'History') {
  const viewport = page.viewportSize();
  const isMobile = viewport && viewport.width < 768;
  
  if (isMobile) {
    const navBtn = page.getByRole('button', { name: tabName });
    await expect(navBtn).toBeVisible();
    
    // Use robust pointer sequence for Radix/Mobile
    await navBtn.evaluate(el => {
      const events = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
      events.forEach(name => {
        el.dispatchEvent(new PointerEvent(name, { bubbles: true, cancelable: true, pointerType: 'touch' }));
      });
    });
    
    // Wait for the sheet to appear
    await expect(page.getByTestId('mobile-sidebar-container')).toBeVisible({ timeout: 5000 });
  } else {
      const sidebar = page.getByTestId('desktop-sidebar-container');
      const tab = sidebar.locator(`[role="tab"][aria-label="${tabName}"]`);
      await expect(tab).toBeVisible({ timeout: 5000 });
      await tab.click();
  }
}
