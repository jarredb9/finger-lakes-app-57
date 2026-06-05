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
});
