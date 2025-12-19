import { expect, Locator, Page } from '@playwright/test';

/**
 * A centralized container for common test helper functions.
 */

// --- Reusable Locators ---

export function getSidebarContainer(page: Page): Locator {
  // Use a locator that finds the visible container
  return page.locator('[data-testid="desktop-sidebar-container"], [data-testid="mobile-sidebar-container"]').filter({ visible: true }).first();
}

// --- Common Actions ---

export async function login(page: Page, email: string, pass: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(pass);
  
  // Use Enter key to submit, which is often more reliable on Mobile Safari
  await page.getByLabel('Password').press('Enter');
  
  // Wait for login to complete
  // On mobile, we look for the bottom nav. On desktop, the sidebar header.
  const viewport = page.viewportSize();
  const isMobile = viewport && viewport.width < 768;

  if (isMobile) {
      await expect(page.locator('div.fixed.bottom-0')).toBeVisible({ timeout: 20000 });
  } else {
      await expect(page.getByRole('heading', { name: 'Winery Tracker' }).first()).toBeVisible({ timeout: 20000 });
  }
}

export async function navigateToTab(page: Page, tabName: 'Explore' | 'Trips' | 'Friends' | 'History') {
  const viewport = page.viewportSize();
  const isMobile = viewport && viewport.width < 768;
  
  if (isMobile) {
    const bottomNavNames: Record<string, string> = {
      'Explore': 'Explore',
      'Trips': 'Trips',
      'Friends': 'Friends'
    };

    if (bottomNavNames[tabName]) {
      const navBtn = page.getByRole('button', { name: bottomNavNames[tabName] });
      await expect(navBtn).toBeVisible();
      await navBtn.evaluate(node => (node as HTMLElement).click());
      
      // Wait for the sheet to appear
      await expect(page.getByTestId('mobile-sidebar-container')).toBeVisible({ timeout: 5000 });
      
      // Give animation time to finish
      await page.waitForTimeout(500);

      // Ensure the sheet is actually on the right tab after opening
      const sidebar = page.getByTestId('mobile-sidebar-container');
      const tab = sidebar.getByRole('tab', { name: tabName });
      if (await tab.isVisible()) {
          // Use evaluate click to bypass "outside of viewport" errors
          await tab.evaluate(node => (node as HTMLElement).click());
      }
    } else {
      // For tabs inside the sheet (like History)
      const isSheetOpen = await page.getByTestId('mobile-sidebar-container').isVisible();
      if (!isSheetOpen) {
        await page.getByRole('button', { name: 'Explore' }).click({ force: true });
      }
      
      const expandButton = page.getByRole('button', { name: 'Expand to full screen' });
      if (await expandButton.isVisible()) {
        await expandButton.evaluate(node => (node as HTMLElement).click());
        await page.waitForTimeout(500);
      }

      // Ensure tab list is there and visible
      const sidebar = page.getByTestId('mobile-sidebar-container');
      const tabsList = sidebar.locator('[role="tablist"]');
      await expect(tabsList).toBeVisible({ timeout: 10000 });

      // Use a very specific selector for the mobile tab trigger to avoid any ambiguity
      const tabToClick = sidebar.locator(`button[role="tab"][aria-label="${tabName}"]`).first();
      console.log(`Clicking mobile tab: ${tabName}`);
      
      await tabToClick.scrollIntoViewIfNeeded();
      
      // Try dispatching a sequence of events for Radix UI (pointerdown is often critical)
      await tabToClick.evaluate(node => {
          const opts = { bubbles: true, cancelable: true, view: window };
          node.dispatchEvent(new PointerEvent('pointerdown', opts));
          node.dispatchEvent(new MouseEvent('mousedown', opts));
          node.dispatchEvent(new PointerEvent('pointerup', opts));
          node.dispatchEvent(new MouseEvent('mouseup', opts));
          node.dispatchEvent(new MouseEvent('click', opts));
      });
      
      // Give content time to render
      await page.waitForTimeout(1000);
    }
  } else {
      const sidebar = page.getByTestId('desktop-sidebar-container');
      const tab = sidebar.locator(`[role="tab"][aria-label="${tabName}"]`);
      await expect(tab).toBeVisible({ timeout: 10000 });
      await tab.click();
  }
}