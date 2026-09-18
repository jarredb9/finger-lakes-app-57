import { expect, Page } from '@playwright/test';

/**
 * E2E CUSTOM STORE & FEEDBACK ASSERTIONS
 */

export async function waitForToast(page: Page, message: string | RegExp) {
    const toast = page.locator('ol li[role="status"], ol li[role="alert"]').filter({ hasText: message }).first();
    // Wait for the toast to be attached to the DOM first
    await toast.waitFor({ state: 'attached', timeout: 20000 });
    // Then ensure it's visible to the user
    await expect(toast).toBeVisible({ timeout: 15000 });
}

export async function ensureProfileReady(page: Page) {
    await expect(async () => {
        const { user, isLoading } = await page.evaluate(() => {
            const store = (window as any).useUserStore?.getState();
            return { user: store?.user, isLoading: store?.isLoading };
        });
        
        if (isLoading) throw new Error('UserStore is still loading');
        if (!user) throw new Error('User not found in store');
        if (user.full_name === 'User' && process.env.NEXT_PUBLIC_IS_E2E !== 'true') {
            throw new Error('Profile not yet fully initialized');
        }
        return true;
    }).toPass({ timeout: 15000, intervals: [1000, 2000] });
}

/**
 * Asserts that a trip with the given name exists in the store.
 * Faster alternative to waitForToast for success verification.
 */
export async function expectTripInStore(page: Page, tripName: string) {
    await expect(async () => {
        const found = await page.evaluate((name) => {
            const trips = window.useTripStore?.getState().trips || [];
            return trips.some((t) => t.name === name);
        }, tripName);
        
        if (!found) {
            throw new Error(`Trip "${tripName}" not found in store`);
        }
    }).toPass({ timeout: 15000, intervals: [1000, 2000] });
}

/**
 * Asserts that a trip with the given name no longer exists in the store.
 */
export async function expectTripDeletedFromStore(page: Page, tripName: string) {
    await expect(async () => {
        const found = await page.evaluate((name) => {
            const trips = window.useTripStore?.getState().trips || [];
            return trips.some((t) => t.name === name);
        }, tripName);
        
        if (found) {
            throw new Error(`Trip "${tripName}" still exists in store`);
        }
    }).toPass({ timeout: 15000, intervals: [1000, 2000] });
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
 * Asserts that a winery's status (favorite/wishlist) in the store match the expected state.
 */
export async function expectWineryStatusInStore(page: Page, wineryName: string, type: 'favorite' | 'wishlist', isActive: boolean) {
    await expect(async () => {
        const actual = await page.evaluate(({ name, type }) => {
            // @ts-ignore
            const winery = window.useWineryDataStore?.getState().persistentWineries.find(w => w.name === name);
            if (!winery) throw new Error(`Winery "${name}" not found in store`);
            return type === 'favorite' ? !!winery.isFavorite : !!winery.onWishlist;
        }, { name: wineryName, type });
        if (actual !== isActive) throw new Error(`Status mismatch for ${type}: expected ${isActive}, but got ${actual}`);
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
