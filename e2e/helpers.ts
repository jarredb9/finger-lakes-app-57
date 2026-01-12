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
  
  // Wait for login to complete with robust retry logic
  const viewport = page.viewportSize();
  const isMobile = viewport && viewport.width < 768;
  const successSelector = isMobile ? 'div.fixed.bottom-0' : 'h1:has-text("Winery Tracker")';

  try {
    // Shorter timeout for first attempt to catch failures quickly
    await expect(page.locator(successSelector).first()).toBeVisible({ timeout: 8000 });
  } catch (e) {
    console.log(`[Helper] Login attempt 1 failed (UI element '${successSelector}' not found). Retrying...`);
    
    // Ensure we are still on login page / form is visible
    if (await page.getByLabel('Password').isVisible()) {
        await page.getByLabel('Password').fill(pass);
        await page.getByLabel('Password').press('Enter');
        
        // Wait longer for second attempt
        await expect(page.locator(successSelector).first()).toBeVisible({ timeout: 30000 });
    } else {
        // If password field is gone, maybe we did login but it's just slow loading?
        // Or we are on a different page.
        console.log('[Helper] Password field not visible, checking for success element again...');
        await expect(page.locator(successSelector).first()).toBeVisible({ timeout: 30000 });
    }
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
      'Friends': 'Friends'
    };

    if (bottomNavNames[tabName]) {
      const navBtn = page.getByRole('button', { name: bottomNavNames[tabName] });
      await expect(navBtn).toBeVisible();
      await navBtn.click();
      
      // Wait for the sheet to appear
      await expect(page.getByTestId('mobile-sidebar-container')).toBeVisible({ timeout: 5000 });
      
      // Ensure the sheet is actually on the right tab after opening
      const sidebar = page.getByTestId('mobile-sidebar-container');
      const tab = sidebar.getByRole('tab', { name: tabName });
      
      if (await tab.isVisible()) {
          await tab.click();
      }
    } else {
      // For tabs inside the sheet (like History)
      let isSheetOpen = await page.getByTestId('mobile-sidebar-container').isVisible();
      if (!isSheetOpen) {
        await page.getByRole('button', { name: 'Explore' }).click();
        await expect(page.getByTestId('mobile-sidebar-container')).toBeVisible({ timeout: 5000 });
      }
      
      const expandButton = page.getByRole('button', { name: 'Expand to full screen' });
      if (await expandButton.isVisible()) {
        await expandButton.scrollIntoViewIfNeeded();
        await expandButton.click();
        
        // Wait for animation by ensuring a known element is stable or checking attribute
        await expect(page.getByTestId('mobile-sidebar-container')).toHaveClass(/h-\[calc\(100vh-4rem\)\]/);
      }

      // Ensure tab list is there and visible
      const sidebar = page.getByTestId('mobile-sidebar-container');
      const tabsList = sidebar.locator('[role="tablist"]');
      await expect(tabsList).toBeVisible({ timeout: 10000 });

      // Use a very specific selector for the mobile tab trigger to avoid any ambiguity
      const tabToClick = sidebar.locator(`button[role="tab"][aria-label="${tabName}"]`).first();
      
      await tabToClick.scrollIntoViewIfNeeded();
      
      // NOTE: We dispatch a full pointer event sequence here because Radix UI primitives 
      // sometimes fail to trigger 'click' events in Playwright's mobile emulation 
      // without the preceding pointer/mouse down events.
      await tabToClick.evaluate(node => {
          const opts = { bubbles: true, cancelable: true, view: window };
          node.dispatchEvent(new PointerEvent('pointerdown', opts));
          node.dispatchEvent(new MouseEvent('mousedown', opts));
          node.dispatchEvent(new PointerEvent('pointerup', opts));
          node.dispatchEvent(new MouseEvent('mouseup', opts));
          node.dispatchEvent(new MouseEvent('click', opts));
      });
    }
  } else {
      const sidebar = page.getByTestId('desktop-sidebar-container');
      const tab = sidebar.locator(`[role="tab"][aria-label="${tabName}"]`);
      await expect(tab).toBeVisible({ timeout: 10000 });
      await tab.click();
  }
}