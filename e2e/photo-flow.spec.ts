import { test, expect } from './utils';
import { login, navigateToTab, getSidebarContainer, robustClick } from './helpers';

// Define helper directly in the test file to avoid bundling issues
const createDummyImage = (): Buffer => {
  return Buffer.from(
    'iVBORw0KGgoAAAANghjYAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
};

test.describe('Photo Management Workflow', () => {
  const dummyImage = createDummyImage(); // Create once for the test suite

  test.beforeEach(async ({ page, mockMaps, user }) => {
    // CRITICAL: Override mocks to use real Supabase interactions
    await mockMaps.useRealVisits();
    await login(page, user.email, user.password);
  });

  test('should successfully add and then delete a photo when logging a new visit', async ({ page, user }) => {
    // 1. Navigate to Winery & Open Modal
    await navigateToTab(page, 'Explore');
    const sidebar = getSidebarContainer(page);
    
    // Ensure search results are loaded
    await expect.poll(async () => {
        return await page.evaluate(() => (window as any).useMapStore?.getState().isSearching);
    }, { timeout: 10000 }).toBe(false);

    const wineryCard = sidebar.locator('[data-testid="winery-card"]').first();
    await expect(wineryCard).toBeVisible({ timeout: 15000 });
    await robustClick(wineryCard);
    
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    // 2. Log New Visit with Photo
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

    await robustClick(page.getByRole('button', { name: 'Add Visit' }));

    // Wait for network success
    await logVisitPromise;

    // 3. Verify Photo is visible in the UI and has a valid server URL (Not a blob)
    const visitPhoto = modal.locator('img[alt="Visit photo"]').first();
    await expect.poll(async () => {
        const src = await visitPhoto.getAttribute('src');
        // The URL should be from Supabase storage, not a local blob
        return src && !src.startsWith('blob:') && src.includes(user.id);
    }, {
        message: 'Expected visit photo to have a valid server-side URL.',
        timeout: 30000 
    }).toBeTruthy();

    await expect(visitPhoto).toBeVisible();

    // 4. Find the visit card and click Edit
    const visitCard = modal.locator('[data-testid="visit-card"]').first();
    await expect(visitCard).toBeVisible();
    
    await robustClick(visitCard.getByLabel('Edit visit'));

    // 5. Wait for Form to switch to Edit Mode
    await expect(modal.locator('text="Edit Visit"')).toBeVisible();

    // 6. Locate the photo in the form (PhotoUploader) and click Delete
    const photoInForm = modal.locator('img[alt="Visit photo"]');
    await expect(photoInForm).toBeVisible();
    
    const photoContainer = photoInForm.locator('..');
    const deleteButton = photoContainer.locator('button').first();
    await deleteButton.click();

    // 7. Verify visual feedback (Opacity check for deletion marker)
    await expect(photoInForm).toHaveClass(/opacity-40/);

    // 8. Save Changes
    const updateVisitPromise = page.waitForResponse(response => 
        response.url().includes('/rpc/update_visit') && response.status() === 200
    );

    await robustClick(page.getByRole('button', { name: 'Save Changes' }));
    await updateVisitPromise;

    // 9. Verify Photo Removal in UI (Visit Card)
    await expect(modal.locator('text="Add New Visit"')).toBeVisible(); // Form reset
    await expect(visitCard.locator('img[alt="Visit photo"]')).toBeHidden();
  });
});
