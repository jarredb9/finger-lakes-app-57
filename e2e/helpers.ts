import { expect, Locator, Page } from '@playwright/test';
import { Trip, VisitWithWinery } from '@/lib/types';

/**
 * E2E TEST HELPERS - SURGICAL RECONCILIATION
 */

// ==========================================
// 1. CORE UTILITIES
// ==========================================

export function getSidebarContainer(page: Page): Locator {
  return page.locator('[data-testid="desktop-sidebar-container"], [data-testid="mobile-sidebar-container"], [data-testid="app-sidebar"], [data-testid="trip-list-container"]').filter({ visible: true }).first();
}

/**
 * Waits for the application to be fully loaded and hydrated.
 */
export async function waitForAppReady(page: Page) {
    const isMobile = page.viewportSize()?.width! < 768;
    const successSelector = isMobile 
      ? '[data-testid="mobile-nav-explore"], [data-testid="settings-page-container"], [data-testid="trip-details-card"]' 
      : '[data-testid="desktop-sidebar-container"], [data-testid="settings-page-container"], [data-testid="trip-details-card"]';
    
    await expect(page.locator(successSelector).first()).toBeVisible({ timeout: 25000 });
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
            window.localStorage.removeItem('winery-data-storage-e2e');
            window.localStorage.removeItem('_E2E_ENABLE_REAL_SYNC');
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

  // Ensure sidebar is open on desktop if we are navigating
  if (!isMobile) {
      const sidebar = page.locator('[data-testid="desktop-sidebar-container"]');
      if (!(await sidebar.isVisible())) {
          const openBtn = page.getByRole('button', { name: /Open sidebar/i });
          if (await openBtn.isVisible()) {
              await openBtn.click({ force: true });
          }
      }
  }

  const tab = getTabTrigger(page, tabName);
  await tab.click({ force: true });

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
        await expandBtn.click({ force: true });
        await expect(sidebar).toHaveAttribute('data-state', 'stable', { timeout: 10000 });
    }
}

/**
 * Fills and submits the login form.
 */
export async function submitLoginForm(page: Page, email: string, pass: string) {
    await expect(page.getByLabel('Email')).toBeVisible({ timeout: 10000 });
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(pass);
    
    const signInBtn = page.getByRole('button', { name: 'Sign In' });
    // Use click if visible, otherwise fall back to Enter key
    try {
        await signInBtn.click({ force: true, timeout: 5000 });
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
  const pwaSuffix = isPwa ? '?pwa=true' : '';

  // 0. REGISTRATION BUFFER (WebKit Only)
  if (isWebKit) {
      await page.waitForTimeout(2000);
  }

  await expect(async () => {
    // Ensure we are on the login page
    if (!page.url().includes('/login')) {
        await page.goto(`/login${pwaSuffix}`);
    } else if (isPwa && !page.url().includes('pwa=true')) {
        await page.goto(`/login${pwaSuffix}`);
    }
    
    await page.waitForLoadState('load');
    await page.waitForLoadState('networkidle');

    await submitLoginForm(page, email, pass);
    await waitForAppReady(page);
  }).toPass({ intervals: [3000], timeout: 60000 });
  
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
        const { user, isLoading } = await page.evaluate(() => {
            const store = (window as any).useUserStore?.getState();
            return { user: store?.user, isLoading: store?.isLoading };
        });
        
        if (isLoading) throw new Error('UserStore is still loading');
        if (!user) throw new Error('User not found in store');
        if (user.name === 'User') {
            console.log(`[DIAGNOSTIC] Profile not yet fully initialized (name is still 'User') for ID: ${user.id}`);
            throw new Error('Profile not yet fully initialized');
        }
        return true;
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
    
    await wineryItem.click({ force: true });
    
    const modal = page.getByRole('dialog').filter({ hasText: /Detailed information/i });
    await expect(modal).toBeVisible({ timeout: 10000 });
}

export async function closeWineryModal(page: Page) {
    const modal = page.getByTestId('winery-modal');
    
    await expect(async () => {
        const isOpen = await page.evaluate(() => {
            // @ts-ignore
            return !!(window.useUIStore?.getState().isWineryModalOpen);
        });
        if (!isOpen) return;

        const closeBtn = modal.getByRole('button', { name: /Close/i });
        if (await closeBtn.isVisible()) {
            // Only click if it's enabled to avoid timeout
            if (await closeBtn.isEnabled()) {
                await closeBtn.click({ force: true });
            }
        } else {
            await page.keyboard.press('Escape');
        }

        throw new Error('Winery modal still open in store');
    }).toPass({ timeout: 15000, intervals: [1000, 2000] });

    await expect(modal).not.toBeVisible({ timeout: 10000 });
}

export async function logVisit(page: Page, data: { review: string, rating?: number, isPrivate?: boolean }) {
    const visitModal = page.getByTestId('visit-modal');
    await expect(visitModal).toBeVisible({ timeout: 15000 });
    
    await visitModal.getByLabel('Your Review').fill(data.review);
    if (data.rating) await visitModal.getByLabel(`Set rating to ${data.rating}`).click({ force: true });
    if (data.isPrivate) await visitModal.getByLabel(/Make this visit private/i).check();
    
    const saveBtn = visitModal.getByRole('button', { name: /(Add Visit|Save Changes)/i });

    await expect(async () => {
        const isOpen = await page.evaluate(() => {
            // @ts-ignore
            return !!(window.useUIStore?.getState().isModalOpen);
        });
        
        if (!isOpen) return;

        const isSubmitting = await page.evaluate(() => {
            // @ts-ignore
            return !!(window.useVisitStore?.getState().isSavingVisit);
        });

        // Only click if we are not already in the middle of a submission
        if (!isSubmitting) {
            await saveBtn.click({ force: true });
        }
        
        throw new Error('Modal still open in store after click');
    }).toPass({ timeout: 15000, intervals: [1000, 2000] });

    await expectVisitInStore(page, data.review);
    await expect(visitModal).not.toBeVisible({ timeout: 10000 });
}

// ==========================================
// 4. SOCIAL & FEEDBACK
// ==========================================

export async function setupFriendship(pageA: Page, pageB: Page, user1Email: string, user2Email: string) {
    console.log(`[DIAGNOSTIC] Setting up friendship between ${user1Email} and ${user2Email}`);
    
    // Log user IDs for context verification
    const idA = await pageA.evaluate(() => (window as any).useUserStore?.getState().user?.id);
    const idB = await pageB.evaluate(() => (window as any).useUserStore?.getState().user?.id);
    console.log(`[DIAGNOSTIC] Page A User ID: ${idA}, Page B User ID: ${idB}`);

    // 1. User A Sends Request
    await navigateToTab(pageA, 'Friends');
    await ensureSidebarExpanded(pageA);
    const sidebarA = getSidebarContainer(pageA);
    
    const emailInput = sidebarA.locator('[data-testid="add-friend-email-input"]');
    await emailInput.fill(user2Email);
    await expect(emailInput).toHaveValue(user2Email);
    
    const addBtn = sidebarA.locator('[data-testid="add-friend-btn"]');
    await addBtn.click({ force: true });
    
    // Non-fatal response wait for sync
    await pageA.waitForResponse(resp => resp.url().includes('send_friend_request'), { timeout: 10000 }).catch(() => null);

    // 2. User B Accepts Request
    await expect(async () => {
        // Ensure User B is on Friends tab
        const currentTab = await pageB.evaluate(() => {
            // @ts-ignore
            return window.useUIStore?.getState().activeTab;
        }).catch(() => null);

        if (currentTab !== 'Friends') {
            await navigateToTab(pageB, 'Friends');
            await ensureSidebarExpanded(pageB);
        }

        const sidebarB = getSidebarContainer(pageB);
        const friendsCard = sidebarB.locator('[data-testid="my-friends-card"]');
        const requestsCard = sidebarB.locator('[data-testid="friend-requests-card"]');
        const rowId = `[data-testid="request-row-${user1Email}"]`;

        // Already friends check
        if (await friendsCard.locator(`text="${user1Email}"`).isVisible()) {
            return;
        }

        // Check visibility
        if (!(await requestsCard.locator(rowId).isVisible())) {
            console.log(`[DIAGNOSTIC] Request row ${rowId} not visible. Refreshing store...`);
            await refreshFriendsStore(pageB);
            
            // Log store state
            const reqs = await pageB.evaluate(() => {
                // @ts-ignore
                return window.useFriendStore?.getState().friendRequests?.map(r => r.email);
            });
            console.log(`[DIAGNOSTIC] Current friendRequests in store: ${JSON.stringify(reqs)}`);
            
            // Small buffer for UI to update
            await pageB.waitForTimeout(1000);
        }

        const requestRow = pageB.locator(rowId).first();
        if (!(await requestRow.isVisible())) {
            throw new Error(`Request from ${user1Email} not found in requests card`);
        }
        
        const acceptBtn = requestRow.locator('[data-testid="accept-request-btn"]');
        await acceptBtn.click({ force: true });
        
        await pageB.waitForResponse(resp => resp.url().includes('respond_to_friend_request'), { timeout: 10000 }).catch(() => null);
        await expect(friendsCard.locator(`text="${user1Email}"`)).toBeVisible({ timeout: 15000 });
    }).toPass({ timeout: 60000, intervals: [5000] });

    // Settlement buffer for WebKit container sync
    await pageA.waitForTimeout(1000);
}

export async function waitForToast(page: Page, message: string | RegExp) {
    const toast = page.locator('[role="status"], [role="alert"]').filter({ hasText: message }).first();
    // Wait for the toast to be attached to the DOM first
    await toast.waitFor({ state: 'attached', timeout: 20000 });
    // Then ensure it's visible to the user
    await expect(toast).toBeVisible({ timeout: 15000 });
}

/**
 * Asserts that a trip with the given name exists in the store.
 * Faster alternative to waitForToast for success verification.
 */
export async function expectTripInStore(page: Page, tripName: string) {
    await expect(async () => {
        const found = await page.evaluate((name) => {
            // @ts-ignore
            const trips = window.useTripStore?.getState().trips || [];
            return trips.some((t: any) => t.name === name);
        }, tripName);
        if (!found) throw new Error(`Trip "${tripName}" not found in store`);
    }).toPass({ timeout: 10000, intervals: [500, 1000] });
}

/**
 * Asserts that a trip with the given name no longer exists in the store.
 */
export async function expectTripDeletedFromStore(page: Page, tripName: string) {
    await expect(async () => {
        const found = await page.evaluate((name) => {
            // @ts-ignore
            const trips = window.useTripStore?.getState().trips || [];
            return trips.some((t: any) => t.name === name);
        }, tripName);
        if (found) throw new Error(`Trip "${tripName}" still exists in store`);
    }).toPass({ timeout: 10000, intervals: [500, 1000] });
}

/**
 * Asserts that a visit matching the given criteria exists in the store.
 */
export async function expectVisitInStore(page: Page, query: string | { review?: string, date?: string }) {
    await expect(async () => {
        const found = await page.evaluate((q) => {
            // @ts-ignore
            const visits = window.useVisitStore?.getState().visits || [];
            return visits.some((v: any) => {
                if (typeof q === 'string') return v.user_review?.includes(q);
                if (q.review && !v.user_review?.includes(q.review)) return false;
                if (q.date && v.visit_date !== q.date) return false;
                return true;
            });
        }, query);
        if (!found) throw new Error(`Visit matching ${JSON.stringify(query)} not found in store`);
    }).toPass({ timeout: 10000, intervals: [500, 1000] });
}

/**
 * Asserts that a visit with the given review text no longer exists in the store.
 */
export async function expectVisitDeletedFromStore(page: Page, reviewText: string) {
    await expect(async () => {
        const found = await page.evaluate((text) => {
            // @ts-ignore
            const visits = window.useVisitStore?.getState().visits || [];
            return visits.some((v: any) => v.user_review?.includes(text));
        }, reviewText);
        if (found) throw new Error(`Visit with review containing "${reviewText}" still exists in store`);
    }).toPass({ timeout: 10000, intervals: [500, 1000] });
}

/**
 * Asserts that a winery's privacy settings in the store match the expected state.
 */
export async function expectWineryPrivacyInStore(page: Page, wineryName: string, type: 'favorite' | 'wishlist', isPrivate: boolean) {
    await expect(async () => {
        const actual = await page.evaluate(({ name, type }) => {
            // @ts-ignore
            const winery = window.useWineryDataStore?.getState().persistentWineries.find(w => w.name === name);
            if (!winery) throw new Error(`Winery "${name}" not found in store`);
            return type === 'favorite' ? !!winery.favoriteIsPrivate : !!winery.wishlistIsPrivate;
        }, { name: wineryName, type });
        if (actual !== isPrivate) throw new Error(`Privacy mismatch for ${type}: expected ${isPrivate}, but got ${actual}`);
    }).toPass({ timeout: 10000, intervals: [500, 1000] });
}

export async function selectPrivacyOption(page: Page, optionName: 'Public' | 'Friends Only' | 'Private') {
    await navigateToSettings(page);
    const container = page.getByTestId('settings-page-container');
    const privacySelect = container.locator('[data-testid="privacy-select"]').first();
    await privacySelect.click({ force: true });
    const option = page.locator('[role="option"], div').filter({ hasText: new RegExp(`^${optionName}$`) }).last();
    await option.click({ force: true });
    
    const expectedLevel = optionName.toLowerCase().replace(' ', '_') as 'public' | 'friends_only' | 'private';
    
    await expect(async () => {
        const actual = await page.evaluate(() => {
            // @ts-ignore
            return window.useUserStore?.getState().user?.privacy_level;
        });
        if (actual !== expectedLevel) throw new Error(`Privacy level mismatch: expected ${expectedLevel}, but got ${actual}`);
    }).toPass({ timeout: 10000 });
}

// ==========================================
// 5. ATOMIC STATE INJECTION (DIAGNOSTIC & PERFORMANCE)
// ==========================================

/**
 * Injects trip data directly into the Zustand store.
 * Bypasses navigation and initial fetch for specific tests.
 */
export async function injectTripState(page: Page, trips: Trip[]) {
  await page.evaluate((tripsToInject) => {
    // @ts-ignore
    const store = window.useTripStore;
    if (store && store.setState) {
      store.setState({ 
        trips: tripsToInject, 
        upcomingTrips: tripsToInject,
        isLoading: false,
        hasMore: false,
        count: tripsToInject.length
      });
    }
  }, trips);
}

/**
 * Injects visit data directly into the Zustand store.
 */
export async function injectVisitState(page: Page, visits: VisitWithWinery[]) {
  await page.evaluate((visitsToInject) => {
    // @ts-ignore
    const store = window.useVisitStore;
    if (store && store.setState) {
      store.setState({ 
        visits: visitsToInject, 
        isLoading: false,
        hasMore: false,
        totalPages: 1
      });
    }
  }, visits);
}

/**
 * Injects winery data directly into the Master Cache (wineryDataStore).
 * This is the source of truth for markers and details.
 */
export async function injectWineryState(page: Page, wineries: any[]) {
  await page.evaluate((wineriesToInject) => {
    // @ts-ignore
    const store = window.useWineryDataStore;
    if (store && store.setState) {
      store.setState({ 
        persistentWineries: wineriesToInject,
        isLoading: false,
        error: null
      });
    }
  }, wineries);
}

/**
 * Injects social data (friends, requests, feed) directly into the Zustand store.
 */
export async function injectSocialState(page: Page, data: { 
    friends?: any[], 
    friendRequests?: any[], 
    sentRequests?: any[],
    friendActivityFeed?: any[]
}) {
  await page.evaluate((socialData) => {
    // @ts-ignore
    const store = window.useFriendStore;
    if (store && store.setState) {
      store.setState({ 
        friends: socialData.friends || [], 
        friendRequests: socialData.friendRequests || [],
        sentRequests: socialData.sentRequests || [],
        friendActivityFeed: socialData.friendActivityFeed || [],
        isLoading: false,
        error: null
      });
    }
  }, data);
}

/**
 * Removes a friend or cancels a sent request.
 */
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
                await refreshFriendsStore(page);
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
        await removeBtn.click({ force: true });

        // Handle AlertDialog only if it was an accepted friend
        if (isFriend) {
            const confirmBtn = page.locator('button:has-text("Remove"), [data-testid="confirm-remove-btn"]').filter({ visible: true }).first();
            await confirmBtn.click({ force: true });
        }

        await expect(sidebar.locator(`text="${email}"`)).not.toBeVisible({ timeout: 10000 });
    }).toPass({ timeout: 45000, intervals: [5000] });
}
