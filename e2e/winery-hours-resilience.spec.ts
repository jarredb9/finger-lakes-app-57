import { test, expect } from './utils';
import {
  login,
  clearServiceWorkers,
  openWineryModalState,
} from './helpers';

test.describe('Winery Operational Hours Resilience & PWA Hydration Suite', () => {
  test.beforeEach(async ({ page, user, mockMaps }) => {
    await clearServiceWorkers(page);
    await page.addInitScript(() => {
      window._E2E_SKIP_DETAILS_MOCK = true;
    });
    await mockMaps.initDefaultMocks({ currentUserId: user.id });
    await login(page, user.email, user.password, { skipMapReady: true });
  });

  test.describe('Desktop Modal Tri-State Operational Hours & Fallbacks', () => {
    test('renders "Hours Unavailable" without defaulting to "Closed" when opening_hours is null', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });

      const wineryWithoutHours = {
        id: 2988,
        google_place_id: 'place_2988_resilience',
        name: "Anyela's Vineyards (Resilience Test)",
        address: '2433 W Lake Rd, Skaneateles, NY',
        latitude: 42.89,
        longitude: -76.41,
        rating: 4.6,
        user_rating_count: 85,
        website: null,
        opening_hours: null,
        enrichment_tier: 'basic',
      };

      await openWineryModalState(page, wineryWithoutHours);

      const dialog = page.getByTestId('winery-modal-dialog');
      await expect(dialog).toBeVisible();

      // Invariant: Missing hours must render "Hours Unavailable" and NEVER "Closed" or "Open Now"
      await expect(dialog.getByText('Hours Unavailable')).toBeVisible();
      await expect(dialog.getByText('Open Now')).not.toBeVisible();
      await expect(dialog.getByText('Closed', { exact: true })).not.toBeVisible();

      // No broken toggle or website fallback link when website is null
      await expect(dialog.getByTestId('hours-toggle')).not.toBeVisible();
      await expect(dialog.getByTestId('schedule-fallback-website')).not.toBeVisible();
    });

    test('renders direct website link fallback when opening_hours is null and website is present', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });

      const wineryWithWebsiteFallback = {
        id: 2989,
        google_place_id: 'place_2989_website_fallback',
        name: 'Six Eighty Cellars (Fallback Test)',
        address: '3050 Swick Rd, Ovid, NY',
        latitude: 42.66,
        longitude: -76.82,
        rating: 4.7,
        website: 'https://sixeightycellars.com',
        opening_hours: null,
        enrichment_tier: 'basic',
      };

      await openWineryModalState(page, wineryWithWebsiteFallback);

      const dialog = page.getByTestId('winery-modal-dialog');
      await expect(dialog).toBeVisible();

      await expect(dialog.getByText('Hours Unavailable')).toBeVisible();
      const websiteLink = dialog.getByTestId('schedule-fallback-website');
      await expect(websiteLink).toBeVisible();
      await expect(websiteLink).toHaveAttribute('href', 'https://sixeightycellars.com');
    });
  });

  test.describe('Mobile Drawer Tri-State Operational Hours & Peek Badge', () => {
    test('renders peek status badge as "⚪ HOURS UNAVAILABLE" and not "🔴 CLOSED" when hours are null', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });

      const mobileWinery = {
        id: 2990,
        google_place_id: 'place_2990_mobile_null',
        name: 'Silent Valley Cellars (Mobile Test)',
        address: '1000 Secret Hollow Rd, Hammondsport, NY',
        latitude: 42.45,
        longitude: -77.2,
        opening_hours: null,
        enrichment_tier: 'basic',
      };

      await openWineryModalState(page, mobileWinery);

      const drawer = page.getByTestId('winery-modal-drawer');
      await expect(drawer).toBeVisible();

      // Invariant: Mobile peek status tag must show "⚪ HOURS UNAVAILABLE"
      const peekBadge = page.getByTestId('peek-open-status-tag');
      await expect(peekBadge).toBeVisible();
      await expect(peekBadge).toHaveText('⚪ HOURS UNAVAILABLE');
      await expect(peekBadge).not.toHaveText(/🔴 CLOSED/);
      await expect(peekBadge).not.toHaveText(/🟢 OPEN NOW/);
    });

    test('renders animated skeleton pill in mobile peek badge when loading state is active', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });

      const loadingWinery = {
        id: 2991,
        google_place_id: 'place_2991_loading',
        name: 'Loading Vineyard',
        address: '500 Scenic Trail, Geneva, NY',
        latitude: 42.87,
        longitude: -76.98,
        opening_hours: null,
      };

      // Set loading state in UI/winery store before opening
      await page.evaluate((winery) => {
        window.useWineryDataStore?.getState().upsertWinery(winery as any);
        window.useWineryDataStore?.setState({ loadingWineryId: String(winery.id) });
        window.useUIStore?.getState().openWineryModal(String(winery.id));
      }, loadingWinery);

      const drawer = page.getByTestId('winery-modal-drawer');
      await expect(drawer).toBeVisible();

      // Invariant: When loading, drawer peek badge displays skeleton
      const skeletonPill = page.getByTestId('peek-status-skeleton');
      await expect(skeletonPill).toBeVisible();
    });
  });

  test.describe('Decoupled Hydration & Dynamic Operational Hours Arrival', () => {
    test('renders cached content immediately and dynamically transitions from "Hours Unavailable" to "Open Now" with weekly hours on enrichment', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });

      const initialWinery = {
        id: 2992,
        google_place_id: 'place_2992_transition',
        name: 'Transition Test Cellars',
        address: '100 Riesling Way, Dundee, NY',
        latitude: 42.52,
        longitude: -76.95,
        rating: 4.8,
        opening_hours: null,
        enrichment_tier: 'basic',
      };

      await openWineryModalState(page, initialWinery);

      const dialog = page.getByTestId('winery-modal-dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText('Hours Unavailable')).toBeVisible();

      // Simulate background enrichment arrival
      await page.evaluate(() => {
        window.useWineryDataStore?.getState().upsertWinery({
          id: 'place_2992_transition',
          google_place_id: 'place_2992_transition',
          name: 'Transition Test Cellars',
          address: '100 Riesling Way, Dundee, NY',
          latitude: 42.52,
          longitude: -76.95,
          rating: 4.8,
          enrichment_tier: 'enriched',
          opening_hours: {
            open_now: true,
            periods: [
              {
                open: { day: 0, hour: 0, minute: 0 },
              },
            ],
            weekday_text: [
              'Monday: 10:00 AM – 5:00 PM',
              'Tuesday: 10:00 AM – 5:00 PM',
              'Wednesday: 10:00 AM – 5:00 PM',
              'Thursday: 10:00 AM – 5:00 PM',
              'Friday: 10:00 AM – 5:00 PM',
              'Saturday: 10:00 AM – 6:00 PM',
              'Sunday: 11:00 AM – 5:00 PM',
            ],
          },
        } as any);
      });

      // Assert dynamic UI transition to "Open Now" and hours toggle becoming visible
      await expect(dialog.getByText('Open Now')).toBeVisible();
      await expect(dialog.getByTestId('hours-toggle')).toBeVisible();
    });
  });
});
