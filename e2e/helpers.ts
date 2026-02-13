import { expect, Locator, Page } from '@playwright/test';

/**
 * A centralized container for common test helper functions.
 */

// --- Reusable Locators ---

export function getSidebarContainer(page: Page): Locator {
  const viewport = page.viewportSize();
  const isMobile = viewport && viewport.width < 768;
  
  const selector = isMobile 
    ? '[data-testid="mobile-sidebar-container"]' 
    : '[data-testid="desktop-sidebar-container"]';
    
  // Use .first() to handle any accidental duplicates, but scope to visible state
  return page.locator(selector).filter({ visible: true }).first();
}

// --- Common Actions ---

// --- Helper to dismiss Next.js Error Overlay ---
export async function dismissErrorOverlay(page: Page) {
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

  const isMobile = page.viewportSize()?.width! < 768;
  const successSelector = isMobile ? 'div.fixed.bottom-0' : 'h1:has-text("Winery Tracker")';

  // Retry logic for occasional Supabase Auth consistency delays
  await expect(async () => {
    await page.goto('/login');
    await dismissErrorOverlay(page);

    const emailInput = page.getByLabel('Email');
    await expect(emailInput).toBeVisible({ timeout: 5000 });
    await emailInput.fill(email);
    
    const passInput = page.getByLabel('Password');
    await passInput.fill(pass);
    await passInput.press('Enter');

    // Check if we reached the dashboard
    const dashboard = page.locator(successSelector).first();
    await expect(dashboard).toBeVisible({ timeout: 10000 });
  }).toPass({
    intervals: [2000, 5000],
    timeout: 45000
  });
  
  // Wait for critical initial data fetches to stabilize deterministically
  await Promise.all([
    page.waitForResponse(resp => resp.url().includes('/auth/v1/user'), { timeout: 10000 }).catch(() => {}),
    page.waitForResponse(resp => resp.url().includes('get_map_markers'), { timeout: 10000 }).catch(() => {})
  ]);

  // IMPORTANT: On mobile, the sheet is closed by default. Open Explore so subsequent tests can find wineries.
  if (isMobile) {
      await navigateToTab(page, 'Explore');
  }

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
      
      // Use robust pointer sequence for Radix/Mobile
      await navBtn.evaluate(el => {
        const events = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
        events.forEach(name => {
          el.dispatchEvent(new PointerEvent(name, { bubbles: true, cancelable: true, pointerType: 'touch' }));
        });
      });
      
      // Wait for the sheet to appear
      await expect(page.getByTestId('mobile-sidebar-container')).toBeVisible({ timeout: 5000 });
      // Ensure it is truly visible (not animating)
      await expect(page.locator('[data-testid="mobile-sidebar-container"]:visible')).toBeVisible({ timeout: 5000 });
      
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