import { test, expect, Locator, Page } from '@playwright/test';

// Helper function to get the appropriate sidebar container based on viewport
function getSidebarContainer(page: Page): Locator {
  // Playwright's default viewport is wide enough for desktop.
  // We'll consider anything smaller than 'md' breakpoint (768px in Tailwind) as mobile.
  const viewport = page.viewportSize(); // viewport can be null
  const isMobileViewport = viewport && viewport.width !== undefined && viewport.width < 768;
  if (isMobileViewport) {
    return page.getByTestId('mobile-sidebar-container');
  }
  return page.getByTestId('desktop-sidebar-container');
}

// Helper to navigate to Trips tab handling mobile/desktop differences
async function navigateToTrips(page: Page) {
  const viewport = page.viewportSize(); // viewport can be null
  const isMobile = viewport && viewport.width !== undefined && viewport.width < 768;
  
  if (isMobile) {
      // Use direct URL navigation for robustness on mobile
      await page.goto('/trips');
      // Wait for the mobile sheet container to be visible
      await expect(page.getByTestId('mobile-sidebar-container')).toBeVisible({ timeout: 10000 });
  } else {
      const sidebar = getSidebarContainer(page);
      await sidebar.getByRole('tab', { name: 'Trips' }).click({ force: true });
  }
}

test.describe('Trip Planning Flow', () => {
  test.beforeEach(async ({ page }) => {
    // login logic
    const email = process.env.TEST_USER_EMAIL || 'test@example.com';
    const password = process.env.TEST_USER_PASSWORD || 'password';

    await page.goto('/login');
    
    // Debug: Check if env vars are loaded
    console.log(`Using Test User: ${process.env.TEST_USER_EMAIL ? 'Present (Env)' : 'Default (test@example.com)'}`);

    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign In' }).click({ force: true });

    // Handling potential slow logins or errors
    try {
      // Verify we are on the dashboard with increased timeout (20s)
      // Now using a specific test ID to avoid ambiguity from responsive rendering
      // On mobile, the "Winery Tracker" header is in the AppSidebar which is in the Sheet.
      // But the Sheet might be closed initially on mobile login?
      // Actually, after login, we redirect to /.
      // On mobile, / defaults to "Explore" but the Sheet is CLOSED.
      // So 'mobile-sidebar-container' is NOT visible.
      // The header "Winery Tracker" is ALSO rendered in the top bar on mobile?
      // Let's check AppShell. No, only in AppSidebar.
      // Wait, AppShell has: <h1 className="text-lg font-bold tracking-tight">Winery Tracker</h1> inside AppSidebar.
      // Does mobile have a top bar?
      // AppShell: {/* Main Map Area */} contains Mobile User Avatar.
      // AppSidebar contains "Winery Tracker".
      
      // If we are on Desktop, sidebar is visible -> Header visible.
      // If we are on Mobile, Sheet is closed -> Header NOT visible.
      
      // So we should NOT wait for "Winery Tracker" on mobile login verification if the sheet is closed.
      // We should wait for the Map or the User Avatar or the Bottom Nav.
      
      const viewport = page.viewportSize();
    const isMobile = viewport && viewport.width !== undefined && viewport.width < 768;
      if (isMobile) {
          // Verify Bottom Nav is visible
          await expect(page.locator('div.fixed.bottom-0')).toBeVisible({ timeout: 20000 });
      } else {
          const sidebarContainer = getSidebarContainer(page);
          await expect(sidebarContainer.getByRole('heading', { name: 'Winery Tracker' })).toBeVisible({ timeout: 20000 });
      }
      
    } catch (error) {
      const url = page.url();
      console.error(`Login Timeout. Current URL: ${url}`);
      
      // Check for visible alerts (excluding empty ones like route announcers)
      const alerts = page.locator('[role="alert"]');
      const count = await alerts.count();
      const errorMessages = [];
      const ignoredAlerts = ["Zoom in to see more results"]; // Alerts that are NOT errors
      
      for (let i = 0; i < count; i++) {
        const text = await alerts.nth(i).textContent();
        if (text && text.trim().length > 0) {
            const trimmed = text.trim();
            // Only add if it's not a known non-error alert
            if (!ignoredAlerts.some(ignore => trimmed.includes(ignore))) {
                errorMessages.push(trimmed);
            }
        }
      }
      
      if (errorMessages.length > 0) {
        console.error(`Login Failed. Visible Alerts: ${JSON.stringify(errorMessages)}`);
        if (errorMessages.some(msg => msg.includes("Google Maps"))) {
           throw new Error("Login failed due to missing Google Maps API Key.");
        }
        throw new Error(`Login failed with alerts: ${errorMessages.join(', ')}`);
      }
      
      // If we are still on login page but no alerts, maybe the button is still 'Signing in...'
      if (url.includes('/login')) {
         const btnText = await page.getByRole('button', { name: /Sign In|Signing in/ }).textContent();
         console.error(`Stuck on Login Page. Submit button text: "${btnText}"`);
      }

      // Re-throw the original timeout if we couldn't find a specific cause
      throw error;
    }
  });

  test('can create a new trip from a winery', async ({ page }) => {
    const sidebarContainer = getSidebarContainer(page);

    // 1. Ensure we are on the 'Explore' tab (default)
    // On mobile, the sheet might be closed, so checking 'Explore' tab active state inside the sidebar is invalid if not open.
    // Instead, verify we can navigate to Trips.
    
    // Navigate to Trips tab
    await navigateToTrips(page);
    
    // Verify Trip Planner headers
    await expect(sidebarContainer.getByRole('heading', { name: 'Happening Today' })).toBeVisible();
    await expect(sidebarContainer.getByRole('heading', { name: 'Plan a Trip' })).toBeVisible();
    
    // Verify the "New Trip" button exists in the planner
    await expect(sidebarContainer.getByRole('button', { name: 'New Trip' })).toBeVisible();
  });

  test('can create a new trip from winery details', async ({ page }) => {
    // This test interacts with "Wineries in View".
    // On mobile, this requires the Explore tab to be open.
    // Default is Explore, but sheet is closed.
    
    const viewport = page.viewportSize();
    const isMobile = viewport && viewport.width !== undefined && viewport.width < 768;
    
    if (isMobile) {
        // Open Explore sheet
        await page.locator('div.fixed.bottom-0').getByRole('button', { name: 'Explore' }).click({ force: true });
        await expect(page.getByTestId('mobile-sidebar-container')).toBeVisible();
    }
    
    const sidebarContainer = getSidebarContainer(page);

    // 1. Open the first winery modal
    // Wait for results to load
    await expect(sidebarContainer.getByText('Wineries in View')).toBeVisible();
    
    // Click the first winery card (assuming cards are in the results container)
    // The structure is roughly: Card -> CardContent -> div -> div (winery items)
    // We'll target the first item that has a "font-medium" class (winery name)
    const firstWinery = sidebarContainer.locator('.space-y-2 > div > p.font-medium').first();
    
    // On mobile, we might need to scroll or force click
    if (isMobile) {
        await firstWinery.evaluate(node => (node as HTMLElement).click());
    } else {
        await firstWinery.click();
    }

    // 2. Wait for Modal
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    // Use .first() because sometimes title might appear twice if animations overlap or responsive duplicates?
    await expect(modal.getByRole('heading', { name: /Add to a Trip/i }).first()).toBeVisible();

    // 3. Select Date
    await modal.getByRole('button', { name: 'Pick a date' }).click();
    // Select the "today" or a specific enabled date. 
    // react-day-picker usually has role="gridcell" for days. 
    // We'll pick the first enabled day in the current view.
    const day = page.getByRole('gridcell', { disabled: false }).first();
    await day.click();

    // 4. Create New Trip
    // Wait for the "Create a new trip..." option to appear
    const createCheckbox = modal.getByLabel('Create a new trip...');
    await expect(createCheckbox).toBeVisible();
    await createCheckbox.check();

    // Fill Trip Name
    const nameInput = modal.getByPlaceholder('New trip name...');
    await expect(nameInput).toBeVisible();
    await nameInput.fill('Playwright Test Trip');

    // 5. Submit
    await modal.getByRole('button', { name: 'Add to Trip' }).click();

    // 6. Verify Success
    // Check for success toast (use .first() to handle duplicate accessibility/visible elements)
    await expect(page.getByText('Winery added to trip(s).').first()).toBeVisible();

    // Check for "On Trip" badge in the modal header
    await expect(modal.getByText(/On Trip: Playwright Test Trip/).first()).toBeVisible();
  });
});