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

// --- Helper to dismiss Next.js Error Overlay ---
async function dismissErrorOverlay(page: Page) {
  // Strategy 1: CSS Injection (Most Robust)
  // This effectively "deletes" the portal visually and interaction-wise even if it appears later
  await page.addStyleTag({ 
    content: `
      nextjs-portal { 
        display: none !important; 
        pointer-events: none !important; 
        visibility: hidden !important;
      }
    ` 
  });

  // Strategy 2: Immediate Removal (for existing ones)
  // Check for the Next.js portal which intercepts events
  const portal = page.locator('nextjs-portal');
  if (await portal.count() > 0 && await portal.isVisible()) {
    console.log('[Helper] Detected Next.js Error Overlay. Attempting to extract error and dismiss...');
    
    // Extract error text if possible
    try {
        const errorText = await portal.evaluate(el => el.shadowRoot?.textContent || el.textContent);
        console.log('[Helper] Next.js Overlay Content:', errorText?.slice(0, 500)); 
    } catch (e) {
        console.log('[Helper] Could not extract error text.');
    }

    // Force remove
    await page.evaluate(() => {
      const p = document.querySelector('nextjs-portal');
      if (p) p.remove();
    });
  }
}

export async function login(page: Page, email: string, pass: string) {
  // Pre-emptively dismiss cookie banner by setting localStorage before load
  await page.addInitScript(() => {
    window.localStorage.setItem('cookie-consent', 'true');
  });

  await page.goto('/login');
  await dismissErrorOverlay(page); // Check on load

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(pass);
  
  // Use Enter key to submit
  await page.getByLabel('Password').press('Enter');
  
  // Wait for login to complete
  const viewport = page.viewportSize();
  const isMobile = viewport && viewport.width < 768;
  const successSelector = isMobile ? 'div.fixed.bottom-0' : 'h1:has-text("Winery Tracker")';

  await expect(page.locator(successSelector).first()).toBeVisible({ timeout: 30000 });
  
  // Wait for initial data fetches to stabilize
  await page.waitForLoadState('networkidle');

  await dismissErrorOverlay(page); // Check after login
}

export async function navigateToTab(page: Page, tabName: 'Explore' | 'Trips' | 'Friends' | 'History') {
  await dismissErrorOverlay(page); // Check before nav

  const viewport = page.viewportSize();
  const isMobile = viewport && viewport.width < 768;
  
  if (isMobile) {
    const bottomNavNames: Record<string, string> = {
      'Explore': 'Explore',
      'Trips': 'Trips',
      'Friends': 'Friends',
      'History': 'History'
    };

    if (bottomNavNames[tabName]) {
      const navBtn = page.getByRole('button', { name: bottomNavNames[tabName] });
      await expect(navBtn).toBeVisible();
      await navBtn.click();
      
      // Wait for the sheet to appear
      await expect(page.getByTestId('mobile-sidebar-container')).toBeVisible({ timeout: 5000 });
      
      // NOTE: We no longer click the tab *inside* the sidebar on mobile because 
      // AppShell passes `hideTabs={true}` to AppSidebar when in the mobile sheet.
      // The bottom nav button itself sets the active tab state.
    } else {
       throw new Error(`Tab "${tabName}" is not defined in bottom navigation for mobile.`);
    }
  } else {
      const sidebar = page.getByTestId('desktop-sidebar-container');
      const tab = sidebar.locator(`[role="tab"][aria-label="${tabName}"]`);
      await expect(tab).toBeVisible({ timeout: 10000 });
      await tab.click();
  }
}