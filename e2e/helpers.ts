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

export function getSidebarContainer(page: Page): Locator {
  return page.locator('[data-testid="desktop-sidebar-container"], [data-testid="mobile-sidebar-container"]').filter({ visible: true }).first();
}

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

export async function getBrowserSupabase(page: Page) {
    return await page.evaluate(() => {
        try {
            // @ts-ignore
            const { createClient } = require('@/utils/supabase/client');
            return createClient();
        } catch (e) {
            return null;
        }
    });
}

// ==========================================
// 2. NAVIGATION & LAYOUT
// ==========================================

export async function waitForMapReady(page: Page) {
    const mapContainer = page.locator('[data-testid="map-container"]');
    await expect(mapContainer).toBeAttached({ timeout: 10000 });
    
    await expect(async () => {
        const hasBounds = await page.evaluate(() => {
            // @ts-ignore
            return !!(window.useMapStore?.getState?.().bounds);
        });
        if (!hasBounds) throw new Error('Map bounds not yet initialized');
    }).toPass({ timeout: 10000 });
}

export async function ensureSidebarExpanded(page: Page) {
    const isMobile = page.viewportSize()!.width < 768;
    if (!isMobile) return;

    const sidebar = getSidebarContainer(page);
    const expandBtn = page.getByRole('button', { name: 'Expand to full screen' });
    
    if (await expandBtn.isVisible()) {
        await expandBtn.click();
        await expect(sidebar).toHaveAttribute('data-state', 'stable', { timeout: 15000 });
    }
}

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

export async function login(page: Page, email: string, pass: string, options: { skipMapReady?: boolean } = {}) {
  await page.addInitScript(() => {
    window.localStorage.setItem('cookie-consent', 'true');
  });

  const isMobile = page.viewportSize()?.width! < 768;
  const successSelector = isMobile ? 'div.fixed.bottom-0' : 'h1:has-text("Winery Tracker")';

  await expect(async () => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    const emailInput = page.getByLabel('Email');
    await expect(emailInput).toBeVisible({ timeout: 5000 });
    await emailInput.fill(email);
    
    const passInput = page.getByLabel('Password');
    await passInput.fill(pass);
    await passInput.press('Enter');

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
    await page.waitForLoadState('networkidle');
  }).toPass({
    intervals: [2000, 5000],
    timeout: 30000
  });
  
  await Promise.all([
    page.waitForResponse(resp => resp.url().includes('/auth/v1/user'), { timeout: 15000 }).catch(() => {}),
    !options.skipMapReady ? page.waitForResponse(resp => resp.url().includes('get_map_markers') && resp.status() === 200, { timeout: 15000 }).catch(() => {}) : Promise.resolve()
  ]);

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

  if (!options.skipMapReady) {
    await waitForMapReady(page);
  }

  if (isMobile) {
    await navigateToTab(page, 'Explore');
  }
}

// ==========================================
// 3. WINERY & VISIT ACTIONS
// ==========================================

export async function waitForSearchComplete(page: Page) {
  const sidebar = getSidebarContainer(page);
  const resultsList = sidebar.getByTestId('winery-results-list');
  await expect(resultsList).toHaveAttribute('data-loaded', 'true', { timeout: 15000 });
}

export async function openWineryDetails(page: Page, wineryName: string) {
    const sidebar = getSidebarContainer(page);
    const wineryItem = sidebar.locator('text=' + wineryName).first();
    await expect(wineryItem).toBeVisible({ timeout: 15000 });
    await robustClick(page, wineryItem);
    
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
}

export async function closeWineryModal(page: Page) {
    const modal = page.getByRole('dialog');
    if (!(await modal.isVisible())) return;

    const closeBtn = modal.getByRole('button', { name: 'Close' });
    if (await closeBtn.isVisible()) {
        await closeBtn.click();
    } else {
        await page.keyboard.press('Escape');
    }
    await expect(modal).not.toBeVisible();
}

export async function logVisit(page: Page, data: { review: string, rating?: number, isPrivate?: boolean }) {
    const modal = page.getByRole('dialog');
    await modal.getByText('Add New Visit').scrollIntoViewIfNeeded();
    await page.getByLabel('Your Review').fill(data.review);
    
    if (data.rating) {
        const star = modal.getByLabel(`Set rating to ${data.rating}`);
        await robustClick(page, star);
    }

    if (data.isPrivate) {
        await page.getByLabel('Make this visit private').check();
    }
    
    await robustClick(page, page.getByRole('button', { name: 'Add Visit' }));
    await expect(page.getByText('Visit added successfully.').first()).toBeVisible();
}

// ==========================================
// 4. SOCIAL & FEEDBACK
// ==========================================

export async function setupFriendship(pageA: Page, pageB: Page, user1Email: string, user2Email: string) {
    const isMobileA = pageA.viewportSize()!.width < 768;

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
        const isMobileView = pageB.viewportSize()!.width < 768;

        if (isMobileView) {
            const expandBtn = pageB.getByRole('button', { name: 'Expand to full screen' });
            if (await expandBtn.isVisible()) {
                await expandBtn.click();
                await expect(sidebarB).toHaveAttribute('data-state', 'stable', { timeout: 10000 });
            }
        }

        // Check if already friends (handles retry case where accept already succeeded)
        const myFriendsCard = sidebarB.locator('.rounded-lg.border').filter({ hasText: 'My Friends' });
        if (await myFriendsCard.locator('text=' + user1Email).isVisible()) {
            return; // Success!
        }

        const requestsCard = sidebarB.locator('.rounded-lg.border').filter({ hasText: 'Friend Requests' });
        if (!(await requestsCard.isVisible())) throw new Error('Friend Requests card not visible');
        
        const requestRow = requestsCard.locator('.flex.items-center', { hasText: user1Email });
        if (!(await requestRow.isVisible())) throw new Error(`Request from ${user1Email} not found in list`);
        
        const acceptBtn = requestRow.getByRole('button', { name: 'Accept request' });
        await robustClick(pageB, acceptBtn);
        
        // Verify moved to My Friends list
        await expect(myFriendsCard.locator('text=' + user1Email)).toBeVisible({ timeout: 10000 });
    }).toPass({ timeout: 25000, intervals: [3000, 5000] });
}

export async function selectPrivacyOption(page: Page, optionName: 'Public' | 'Friends Only' | 'Private') {
    const sidebar = getSidebarContainer(page);
    
    // Mobile guard: ensure sheet is expanded and stable
    if (page.viewportSize()!.width < 768) {
        await expect(sidebar).toHaveAttribute('data-state', 'stable', { timeout: 15000 });
    }

    const privacySelect = sidebar.getByRole('combobox').first();
    await expect(privacySelect).toBeVisible({ timeout: 10000 });
    await robustClick(page, privacySelect);
    
    const option = page.locator('[role="option"], div').filter({ hasText: new RegExp('^' + optionName + '$') }).last();
    await expect(option).toBeVisible({ timeout: 10000 });
    await robustClick(page, option);
}
