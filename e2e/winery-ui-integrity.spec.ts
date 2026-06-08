import { test, expect } from './utils';
import { login, waitForAppReady } from './helpers';

test.describe('Winery UI Integrity', () => {
  test('restored opening hours and status are visible in WineryDetails', async ({ page, mockMaps, user }) => {
    // 1. Setup mock data with opening hours
    const mockWinery = {
      id: 'mock-winery-hours',
      google_place_id: 'mock-winery-hours',
      name: 'Winery with Hours',
      address: '123 Vineyard Lane',
      rating: 4.5,
      openingHours: {
        open_now: true,
        periods: [
          {
            open: { day: 0, time: '0000' } // Always open 24/7 for stability in tests
          }
        ],
        weekday_text: [
          'Monday: 9:00 AM – 5:00 PM',
          'Tuesday: 9:00 AM – 5:00 PM',
          'Wednesday: 9:00 AM – 5:00 PM',
          'Thursday: 9:00 AM – 5:00 PM',
          'Friday: 9:00 AM – 5:00 PM',
          'Saturday: 9:00 AM – 5:00 PM',
          'Sunday: 9:00 AM – 5:00 PM'
        ]
      }
    };

    await mockMaps.initDefaultMocks({ currentUserId: user.id });
    
    // 2. Login
    await login(page, user.email, user.password);
    await waitForAppReady(page);

    // Inject mock winery into the store
    await page.evaluate((winery) => {
      if ((window as any).useWineryDataStore) {
        (window as any).useWineryDataStore.setState({ persistentWineries: [winery] });
      }
    }, mockWinery);

    // 3. Open the winery modal
    await page.evaluate((id) => {
      if ((window as any).useUIStore) {
        (window as any).useUIStore.getState().openWineryModal(id);
      }
    }, mockWinery.id);

    // 4. Verify UI Restoration
    const modal = page.getByTestId('winery-modal');
    await expect(modal).toBeVisible();

    // Check for "Open" status
    const status = modal.locator('span', { hasText: /Open|Closed/ });
    await expect(status).toBeVisible();
    await expect(status).toHaveClass(/text-(green|red)-600/);

    // Check for Today's Hours
    const todayIndex = (new Date().getDay() + 6) % 7;
    const expectedHoursLine = mockWinery.openingHours.weekday_text[todayIndex];
    const expectedHours = expectedHoursLine.substring(expectedHoursLine.indexOf(':') + 2);
    
    await expect(modal.getByText(expectedHours)).toBeVisible();

    // Check for Toggle Button
    const toggleButton = modal.getByTestId('hours-toggle');
    await expect(toggleButton).toBeVisible();

    // Test Toggle
    await toggleButton.click();
    for (const line of mockWinery.openingHours.weekday_text) {
      await expect(modal.getByText(line)).toBeVisible();
    }
    
    await toggleButton.click();
    // After closing, only today's hours should be visible (lines don't contain full text like "Monday:")
    await expect(modal.getByText('Monday: 9:00 AM – 5:00 PM')).not.toBeVisible();
  });

  test('fallback to open_now when periods are missing', async ({ page, mockMaps, user }) => {
    // 1. Setup mock data with ONLY open_now (simulating local data or limited API result)
    const mockWinery = {
      id: 'mock-winery-fallback',
      google_place_id: 'mock-winery-fallback',
      name: 'Winery with Fallback',
      address: '456 Limited Road',
      openingHours: {
        open_now: false,
        // no periods, no weekday_text
      }
    };

    await mockMaps.initDefaultMocks({ currentUserId: user.id });
    
    await login(page, user.email, user.password);
    await waitForAppReady(page);

    // Inject mock winery into the store
    await page.evaluate((winery) => {
      if ((window as any).useWineryDataStore) {
        (window as any).useWineryDataStore.setState({ persistentWineries: [winery] });
      }
    }, mockWinery);

    await page.evaluate((id) => {
      if ((window as any).useUIStore) {
        (window as any).useUIStore.getState().openWineryModal(id);
      }
    }, mockWinery.id);

    const modal = page.getByTestId('winery-modal');
    await expect(modal).toBeVisible();

    // Check for "Closed" status (from open_now: false)
    const status = modal.locator('span', { hasText: 'Closed' });
    await expect(status).toBeVisible();
    await expect(status).toHaveClass(/text-red-600/);
    
    // Verify Clock icon is still there (since we have open_now)
    await expect(modal.locator('svg.lucide-clock')).toBeVisible();
  });
});
