import { test, expect, Locator } from '@playwright/test';

// Helper function to get the appropriate sidebar container based on viewport
function getSidebarContainer(page: any): Locator {
  // Playwright's default viewport is wide enough for desktop.
  // We'll consider anything smaller than 'md' breakpoint (768px in Tailwind) as mobile.
  const isMobileViewport = page.viewportSize() && page.viewportSize().width < 768;
  if (isMobileViewport) {
    return page.getByTestId('mobile-sidebar-container');
  }
  return page.getByTestId('desktop-sidebar-container');
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
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Handling potential slow logins or errors
    try {
      // Verify we are on the dashboard with increased timeout (20s)
      // Now using a specific test ID to avoid ambiguity from responsive rendering
      const sidebarContainer = getSidebarContainer(page);
      await expect(sidebarContainer.getByRole('heading', { name: 'Winery Tracker' })).toBeVisible({ timeout: 20000 });
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
    await expect(sidebarContainer.getByRole('tab', { name: 'Explore' })).toHaveAttribute('data-state', 'active');

    // 2. Wait for wineries to load (look for at least one winery card)
    await expect(sidebarContainer.getByText('Wineries in View')).toBeVisible();

    // Navigate to Trips tab
    await sidebarContainer.getByRole('tab', { name: 'Trips' }).click();
    
    // Verify Trip Planner headers
    await expect(sidebarContainer.getByRole('heading', { name: 'Happening Today' })).toBeVisible();
    await expect(sidebarContainer.getByRole('heading', { name: 'Plan a Trip' })).toBeVisible();
    
    // Verify the "New Trip" button exists in the planner
    await expect(sidebarContainer.getByRole('button', { name: 'New Trip' })).toBeVisible();
  });

  test('can create a new trip from winery details', async ({ page }) => {
    const sidebarContainer = getSidebarContainer(page);

    // 1. Open the first winery modal
    // Wait for results to load
    await expect(sidebarContainer.getByText('Wineries in View')).toBeVisible();
    
    // Click the first winery card (assuming cards are in the results container)
    // The structure is roughly: Card -> CardContent -> div -> div (winery items)
    // We'll target the first item that has a "font-medium" class (winery name)
    const firstWinery = sidebarContainer.locator('.space-y-2 > div > p.font-medium').first();
    await firstWinery.click();

    // 2. Wait for Modal
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await expect(modal.getByRole('heading', { name: /Add to a Trip/i })).toBeVisible();

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
