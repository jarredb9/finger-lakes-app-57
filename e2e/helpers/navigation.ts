import { expect, Locator, Page } from '@playwright/test';
import { dismissCookieConsent, getSidebarContainer, waitForAppReady, waitForSignal } from './core';

/**
 * E2E NAVIGATION & RESPONSIVE SHELL HELPERS
 */

/**
 * Gets the tab trigger locator for desktop, tablet, and mobile.
 */
export function getTabTrigger(page: Page, tabName: 'Explore' | 'Trips' | 'Friends' | 'History'): Locator {
    const width = page.viewportSize()?.width ?? 1280;
    if (width < 768) {
        // Special case for 'Explore' which maps to 'Search' icon button on mobile
        const id = tabName === 'Explore' ? 'explore' : tabName.toLowerCase();
        return page.getByTestId(`mobile-nav-${id}`).first();
    }
    // For Tablet (768-1023) and Desktop (>=1024)
    return page.locator('[data-testid="desktop-sidebar-container"], [data-testid="tablet-floating-drawer"], [data-testid="app-sidebar"]').locator('[role="tab"]').filter({ hasText: tabName }).first();
}

export async function navigateToTab(page: Page, tabName: 'Explore' | 'Trips' | 'Friends' | 'History') {
  const width = page.viewportSize()?.width ?? 1280;
  const isMobile = width < 768;
  const isTablet = width >= 768 && width < 1024;
  const isDesktop = width >= 1024;

  // Ensure sidebar is open on desktop if we are navigating
  if (isDesktop) {
      // Check store state for sidebar
      const isSidebarOpenStore = await page.evaluate(() => window.useUIStore?.getState().isSidebarOpen);
      if (!isSidebarOpenStore) {
          const openBtn = page.getByRole('button', { name: /Open sidebar/i });
          if (await openBtn.isVisible().catch(() => false)) {
              await openBtn.click();
          }
      }
      // Wait for sidebar visually
      await expect(page.locator('[data-testid="desktop-sidebar-container"]')).toBeVisible({ timeout: 5000 });
  } else if (isTablet) {
      // Ensure tablet drawer is expanded if collapsed
      const drawer = page.getByTestId('tablet-floating-drawer');
      if (await drawer.isVisible().catch(() => false)) {
          const state = await drawer.getAttribute('data-state');
          if (state === 'collapsed') {
              await page.getByTestId('tablet-drawer-expand-button').click();
              await expect(drawer).toHaveAttribute('data-state', 'expanded', { timeout: 5000 });
          }
      }
  } else {
      // Dismiss overlays that block navigation on mobile
      await dismissCookieConsent(page);
  }

  const tab = getTabTrigger(page, tabName);
  await expect(tab).toBeVisible({ timeout: 15000 });
  await expect(tab).toBeEnabled({ timeout: 5000 });
  
  const containerIdMap = {
      'Explore': 'map-container',
      'Trips': 'trip-list-container',
      'Friends': 'friend-activity-feed',
      'History': 'visit-history-container'
  };

  // Use toPass for the click and initial signal to handle hydration race conditions
  await expect(async () => {
      // Inspect DOM state to check if tab is already selected before clicking
      const isAlreadyActive = await tab.evaluate((el) => {
          return el.getAttribute('aria-selected') === 'true' ||
                 el.getAttribute('data-state') === 'active' ||
                 el.classList.contains('bg-primary/10');
      }).catch(() => false);

      if (!isAlreadyActive) {
          await tab.click();
      }
      
      // On mobile, wait for drawer sheet to be visible and stable for sidebar tabs
      if (isMobile) {
          const sheet = page.locator('[data-testid="mobile-sidebar-container"], [data-testid="interactive-bottom-sheet"]').first();
          if (await sheet.isVisible().catch(() => false)) {
              await expect(sheet).toHaveAttribute('data-state', 'stable', { timeout: 5000 }).catch(() => {});
          }
      }

      await waitForSignal(page, containerIdMap[tabName], /ready|error|stable/, 5000);
  }).toPass({ timeout: 15000, intervals: [2000] });
}

export async function navigateToSettings(page: Page) {
    // Use direct navigation for robustness in E2E
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await waitForAppReady(page);
}

export async function ensureSidebarExpanded(page: Page) {
    const width = page.viewportSize()?.width ?? 1280;
    if (width >= 1024) return;
    
    if (width < 768) {
        const sidebar = getSidebarContainer(page);
        await expect(sidebar).toBeVisible({ timeout: 10000 });
        await expect(sidebar).toHaveAttribute('data-state', 'stable', { timeout: 10000 });

        const expandBtn = page.getByRole('button', { name: 'Expand to full screen' });
        const isMiniMode = await expandBtn.isVisible().catch(() => false);
        
        if (isMiniMode) {
            await expandBtn.click();
            const minimizeBtn = page.getByRole('button', { name: 'Minimize to half screen' });
            await expect(minimizeBtn).toBeVisible({ timeout: 5000 }).catch(() => {});
            await expect(sidebar).toHaveAttribute('data-state', 'stable', { timeout: 10000 });
        }
    } else {
        // Tablet Tier (768 - 1023px)
        const drawer = page.getByTestId('tablet-floating-drawer');
        await expect(drawer).toBeVisible({ timeout: 10000 });
        const state = await drawer.getAttribute('data-state');
        if (state === 'collapsed') {
            const expandBtn = page.getByTestId('tablet-drawer-expand-button');
            await expandBtn.click();
            await expect(drawer).toHaveAttribute('data-state', 'expanded', { timeout: 5000 });
        }
    }
}
