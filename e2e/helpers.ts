 
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
      ? 'div.fixed.bottom-0, [data-testid="settings-page-container"], [data-testid="trip-details-card"]' 
      : '[data-testid="desktop-sidebar-container"], [data-testid="settings-page-container"], [data-testid="trip-details-card"]';
    
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
    // This is CRITICAL for WebKit/Safari to allow cross-origin storage cleanup
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
            // Force delete IndexedDB for winery storage
            if (window.indexedDB && window.indexedDB.databases) {
                const dbs = await window.indexedDB.databases();
                for (const db of dbs) {
                    if (db.name) window.indexedDB.deleteDatabase(db.name);
                }
            }
            // Standard LocalStorage/SessionStorage cleanup
            window.localStorage.clear();
            window.sessionStorage.clear();
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

/**
 * Fills and submits the login form.
 */
export async function submitLoginForm(page: Page, email: string, pass: string) {
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(pass);
    
    const signInBtn = page.getByRole('button', { name: 'Sign In' });
    // Use robustClick if visible, otherwise fall back to Enter key
    try {
        await robustClick(page, signInBtn);
    } catch (e) {
        await page.keyboard.press('Enter');
    }
}

export async function login(page: Page, email: string, pass: string, options: { skipMapReady?: boolean, isPwa?: boolean } = {}) {
  await page.addInitScript(() => {
    window.localStorage.setItem('cookie-consent', 'true');
  });

  const isMobile = page.viewportSize()?.width! < 768;
  const isWebKit = page.context().browser()?.browserType().name() === 'webkit';
  const isPwa = options.isPwa || false;
  const pwaSuffix = isPwa ? (isPwa.toString().includes('?') ? '&pwa=true' : '?pwa=true') : '';

  // 0. REGISTRATION BUFFER (WebKit Only)
  if (isWebKit) {
      await page.waitForTimeout(2000);
  }

  await expect(async () => {
    await page.goto(`/login${pwaSuffix}`);
    await page.waitForLoadState('networkidle');

    await submitLoginForm(page, email, pass);
    await waitForAppReady(page);
  }).toPass({ intervals: [2000], timeout: 45000 });
  
  await page.waitForResponse(resp => resp.url().includes('/auth/v1/user'), { timeout: 15000 }).catch(() => null);

  if (!options.skipMapReady) {
    // Note: get_map_markers is bypassed in E2E mode at the store level
    
    await expect(async () => {
      const isHydrated = await page.evaluate(() => {
          try {
              const u = (window as any).useUserStore?.getState().user;
              const w = (window as any).useWineryDataStore?.persist?.hasHydrated();
              const v = (window as any).useVisitStore?.persist?.hasHydrated();
              const t = (window as any).useTripStore?.persist?.hasHydrated();
              return !!(u && w && v && t);
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
    
    // Ensure sidebar is ready
    await expect(sidebar).toBeVisible({ timeout: 10000 });

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
            try {
                await expect(wineryItem).toBeVisible({ timeout: 5000 });
            } catch (e3) {
                // Last ditch effort: find anything that looks like it
                wineryItem = sidebar.locator('div, h3, p').filter({ hasText: wineryName }).first();
                await expect(wineryItem).toBeVisible({ timeout: 5000 });
            }
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
    // If the form isn't visible, we might need to trigger it.
    // In the new pattern, VisitForm is a separate dialog.
    const visitModal = page.getByRole('dialog').filter({ hasText: /(Log a Visit|Edit Visit)/i }).last();
    
    // Check if we need to scroll or if it's already there
    await expect(visitModal).toBeVisible({ timeout: 15000 });
    
    await visitModal.getByLabel('Your Review').fill(data.review);
    if (data.rating) await robustClick(page, visitModal.getByLabel(`Set rating to ${data.rating}`));
    if (data.isPrivate) await visitModal.getByLabel(/Make this visit private/i).check();
    
    await robustClick(page, visitModal.getByRole('button', { name: /(Add Visit|Save Changes)/i }));
    await expect(page.getByText(/(Visit added successfully|Visit cached|Visit updated successfully|Edit cached)/i).first()).toBeVisible({ timeout: 15000 });
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
    
    // Non-fatal response wait for sync
    await pageA.waitForResponse(resp => resp.url().includes('send_friend_request'), { timeout: 10000 }).catch(() => null);

    // 2. User B Accepts Request
    await expect(async () => {
        const sidebarB = getSidebarContainer(pageB);
        const friendsCard = sidebarB.locator('[data-testid="my-friends-card"]');
        const requestsCard = sidebarB.locator('[data-testid="friend-requests-card"]');
        const rowId = `[data-testid="request-row-${user1Email}"]`;

        // Check visibility before reload to catch Realtime sync
        if (!(await requestsCard.locator(rowId).isVisible()) && 
            !(await friendsCard.locator(`text="${user1Email}"`).isVisible())) {
            
            await pageB.reload();
            await pageB.waitForLoadState('networkidle');
            await waitForAppReady(pageB);
            await navigateToTab(pageB, 'Friends');
            await ensureSidebarExpanded(pageB);
        }

        // Already friends check
        if (await friendsCard.locator(`text="${user1Email}"`).isVisible()) {
            return;
        }

        const requestRow = pageB.locator(rowId).first();
        if (!(await requestRow.isVisible())) {
            throw new Error(`Request from ${user1Email} not found in requests card`);
        }
        
        const acceptBtn = requestRow.locator('[data-testid="accept-request-btn"]');
        await robustClick(pageB, acceptBtn);
        
        await pageB.waitForResponse(resp => resp.url().includes('respond_to_friend_request'), { timeout: 10000 }).catch(() => null);
        await expect(friendsCard.locator(`text="${user1Email}"`)).toBeVisible({ timeout: 15000 });
    }).toPass({ timeout: 60000, intervals: [5000, 10000] });
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

export async function removeFriend(page: Page, email: string) {
    await navigateToTab(page, 'Friends');
    await ensureSidebarExpanded(page);
    const sidebar = getSidebarContainer(page);

    await expect(async () => {
        const friendsCard = sidebar.locator('[data-testid="my-friends-card"]');
        const sentCard = sidebar.locator('[data-testid="sent-requests-card"]');
        
        let friendRow = friendsCard.locator(`[data-testid="friend-row-${email}"], .flex.items-center:has-text("${email}")`).first();
        let isFriend = await friendRow.isVisible();
        
        if (!isFriend) {
            friendRow = sentCard.locator(`.flex.items-center:has-text("${email}")`).first();
            if (!(await friendRow.isVisible())) {
                await page.reload();
                await page.waitForLoadState('networkidle');
                await waitForAppReady(page);
                await navigateToTab(page, 'Friends');
                await ensureSidebarExpanded(page);
                
                // Re-check
                const friendsCardUpdate = sidebar.locator('[data-testid="my-friends-card"]');
                const sentCardUpdate = sidebar.locator('[data-testid="sent-requests-card"]');
                isFriend = await friendsCardUpdate.locator(`[data-testid="friend-row-${email}"], .flex.items-center:has-text("${email}")`).first().isVisible();
                friendRow = isFriend 
                    ? friendsCardUpdate.locator(`[data-testid="friend-row-${email}"], .flex.items-center:has-text("${email}")`).first()
                    : sentCardUpdate.locator(`.flex.items-center:has-text("${email}")`).first();
            }
        }

        if (!(await friendRow.isVisible())) {
             return; // Already removed
        }

        const removeBtn = friendRow.locator('button[aria-label="Remove friend"], [data-testid="remove-friend-btn"], [data-testid="cancel-request-btn"]').first();
        await robustClick(page, removeBtn);

        // Handle AlertDialog only if it was an accepted friend
        if (isFriend) {
            const confirmBtn = page.locator('button:has-text("Remove"), [data-testid="confirm-remove-btn"]').filter({ visible: true }).first();
            await robustClick(page, confirmBtn);
        }

        await expect(sidebar.locator(`text="${email}"`)).not.toBeVisible({ timeout: 10000 });
    }).toPass({ timeout: 45000, intervals: [5000] });
}
