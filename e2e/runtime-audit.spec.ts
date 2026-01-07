import { test, expect } from '@playwright/test';

test.describe('Runtime & Performance Audit', () => {
  test('should login and check for hydration/console errors', async ({ page }) => {
    const consoleMessages: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.text().includes('hydration')) {
        consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
      }
    });

    await page.goto('http://localhost:3001/login');
    
    // Fill credentials
    await page.getByLabel('Email').fill('$TEST_USER_EMAIL');
    await page.getByLabel('Password').fill('$TEST_USER_PASSWORD');
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Wait for navigation to dashboard
    await expect(page).toHaveURL('http://localhost:3001/', { timeout: 15000 });

    // Wait for the map/wineries to load (indicator of hydration completion)
    const sidebar = page.locator('[data-testid="desktop-sidebar-container"], [data-testid="mobile-sidebar-container"]').filter({ visible: true }).first();
    await expect(sidebar.getByText(/Wineries/i).first()).toBeVisible({ timeout: 20000 });

    // Check for errors
    console.log('--- Runtime Error Log ---');
    if (consoleMessages.length > 0) {
      consoleMessages.forEach(msg => console.log(msg));
    } else {
      console.log('No critical console errors or hydration mismatches detected.');
    }
    console.log('-------------------------');

    // Performance markers (Optional check for key elements)
    const wineries = await page.locator('[data-testid="winery-card"]').count();
    console.log(`Loaded ${wineries} winery cards.`);
    
    expect(consoleMessages.filter(m => m.includes('hydration')).length).toBe(0);
  });
});
