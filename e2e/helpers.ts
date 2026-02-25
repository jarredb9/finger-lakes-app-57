/* eslint-disable no-console */
import { expect, Locator, Page } from '@playwright/test';

/**
 * E2E TEST HELPERS
 * 
 * Organized into four categories:
 * 1. Core Utilities (Interactions & Setup)
 * 2. Navigation & Layout (Tabs & Sheet management)
 * 3. Winery & Visit Actions (The user journey)
 * 4. Social & Feedback (Friends & Toasts)
 */

// ==========================================
// 1. CORE UTILITIES
// ==========================================

/**
 * Returns the visible sidebar container (desktop or mobile).
 */
export function getSidebarContainer(page: Page): Locator {
  return page.locator('[data-testid="desktop-sidebar-container"], [data-testid="mobile-sidebar-container"]').filter({ visible: true }).first();
}

/**
 * A robust click implementation that handles PointerEvents, MouseEvents and a final Click
 * to ensure Radix and other interaction-heavy components trigger correctly across all engines.
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
      if (isPointer) {
          (eventOptions as any).pointerType = 'touch';
      }
      el.dispatchEvent(new EventClass(name, eventOptions));
    });
  });
}

/**
 * Forcefully unregisters all service workers and clears all caches.
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
            const dbs = await window.indexedDB.databases();
            dbs.forEach(db => {
                if (db.name) window.indexedDB.deleteDatabase(db.name);
            });
        } catch (e) {
            console.error('Error clearing SW/Caches:', e);
        }
    });
}

/**
 * Fetches data from a specific Zustand store via the window object.
 */
export async function fetchStoreState(page: Page, storeName: 'useUserStore' | 'useWineryDataStore' | 'useVisitStore' | 'useFriendStore' | 'useMapStore') {
    return await page.evaluate((name) => {
        const store = (window as any)[name];
        if (!store) return null;
        return store.getState();
    }, storeName);
}

// ==========================================
// 2. NAVIGATION & LAYOUT
// ==========================================

/**
 * Wait for Google Maps and internal state to be ready.
 */
export async function waitForMapReady(page: Page) {
    const mapContainer = page.locator('[data-testid="map-container"]');
    await expect(mapContainer).toBeAttached({ timeout: 10000 });
    
    await expect(async () => {
        const state = await fetchStoreState(page, 'useMapStore');
        if (!state?.bounds) throw new Error('Map bounds not yet initialized');
    }).toPass({ timeout: 10000 });
}

/**
 * Ensures the mobile sidebar/bottom sheet is expanded and stable.
 */
export async function ensureSidebarExpanded(page: Page) {
    const isMobile = page.viewportSize()!.width < 768;
    if (!isMobile) return;

    const sidebar = getSidebarContainer(page);
    const expandBtn = page.getByRole('button', { name: 'Expand to full screen' });
    
    if (await expandBtn.isVisible()) {
        await expandBtn.click();
        // Wait for animation to finish and data-state to be stable
        await expect(sidebar).toHaveAttribute('data-state', 'stable', { timeout: 10000 });
    }
}

/**
 * Switches between main application tabs (Explore, Trips, Friends, History).
 */
export async function navigateToTab(page: Page, tabName: 'Explore' | 'Trips' | 'Friends' | 'History') {
  const viewport = page.viewportSize();
  const isMobile = viewport && viewport.width < 768;
  
  if (isMobile) {
    const navBtn = page.getByRole('button', { name: tabName });
    await navBtn.evaluate(el => {
        const events = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
        events.forEach(name => {
            const EventClass = name.startsWith('pointer') ? PointerEvent : MouseEvent;
            el.dispatchEvent(new EventClass(name, { bubbles: true, cancelable: true, pointerType: 'touch' } as any));
        });
    });
    
    const sheet = page.getByTestId('mobile-sidebar-container');
    await expect(sheet).toBeVisible({ timeout: 5000 });
    await expect(sheet).toHaveAttribute('data-state', 'stable', { timeout: 10000 });
  } else {
      const sidebar = page.getByTestId('desktop-sidebar-container');
      const tab = sidebar.locator(`[role="tab"][aria-label="${tabName}"]`);
      await robustClick(tab);
  }
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

/**
 * High-level login helper.
 */
export async function login(page: Page, email: string, pass: string, options: { skipMapReady?: boolean } = {}) {
  await page.addInitScript(() => {
    window.localStorage.setItem('cookie-consent', 'true');
  });

  const isMobile = page.viewportSize()?.width! < 768;
  const successSelector = isMobile ? 'div.fixed.bottom-0' : 'h1:has-text("Winery Tracker")';

  await expect(async () => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(pass);
    await page.keyboard.press('Enter');

    const dashboard = page.locator(successSelector).first();
    try {
        await expect(dashboard).toBeVisible({ timeout: 10000 });
    } catch (e) {
        const signInBtn = page.getByRole('button', { name: 'Sign In' });
        if (await signInBtn.isVisible()) {
            await robustClick(signInBtn);
            await expect(dashboard).toBeVisible({ timeout: 10000 });
        } else {
            throw e;
        }
    }
  }).toPass({ intervals: [2000, 5000], timeout: 30000 });
  
  if (!options.skipMapReady) {
    await expect(async () => {
      const isHydrated = await page.evaluate(() => {
          const userStore = (window as any).useUserStore;
          const wineryStore = (window as any).useWineryDataStore;
          const visitStore = (window as any).useVisitStore;
          
          if (!userStore || !wineryStore || !visitStore) return false;
          
          const u = userStore.getState().user;
          const w = wineryStore.persist?.hasHydrated();
          const v = visitStore.persist?.hasHydrated();
          
          return !!(u && w && v);
      });
      if (!isHydrated) throw new Error('Stores not yet hydrated');
    }).toPass({ timeout: 15000, intervals: [1000, 2000] });

    await waitForMapReady(page);
  }

  if (isMobile) {
    await navigateToTab(page, 'Explore');
  }
}

// ==========================================
// 3. WINERY & VISIT ACTIONS
// ==========================================

/**
 * Finds and opens a winery modal from the Explore list.
 */
export async function openWineryDetails(page: Page, wineryName: string) {
    const sidebar = getSidebarContainer(page);
    // Use resilient text-based locator aligned with trip-flow pattern
    const wineryCard = sidebar.locator(`text=${wineryName}`).first();
    
    await expect(wineryCard).toBeVisible({ timeout: 15000 });
    await wineryCard.scrollIntoViewIfNeeded();
    await robustClick(page, wineryCard);
    
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 });
}

/**
 * Safely closes the winery modal to prevent overlay conflicts.
 */
export async function closeWineryModal(page: Page) {
    const modal = page.getByRole('dialog');
    if (!(await modal.isVisible())) return;

    const closeBtn = modal.getByRole('button', { name: /Close/i });
    if (await closeBtn.isVisible()) {
        await closeBtn.click();
    } else {
        await page.keyboard.press('Escape');
    }
    await expect(modal).not.toBeVisible({ timeout: 10000 });
}

/**
 * Fills and submits the visit form within the winery modal.
 */
export async function logVisit(page: Page, data: { review?: string, rating?: number, isPrivate?: boolean }) {
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    // Scroll to form
    const formHeading = modal.getByText(/Add New Visit/i);
    await formHeading.scrollIntoViewIfNeeded();

    // Use modal scoping for all fields to prevent global ambiguity
    if (data.review) {
        await modal.getByLabel('Your Review').fill(data.review);
    }

    if (data.rating) {
        const star = modal.getByLabel(`Set rating to ${data.rating}`);
        await robustClick(page, star);
    }

    if (data.isPrivate) {
        const checkbox = modal.getByLabel(/Make this visit private/i);
        await checkbox.check();
    }

    const submitBtn = modal.getByRole('button', { name: /Add Visit|Save Changes/i });
    await robustClick(page, submitBtn);
    await waitForToast(page, /Visit added successfully|Visit updated successfully/i);
}

// ==========================================
// 4. SOCIAL & FEEDBACK
// ==========================================

/**
 * Handles the multi-user friendship flow.
 */
export async function setupFriendship(pageA: Page, pageB: Page, user1Email: string, user2Email: string) {
    // 1. User A sends request
    await navigateToTab(pageA, 'Friends');
    await ensureSidebarExpanded(pageA);
    const sidebarA = getSidebarContainer(pageA);

    await expect(sidebarA.getByText('Add a Friend').first()).toBeVisible({ timeout: 10000 });
    await sidebarA.getByPlaceholder("Enter friend's email").fill(user2Email);
    
    const addBtn = sidebarA.getByRole('button', { name: 'Add friend' });
    await robustClick(pageA, addBtn);
    await waitForToast(pageA, /Friend request sent!/i);

    // 2. User B accepts request with retry for consistency
    await expect(async () => {
        await pageB.reload();
        await navigateToTab(pageB, 'Friends');
        await ensureSidebarExpanded(pageB);
        
        const sidebarB = getSidebarContainer(pageB);
        const requestsCard = sidebarB.locator('.rounded-lg.border').filter({ hasText: 'Friend Requests' });
        if (!(await requestsCard.isVisible())) throw new Error('Friend Requests card not visible');
        
        const requestRow = requestsCard.locator('.flex.items-center', { hasText: user1Email });
        if (!(await requestRow.isVisible())) throw new Error(`Request from ${user1Email} not found`);
        
        const acceptBtn = requestRow.getByRole('button', { name: 'Accept request' });
        await robustClick(pageB, acceptBtn);
        
        const myFriendsCard = sidebarB.locator('.rounded-lg.border').filter({ hasText: 'My Friends' });
        await expect(myFriendsCard.locator('text=' + user1Email)).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 25000, intervals: [3000, 5000] });
}

/**
 * Centralized toast detection to resolve strict-mode ambiguity.
 */
export async function waitForToast(page: Page, message: string | RegExp) {
    const toast = page.locator('[role="status"], [role="alert"]').filter({ hasText: message }).first();
    await expect(toast).toBeVisible({ timeout: 15000 });
}

/**
 * Robustly interacts with Radix UI Select components.
 */
export async function selectOption(page: Page, trigger: Locator, optionText: string) {
    await robustClick(page, trigger);
    const option = page.getByRole('option', { name: optionText });
    await expect(option).toBeVisible({ timeout: 10000 });
    await option.click();
}
