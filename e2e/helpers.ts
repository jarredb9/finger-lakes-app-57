/* eslint-disable no-console */
import { expect, Locator, Page } from '@playwright/test';

/**
 * A centralized container for common test helper functions.
 */

// --- Reusable Locators ---

export function getSidebarContainer(page: Page): Locator {
  // Use a more robust check: return whichever container is actually present and visible
  return page.locator('[data-testid="desktop-sidebar-container"], [data-testid="mobile-sidebar-container"]').filter({ visible: true }).first();
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
    const mapContainer = page.locator('[data-testid="map-container"]');
    await expect(mapContainer).toBeAttached({ timeout: 10000 });
    
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
    
    // Press Enter for better reliability across Safari/WebKit
    await passInput.press('Enter');

    // Check if we reached the dashboard
    const dashboard = page.locator(successSelector).first();
    try {
        await expect(dashboard).toBeVisible({ timeout: 10000 });
    } catch (e) {
        // Fallback to robust click if Enter didn't trigger navigation
        const signInBtn = page.getByRole('button', { name: 'Sign In' });
        if (await signInBtn.isVisible()) {
            await robustClick(signInBtn);
            await expect(dashboard).toBeVisible({ timeout: 10000 });
        } else {
            throw e;
        }
    }
    await page.waitForLoadState('networkidle');
  }).toPass({
    intervals: [2000, 5000],
    timeout: 30000
  });
  
  // Wait for critical initial data fetches and store hydration
  await Promise.all([
    page.waitForResponse(resp => resp.url().includes('/auth/v1/user'), { timeout: 15000 }).catch(() => {}),
    !options.skipMapReady ? page.waitForResponse(resp => resp.url().includes('get_map_markers') && resp.status() === 200, { timeout: 15000 }).catch(() => {}) : Promise.resolve()
  ]);

  // Deterministic check for store hydration instead of waitForTimeout
  if (!options.skipMapReady) {
    await expect(async () => {
      const isHydrated = await page.evaluate(() => {
          const u = (window as any).useUserStore?.getState().user;
          const w = (window as any).useWineryDataStore?.persist?.hasHydrated();
          const v = (window as any).useVisitStore?.persist?.hasHydrated();
          return !!(u && w && v);
      });
      if (!isHydrated) throw new Error('Stores not yet hydrated');
    }).toPass({ timeout: 15000, intervals: [1000, 2000] });
  }

  // Ensure map is functional before returning
  if (!options.skipMapReady) {
    await waitForMapReady(page);
  }

      // IMPORTANT: On mobile, the sheet is closed by default. Open Explore so subsequent tests can find wineries.
    if (isMobile) {
        await navigateToTab(page, 'Explore');
    }
  
  }
  
  /**
   * Gets a Supabase client from the browser context if possible.
   */
  export async function getBrowserSupabase(page: Page) {
      return await page.evaluate(() => {
          // @ts-ignore
          if (window.supabase) return window.supabase;
          // Import createClient dynamically if needed or use existing instances
          // For simplicity, we assume we can just create one if we have the env vars
          // but often the app has one we can grab.
          // Let's try to find it in the Window object or create a new one.
          try {
              // @ts-ignore
              const { createClient } = require('@/utils/supabase/client');
              return createClient();
          } catch (e) {
              return null;
          }
      });
  }
  
  /**
   * A robust click implementation that handles PointerEvents, MouseEvents and a final Click * to ensure Radix and other interaction-heavy components trigger correctly across all engines.
 */
export async function robustClick(pageOrLocator: Page | Locator, locator?: Locator) {
  const target = locator || (pageOrLocator as Locator);
  await expect(target).toBeVisible({ timeout: 15000 });
  
  await target.evaluate(el => {
    const events = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
    events.forEach(name => {
      const isPointer = name.startsWith('pointer');
      const EventClass = isPointer ? PointerEvent : MouseEvent;
      const eventOptions = { bubbles: true, cancelable: true };
      
      // For pointer events, specify 'touch' to help mobile emulators
      if (isPointer) {
          (eventOptions as any).pointerType = 'touch';
      }
      
      el.dispatchEvent(new EventClass(name, eventOptions));
    });
  });
}

/**
 * Establishes a friendship between two users in an E2E test.
 * Assumes both pages are already logged in as their respective users.
 */
export async function setupFriendship(pageA: Page, pageB: Page, user1Email: string, user2Email: string) {
    const isMobileA = pageA.viewportSize()!.width < 768;
    const isMobileB = pageB.viewportSize()!.width < 768;

    // 1. User A sends request
    await navigateToTab(pageA, 'Friends');
    const sidebarA = getSidebarContainer(pageA);
    
    if (isMobileA) {
        const expandBtn = pageA.getByRole('button', { name: 'Expand to full screen' });
        if (await expandBtn.isVisible()) await expandBtn.click();
    }

    await expect(sidebarA.getByText('Add a Friend').first()).toBeVisible({ timeout: 10000 });
    await sidebarA.getByPlaceholder("Enter friend's email").fill(user2Email);
    
    const addBtn = sidebarA.getByRole('button', { name: 'Add friend' });
    await expect(addBtn).toBeEnabled();
    await robustClick(pageA, addBtn);
    await expect(pageA.getByText('Friend request sent!').first()).toBeVisible();

    // 2. User B accepts request with retry logic for eventual consistency
    await expect(async () => {
        await pageB.reload();
        await navigateToTab(pageB, 'Friends');
        const sidebarB = getSidebarContainer(pageB);

        if (isMobileB) {
            const expandBtn = pageB.getByRole('button', { name: 'Expand to full screen' });
            if (await expandBtn.isVisible()) await expandBtn.click();
        }

        const requestsCard = sidebarB.locator('.rounded-lg.border').filter({ hasText: 'Friend Requests' });
        if (!(await requestsCard.isVisible())) throw new Error('Friend Requests card not visible');
        
        const requestRow = requestsCard.locator('.flex.items-center', { hasText: user1Email });
        if (!(await requestRow.isVisible())) throw new Error(`Request from ${user1Email} not found`);
        
        const acceptBtn = requestRow.getByRole('button', { name: 'Accept request' });
        await robustClick(pageB, acceptBtn);
        
        // Verify moved to My Friends list
        const myFriendsCard = sidebarB.locator('.rounded-lg.border').filter({ hasText: 'My Friends' });
        await expect(myFriendsCard.locator('text=' + user1Email)).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 25000, intervals: [3000, 5000] });
}

export async function navigateToTab(page: Page, tabName: 'Explore' | 'Trips' | 'Friends' | 'History') {
  const viewport = page.viewportSize();
  const isMobile = viewport && viewport.width < 768;
  
  if (isMobile) {
    const navBtn = page.getByRole('button', { name: tabName });
    
    // For mobile Radix triggers, we sometimes need a direct event dispatch
    await navBtn.evaluate(el => {
        const events = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
        events.forEach(name => {
            const EventClass = name.startsWith('pointer') ? PointerEvent : MouseEvent;
            el.dispatchEvent(new EventClass(name, { bubbles: true, cancelable: true, pointerType: 'touch' } as any));
        });
    });
    
    // Wait for the sheet to appear and stabilize
    const sheet = page.getByTestId('mobile-sidebar-container');
    await expect(sheet).toBeVisible({ timeout: 5000 });
    await expect(sheet).toHaveAttribute('data-state', 'stable', { timeout: 10000 });
  } else {
      const sidebar = page.getByTestId('desktop-sidebar-container');
      const tab = sidebar.locator(`[role="tab"][aria-label="${tabName}"]`);
      await robustClick(tab);
  }
}
