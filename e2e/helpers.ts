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
  // Capture all console messages
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log(`[Browser ${msg.type()}] ${msg.text()}`);
    }
  });

  // Capture page errors
  page.on('pageerror', (err) => {
    console.error(`[Page Error] ${err.message}`);
  });

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

  try {
      // 1. Wait for AuthProvider loading screen to disappear
      await expect(page.getByText('Loading...')).not.toBeVisible({ timeout: 15000 });
      
      // 2. Wait for the main UI element
      if (isMobile) {
          await expect(page.locator('div.fixed.bottom-0')).toBeVisible({ timeout: 20000 });
      } else {
          // Use a broader selector for the branding header
          await expect(page.getByRole('heading', { name: 'Winery Tracker' }).first()).toBeVisible({ timeout: 20000 });
      }
  } catch (error) {
      console.error(`Login failed for ${email}. Current URL: ${page.url()}`);
      // Log some page content to see what's actually rendered
      const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
      console.log(`Page body snippet: ${bodyText}`);
      await page.screenshot({ path: `test-results/login-failed-${Date.now()}.png` });
      throw error;
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
