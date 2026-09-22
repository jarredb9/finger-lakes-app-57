import { Page } from '@playwright/test';
import { Trip, VisitWithWinery, Winery, Friend, FriendActivity } from '@/lib/types';

/**
 * E2E ATOMIC STATE INJECTION & DIAGNOSTICS (PERFORMANCE & DEBUGGING)
 */

/**
 * Capture and log critical Zustand store state for diagnostics.
 */
export async function dumpStoreDiagnostics(page: Page) {
  const diagnostics = await page.evaluate(() => {
    return {
      // @ts-ignore
      mapStore: window.useMapStore?.getState(),
      // @ts-ignore
      wineryDataStore: window.useWineryDataStore?.getState(),
      // @ts-ignore
      userStore: window.useUserStore?.getState(),
      // @ts-ignore
      tripStore: window.useTripStore?.getState(),
      // @ts-ignore
      friendStore: window.useFriendStore?.getState(),
      // @ts-ignore
      visitStore: window.useVisitStore?.getState(),
      localStorage: { ...localStorage },
      sessionStorage: { ...sessionStorage }
    };
  });
  
  console.log('--- DIAGNOSTICS DUMP START ---');
  console.log(JSON.stringify(diagnostics, null, 2));
  console.log('--- DIAGNOSTICS DUMP END ---');
  return diagnostics;
}

/**
 * Injects trip data directly into the Zustand store.
 * Bypasses navigation and initial fetch for specific tests.
 * @deprecated Use modular route fixtures (e2e/fixtures/) instead of direct store injection.
 */
export async function injectTripState(page: Page, trips: Trip[]) {
  await page.evaluate((tripsToInject) => {
    // @ts-ignore
    const store = window.useTripStore;
    if (store && store.setState) {
      const now = Date.now();
      const lastActionTimestamps: Record<string, number> = {};
      const tripsList = tripsToInject as unknown as Trip[];
      tripsList.forEach(t => {
          lastActionTimestamps[t.id.toString()] = now;
      });

      store.setState({ 
        trips: tripsList, 
        upcomingTrips: tripsList,
        isLoading: false,
        hasMore: false,
        count: tripsList.length,
        lastActionTimestamp: now,
        lastActionTimestamps: { ...store.getState().lastActionTimestamps, ...lastActionTimestamps }
      });
    }
  }, trips as unknown as Record<string, unknown>[]);
}

/**
 * Injects visit data directly into the Zustand store.
 * @deprecated Use modular route fixtures (e2e/fixtures/) instead of direct store injection.
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
 * @deprecated Use modular route fixtures (e2e/fixtures/) instead of direct store injection.
 */
export async function injectWineryState(page: Page, wineries: Winery[]) {
  await page.evaluate((wineriesToInject) => {
    // @ts-ignore
    const store = window.useWineryDataStore;
    if (store && store.setState) {
      store.setState({ 
        persistentWineries: wineriesToInject as unknown as Winery[],
        isLoading: false,
        error: null
      });
    }
  }, wineries as unknown as Record<string, unknown>[]);
}

/**
 * Injects social data (friends, requests, feed) directly into the Zustand store.
 * @deprecated Use modular route fixtures (e2e/fixtures/) instead of direct store injection.
 */
export async function injectSocialState(page: Page, data: { 
    friends?: Friend[], 
    friendRequests?: Friend[], 
    sentRequests?: Friend[],
    friendActivityFeed?: FriendActivity[]
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
