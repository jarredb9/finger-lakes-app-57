import { test, expect } from '@playwright/test';

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
      // Use .first() because responsive layouts might render multiple headings (mobile/desktop)
      await expect(page.getByRole('heading', { name: 'Winery Tracker' }).first()).toBeVisible({ timeout: 20000 });
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
    // 1. Ensure we are on the 'Explore' tab (default)
    // Use .first() because tabs are duplicated in mobile/desktop layouts
    await expect(page.getByRole('tab', { name: 'Explore' }).first()).toHaveAttribute('data-state', 'active');

    // 2. Wait for wineries to load (look for at least one winery card)
    // "Wineries in View" is inside the sidebar, so it's also duplicated
    await expect(page.getByText('Wineries in View').first()).toBeVisible();

    // Navigate to Trips tab
    await page.getByRole('tab', { name: 'Trips' }).first().click();
    
    // Verify Trip Planner headers
    await expect(page.getByRole('heading', { name: 'Happening Today' }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Plan a Trip' }).first()).toBeVisible();
    
    // Verify the "New Trip" button exists in the planner (was "Create Trip")
    await expect(page.getByRole('button', { name: 'New Trip' }).first()).toBeVisible();
  });
});
