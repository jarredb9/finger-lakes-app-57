import { test, expect } from './utils';
import { 
    login, 
    navigateToTab, 
    openWineryDetails, 
    clearServiceWorkers
} from './helpers';

test.describe('Winery Q&A Review Fallback Flow', () => {
  test.beforeEach(async ({ page, user, mockMaps }) => {
    await clearServiceWorkers(page);
    await page.addInitScript(() => {
      (window as any)._E2E_SKIP_DETAILS_MOCK = true;
    });
    await mockMaps.initDefaultMocks({ currentUserId: user.id });
    await login(page, user.email, user.password);
  });

  test('Clicking amenity rows opens reviews panel with relevant search results (with Reviews Enrichment)', async ({ page }) => {
    // 1. Navigate to Explore
    await navigateToTab(page, 'Explore');

    // 2. Open Winery 3 ('The Phantom Cellar') which triggers mock API enrichment returning null/unknown attributes & reviews
    await openWineryDetails(page, 'The Phantom Cellar');

    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    // 3. Switch to the Amenities tab in the redesigned tabbed interface
    const amenitiesTab = modal.getByRole('tab', { name: /Amenities/i });
    await expect(amenitiesTab).toBeVisible();
    await amenitiesTab.click();

    // 4. Verify that amenity rows are displayed, including "Outdoor" row
    const outdoorRow = modal.getByTestId('amenity-row-outdoor');
    await expect(outdoorRow).toBeVisible();

    const evRow = modal.getByTestId('amenity-row-ev_charging');
    await expect(evRow).toBeVisible();

    // 5. Click on the "Outdoor" amenity row to trigger the reviews panel (Side-Sheet on desktop or Sub-Drawer on mobile)
    await outdoorRow.click();

    // 6. Verify the reviews panel is visible and contains the relevant review snippet
    const reviewsPanel = page.getByTestId('amenity-reviews-sheet').or(page.getByTestId('amenity-reviews-drawer'));
    await expect(reviewsPanel).toBeVisible();

    // The review text should be displayed
    await expect(reviewsPanel.getByText(/Loved the outdoor seating patio/i)).toBeVisible();

    // 7. Close the reviews panel and click on "EV Charging" row
    const closeButton = reviewsPanel.getByRole('button', { name: /close/i });
    await closeButton.click();

    await evRow.click();

    // The reviews panel should re-open with EV-related content
    const reviewsPanel2 = page.getByTestId('amenity-reviews-sheet').or(page.getByTestId('amenity-reviews-drawer'));
    await expect(reviewsPanel2).toBeVisible();
    await expect(reviewsPanel2.getByText(/electric vehicle ev charging/i)).toBeVisible();
  });

  test('Clicking amenity rows on winery with NO reviews displays the fallback text (with Reviews Enrichment)', async ({ page }) => {
    // 1. Navigate to Explore
    await navigateToTab(page, 'Explore');

    // 2. Open 'Vineyard of Illusion' which triggers mock API enrichment returning null/unknown attributes & empty reviews
    await openWineryDetails(page, 'Vineyard of Illusion');

    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    // 3. Switch to Amenities tab
    const amenitiesTab = modal.getByRole('tab', { name: /Amenities/i });
    await expect(amenitiesTab).toBeVisible();
    await amenitiesTab.click();

    // 4. Click on "Parking" amenity row
    const parkingRow = modal.getByTestId('amenity-row-parking');
    await expect(parkingRow).toBeVisible();
    await parkingRow.click();

    // 5. Verify the reviews panel shows fallback text when no reviews are found
    const reviewsPanel = page.getByTestId('amenity-reviews-sheet').or(page.getByTestId('amenity-reviews-drawer'));
    await expect(reviewsPanel).toBeVisible();
    await expect(reviewsPanel.getByText(/No mention of this in the reviews/i)).toBeVisible();
  });

  test('Cycling through multiple reviews in the reviews panel (with Reviews Enrichment)', async ({ page }) => {
    // 1. Navigate to Explore and open 'The Phantom Cellar'
    await navigateToTab(page, 'Explore');
    await openWineryDetails(page, 'The Phantom Cellar');

    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    // 2. Switch to Amenities tab and click "Outdoor" row
    const amenitiesTab = modal.getByRole('tab', { name: /Amenities/i });
    await amenitiesTab.click();

    const outdoorRow = modal.getByTestId('amenity-row-outdoor');
    await outdoorRow.click();

    const reviewsPanel = page.getByTestId('amenity-reviews-sheet').or(page.getByTestId('amenity-reviews-drawer'));
    await expect(reviewsPanel).toBeVisible();

    // 3. Verify the first review is displayed (as a snippet)
    const firstReviewText = /Loved the outdoor seating patio/i;
    await expect(reviewsPanel.getByText(firstReviewText)).toBeVisible();
    await expect(reviewsPanel.getByText(/John Doe/i)).toBeVisible();

    // 4. Expand the first review
    const expandButton = reviewsPanel.getByTestId('toggle-full-review');
    await expect(expandButton).toContainText(/Show full review/i);
    await expandButton.click();
    
    // Verify it now shows "Show less" and the full text (which includes the hard-to-park part)
    await expect(expandButton).toContainText(/Show less/i);
    await expect(reviewsPanel.getByText(/parking is a bit hard/i)).toBeVisible();

    // 5. Load the next review
    const nextButton = reviewsPanel.getByTestId('next-review');
    await expect(nextButton).toBeVisible();
    await nextButton.click();

    // 6. Verify the second review is displayed
    const secondReviewText = /really enjoyed the outdoor atmosphere/i;
    await expect(reviewsPanel.getByText(secondReviewText)).toBeVisible();
    await expect(reviewsPanel.getByText(/Jane Smith/i)).toBeVisible();
    
    // Verify "1 of 2" indicator is now "2 of 2"
    await expect(reviewsPanel.getByText(/2 of 2/i)).toBeVisible();

    // 7. Verify "Previous" button is now visible and "Next" is hidden
    const prevButton = reviewsPanel.getByTestId('prev-review');
    await expect(prevButton).toBeVisible();
    await expect(nextButton).not.toBeVisible();

    // 8. Go back to first review
    await prevButton.click();
    await expect(reviewsPanel.getByText(firstReviewText)).toBeVisible();
    await expect(prevButton).not.toBeVisible();
    await expect(nextButton).toBeVisible();
  });

  test('Handling unnormalized V1 review data (Robustness check)', async ({ page }) => {
    // 1. Manually route get-winery-details to return V1 style reviews for a specific winery
    await page.context().route(/functions\/v1\/get-winery-details/, async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204 });
      
      const detailedWinery = {
        id: 'ch-v1-data',
        name: 'V1 Data Winery',
        address: 'V1 St',
        latitude: 42.7,
        longitude: -76.9,
        enrichment_tier: 'enriched',
        reviews: [
          {
            authorAttribution: { displayName: "V1 Author" },
            text: { text: "This place is great and has outdoor seating." },
            relativePublishTimeDescription: "2 days ago"
          }
        ],
        outdoor_seating: null // Trigger Q&A fallback
      };
      
      await route.fulfill({ 
        status: 200, 
        contentType: 'application/json', 
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(detailedWinery) 
      });
    });

    // 2. Navigate and open the winery
    await navigateToTab(page, 'Explore');
    
    await page.evaluate(() => {
        const winery = {
            id: 'ch-v1-data',
            name: 'V1 Data Winery',
            latitude: 42.7,
            longitude: -76.9,
            address: 'V1 St',
            enrichment_tier: 'enriched',
            reviews: []
        };
        (window as any).useWineryDataStore.getState().upsertWinery(winery);
        const mapStore = (window as any).useMapStore.getState();
        mapStore.setSearchResults([...mapStore.searchResults, winery]);
    });

    await openWineryDetails(page, 'V1 Data Winery');

    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    // 3. Switch to Amenities tab and click "Outdoor" row to trigger reviews
    const amenitiesTab = modal.getByRole('tab', { name: /Amenities/i });
    await amenitiesTab.click();

    const outdoorRow = modal.getByTestId('amenity-row-outdoor');
    await outdoorRow.click();

    // 4. Verify the review text is extracted correctly from the V1 object in the reviews panel
    const reviewsPanel = page.getByTestId('amenity-reviews-sheet').or(page.getByTestId('amenity-reviews-drawer'));
    await expect(reviewsPanel).toBeVisible();
    await expect(reviewsPanel.getByText(/has outdoor seating/i)).toBeVisible();
    await expect(reviewsPanel.getByText(/V1 Author/i)).toBeVisible();
  });
});
