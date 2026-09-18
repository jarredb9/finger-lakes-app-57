import { expect, Page } from '@playwright/test';
import { dismissCookieConsent, waitForAppReady, waitForMapReady, waitForSignal } from './core';
import { navigateToTab } from './navigation';

/**
 * E2E AUTHENTICATION & LOGIN FLOW HELPERS
 */

/**
 * Fills the login form fields.
 */
export async function fillLoginForm(page: Page, email: string, pass: string) {
    const form = page.locator('form');
    await expect(form).toBeVisible({ timeout: 10000 });
    const hasHydratedAttr = await form.getAttribute('data-hydrated').catch(() => null);
    if (hasHydratedAttr !== null) {
        await expect(form).toHaveAttribute('data-hydrated', 'true', { timeout: 10000 });
    }
    await expect(page.getByLabel('Email')).toBeVisible({ timeout: 10000 });
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(pass);
}

/**
 * Clicks the sign-in button or presses Enter.
 */
export async function clickSignIn(page: Page) {
    const signInBtn = page.getByRole('button', { name: 'Sign In' });
    await expect(signInBtn).toBeVisible({ timeout: 10000 });
    await expect(signInBtn).toBeEnabled({ timeout: 5000 });
    await signInBtn.click();
}

/**
 * Fills and submits the login form.
 */
export async function submitLoginForm(page: Page, email: string, pass: string) {
    await fillLoginForm(page, email, pass);
    await clickSignIn(page);
}

export async function login(page: Page, email: string, pass: string, options: { skipMapReady?: boolean, isPwa?: boolean } = {}) {
  await page.addInitScript(() => {
    (window as any)._E2E_ENABLE_REAL_SYNC = true;
    window.localStorage.setItem('_E2E_ENABLE_REAL_SYNC', 'true');
    window.localStorage.setItem('cookie-consent', 'true');
  });

  const width = page.viewportSize()?.width ?? 1280;
  const isMobile = width < 768;
  const isPwa = options.isPwa || false;
  const pwaSuffix = isPwa ? '?pwa=true' : '';

  // 1. Ensure we are on the login page
  if (!page.url().includes('/login')) {
    await page.goto(`/login${pwaSuffix}`);
  } else if (isPwa && !page.url().includes('pwa=true')) {
    await page.goto(`/login${pwaSuffix}`);
  }

  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle').catch(() => {});

  // Dismiss cookie consent if visible
  await dismissCookieConsent(page);

  // 2. Perform Login once (no nested action retry loops)
  await submitLoginForm(page, email, pass);

  // 3. Wait deterministically for client-side navigation away from /login
  try {
    await page.waitForURL(
      (url) => !url.pathname.includes('/login') && !url.pathname.includes('/signup'),
      { timeout: 20000 }
    );
  } catch (navError) {
    const errorAlert = await page.locator('form [role="alert"]').textContent().catch(() => null);
    if (errorAlert) {
      throw new Error(`Login failed on ${page.url()} with form error: "${errorAlert.trim()}" (Email: ${email})`);
    }
    throw navError;
  }

  // 4. Wait for app ready (respecting options.skipMapReady)
  await waitForAppReady(page, options);

  // Final check for cookie consent after app is ready
  await dismissCookieConsent(page);

  if (!options.skipMapReady) {
    if (page.url().includes('/trips')) {
      await waitForSignal(page, 'trip-list-container', 'ready', 15000);
    } else {
      await waitForMapReady(page);
    }
  }

  if (isMobile && !options.skipMapReady) {
    await navigateToTab(page, 'Explore');
  }
}

/**
 * @deprecated Use login() instead. Retained for backwards compatibility.
 */
export async function loginProgrammatic(
  page: Page,
  email: string,
  pass: string,
  options: { skipMapReady?: boolean; isPwa?: boolean; redirectTo?: string } = {}
) {
  return login(page, email, pass, options);
}
