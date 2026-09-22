import { expect, Page } from '@playwright/test';
import { Winery } from '@/lib/types';
import { getSidebarContainer } from './core';
import { ensureSidebarExpanded } from './navigation';

/**
 * E2E WINERY SEARCH, CARD & MODAL WORKFLOW HELPERS
 */

export async function waitForSearchComplete(page: Page) {
    const sidebar = getSidebarContainer(page);
    const resultsList = sidebar.getByTestId('winery-results-list');
    await expect(resultsList).toHaveAttribute('data-loaded', 'true', { timeout: 15000 });
}

export async function openWineryDetails(page: Page, wineryName: string, options: { fullDrawer?: boolean } = {}) {
    if (options.fullDrawer) {
        await page.evaluate(() => { window._E2E_FULL_DRAWER = true; });
    }
    const width = page.viewportSize()?.width ?? 1280;
    const isMobile = width < 768;
    if (isMobile) {
        await ensureSidebarExpanded(page);
    }

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
    
    await wineryItem.scrollIntoViewIfNeeded();
    
    // Click the title specifically to avoid stopPropagation zones (like MapNavigation)
    const title = wineryItem.locator('h3').first();
    if (await title.isVisible()) {
        await title.click();
    } else {
        await wineryItem.click();
    }
    
    const modal = page.locator('[data-testid="winery-modal-dialog"], [data-testid="tablet-winery-sheet"], [data-testid="winery-modal-drawer"], [role="dialog"]').first();
    await expect(modal).toHaveAttribute('data-state', 'ready', { timeout: 15000 });
    await expect(modal).toBeVisible();

    if (isMobile) {
        const isFullDrawer = await page.evaluate(() => window._E2E_FULL_DRAWER).catch(() => false);
        if (!isFullDrawer) {
            const titleCard = modal.getByTestId('drawer-title-card').first();
            if (await titleCard.isVisible()) {
                await titleCard.click().catch(() => {});
            }
        }
        await expect(modal.locator('[data-testid="drawer-drag-handle"], [data-testid="drawer-title-card"]').first()).toBeVisible();
    }
}

/**
 * Programmatically upserts a winery object (optional) and opens the winery modal via UI store with optional _E2E_FULL_DRAWER snap point override.
 */
export async function openWineryModalState(
    page: Page, 
    wineryIdOrData: string | number | Record<string, any> = 3, 
    options: { fullDrawer?: boolean } = {}
) {
    if (options.fullDrawer) {
        await page.evaluate(() => { window._E2E_FULL_DRAWER = true; });
    }
    await page.evaluate((arg) => {
        let id: string;
        if (typeof arg === 'object' && arg !== null) {
            window.useWineryDataStore?.getState().upsertWinery(arg as Winery);
            id = String((arg as Record<string, any>).google_place_id || (arg as Record<string, any>).id);
        } else {
            id = String(arg);
        }
        window.useUIStore?.getState().openWineryModal(id);
    }, wineryIdOrData);

    const modal = page.locator('[data-testid="winery-modal-dialog"], [data-testid="tablet-winery-sheet"], [data-testid="winery-modal-drawer"], [role="dialog"]').first();
    await expect(modal).toHaveAttribute('data-state', 'ready', { timeout: 15000 });
    await expect(modal).toBeVisible({ timeout: 15000 });
}

export async function closeWineryModal(page: Page) {
    const modal = page.locator('[data-testid="winery-modal-dialog"], [data-testid="tablet-winery-sheet"], [data-testid="winery-modal-drawer"]').first();
    
    const isOpen = await page.evaluate(() => {
        // @ts-ignore
        return !!(window.useUIStore?.getState().isWineryModalOpen);
    });

    if (isOpen) {
        const closeBtn = modal.getByRole('button', { name: /Close/i });
        if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await closeBtn.click();
        } else {
            await page.keyboard.press('Escape');
            await page.evaluate(() => {
                // @ts-ignore
                window.useUIStore?.getState().closeWineryModal?.();
            }).catch(() => {});
        }
    }

    // Wait for the store to update and the modal to hide
    await expect(async () => {
        const isOpen = await page.evaluate(() => {
            // @ts-ignore
            return !!(window.useUIStore?.getState().isWineryModalOpen);
        });
        if (isOpen) {
            // If it's still open, try closing via store and hitting Escape
            await page.evaluate(() => {
                // @ts-ignore
                window.useUIStore?.getState().closeWineryModal?.();
            }).catch(() => {});
            await page.keyboard.press('Escape').catch(() => {});
            throw new Error('Winery modal still open in store');
        }
    }).toPass({ timeout: 10000, intervals: [1000] });

    await expect(modal).not.toBeVisible({ timeout: 5000 });
}
