import { test, expect } from './utils';
import {
  login,
  clearServiceWorkers
} from './helpers';

test.describe('Winery Modal Consolidated Suite', () => {
  test.beforeEach(async ({ page, user, mockMaps }) => {
    await clearServiceWorkers(page);
    await page.addInitScript(() => {
      (window as any)._E2E_SKIP_DETAILS_MOCK = true;
    });
    await mockMaps.initDefaultMocks({ currentUserId: user.id });
    await login(page, user.email, user.password);
  });

  const seedWineryAndOpenModal = async (page: any, wineryId = 3, name = 'The Phantom Cellar') => {
    await page.evaluate(({ id, wineryName }: { id: any; wineryName: any }) => {
      const winery = {
        id,
        google_place_id: `place_${id}`,
        name: wineryName,
        address: '123 Seneca Trail, Dundee, NY',
        latitude: 42.52,
        longitude: -76.95,
        rating: 4.8,
        user_rating_count: 124,
        enrichment_tier: 'enriched',
        generative_summary: { overview: { text: 'A charming winery with beautiful views of Seneca Lake.' } },
        opening_hours: {
          open_now: true,
          weekday_text: [
            'Monday: 10:00 AM – 5:00 PM',
            'Tuesday: 10:00 AM – 5:00 PM',
            'Wednesday: 10:00 AM – 5:00 PM',
            'Thursday: 10:00 AM – 5:00 PM',
            'Friday: 10:00 AM – 6:00 PM',
            'Saturday: 10:00 AM – 6:00 PM',
            'Sunday: 11:00 AM – 5:00 PM'
          ]
        }
      };
      (window as any).useWineryDataStore.getState().upsertWinery(winery);
      (window as any).useUIStore.getState().openWineryModal(String(id));
    }, { id: wineryId, wineryName: name });
  };

  test.describe('Responsive Layouts', () => {
    test('renders as a Drawer on mobile viewports', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await seedWineryAndOpenModal(page);

      const drawer = page.getByTestId('winery-modal-drawer');
      await expect(drawer).toBeVisible();

      const dragHandle = drawer.locator('[data-testid="drawer-drag-handle"]');
      await expect(dragHandle).toBeVisible();
    });

    test('renders as a Dialog with split columns on desktop viewports', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await seedWineryAndOpenModal(page);

      const dialog = page.getByTestId('winery-modal-dialog');
      await expect(dialog).toBeVisible();

      await expect(dialog.getByTestId('modal-left-column')).toBeVisible();
      await expect(dialog.getByTestId('modal-right-column')).toBeVisible();
    });
  });

  test.describe('Mobile Snap Drawer Gestures & Peek Bar', () => {
    test('snaps between points and allows swipe interactions', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await seedWineryAndOpenModal(page);

      const drawer = page.getByTestId('winery-modal-drawer');
      await expect(drawer).toBeVisible();
      await expect(drawer).toHaveAttribute('data-snap-points', '300px,520px,1');

      await expect(page.getByTestId('peek-open-status-tag')).toBeVisible();
      await expect(page.getByTestId('log-visit-button').first()).toBeVisible();
      await expect(page.getByTestId('route-from-current').first()).toBeVisible();

      const handle = page.getByTestId('drawer-drag-handle');
      const initialBox = await handle.boundingBox();
      expect(initialBox).not.toBeNull();
      const startX = initialBox!.x + initialBox!.width / 2;
      const startY = initialBox!.y + initialBox!.height / 2;

      // Swipe Up to Half
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX, startY - 200, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(400);

      await expect(drawer).toBeVisible();
    });
  });

  test.describe('Navigation Tabs & Quick Actions', () => {
    test('switches across tabs (Community, Amenities, AI Insights, Visits, Trip)', async ({ page }) => {
      await seedWineryAndOpenModal(page);

      const modal = page.getByTestId('winery-modal-dialog').or(page.getByTestId('winery-modal-drawer'));
      await expect(modal).toBeVisible();

      const communityTab = modal.getByRole('tab', { name: /Community/i });
      const amenitiesTab = modal.getByRole('tab', { name: /Amenities/i });
      const aiInsightsTab = modal.getByRole('tab', { name: /AI Insights/i });
      const visitsTab = modal.getByRole('tab', { name: /Visits/i });
      const tripTab = modal.getByRole('tab', { name: /Trip/i });

      await expect(communityTab).toBeVisible();
      await expect(amenitiesTab).toBeVisible();
      await expect(aiInsightsTab).toBeVisible();
      await expect(visitsTab).toBeVisible();
      await expect(tripTab).toBeVisible();

      await amenitiesTab.click();
      await expect(modal.getByTestId('amenity-row-parking')).toBeVisible();

      await visitsTab.click();
      await expect(modal.getByTestId('log-visit-button')).toBeVisible();

      await tripTab.click();
      await expect(modal.getByTestId('trip-planner-section')).toBeVisible();

      await aiInsightsTab.click();
      const insightsContainer = modal.locator('.stable-gemini-container').or(modal.getByTestId('gemini-summary'));
      await expect(insightsContainer).toBeVisible();
    });

    test('Share button and Route Navigation popover (Google Maps & Waze)', async ({ page }) => {
      await seedWineryAndOpenModal(page);

      const modal = page.getByTestId('winery-modal-dialog').or(page.getByTestId('winery-modal-drawer'));
      await expect(modal.getByTestId('share-button')).toBeVisible();

      const routeButton = modal.getByTestId('route-from-current');
      await routeButton.click();

      const mapChoices = page.getByTestId('map-navigation-popover');
      await expect(mapChoices).toBeVisible();
      await expect(mapChoices.getByRole('button', { name: /Google Maps/i })).toBeVisible();
      await expect(mapChoices.getByRole('button', { name: /Waze/i })).toBeVisible();
    });
  });
});
