import { expect, Page } from '@playwright/test';
import { waitForSignal } from './core';
import { expectVisitInStore } from './assertions';

/**
 * E2E VISIT LOGGING & WORKFLOW HELPERS
 */

export async function logVisit(page: Page, data: { review: string, rating?: number, isPrivate?: boolean, date?: string }) {
    const visitModal = page.getByTestId('visit-modal');
    
    // Use Signal-Based Synchronization to wait for the modal to be ready
    await waitForSignal(page, 'visit-modal', 'ready', 15000);
    await expect(visitModal).toBeVisible();
    
    if (data.date) {
        await visitModal.getByLabel('Visit Date').fill(data.date);
    }
    
    await visitModal.getByLabel('Your Review').fill(data.review);
    if (data.rating) await visitModal.getByLabel(`Set rating to ${data.rating}`).click({ force: true });
    if (data.isPrivate) await visitModal.getByLabel(/Make this visit private/i).check();
    
    const saveBtn = visitModal.getByTestId('visit-save-button');
    
    // Buffer for React event loop
    await page.waitForTimeout(500);
    await saveBtn.click({ force: true });

    await expect(async () => {
        const { isOpen, isSubmitting, errorText } = await page.evaluate(() => {
            // @ts-ignore
            const uiStore = window.useUIStore?.getState();
            // @ts-ignore
            const visitStore = window.useVisitStore?.getState();
            const toast = document.querySelector('[role="status"], [role="alert"]');
            return {
                isOpen: !!(uiStore?.isModalOpen),
                isSubmitting: !!(visitStore?.isSavingVisit),
                errorText: toast?.textContent || null
            };
        });
        
        if (errorText?.toLowerCase().includes('error') || errorText?.toLowerCase().includes('failed')) {
            // Special case: Offline queueing often shows a "Sync failed" toast which is EXPECTED in offline tests
            const isOffline = await page.evaluate(() => typeof navigator !== 'undefined' && !navigator.onLine);
            if (!isOffline) {
                throw new Error(`Log visit failed: ${errorText}`);
            }
        }

        if (!isOpen) return;

        // If it's still open but not submitting, we might need a fallback click 
        // if the first one was ignored, but we do it outside of this loop ideally 
        // or very sparingly.
        if (!isSubmitting) {
            // Check if button is still enabled
            if (await saveBtn.isEnabled({ timeout: 1000 })) {
                 await saveBtn.click({ force: true }).catch(() => {});
            }
        }

        throw new Error(`Modal still open (isSavingVisit=${isSubmitting})`);
    }).toPass({ timeout: 25000, intervals: [3000] });

    await expectVisitInStore(page, data.review);
    await expect(visitModal).not.toBeVisible({ timeout: 10000 });
}
