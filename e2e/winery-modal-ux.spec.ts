import { test, expect } from './utils';
import {
  login,
  navigateToTab,
  openWineryDetails,
  ensureSidebarExpanded,
  clearServiceWorkers
} from './helpers';

test.describe('Winery Modal Redesign', () => {
  test.beforeEach(async ({ page, user, mockMaps }) => {
    await clearServiceWorkers(page);
    await page.addInitScript(() => {
      (window as any)._E2E_SKIP_DETAILS_MOCK = true;
    });
    await mockMaps.initDefaultMocks({ currentUserId: user.id });
    await login(page, user.email, user.password);
  });

  test.describe('Responsive Modal Rendering', () => {
    test('renders as a Drawer (bottom sheet) on mobile viewports', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 812 });

      await navigateToTab(page, 'Explore');
      await ensureSidebarExpanded(page);
      await openWineryDetails(page, 'The Phantom Cellar');

      // On mobile, the redesigned modal should render inside a Drawer (bottom sheet)
      const drawer = page.getByTestId('winery-modal-drawer');
      await expect(drawer).toBeVisible();

      // Verify it has a drag handle
      const dragHandle = drawer.locator('[data-testid="drawer-drag-handle"]');
      await expect(dragHandle).toBeVisible();
    });

    test('renders as a Dialog with split columns on desktop viewports', async ({ page }) => {
      // Set desktop viewport
      await page.setViewportSize({ width: 1280, height: 900 });

      await navigateToTab(page, 'Explore');
      await openWineryDetails(page, 'The Phantom Cellar');

      // On desktop, the redesigned modal should render as a Dialog
      const dialog = page.getByTestId('winery-modal-dialog');
      await expect(dialog).toBeVisible();

      // Verify the two-column layout
      const leftColumn = dialog.getByTestId('modal-left-column');
      const rightColumn = dialog.getByTestId('modal-right-column');
      await expect(leftColumn).toBeVisible();
      await expect(rightColumn).toBeVisible();
    });
  });

  test.describe('Navigation Tabs', () => {
    test('switching between bottom/right navigation tabs displays correct content', async ({ page }) => {
      await navigateToTab(page, 'Explore');
      await openWineryDetails(page, 'The Phantom Cellar');

      const modal = page.getByTestId('winery-modal-dialog').or(page.getByTestId('winery-modal-drawer'));
      await expect(modal).toBeVisible();

      // The 5 tabs should be: Community, Amenities, AI Insights, Visits, Trip
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

      // Click Amenities tab and verify amenity rows are shown
      await amenitiesTab.click();
      const parkingRow = modal.getByTestId('amenity-row-parking');
      await expect(parkingRow).toBeVisible();

      // Click Visits tab and verify visit history is shown
      await visitsTab.click();
      const logVisitButton = modal.getByTestId('log-visit-button');
      await expect(logVisitButton).toBeVisible();

      // Click Trip tab and verify trip planner section appears
      await tripTab.click();
      const tripSection = modal.getByTestId('trip-planner-section');
      await expect(tripSection).toBeVisible();

      // Click Community tab and verify friend activity
      await communityTab.click();
      const communityContent = modal.getByTestId('community-tab');
      await expect(communityContent).toBeVisible();
    });
  });

  test.describe('AI Insights Tab', () => {
    test('switching to AI Insights tab displays generative summary', async ({ page }) => {
      await navigateToTab(page, 'Explore');
      await openWineryDetails(page, 'The Phantom Cellar');

      const modal = page.getByTestId('winery-modal-dialog').or(page.getByTestId('winery-modal-drawer'));
      await expect(modal).toBeVisible();

      const aiInsightsTab = modal.getByRole('tab', { name: /AI Insights/i });
      await expect(aiInsightsTab).toBeVisible();

      // Click AI Insights tab
      await aiInsightsTab.click();
      await expect(aiInsightsTab).toHaveAttribute('aria-selected', 'true');

      // Verify AI content is visible (Gemini summary)
      const geminiSummary = modal.locator('[data-testid="gemini-summary"]');
      await expect(geminiSummary).toBeVisible();
    });
  });

  test.describe('Amenities & Reviews Panel', () => {
    test('clicking any of the 8 amenities triggers the reviews panel overlay', async ({ page }) => {
      await navigateToTab(page, 'Explore');
      await openWineryDetails(page, 'The Phantom Cellar');

      const modal = page.getByTestId('winery-modal-dialog').or(page.getByTestId('winery-modal-drawer'));
      await expect(modal).toBeVisible();

      // Switch to Amenities tab
      const amenitiesTab = modal.getByRole('tab', { name: /Amenities/i });
      await amenitiesTab.click();

      // All 8 amenity rows should be present
      const amenityKeys = [
        'parking', 'restrooms', 'tasting_room', 'dogs',
        'picnic_area', 'ev_charging', 'reservations', 'tasting_fee'
      ];

      for (const key of amenityKeys) {
        const row = modal.getByTestId(`amenity-row-${key}`);
        await expect(row).toBeVisible();
      }

      // Click the first amenity (parking) and verify reviews panel appears
      const parkingRow = modal.getByTestId('amenity-row-parking');
      await parkingRow.click();

      const reviewsPanel = page.getByTestId('amenity-reviews-sheet').or(page.getByTestId('amenity-reviews-drawer'));
      await expect(reviewsPanel).toBeVisible();
    });
  });

  test.describe('Route From Current Location', () => {
    test('clicking the Route From Current action triggers MapNavigation popover', async ({ page }) => {
      await navigateToTab(page, 'Explore');
      await openWineryDetails(page, 'The Phantom Cellar');

      const modal = page.getByTestId('winery-modal-dialog').or(page.getByTestId('winery-modal-drawer'));
      await expect(modal).toBeVisible();

      // The "Route From Current Location" button should be visible in the Overview segment
      const routeButton = modal.getByTestId('route-from-current');
      await expect(routeButton).toBeVisible();

      // Click the route button
      await routeButton.click();

      // Verify MapNavigation popup with choices appears (Google Maps, Apple Maps, Waze)
      const mapChoices = page.getByTestId('map-navigation-popover');
      await expect(mapChoices).toBeVisible();

      // Should contain Google Maps option
      await expect(mapChoices.getByRole('button', { name: /Google Maps/i })).toBeVisible();

      // Should contain Waze option (new in redesign)
      await expect(mapChoices.getByRole('button', { name: /Waze/i })).toBeVisible();
    });
  });

  test.describe('Quick Actions', () => {
    test('Share button is present in the quick actions row', async ({ page }) => {
      await navigateToTab(page, 'Explore');
      await openWineryDetails(page, 'The Phantom Cellar');

      const modal = page.getByTestId('winery-modal-dialog').or(page.getByTestId('winery-modal-drawer'));
      await expect(modal).toBeVisible();

      const shareButton = modal.getByTestId('share-button');
      await expect(shareButton).toBeVisible();
    });
  });
});
