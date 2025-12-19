import { expect, Locator, Page } from '@playwright/test';

/**
 * A centralized container for common test helper functions.
 */

// --- Reusable Locators ---

export function getSidebarContainer(page: Page): Locator {
  const viewport = page.viewportSize();
  const isMobileViewport = viewport && viewport.width < 768;
  if (isMobileViewport) {
    return page.getByTestId('mobile-sidebar-container');
  }
  return page.getByTestId('desktop-sidebar-container');
}

// --- Common Actions ---

export async function login(page: Page, email: string, pass: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(pass);
  
  // Use Enter key to submit, which is often more reliable on Mobile Safari
  await page.getByLabel('Password').press('Enter');
  
  // Fallback: If button is still 'Sign In' after 500ms, click it
  try {
    const btn = page.getByRole('button', { name: 'Sign In' });
    if (await btn.isVisible({ timeout: 500 })) {
        await btn.click({ force: true });
    }
  } catch (e) {
    // Ignore timeout
  }

  // Wait for login to complete with mobile-aware check
  const viewport = page.viewportSize();
  const isMobile = viewport && viewport.width < 768;

  if (isMobile) {
      await expect(page.locator('div.fixed.bottom-0')).toBeVisible({ timeout: 20000 });
  } else {
      // Use .first() to resolve strict mode violation between mobile/desktop headings
      // Also confirm it's visible in the desktop container specifically
      const sidebar = page.getByTestId('desktop-sidebar-container');
      await expect(sidebar.getByRole('heading', { name: 'Winery Tracker' }).first()).toBeVisible({ timeout: 20000 });
  }
}

export async function navigateToTab(page: Page, tabName: 'Explore' | 'Trips' | 'Friends' | 'History') {
  // Dismiss cookie banner if present
  const gotItBtn = page.getByRole('button', { name: 'Got it' });
  if (await gotItBtn.isVisible()) {
    await gotItBtn.click();
  }

  const viewport = page.viewportSize();
  const isMobile = viewport && viewport.width < 768;
  
  if (isMobile) {
    const bottomNavNames: Record<string, string> = {
      'Explore': 'Explore',
      'Trips': 'Trips',
      'Friends': 'Friends'
    };

    // If it's a main bottom nav item, click it
    if (bottomNavNames[tabName]) {
      await page.getByRole('button', { name: bottomNavNames[tabName] }).click({ force: true });
    } else {
      // For tabs inside the sheet (like History), ensure sheet is open and expanded
      const isSheetOpen = await page.getByTestId('mobile-sidebar-container').isVisible();
      if (!isSheetOpen) {
        // Open the Explore sheet by default to reveal the tabs
        await page.getByRole('button', { name: 'Explore' }).click({ force: true });
      }
      
      // Ensure the sheet is fully expanded so all tabs are visible and clickable
      const expandButton = page.getByRole('button', { name: 'Expand to full screen' });
      if (await expandButton.isVisible()) {
        await expandButton.click();
        await page.waitForTimeout(500); // Allow animation to complete
      }

      const tabToClick = page.getByTestId('mobile-sidebar-container').getByRole('tab', { name: tabName });
      await tabToClick.click({ force: true });
    }
    await expect(page.getByTestId('mobile-sidebar-container')).toBeVisible({ timeout: 15000 });
  } else {
      // Desktop: Explicitly scope to the desktop sidebar to avoid mobile duplication issues
      const sidebar = page.getByTestId('desktop-sidebar-container');
      const tab = sidebar.getByRole('tab', { name: tabName });
      await expect(tab).toBeVisible({ timeout: 10000 });
      await tab.click();
  }
}
