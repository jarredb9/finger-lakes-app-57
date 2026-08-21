import { test, expect } from './utils';
import { clearServiceWorkers } from './helpers';

test.describe('PWA Install & Cookie Consent Layout', () => {

  test.beforeEach(async ({ page }) => {
    await clearServiceWorkers(page);
  });
  
  test('Mobile: Install Bar at Top and Cookie Consent at Bottom with No Overlap', async ({ page }) => {
    const isMobile = (page.viewportSize()?.width ?? 1280) < 768;
    test.skip(!isMobile, 'Mobile (< 768px) viewports only');
    
    // 1. Navigate to unauthenticated page with PWA flag
    await page.goto('/login?pwa=true');
    await page.waitForLoadState('domcontentloaded');

    const viewport = page.viewportSize() || { width: 375, height: 667 };

    // 2. Wait for Cookie Consent (verifies React client hydration)
    const cookieConsent = page.locator('aside[aria-label="Cookie consent"]');
    await expect(cookieConsent).toBeVisible({ timeout: 10000 });

    // 3. Trigger PWA Install Prompt (now that listeners are mounted)
    await page.evaluate(() => {
      window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true }));
    });

    const installBar = page.getByTestId('mobile-pwa-install-bar');
    await expect(installBar).toBeVisible({ timeout: 5000 });

    // 4. Auto-retrying position verification (waits for CSS entry animations to settle)
    await expect.poll(async () => {
      const barBox = await installBar.boundingBox();
      const cookieBox = await cookieConsent.boundingBox();
      if (!barBox || !cookieBox) return false;

      // Mobile Install Bar: Docked to top (y <= 5px tolerance)
      const barAtTop = barBox.y <= 5;
      // Mobile Cookie Consent: Docked to bottom (bottom edge within 5px of viewport bottom)
      const cookieAtBottom = (cookieBox.y + cookieBox.height) >= (viewport.height - 5);
      // No vertical collision: bottom of install bar is strictly above top of cookie banner
      const noOverlap = (barBox.y + barBox.height) < cookieBox.y;

      return barAtTop && cookieAtBottom && noOverlap;
    }, { message: 'Mobile PWA bar and Cookie Consent must occupy top and bottom without overlap', timeout: 5000 }).toBe(true);
  });

  test('Desktop/Tablet: Install Card at Bottom-Left and Cookie Notice at Bottom-Right with No Overlap', async ({ page }) => {
    const isMobile = (page.viewportSize()?.width ?? 1280) < 768;
    test.skip(isMobile, 'Desktop/Tablet (>= 768px) viewports only');
    
    // 1. Navigate to unauthenticated page
    await page.goto('/login?pwa=true');
    await page.waitForLoadState('domcontentloaded');

    const viewport = page.viewportSize() || { width: 1280, height: 800 };

    // 2. Wait for Cookie Consent (verifies React client hydration)
    const cookieConsent = page.locator('aside[aria-label="Cookie consent"]');
    await expect(cookieConsent).toBeVisible({ timeout: 10000 });

    // 3. Trigger PWA Install Prompt (now that listeners are mounted)
    await page.evaluate(() => {
      window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true }));
    });

    const installCard = page.getByTestId('desktop-pwa-install-card');
    await expect(installCard).toBeVisible({ timeout: 5000 });

    // 4. Auto-retrying position verification (waits for CSS entry animations to settle)
    await expect.poll(async () => {
      const cardBox = await installCard.boundingBox();
      const cookieBox = await cookieConsent.boundingBox();
      if (!cardBox || !cookieBox) return false;

      const midX = viewport.width / 2;
      const midY = viewport.height / 2;

      // Desktop PWA Card: Bottom-Left quadrant (fixed bottom-4 left-4)
      const cardInBottomLeft = cardBox.x < midX && (cardBox.y + cardBox.height) > midY;
      // Desktop Cookie Notice: Bottom-Right quadrant (md:bottom-4 md:right-4)
      const cookieInBottomRight = cookieBox.x > midX && (cookieBox.y + cookieBox.height) > midY;
      // No horizontal overlap between left card and right notice
      const noOverlap = (cardBox.x + cardBox.width) < cookieBox.x;

      return cardInBottomLeft && cookieInBottomRight && noOverlap;
    }, { message: 'Desktop PWA card and Cookie Notice must occupy separate bottom quadrants without overlap', timeout: 5000 }).toBe(true);
  });

});
