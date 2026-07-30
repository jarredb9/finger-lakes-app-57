import { test, expect } from './utils';
import { login, clearServiceWorkers } from './helpers';

test.describe('AI Features Settings Toggle & Preference Persistence', () => {
  test.beforeEach(async ({ page, user, mockMaps }) => {
    await clearServiceWorkers(page);
    await mockMaps.initDefaultMocks({ currentUserId: user.id });
    await login(page, user.email, user.password);
  });

  test('defaults to OFF, allows opt-in toggle, and persists setting across page reloads', async ({ page }) => {
    // Navigate to Settings page
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    const settingsCard = page.getByTestId('ai-settings-card');
    await expect(settingsCard).toBeVisible();

    const aiSwitch = page.getByTestId('ai-features-switch');
    await expect(aiSwitch).toBeVisible();

    // Default state: OFF (unchecked / aria-checked="false")
    await expect(aiSwitch).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByText('AI features are turned off by default.')).toBeVisible();

    // Toggle ON
    await aiSwitch.click();

    // Verify switch updates to checked
    await expect(aiSwitch).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('AI features are active across the app.')).toBeVisible();

    // Reload page to verify persistence
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify persisted state ON
    const persistedSwitch = page.getByTestId('ai-features-switch');
    await expect(persistedSwitch).toHaveAttribute('aria-checked', 'true');

    // Toggle back OFF
    await persistedSwitch.click();
    await expect(persistedSwitch).toHaveAttribute('aria-checked', 'false');

    // Reload page to verify persisted state OFF
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('ai-features-switch')).toHaveAttribute('aria-checked', 'false');
  });
});
