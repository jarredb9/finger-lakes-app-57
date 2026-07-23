import { test, expect } from './utils';
import { login, clearServiceWorkers } from './helpers';

test.describe('Winery Amenities & Q&A Reviews Consolidated Suite', () => {
  test.beforeEach(async ({ page, user, mockMaps }) => {
    await clearServiceWorkers(page);
    await page.addInitScript(() => {
      (window as any)._E2E_SKIP_DETAILS_MOCK = true;
      (window as any)._E2E_FULL_DRAWER = true;
    });
    await mockMaps.initDefaultMocks({ currentUserId: user.id });
    await login(page, user.email, user.password);
  });

  const seedAndOpenWinery = async (page: any, rawWinery: any) => {
    await page.evaluate((wineryData: any) => {
      (window as any).useWineryDataStore.getState().upsertWinery(wineryData);
      const wineryId = String(wineryData.google_place_id || wineryData.id);
      (window as any).useUIStore.getState().openWineryModal(wineryId);
    }, rawWinery);

    const modal = page.getByRole('dialog').or(page.getByTestId('winery-modal-drawer'));
    await expect(modal).toBeVisible();

    const isMobile = await page.evaluate(() => window.innerWidth < 768);
    if (isMobile) {
      const tabsList = modal.locator('[role="tablist"]');
      await expect(tabsList).toBeVisible();
    }
  };

  test('Clicking amenity rows opens reviews panel with matched search results', async ({ page }) => {
    await seedAndOpenWinery(page, {
      id: 'place_3',
      google_place_id: 'place_3',
      dbId: 3,
      name: 'The Phantom Cellar',
      latitude: 42.52,
      longitude: -76.95,
      enrichment_tier: 'enriched',
      outdoor_seating: true,
      ev_charging: true,
      reviews: [
        { author_name: 'John Doe', text: 'Loved the outdoor seating patio! Very relaxed atmosphere.' },
        { author_name: 'EV Driver', text: 'Has great electric vehicle ev charging spots right upfront.' }
      ]
    });

    const modal = page.getByRole('dialog').or(page.getByTestId('winery-modal-drawer'));
    await expect(modal).toBeVisible();

    const amenitiesTab = modal.getByRole('tab', { name: /Amenities/i });
    await amenitiesTab.click();

    const outdoorRow = modal.getByTestId('amenity-row-outdoor');
    await expect(outdoorRow).toBeVisible();
    await outdoorRow.click();

    const reviewsPanel = page.getByTestId('amenity-reviews-sheet').or(page.getByTestId('amenity-reviews-drawer'));
    await expect(reviewsPanel).toBeVisible();
    await expect(reviewsPanel.getByText(/Loved the outdoor seating patio/i)).toBeVisible();
  });

  test('Clicking amenity rows on winery with NO reviews displays fallback text', async ({ page }) => {
    await seedAndOpenWinery(page, {
      id: 'place_99',
      google_place_id: 'place_99',
      dbId: 99,
      name: 'Vineyard of Illusion',
      latitude: 42.55,
      longitude: -76.92,
      enrichment_tier: 'enriched',
      reviews: []
    });

    const modal = page.getByRole('dialog').or(page.getByTestId('winery-modal-drawer'));
    await expect(modal).toBeVisible();

    const amenitiesTab = modal.getByRole('tab', { name: /Amenities/i });
    await amenitiesTab.click();

    const parkingRow = modal.getByTestId('amenity-row-parking');
    await expect(parkingRow).toBeVisible();
    await parkingRow.click();

    const reviewsPanel = page.getByTestId('amenity-reviews-sheet').or(page.getByTestId('amenity-reviews-drawer'));
    await expect(reviewsPanel).toBeVisible();
    await expect(reviewsPanel.getByText(/No mention of this in the reviews/i)).toBeVisible();
  });

  test('Cycling and expanding reviews in the reviews panel', async ({ page }) => {
    await seedAndOpenWinery(page, {
      id: 'place_3',
      google_place_id: 'place_3',
      dbId: 3,
      name: 'The Phantom Cellar',
      latitude: 42.52,
      longitude: -76.95,
      enrichment_tier: 'enriched',
      outdoor_seating: true,
      reviews: [
        { author_name: 'John Doe', text: 'Loved the outdoor seating patio! Note that parking is a bit hard nearby.' },
        { author_name: 'Jane Smith', text: 'We really enjoyed the outdoor atmosphere on Saturday afternoon.' }
      ]
    });

    const modal = page.getByRole('dialog').or(page.getByTestId('winery-modal-drawer'));
    await expect(modal).toBeVisible();

    const amenitiesTab = modal.getByRole('tab', { name: /Amenities/i });
    await amenitiesTab.click();
    
    const outdoorRow = modal.getByTestId('amenity-row-outdoor');
    await expect(outdoorRow).toBeVisible();
    await outdoorRow.click();

    const reviewsPanel = page.getByTestId('amenity-reviews-sheet').or(page.getByTestId('amenity-reviews-drawer'));
    await expect(reviewsPanel).toBeVisible();
    await expect(reviewsPanel.getByText(/Loved the outdoor seating patio/i)).toBeVisible();

    const expandButton = reviewsPanel.getByTestId('toggle-full-review');
    await expect(expandButton).toBeVisible();
    await expandButton.click();
    await expect(expandButton).toContainText(/Show less/i);
    await expect(reviewsPanel.getByText(/parking is a bit hard/i)).toBeVisible();

    const nextButton = reviewsPanel.getByTestId('next-review');
    await expect(nextButton).toBeVisible();
    await nextButton.click();
    await expect(reviewsPanel.getByText(/really enjoyed the outdoor atmosphere/i)).toBeVisible();
    await expect(reviewsPanel.getByText(/2 of 2/i)).toBeVisible();

    const prevButton = reviewsPanel.getByTestId('prev-review');
    await expect(prevButton).toBeVisible();
    await prevButton.click();
    await expect(reviewsPanel.getByText(/Loved the outdoor seating patio/i)).toBeVisible();
  });

  test('Handling unnormalized V1 review schema objects', async ({ page }) => {
    await seedAndOpenWinery(page, {
      id: 'ch-v1-data',
      google_place_id: 'ch-v1-data',
      dbId: 77,
      name: 'V1 Data Winery',
      latitude: 42.7,
      longitude: -76.9,
      enrichment_tier: 'enriched',
      outdoor_seating: true,
      reviews: [
        {
          authorAttribution: { displayName: 'V1 Author' },
          text: { text: 'This place is great and has outdoor seating.' },
          relativePublishTimeDescription: '2 days ago'
        }
      ]
    });

    const modal = page.getByRole('dialog').or(page.getByTestId('winery-modal-drawer'));
    await expect(modal).toBeVisible();

    const amenitiesTab = modal.getByRole('tab', { name: /Amenities/i });
    await amenitiesTab.click();

    const outdoorRow = modal.getByTestId('amenity-row-outdoor');
    await expect(outdoorRow).toBeVisible();
    await outdoorRow.click();

    const reviewsPanel = page.getByTestId('amenity-reviews-sheet').or(page.getByTestId('amenity-reviews-drawer'));
    await expect(reviewsPanel).toBeVisible();
    await expect(reviewsPanel.getByText(/has outdoor seating/i)).toBeVisible();
    await expect(reviewsPanel.getByText(/V1 Author/i)).toBeVisible();
  });
});

