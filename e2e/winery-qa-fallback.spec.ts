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

  test('Clicking unknown attributes opens Google Maps reviews section with relevant search results (with Reviews Enrichment)', async ({ page }) => {
    // 1. Navigate to Explore
    await navigateToTab(page, 'Explore');

    // 2. Open Winery 3 ('The Phantom Cellar') which triggers mock API enrichment returning null/unknown attributes & reviews
    await openWineryDetails(page, 'The Phantom Cellar');

    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    // 3. Expand the "Logistics & Accessibility" accordion
    const accordionHeader = modal.getByRole('button', { name: /Logistics & Accessibility/i });
    await expect(accordionHeader).toBeVisible();
    await accordionHeader.click();

    // 4. Verify that "Free Parking", "EV Charging", "Wheelchair Acc.", and "Outdoor" display "Unknown (Ask Reviews)" buttons
    const parkingStatus = modal.getByTestId('status-unknown-parking');
    const evStatus = modal.getByTestId('status-unknown-ev_charging');
    const wheelchairStatus = modal.getByTestId('status-unknown-wheelchair');
    const outdoorStatus = modal.getByTestId('status-unknown-outdoor');

    await expect(parkingStatus).toBeVisible();
    await expect(evStatus).toBeVisible();
    await expect(wheelchairStatus).toBeVisible();
    await expect(outdoorStatus).toBeVisible();

    // 5. Click on the "Outdoor" attribute button to query reviews
    await outdoorStatus.click();

    // 6. Verify that WineryQnA has the "Is there outdoor seating?" question active and displays the review snippet
    const qnaSection = modal.locator('div.space-y-4.pt-2');
    await expect(qnaSection).toBeVisible();
    
    // The active question should be selected in the dropdown trigger
    const qnaSelectTrigger = qnaSection.getByTestId('qna-select');
    await expect(qnaSelectTrigger).toBeVisible();
    await expect(qnaSelectTrigger).toContainText(/Is there outdoor seating\?/i);
    
    // Expect the review text to be displayed in the search results
    await expect(qnaSection.getByText(/Loved the outdoor seating patio/i)).toBeVisible();

    // 7. Click on the "EV Charging" attribute button to query reviews
    await evStatus.click();

    // The EV charging question should be active in the dropdown trigger now
    await expect(qnaSelectTrigger).toContainText(/Is EV charging available\?/i);

    // Expect the review text to be displayed in the search results
    await expect(qnaSection.getByText(/electric vehicle ev charging/i)).toBeVisible();
  });

  test('Clicking unknown attributes on winery with NO reviews displays the fallback text (with Reviews Enrichment)', async ({ page }) => {
    // 1. Navigate to Explore
    await navigateToTab(page, 'Explore');

    // 2. Open 'Vineyard of Illusion' which triggers mock API enrichment returning null/unknown attributes & empty reviews
    await openWineryDetails(page, 'Vineyard of Illusion');

    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    // 3. Expand "Logistics & Accessibility" accordion
    const accordionHeader = modal.getByRole('button', { name: /Logistics & Accessibility/i });
    await expect(accordionHeader).toBeVisible();
    await accordionHeader.click();

    // 4. Verify and click "Free Parking" status button (unknown)
    const parkingStatus = modal.getByTestId('status-unknown-parking');
    await expect(parkingStatus).toBeVisible();
    await parkingStatus.click();

    // 5. Verify that WineryQnA shows fallback text when no reviews are found
    const qnaSection = modal.locator('div.space-y-4.pt-2');
    await expect(qnaSection).toBeVisible();

    const qnaSelectTrigger = qnaSection.getByTestId('qna-select');
    await expect(qnaSelectTrigger).toContainText(/Is there free parking\?/i);

    await expect(qnaSection.getByText(/No mention of this in the reviews/i)).toBeVisible();
  });

  test('Cycling through multiple reviews and expanding a review (with Reviews Enrichment)', async ({ page }) => {
    // 1. Navigate to Explore and open 'The Phantom Cellar'
    await navigateToTab(page, 'Explore');
    await openWineryDetails(page, 'The Phantom Cellar');

    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    // 2. Expand "Logistics & Accessibility" and click "Outdoor"
    const accordionHeader = modal.getByRole('button', { name: /Logistics & Accessibility/i });
    await accordionHeader.click();
    const outdoorStatus = modal.getByTestId('status-unknown-outdoor');
    await outdoorStatus.click();

    const qnaSection = modal.locator('div.space-y-4.pt-2');
    await expect(qnaSection).toBeVisible();

    // 3. Verify the first review is displayed (as a snippet)
    const firstReviewText = /Loved the outdoor seating patio/i;
    await expect(qnaSection.getByText(firstReviewText)).toBeVisible();
    await expect(qnaSection.getByText(/John Doe/i)).toBeVisible();

    // 4. Expand the first review
    const expandButton = qnaSection.getByTestId('toggle-full-review');
    await expect(expandButton).toContainText(/Show full review/i);
    await expandButton.click();
    
    // Verify it now shows "Show less" and the full text (which includes the hard-to-park part)
    await expect(expandButton).toContainText(/Show less/i);
    await expect(qnaSection.getByText(/parking is a bit hard/i)).toBeVisible();

    // 5. Load the next review
    const loadMoreButton = qnaSection.getByTestId('load-another-review');
    await expect(loadMoreButton).toBeVisible();
    await loadMoreButton.click();

    // 6. Verify the second review is displayed
    const secondReviewText = /really enjoyed the outdoor atmosphere/i;
    await expect(qnaSection.getByText(secondReviewText)).toBeVisible();
    await expect(qnaSection.getByText(/Jane Smith/i)).toBeVisible();
    
    // Verify "1 of 2" indicator is now "2 of 2" (Wait, the component says "activeReviewIndex + 1 of searchResults.length")
    await expect(qnaSection.getByText(/2 of 2/i)).toBeVisible();

    // 7. Verify "No other relevant reviews found" is displayed after the last review
    await expect(loadMoreButton).not.toBeVisible();
    await expect(qnaSection.getByText(/No other relevant reviews found/i)).toBeVisible();
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
    
    // We need to trigger the modal for 'ch-v1-data'. 
    // Since it's not in the map markers, we might need to search or use a trick.
    // Let's just use openWineryDetails which uses the name.
    // But we didn't add it to markers.
    // Let's add it to markers for this test.
    await page.evaluate(() => {
        const winery = {
            id: 'ch-v1-data',
            name: 'V1 Data Winery',
            latitude: 42.7,
            longitude: -76.9,
            address: 'V1 St',
            enrichment_tier: 'enriched',
            reviews: [] // Will be populated by the mocked edge function
        };
        (window as any).useWineryDataStore.getState().upsertWinery(winery);
    });

    await openWineryDetails(page, 'V1 Data Winery');

    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    // 3. Select "Outdoor" in Q&A
    const qnaSection = modal.locator('div.space-y-4.pt-2');
    await expect(qnaSection).toBeVisible();
    
    const qnaSelect = qnaSection.getByTestId('qna-select');
    await qnaSelect.click();
    await page.getByRole('option', { name: /Is there outdoor seating\?/i }).click();

    // 4. Verify the review text is extracted correctly from the V1 object
    await expect(qnaSection.getByText(/has outdoor seating/i)).toBeVisible();
    await expect(qnaSection.getByText(/V1 Author/i)).toBeVisible();
  });
});
