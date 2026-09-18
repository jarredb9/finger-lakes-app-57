import { expect, Page } from '@playwright/test';
import { getSidebarContainer } from './core';
import { ensureSidebarExpanded, navigateToSettings, navigateToTab } from './navigation';

/**
 * E2E SOCIAL GRAPH, FRIENDSHIP & PRIVACY HELPERS
 */

export async function refreshFriendsStore(page: Page) {
    await page.evaluate(async () => {
        // @ts-ignore
        const store = window.useFriendStore?.getState();
        if (store) await store.fetchFriends();
    });
}

export async function setupFriendship(pageA: Page, pageB: Page, user1Email: string, user2Email: string) {
    // 1. User A Sends Request
    await navigateToTab(pageA, 'Friends');
    await ensureSidebarExpanded(pageA);
    const sidebarA = getSidebarContainer(pageA);
    
    const emailInput = sidebarA.locator('[data-testid="add-friend-email-input"]');
    await emailInput.fill(user2Email);
    await expect(emailInput).toHaveValue(user2Email);
    
    const addBtn = sidebarA.locator('[data-testid="add-friend-btn"]');
    await expect(addBtn).toBeEnabled({ timeout: 10000 });
    await addBtn.scrollIntoViewIfNeeded();
    await Promise.all([
        pageA.waitForResponse(resp => resp.url().includes('send_friend_request'), { timeout: 10000 }).catch(() => null),
        addBtn.click()
    ]);

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
        const friendRow = friendsCard.locator(`[data-testid="friend-row-${user1Email}"]`);

        // Already friends check
        if (await friendRow.isVisible()) {
            return;
        }

        const requestRow = requestsCard.locator(`[data-testid="request-row-${user1Email}"]`).first();
        if (!(await requestRow.isVisible())) {
            await refreshFriendsStore(pageB);
        }

        if (await requestRow.isVisible()) {
            const acceptBtn = requestRow.locator('[data-testid="accept-request-btn"]');
            await acceptBtn.scrollIntoViewIfNeeded();
            await Promise.all([
                pageB.waitForResponse(resp => resp.url().includes('respond_to_friend_request'), { timeout: 10000 }).catch(() => null),
                acceptBtn.click()
            ]);
            await refreshFriendsStore(pageB);
        }

        // Wait for User B to see User A as a friend
        await expect(friendRow).toBeVisible({ timeout: 15000 });
    }).toPass({ timeout: 60000, intervals: [3000] });
}

export async function removeFriend(page: Page, email: string) {
    await navigateToTab(page, 'Friends');
    await ensureSidebarExpanded(page);
    const sidebar = getSidebarContainer(page);

    await expect(async () => {
        const friendsCard = sidebar.locator('[data-testid="my-friends-card"]');
        const sentCard = sidebar.locator('[data-testid="sent-requests-card"]');
        
        let friendRow = friendsCard.locator(`[data-testid="friend-row-${email}"]`).first();
        let isFriend = await friendRow.isVisible();
        
        if (!isFriend) {
            friendRow = sentCard.locator('div').filter({ hasText: email }).first();
            if (!(await friendRow.isVisible())) {
                await refreshFriendsStore(page);
                await navigateToTab(page, 'Friends');
                await ensureSidebarExpanded(page);
                
                // Re-check
                const friendsCardUpdate = sidebar.locator('[data-testid="my-friends-card"]');
                const sentCardUpdate = sidebar.locator('[data-testid="sent-requests-card"]');
                isFriend = await friendsCardUpdate.locator(`[data-testid="friend-row-${email}"]`).first().isVisible();
                friendRow = isFriend 
                    ? friendsCardUpdate.locator(`[data-testid="friend-row-${email}"]`).first()
                    : sentCardUpdate.locator('div').filter({ hasText: email }).first();
            }
        }

        if (!(await friendRow.isVisible())) {
             return; // Already removed
        }

        const removeBtn = friendRow.locator('[data-testid="remove-friend-btn"], [data-testid="cancel-request-btn"]').first();
        if (await removeBtn.isVisible()) {
            await removeBtn.scrollIntoViewIfNeeded();
            await removeBtn.click();

            // Handle AlertDialog only if it was an accepted friend
            if (isFriend) {
                const confirmBtn = page.locator('[data-testid="confirm-remove-btn"]').filter({ visible: true }).first();
                await expect(confirmBtn).toBeVisible({ timeout: 5000 });
                await confirmBtn.click();
            }
        }

        await expect(friendsCard.locator(`[data-testid="friend-row-${email}"]`)).not.toBeVisible({ timeout: 10000 });
    }).toPass({ timeout: 45000, intervals: [3000] });
}

export async function closeShareDialog(page: Page) {
    const dialog = page.getByTestId('trip-share-dialog');
    
    const isOpen = await page.evaluate(() => {
        // @ts-ignore
        return !!(window.useUIStore?.getState().isShareDialogOpen);
    });

    if (isOpen) {
        const closeBtn = dialog.getByRole('button', { name: /Close/i });
        if (await closeBtn.isVisible({ timeout: 2000 })) {
            await closeBtn.click();
        } else {
            await page.keyboard.press('Escape');
        }
    }

    // Wait for the store to update and the dialog to hide
    await expect(async () => {
        const isOpen = await page.evaluate(() => {
            // @ts-ignore
            return !!(window.useUIStore?.getState().isShareDialogOpen);
        });
        if (isOpen) {
            // If it's still open, try hitting Escape one more time as a fallback
            await page.keyboard.press('Escape').catch(() => {});
            throw new Error('Share dialog still open in store');
        }
    }).toPass({ timeout: 10000, intervals: [1000] });

    await expect(dialog).not.toBeVisible({ timeout: 5000 });
}

export async function selectPrivacyOption(page: Page, optionName: 'Public' | 'Friends Only' | 'Private') {
    await navigateToSettings(page);
    const container = page.getByTestId('settings-page-container');
    const privacySelect = container.locator('[data-testid="privacy-select"]').first();
    await expect(privacySelect).toBeVisible({ timeout: 10000 });
    await privacySelect.scrollIntoViewIfNeeded();
    await privacySelect.click();
    const option = page.locator('[role="option"]').filter({ hasText: new RegExp(`^${optionName}$`) }).last();
    await expect(option).toBeVisible({ timeout: 5000 });
    await option.scrollIntoViewIfNeeded();
    await option.click();
    
    const expectedLevel = optionName.toLowerCase().replace(' ', '_') as 'public' | 'friends_only' | 'private';
    
    await expect(async () => {
        const actual = await page.evaluate(() => {
            // @ts-ignore
            return window.useUserStore?.getState().user?.privacy_level;
        });
        if (actual !== expectedLevel) throw new Error(`Privacy level mismatch: expected ${expectedLevel}, but got ${actual}`);
    }).toPass({ timeout: 10000 });
}
