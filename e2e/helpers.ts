 
import { expect, Locator, Page } from '@playwright/test';

/**
 * E2E TEST HELPERS - SURGICAL RECONCILIATION
 */

// ==========================================
// 1. CORE UTILITIES
// ==========================================

export function getSidebarContainer(page: Page): Locator {
  return page.locator('[data-testid="desktop-sidebar-container"], [data-testid="mobile-sidebar-container"]').filter({ visible: true }).first();
}

/**
 * Waits for the application to be fully loaded and hydrated.
 */
export async function waitForAppReady(page: Page) {
    const isMobile = page.viewportSize()?.width! < 768;
    const successSelector = isMobile 
      ? 'div.fixed.bottom-0, [data-testid="settings-page-container"]' 
      : '[data-testid="desktop-sidebar-container"], [data-testid="settings-page-container"]';
    
    await expect(page.locator(successSelector).first()).toBeVisible({ timeout: 20000 });
}

/**
 * Gets the tab trigger locator for both desktop and mobile.
 */
export function getTabTrigger(page: Page, tabName: 'Explore' | 'Trips' | 'Friends' | 'History') {
    // We look for both possible locations to handle hydration flashes or project mismatches
    const mobileTab = page.getByTestId(`mobile-nav-${tabName.toLowerCase()}`);
    const desktopTab = page.locator('[data-testid="desktop-sidebar-container"]').locator('[role="tab"]').filter({ hasText: tabName });
    
    return mobileTab.or(desktopTab).first();
}

/**
 * A robust click implementation ensuring Radix triggers.
 */
export async function robustClick(pageOrLocator: Page | Locator, locator?: Locator) {
  const target = locator || (pageOrLocator as Locator);
  await expect(target).toBeVisible({ timeout: 15000 });
  await expect(target).toBeEnabled({ timeout: 10000 });
  
  await target.evaluate(el => {
    const events = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
    events.forEach(name => {
      const isPointer = name.startsWith('pointer');
      const EventClass = isPointer ? PointerEvent : MouseEvent;
      const eventOptions = { bubbles: true, cancelable: true };
      if (isPointer) { (eventOptions as any).pointerType = 'touch'; }
      el.dispatchEvent(new EventClass(name, eventOptions));
    });
  });
}

/**
 * Clears service workers and related caches for a fresh test state.
 */
export async function clearServiceWorkers(page: Page) {
    // Navigate to / first to ensure we have a valid origin for SW/IndexedDB access
    await page.goto('/').catch(() => {}); 
    
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
            // WebKit might throw SecurityError here in some contexts
            if (window.indexedDB && window.indexedDB.databases) {
                const dbs = await window.indexedDB.databases();
                dbs.forEach(db => {
                    if (db.name) window.indexedDB.deleteDatabase(db.name);
                });
            }
        } catch (e) {}
    });
}

export async function refreshFriendsStore(page: Page) {
    await page.evaluate(async () => {
        // @ts-ignore
        const store = window.useFriendStore?.getState();
        if (store) await store.fetchFriends();
    });
}

// ==========================================
// 2. NAVIGATION & STATE
// ==========================================

export async function waitForMapReady(page: Page) {
    const mapContainer = page.locator('[data-testid="map-container"]');
    await expect(mapContainer).toBeAttached({ timeout: 10000 });
    
    await expect(async () => {
        const hasBounds = await page.evaluate(() => {
            // @ts-ignore
            return !!(window.useMapStore?.getState?.().bounds);
        }).catch(() => false);
        if (!hasBounds) throw new Error('Map bounds not initialized');
    }).toPass({ timeout: 10000 });
}

export async function navigateToTab(page: Page, tabName: 'Explore' | 'Trips' | 'Friends' | 'History') {
  const isMobile = page.viewportSize()!.width < 768;
  const isWebKit = page.context().browser()?.browserType().name() === 'webkit';

  const tab = getTabTrigger(page, tabName);
  await robustClick(page, tab);

  if (isMobile) {
    const sheet = page.getByTestId('mobile-sidebar-container');
    await expect(sheet).toHaveAttribute('data-state', 'stable', { timeout: 10000 });
  }

  // WebKit/Safari needs a tiny bit more time for global mocks to settle 
  // before the first search trigger happens during navigation to Explore
  if (isWebKit && tabName === 'Explore') {
      await page.waitForTimeout(500);
  }
}

export async function navigateToSettings(page: Page) {
    // Use direct navigation for robustness in E2E
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await waitForAppReady(page);
}

export async function ensureSidebarExpanded(page: Page) {
    const isMobile = page.viewportSize()!.width < 768;
    if (!isMobile) return;
    const sidebar = getSidebarContainer(page);
    const expandBtn = page.getByRole('button', { name: 'Expand to full screen' });
    if (await expandBtn.isVisible()) {
        await expandBtn.click();
        await expect(sidebar).toHaveAttribute('data-state', 'stable', { timeout: 10000 });
    }
}

export async function login(page: Page, email: string, pass: string, options: { skipMapReady?: boolean } = {}) {
  await page.addInitScript(() => {
    window.localStorage.setItem('cookie-consent', 'true');
  });

  const isMobile = page.viewportSize()?.width! < 768;
  const isWebKit = page.context().browser()?.browserType().name() === 'webkit';

  // 0. REGISTRATION BUFFER (WebKit Only)
  // Ensure context.route/page.route are fully active before the first goto()
  if (isWebKit) {
      await page.waitForTimeout(1000);
  }

  await expect(async () => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(pass);
    await page.keyboard.press('Enter');

    try {
        await waitForAppReady(page);
    } catch (e) {
        const signInBtn = page.getByRole('button', { name: 'Sign In' });
        if (await signInBtn.isVisible()) {
            await robustClick(page, signInBtn);
            await waitForAppReady(page);
        } else { throw e; }
    }
  }).toPass({ intervals: [2000], timeout: 45000 });
  
  await page.waitForResponse(resp => resp.url().includes('/auth/v1/user'), { timeout: 15000 }).catch(() => null);

  if (!options.skipMapReady) {
    await page.waitForResponse(resp => resp.url().includes('get_map_markers') && resp.status() === 200, { timeout: 15000 }).catch(() => null);

    await expect(async () => {
      const isHydrated = await page.evaluate(() => {
          try {
              const u = (window as any).useUserStore?.getState().user;
              const w = (window as any).useWineryDataStore?.persist?.hasHydrated();
              const v = (window as any).useVisitStore?.persist?.hasHydrated();
              return !!(u && w && v);
          } catch (e) { return false; }
      }).catch(() => false);
      if (!isHydrated) throw new Error('Stores not hydrated');
    }).toPass({ timeout: 15000, intervals: [1000, 2000] });

    await waitForMapReady(page);
  }

  if (isMobile) {
    if (!options.skipMapReady) {
      await waitForMapReady(page); 
    }
    if (isWebKit) await page.waitForTimeout(500); 
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

export async function ensureProfileReady(page: Page) {
    await expect(async () => {
        const hasName = await page.evaluate(() => {
            const user = (window as any).useUserStore?.getState().user;
            return !!(user && user.name && user.name !== 'User');
        });
        if (!hasName) throw new Error('Profile not yet fully initialized');
    }).toPass({ timeout: 15000, intervals: [1000, 2000] });
}

export async function openWineryDetails(page: Page, wineryName: string) {
    const sidebar = getSidebarContainer(page);
    // Try data-testid first, then text fallback
    let wineryItem = sidebar.getByTestId(`winery-card-${wineryName}`).first();
    
    try {
        await expect(wineryItem).toBeVisible({ timeout: 10000 });
    } catch (e) {
        // Fallback to text search if testid is not present or name-agnostic search is needed
        wineryItem = sidebar.locator('text=' + wineryName).first();
        try {
            await expect(wineryItem).toBeVisible({ timeout: 5000 });
        } catch (e2) {
            wineryItem = sidebar.getByText(wineryName, { exact: false }).first();
            await expect(wineryItem).toBeVisible({ timeout: 5000 });
        }
    }
    
    await robustClick(page, wineryItem);
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible({ timeout: 10000 });
}

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

export async function logVisit(page: Page, data: { review: string, rating?: number, isPrivate?: boolean }) {
    const modal = page.getByRole('dialog');
    await modal.getByText(/Add New Visit/i).scrollIntoViewIfNeeded();
    await modal.getByLabel('Your Review').fill(data.review);
    if (data.rating) await robustClick(page, modal.getByLabel(`Set rating to ${data.rating}`));
    if (data.isPrivate) await modal.getByLabel(/Make this visit private/i).check();
    
    await robustClick(page, modal.getByRole('button', { name: 'Add Visit' }));
    await expect(page.getByText(/(Visit added successfully|Visit cached)/i).first()).toBeVisible({ timeout: 15000 });
}

// ==========================================
// 4. SOCIAL & FEEDBACK
// ==========================================

export async function setupFriendship(pageA: Page, pageB: Page, user1Email: string, user2Email: string) {
    // 1. User A Sends Request
    await navigateToTab(pageA, 'Friends');
    await ensureSidebarExpanded(pageA);
    const sidebarA = getSidebarContainer(pageA);
    
    const emailInput = sidebarA.locator('[data-testid="add-friend-email-input"]');
    await emailInput.fill(user2Email);
    await expect(emailInput).toHaveValue(user2Email);
    
    const addBtn = sidebarA.locator('[data-testid="add-friend-btn"]');
    await robustClick(pageA, addBtn);
    
    // Wait for the RPC response explicitly (Non-fatal)
    await pageA.waitForResponse(resp => resp.url().includes('send_friend_request') && (resp.status() === 200 || resp.status() === 204), { timeout: 15000 }).catch(() => null);

    // 2. User B Accepts Request (Aggressive Reload strategy from stable commit)
    await expect(async () => {
        // Aggressive sync: reload and wait for network
        await pageB.reload();
        await pageB.waitForLoadState('networkidle');

        // Ensure AppShell is hydrated after reload
        await waitForAppReady(pageB);

        await navigateToTab(pageB, 'Friends');
        await ensureSidebarExpanded(pageB);
        const sidebarB = getSidebarContainer(pageB);
        
        const friendsCard = sidebarB.locator('[data-testid="my-friends-card"]');
        const requestsCard = sidebarB.locator('[data-testid="friend-requests-card"]');

        // Check if already friends
        if (await friendsCard.locator(`text="${user1Email}"`).isVisible()) {
            return;
        }

        const requestRow = requestsCard.locator('.flex.items-center').filter({ hasText: user1Email });
        if (!(await requestRow.isVisible())) {
            throw new Error(`Request from ${user1Email} not visible in requests card after reload`);
        }
        
        const acceptBtn = requestRow.locator('[data-testid="accept-request-btn"]');
        await robustClick(pageB, acceptBtn);
        
        // Wait for acceptance RPC (Non-fatal)
        await pageB.waitForResponse(resp => resp.url().includes('respond_to_friend_request') && (resp.status() === 200 || resp.status() === 204), { timeout: 15000 }).catch(() => null);
        
        await expect(friendsCard.locator(`text="${user1Email}"`)).toBeVisible({ timeout: 15000 });
    }).toPass({ timeout: 60000, intervals: [10000] });
}

export async function waitForToast(page: Page, message: string | RegExp) {
    const toast = page.locator('[role="status"], [role="alert"]').filter({ hasText: message }).first();
    await expect(toast).toBeVisible({ timeout: 15000 });
}

export async function selectPrivacyOption(page: Page, optionName: 'Public' | 'Friends Only' | 'Private') {
    await navigateToSettings(page);
    const container = page.getByTestId('settings-page-container');
    const privacySelect = container.locator('[data-testid="privacy-select"]').first();
    await robustClick(page, privacySelect);
    const option = page.locator('[role="option"], div').filter({ hasText: new RegExp(`^${optionName}$`) }).last();
    await robustClick(page, option);
    await expect(page.getByText(/Privacy set to/i).first()).toBeVisible();
}
