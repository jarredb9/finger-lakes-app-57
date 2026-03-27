import { test, expect } from './utils';
import { 
    login, 
    navigateToTab, 
    openWineryDetails, 
    closeWineryModal, 
    robustClick, 
    waitForMapReady,
    waitForToast
} from './helpers';

// Define helper directly in the test file to avoid bundling issues
const createDummyImage = (): Buffer => {
  // A valid 1x1 red PNG pixel
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
};

test.describe('Photo Management Workflow', () => {
  const dummyImage = createDummyImage(); // Create once for the test suite

  test.beforeEach(async ({ page, mockMaps, user }) => {
    // CRITICAL: Override mocks to use real Supabase interactions
    await mockMaps.useRealVisits();
    await mockMaps.initDefaultMocks({ currentUserId: user.id });
    await login(page, user.email, user.password);
  });

  test('should successfully add and then delete a photo when logging a new visit', async ({ page, user }) => {
    // 1. Navigate to Winery & Open Modal
    await navigateToTab(page, 'Explore');
    await waitForMapReady(page);
    await openWineryDetails(page, 'Mock Winery One');
    
    // 2. Open Log Visit modal
    await robustClick(page, page.getByTestId('log-visit-button'));

    // Wait for the UI store to reflect that the modal should be open
    await expect(async () => {
        const isModalOpen = await page.evaluate(() => {
            // @ts-ignore
            return !!(window.useUIStore?.getState().isModalOpen);
        });
        if (!isModalOpen) throw new Error('Visit modal not open in store');
    }).toPass({ timeout: 10000 });

    const modal = page.getByRole('dialog').filter({ hasText: /Log a Visit/i });
    await expect(modal).toBeVisible();

    // 2. Log New Visit with Photo
    // Use standardized date format
    const today = new Date().toISOString().split('T')[0];
    await page.getByLabel('Visit Date').fill(today);
    await robustClick(page, page.locator('svg[aria-label="Set rating to 5"]'));
    
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

    // Set up listener BEFORE clicking save - specifically for log_visit RPC
    const logVisitPromise = page.waitForResponse(response => 
        response.url().includes('/rpc/log_visit') && response.status() === 200
    );

    await robustClick(page, page.getByRole('button', { name: 'Add Visit' }));

    // Wait for network success
    await logVisitPromise;
    await waitForToast(page, 'Visit added successfully.');

    // 2.1 Wait for Visit Modal to close from store and DOM
    await expect(async () => {
        const isOpen = await page.evaluate(() => {
            // @ts-ignore
            return !!(window.useUIStore?.getState().isModalOpen);
        });
        if (isOpen) throw new Error('Modal still open in store');
    }).toPass({ timeout: 10000 });
    await expect(modal).not.toBeVisible({ timeout: 10000 });

    // 3. Verify Photo is visible in the UI (Winery Modal) and has a valid server URL
    const wineryModal = page.getByRole('dialog').filter({ hasText: /Mock Winery One/i });
    
    // We need to wait for the photo to be rendered and its signed URL to be loaded
    // PhotoCard shows a loader or "Photo unavailable" if it fails
    const visitPhoto = wineryModal.locator('img[alt="Visit photo"]').first();
    
    await expect(async () => {
        const isVisible = await visitPhoto.isVisible();
        if (!isVisible) throw new Error('Visit photo not visible yet');
        const src = await visitPhoto.getAttribute('src');
        if (!src || src.startsWith('blob:') || !src.includes(user.id)) {
            throw new Error(`Invalid photo src: ${src}`);
        }
        
        // Verify image is actually loaded and rendered
        const naturalWidth = await visitPhoto.evaluate((img: HTMLImageElement) => img.naturalWidth);
        if (naturalWidth === 0) throw new Error('Image failed to load or has 0 width');
    }).toPass({ timeout: 30000, intervals: [1000, 2000] });

    // 4. Find the visit card and click Edit
    const visitCard = wineryModal.locator('[data-testid="visit-card"]').first();
    await expect(visitCard).toBeVisible();
    
    await robustClick(page, visitCard.getByLabel('Edit visit'));

    // 5. Wait for Form to switch to Edit Mode (Singleton modal)
    await expect(async () => {
        const title = await page.evaluate(() => {
            // @ts-ignore
            return window.useUIStore?.getState().modalTitle;
        });
        if (title !== 'Edit Visit') throw new Error(`Wrong modal title: ${title}`);
    }).toPass({ timeout: 10000 });

    const editModal = page.getByRole('dialog').filter({ hasText: /Edit Visit/i });
    await expect(editModal).toBeVisible();

    // 6. Locate the photo in the form (PhotoUploader) and click Delete
    const photoInForm = editModal.locator('img[alt="Visit photo"]');
    await expect(photoInForm).toBeVisible();
    
    const photoContainer = photoInForm.locator('..');
    const deleteButton = photoContainer.locator('button').first();
    await robustClick(page, deleteButton);

    // 7. Verify visual feedback (Opacity check for deletion marker)
    await expect(photoInForm).toHaveClass(/opacity-40/);

    // 8. Save Changes
    const updateVisitPromise = page.waitForResponse(response => 
        response.url().includes('/rpc/update_visit') && response.status() === 200
    );

    await robustClick(page, editModal.getByRole('button', { name: 'Save Changes' }));
    await updateVisitPromise;
    await waitForToast(page, 'Visit updated successfully.');

    // 9. Verify Photo Removal in UI (Visit Card)
    await expect(async () => {
        const isOpen = await page.evaluate(() => {
            // @ts-ignore
            return !!(window.useUIStore?.getState().isModalOpen);
        });
        if (isOpen) throw new Error('Modal still open in store');
    }).toPass({ timeout: 10000 });
    await expect(editModal).not.toBeVisible(); 
    await expect(visitCard.locator('img[alt="Visit photo"]')).toBeHidden();
    
    await closeWineryModal(page);
  });
});
