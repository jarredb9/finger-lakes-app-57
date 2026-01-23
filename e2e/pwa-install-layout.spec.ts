import { test, expect } from '@playwright/test';

test.describe('PWA Install & Layout', () => {
  
  test('Mobile: Install Prompt at Top, Cookie Consent at Bottom-Left', async ({ page }) => {
    // 1. Set Mobile Viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    // 2. Wait for Cookie Consent (Bottom-Left)
    const cookieConsent = page.locator('aside[aria-label="Cookie consent"]');
    await expect(cookieConsent).toBeVisible();
    const cookieBox = await cookieConsent.boundingBox();
    
    // Verify Cookie Consent Position (Left & Bottom)
    // Left should be 0 (full width)
    expect(cookieBox?.x).toBe(0); 
    // Bottom should be > 600 (screen is 667)
    expect(cookieBox?.y).toBeGreaterThan(500);

    // 3. Trigger PWA Install Prompt manually
    // 3. Trigger PWA Install Prompt manually
    await page.evaluate(() => {
      window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true }));
    });

    // 4. Verify Install Toast Appearance
    const installToast = page.locator('text=Install App').first(); // Adjust selector if needed
    await expect(installToast).toBeVisible({ timeout: 5000 });

    // 5. Verify Install Toast Position (Top)
    // The Toast IS inside the viewport, so we find the Viewport or the Toast itself.
    // The Toast Viewport is fixed at top-2 (8px).
    // The Toast itself should be near the top.
    const toastBox = await installToast.boundingBox();
    
    // Y should be small (near top)
    // top-2 is 8px. Padding is 16px. So roughly 24px.
    console.log('Mobile Toast Y:', toastBox?.y);
    expect(toastBox?.y).toBeLessThan(100); 
    
    // Check it is NOT blocking the bottom (nav bar area)
    expect(toastBox?.y).toBeLessThan(500);
  });

  test('Desktop: Install Prompt at Bottom-Left, Cookie Consent at Bottom-Right', async ({ page }) => {
    // 1. Set Desktop Viewport
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    // 2. Wait for Cookie Consent (Bottom-Right)
    const cookieConsent = page.locator('aside[aria-label="Cookie consent"]');
    await expect(cookieConsent).toBeVisible();
    const cookieBox = await cookieConsent.boundingBox();

    // Verify Cookie Consent Position (Right & Bottom)
    // X should be large (screen 1280 - width ~340 - margin 16 ~ 924)
    expect(cookieBox?.x).toBeGreaterThan(800);
    expect(cookieBox?.y).toBeGreaterThan(600);

    // 3. Trigger PWA Install Prompt
    // 3. Trigger PWA Install Prompt manually
    await page.evaluate(() => {
      window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true }));
    });

    // 4. Verify Install Toast Appearance
    const installToast = page.locator('text=Install Now').first();
    await expect(installToast).toBeVisible({ timeout: 5000 });

    // 5. Verify Install Toast Position (Bottom-Left)
    const toastBox = await installToast.boundingBox();
    
    // X should be small (Left)
    expect(toastBox?.x).toBeLessThan(100); 
    
    // Y should be large (Bottom)
    expect(toastBox?.y).toBeGreaterThan(600);
  });

});
