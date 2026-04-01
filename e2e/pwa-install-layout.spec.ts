import { test, expect } from './utils';
import { clearServiceWorkers, waitForAppReady } from './helpers';

test.describe('PWA Install & Layout', () => {

  test.beforeEach(async ({ page }) => {
    await clearServiceWorkers(page);
  });
  
  test('Mobile: Install Prompt at Top, Cookie Consent at Bottom-Left', async ({ page, user }) => {
    test.skip(!!test.info().project.name.toLowerCase().match(/^(chromium|firefox|webkit)$/), 'Mobile project only');
    // 1. Set Mobile Viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    // 2. Go to login page with pwa flag to ensure SW registration
    await page.goto('/login?pwa=true');
    
    // 3. Wait for Cookie Consent (Bottom-Left)
    const cookieConsent = page.locator('aside[aria-label="Cookie consent"]');
    await expect(cookieConsent).toBeVisible({ timeout: 10000 });
    
    const cookieBox = await cookieConsent.boundingBox();
    expect(cookieBox?.x).toBeLessThan(5); 
    expect(cookieBox?.y).toBeGreaterThan(500);

    // 4. Manual Login (to avoid login helper's cookie-consent bypass)
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign In' }).click({ force: true });
    
    await waitForAppReady(page);

    // 5. Trigger PWA Install Prompt manually
    await page.evaluate(() => {
      window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true }));
    });

    // 6. Verify Install Bar Appearance (Top)
    const installBar = page.getByTestId('mobile-pwa-install-bar');
    await expect(installBar).toBeVisible({ timeout: 5000 });

    const barBox = await installBar.boundingBox();
    expect(barBox?.y).toBeLessThan(5); // Top-0 (allow small offset)
    expect(barBox?.x).toBeLessThan(5);
    
    // Ensure it's near the top
    expect(barBox?.y).toBeLessThan(100); 
  });

  test('Desktop: Install Prompt at Bottom-Left, Cookie Consent at Bottom-Right', async ({ page, user }) => {
    test.skip(test.info().project.name.toLowerCase().includes('mobile'), 'Desktop project only');
    // 1. Set Desktop Viewport
    await page.setViewportSize({ width: 1280, height: 800 });
    
    // 2. Go to login page
    await page.goto('/login?pwa=true');

    // 3. Wait for Cookie Consent (Bottom-Right)
    const cookieConsent = page.locator('aside[aria-label="Cookie consent"]');
    await expect(cookieConsent).toBeVisible({ timeout: 10000 });
    
    const cookieBox = await cookieConsent.boundingBox();
    // Desktop layout for CookieConsent: md:bottom-4 md:right-4 md:w-[340px]
    expect(cookieBox?.x).toBeGreaterThan(800);
    expect(cookieBox?.y).toBeGreaterThan(600);

    // 4. Manual Login
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign In' }).click({ force: true });
    
    await waitForAppReady(page);

    // 5. Trigger PWA Install Prompt
    await page.evaluate(() => {
      window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true }));
    });

    // 6. Verify Install Card Appearance (Bottom-Left)
    const installCard = page.getByTestId('desktop-pwa-install-card');
    await expect(installCard).toBeVisible({ timeout: 5000 });

    const cardBox = await installCard.boundingBox();
    // Desktop layout for PwaHandler: hidden md:block fixed bottom-4 left-4
    expect(cardBox?.x).toBeLessThan(100); 
    expect(cardBox?.y).toBeGreaterThan(600);
  });

});
