import { test, expect } from './utils';
import { login, navigateToTab, getSidebarContainer, clearServiceWorkers } from './helpers';

test.describe('DatePicker UX', () => {
  test.beforeEach(async ({ page }) => {
    await clearServiceWorkers(page);
  });

  test('Desktop: should open popover and close on date selection', async ({ page, user }) => {
    await login(page, user.email, user.password);
    await navigateToTab(page, 'Explore');

    await test.step('Open Winery Modal', async () => {
        const sidebar = getSidebarContainer(page);
        const firstWinery = sidebar.getByTestId('winery-card-Mock Winery One').first();
        await expect(firstWinery).toBeVisible({ timeout: 15000 });
        await firstWinery.scrollIntoViewIfNeeded();
        await firstWinery.click();
        await expect(page.getByRole('dialog')).toBeVisible();
    });

    await test.step('Open DatePicker Popover', async () => {
        const datePickerBtn = page.getByTestId('datepicker-trigger');
        await datePickerBtn.click();
        // Desktop uses Popover - DayPicker v9 uses role="grid"
        await expect(page.getByRole('grid')).toBeVisible();
    });

    await test.step('Select Date and Verify Auto-Close', async () => {
        // Select today's date - react-day-picker v9 structure
        const todayCell = page.locator('td[data-today="true"] button').first();
        await todayCell.click();

        // Popover should close
        await expect(page.getByRole('grid')).not.toBeVisible();
        
        // Button should show selected date (partial match for year)
        const datePickerBtn = page.getByRole('button', { name: /2026/ });
        await expect(datePickerBtn).toBeVisible();
    });

    // Cleanup: Close modal
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('Mobile: should open drawer and close on date selection', async ({ page, user }) => {
    // Use Mobile Chrome viewport size BEFORE login so the app handles mobile shell correctly
    await page.setViewportSize({ width: 393, height: 851 });
    
    await login(page, user.email, user.password);

    // navigateToTab is handled by login() on mobile, but we call it explicitly to be certain
    await navigateToTab(page, 'Explore');

    await test.step('Open Winery Modal', async () => {
        const sidebar = getSidebarContainer(page);
        const firstWinery = sidebar.getByTestId('winery-card-Mock Winery One').first();
        await expect(firstWinery).toBeVisible({ timeout: 15000 });
        await firstWinery.scrollIntoViewIfNeeded();
        await firstWinery.click();
        await expect(page.getByRole('dialog')).toBeVisible();
    });

    await test.step('Open DatePicker Drawer', async () => {
        const datePickerBtn = page.getByTestId('datepicker-trigger');
        await datePickerBtn.click();
        
        // Mobile uses Drawer which has a title
        await expect(page.getByText('Select a date')).toBeVisible();
        await expect(page.getByRole('grid')).toBeVisible();
    });

    await test.step('Select Date and Verify Auto-Close', async () => {
        const todayCell = page.locator('td[data-today="true"] button').first();
        await todayCell.click();

        // Drawer should close
        await expect(page.getByText('Select a date')).not.toBeVisible();
        
        // Button should show selected date
        const datePickerBtn = page.getByTestId('datepicker-trigger');
        await expect(datePickerBtn).toBeVisible();
    });
  });

  test('Desktop: should navigate months in the calendar', async ({ page, user }) => {
    await login(page, user.email, user.password);
    await navigateToTab(page, 'Trips');
    
    // Open New Trip modal to access DatePicker
    await page.getByRole('button', { name: /new trip/i }).click();
    const tripForm = page.getByTestId('trip-form-card');
    await expect(tripForm).toBeVisible();
    await expect(tripForm).toHaveAttribute('data-state', 'ready');

    await tripForm.getByTestId('datepicker-trigger').click();
    const calendar = page.locator('.rdp').or(page.locator('[role="grid"]').locator('xpath=..')).first();
    await expect(calendar).toBeVisible();

    const monthLabel = calendar.locator('[aria-live="polite"]').first();
    const initialMonth = await monthLabel.innerText();

    // Navigate to next month
    const nextBtn = page.locator('.absolute.right-1.top-1').first();
    await nextBtn.click();

    await expect(async () => {
        const currentMonth = await monthLabel.innerText();
        if (!currentMonth || currentMonth === initialMonth) {
            throw new Error('Month did not change');
        }
    }).toPass();

    const finalMonth = await monthLabel.innerText();
    expect(finalMonth).not.toBe(initialMonth);
  });
});
