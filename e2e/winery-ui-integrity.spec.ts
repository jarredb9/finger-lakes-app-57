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

  test('mobile viewport top anchoring layout check', async ({ page, mockMaps, user }) => {
    // Set viewport to mobile dimension (e.g., 375x812)
    await page.setViewportSize({ width: 375, height: 812 });

    // Init mocks and login
    await mockMaps.initDefaultMocks({ currentUserId: user.id });
    await login(page, user.email, user.password);
    await waitForAppReady(page);

    // Open a winery modal
    const mockWineryId = 'mock-winery-hours';
    const mockWinery = {
      id: mockWineryId,
      google_place_id: mockWineryId,
      name: 'Winery with Hours',
      address: '123 Vineyard Lane',
      rating: 4.5,
    };
    
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
    }, mockWineryId);

    // Select the dialog content container
    const dialogContent = page.getByTestId('winery-modal');
    await expect(dialogContent).toBeVisible();

    // Check CSS properties or bounding box layout for top anchoring on mobile
    const box = await dialogContent.boundingBox();
    expect(box).not.toBeNull();
    
    // We will verify the top coordinate aligns with expected top-4 (16px) or is near the top
    expect(box!.y).toBeLessThanOrEqual(50); // Asserts top anchoring/offset on mobile viewport
  });
});

test.describe('Winery Data Integrity (Standardization & Merge Guards)', () => {
  const TEST_WINERY_ID = 'ChIJtest-winery-id' as any;

  test('should not overwrite enriched data with partial map marker data', async ({ page }) => {
    // 1. Setup: Inject an enriched winery into the store
    await page.goto('/');
    
    const enrichedWinery = {
      id: TEST_WINERY_ID,
      name: 'Enriched Winery',
      address: '123 Wine Ave',
      latitude: 42.123,
      longitude: -76.456,
      phone: '555-1234',
      rating: 4.5,
      userRatingCount: 100,
      enrichment_tier: 'enriched',
      openingHours: {
        periods: [],
        weekday_text: ['Monday: 9:00 AM – 5:00 PM']
      },
      reviews: [{ author_name: 'Tester', rating: 5, text: 'Great!', time: Date.now() / 1000, relative_time_description: 'today' }]
    };

    await page.evaluate((data) => {
      // @ts-ignore
      const store = window.useWineryDataStore.getState();
      store.upsertWinery(data);
    }, enrichedWinery);

    // Verify initial state
    const initialStore = await page.evaluate((id) => {
      // @ts-ignore
      return window.useWineryDataStore.getState().getWinery(id);
    }, TEST_WINERY_ID);
    
    expect(initialStore.phone).toBe('555-1234');
    expect(initialStore.enrichment_tier).toBe('enriched');

    // 2. Simulate Map Marker Update (Partial Data)
    // Map markers often have null/undefined for phone, hours, etc.
    const markerUpdate = {
      google_place_id: TEST_WINERY_ID,
      name: 'Enriched Winery (Updated)',
      latitude: 42.123,
      longitude: -76.456,
      phone: null, // explicitly null to trigger overwrite if not guarded
      google_rating: null,
      opening_hours: null,
      reviews: null,
    };

    await page.evaluate((marker) => {
      // @ts-ignore
      const store = window.useWineryDataStore.getState();
      const existing = store.getWinery(marker.google_place_id);
      // @ts-ignore
      const standardized = window.standardizeWineryData(marker, existing);
      store.upsertWinery(standardized);
    }, markerUpdate);

    // 3. Verify that enriched data PERSISTS
    const finalStore = await page.evaluate((id) => {
      // @ts-ignore
      return window.useWineryDataStore.getState().getWinery(id);
    }, TEST_WINERY_ID);

    expect(finalStore.name).toBe('Enriched Winery (Updated)'); // Name can update
    expect(finalStore.phone).toBe('555-1234'); // Phone MUST PERSIST
    expect(finalStore.rating).toBe(4.5); // Rating MUST PERSIST
    expect(finalStore.userRatingCount).toBe(100); // User rating count MUST PERSIST
    expect(finalStore.openingHours).not.toBeNull(); // Hours MUST PERSIST
    expect(finalStore.enrichment_tier).toBe('enriched'); // Tier MUST PERSIST
  });

  test('should trigger details fetch if enrichment is incomplete', async ({ page }) => {
    // Inject a "Ghost Enriched" winery (tier enriched but missing fields)
    const ghostWinery = {
      id: TEST_WINERY_ID,
      name: 'Ghost Winery',
      latitude: 42.123,
      longitude: -76.456,
      enrichment_tier: 'enriched',
      // MISSING reviews or openingHours
    };

    await page.goto('/');
    await page.evaluate((data) => {
      // @ts-ignore
      window.useWineryDataStore.getState().upsertWinery(data);
    }, ghostWinery);

    // Intercept the Edge Function call
    let fetchTriggered = false;
    await page.route('**/functions/v1/get-winery-details', async (route) => {
      fetchTriggered = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...ghostWinery, phone: '555-FETCHED', reviews: [], openingHours: { periods: [], weekday_text: ['...'] } })
      });
    });

    // Trigger ensureWineryDetails
    await page.evaluate(async (id) => {
      // @ts-ignore
      window._E2E_SKIP_DETAILS_MOCK = true;
      // @ts-ignore
      await window.useWineryStore.getState().ensureWineryDetails(id);
    }, TEST_WINERY_ID);

    expect(fetchTriggered).toBe(true);
  });

  test('mobile viewport top anchoring layout check', async ({ page, mockMaps, user }) => {
    // Set viewport to mobile dimension
    await page.setViewportSize({ width: 375, height: 812 });

    await mockMaps.initDefaultMocks({ currentUserId: user.id });
    await login(page, user.email, user.password);
    await waitForAppReady(page);

    // Open winery modal
    const mockWinery = {
      id: 'mock-winery-hours',
      google_place_id: 'mock-winery-hours',
      name: 'Winery with Hours',
      address: '123 Vineyard Lane',
    };

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

    const dialogContent = page.getByTestId('winery-modal');
    await expect(dialogContent).toBeVisible();

    const box = await dialogContent.boundingBox();
    expect(box).not.toBeNull();
    // Mobile modals should be top anchored or positioned specifically (e.g. check top offset < 50px).
    // This will fail because the modal is centered default on desktop/unadjusted views.
    expect(box!.y).toBeLessThanOrEqual(50);
  });
});

