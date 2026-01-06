import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, TestUser, mockGoogleMapsApi } from './utils';
import { login, navigateToTab, getSidebarContainer } from './helpers';

// Define helper directly in the test file to avoid bundling issues
const createDummyImage = (): Buffer => {
  return Buffer.from(
    'iVBORw0KGgoAAAANghjYAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
};

test.describe('Photo Management Workflow', () => {
  let user: TestUser;
  const dummyImage = createDummyImage(); // Create once for the test suite

  test.beforeEach(async ({ page }) => {
    user = await createTestUser();
    await mockGoogleMapsApi(page);
    
    // CRITICAL: Override mocks to use real Supabase interactions (Last registered wins)
    await page.route(/\/rpc\/log_visit/, async route => await route.continue());
    await page.route(/\/rpc\/update_visit/, async route => await route.continue());
    await page.route(/\/rpc\/delete_visit/, async route => await route.continue());

    await login(page, user.email, user.password);
  });

  test.afterEach(async () => {
    if (user) await deleteTestUser(user.id);
  });

  test('should successfully add and then delete a photo when logging a new visit', async ({ page }) => {
    // 1. Navigate to Winery & Open Modal
    await navigateToTab(page, 'Explore');
    const sidebar = getSidebarContainer(page);
    
    // Ensure search results are loaded
    await expect.poll(async () => {
        return await page.evaluate(() => (window as any).useMapStore?.getState().isSearching);
    }, { timeout: 10000 }).toBe(false);

    const wineryCard = sidebar.locator('[data-testid="winery-card"]').first();
    await expect(wineryCard).toBeVisible({ timeout: 15000 });
    await wineryCard.click();
    
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    // 2. Log New Visit with Photo
    // Note: The form is already visible in the modal.

    await page.getByLabel('Visit Date').fill(new Date().toISOString().split('T')[0]);
    await page.locator('svg[aria-label="Set rating to 5"]').click();
    
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('label[for="dropzone-file"]').click();
    const fileChooser = await fileChooserPromise;
    
    await fileChooser.setFiles({
      name: 'test-photo.png',
      mimeType: 'image/png',
      buffer: dummyImage,
    });

    // Assert that the preview appears
    await expect(page.locator('img[alt="Preview 1"]')).toBeVisible();

    // Set up listener BEFORE clicking save
    const logVisitPromise = page.waitForResponse(response => 
        response.url().includes('/rpc/log_visit') && response.status() === 200
    );

    await page.getByRole('button', { name: 'Add Visit' }).click();

    // Wait for network success
    await logVisitPromise;

    // 3. Verify Photo Path in Store State (Direct Assertion)
    // Wait for the visit to be processed, added to the store, AND for the blob URL to be replaced by the server path
    await expect.poll(async () => {
        return await page.evaluate((userId) => {
            const dataStore = (window as any).useWineryDataStore;
            const userVisits = dataStore?.getState().persistentWineries.flatMap((w: any) => w.visits || []).filter((v: any) => v.user_id === userId);
            
            // Find the most recent visit that has photos AND the photo is not a blob (optimistic)
            return userVisits?.find((v: any) => v.photos && v.photos.length > 0 && !v.photos[0].startsWith('blob:'));
        }, user.id);
    }, {
        message: 'Expected to find a visit with a confirmed (non-blob) photo URL in the store.',
        timeout: 30000 
    }).toBeTruthy();

    const photoPath = await page.evaluate((userId) => {
        const dataStore = (window as any).useWineryDataStore;
        const userVisits = dataStore?.getState().persistentWineries.flatMap((w: any) => w.visits || []).filter((v: any) => v.user_id === userId);
        const latestVisit = userVisits?.sort((a: any, b: any) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime())[0];
        return latestVisit?.photos?.[0]; // Get the first photo path of the latest visit
    }, user.id); // Pass user.id here

    expect(photoPath).toMatch(new RegExp(`${user.id}/[a-f0-9-]{36}/\\d+-test-photo.png`));
    
    // Optional: Further UI assertion (since we know the data is there)
    // The image should eventually appear in the UI, if the PhotoCard works correctly.
    await expect(modal.locator('img[alt="Visit photo"]').first()).toBeVisible({ timeout: 5000 });

    // ---------------------------------------------------------
    // NEW: Delete Photo Workflow
    // ---------------------------------------------------------

    // 4. Find the visit card and click Edit
    // The visit card should be in the "Your Visits" section
    const visitCard = modal.locator('[data-testid="visit-card"]').first();
    await expect(visitCard).toBeVisible();
    
    await visitCard.getByLabel('Edit visit').click();

    // 5. Wait for Form to switch to Edit Mode
    const form = modal.locator('text="Edit Visit"');
    await expect(form).toBeVisible();

    // 6. Locate the photo in the form (PhotoUploader) and click Delete
    // Note: When editing, photos move from the card to the form
    const photoInForm = modal.locator('img[alt="Visit photo"]');
    await expect(photoInForm).toBeVisible();
    
    // Find the container of the photo to get the delete button
    const photoContainer = photoInForm.locator('..');
    const deleteButton = photoContainer.locator('button').first();
    
    await deleteButton.click();

    // 7. Verify visual feedback (Opacity check for deletion marker)
    await expect(photoInForm).toHaveClass(/opacity-40/);

    // 8. Save Changes
    const updateVisitPromise = page.waitForResponse(response => 
        response.url().includes('/rpc/update_visit') && response.status() === 200
    );

    await page.getByRole('button', { name: 'Save Changes' }).click();
    await updateVisitPromise;

    // 9. Verify Photo Removal in Store State
    await expect.poll(async () => {
        return await page.evaluate((userId) => {
            const dataStore = (window as any).useWineryDataStore;
            const userVisits = dataStore?.getState().persistentWineries.flatMap((w: any) => w.visits || []).filter((v: any) => v.user_id === userId);
            const latestVisit = userVisits?.sort((a: any, b: any) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime())[0];
            const photos = latestVisit?.photos;
            return !photos || photos.length === 0;
        }, user.id);
    }, {
        message: 'Expected visit photos to be empty or null after deletion.',
        timeout: 10000 
    }).toBe(true);

    // 10. Verify Photo Removal in UI (Visit Card)
    // The edit mode should close, and the visit card should reappear without photos
    await expect(modal.locator('text="Add New Visit"')).toBeVisible(); // Form reset
    await expect(visitCard.locator('img[alt="Visit photo"]')).toBeHidden();

  });
});
