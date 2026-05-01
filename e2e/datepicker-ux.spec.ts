import { test, expect } from './utils';
import { login, navigateToTab, openWineryDetails, ensureSidebarExpanded, clearServiceWorkers } from './helpers';

test.describe('DatePicker UX', () => {
  test.beforeEach(async ({ page }) => {
    await clearServiceWorkers(page);
  });

  test('should open picker and close on date selection', async ({ page, user }) => {
    await login(page, user.email, user.password);
    await navigateToTab(page, 'Explore');

    const isMobile = page.viewportSize()!.width < 768;

    await test.step('Open Winery Modal', async () => {
        if (isMobile) {
            await ensureSidebarExpanded(page);
        }
        await openWineryDetails(page, 'Mock Winery One');
    });

    await test.step('Open DatePicker', async () => {
        const datePickerBtn = page.getByTestId('datepicker-trigger');
        await expect(datePickerBtn).toHaveAttribute('data-state', 'ready');
        
        // Ensure UI is settled after any animations
        await page.waitForTimeout(1000);
        await datePickerBtn.click();
        
        // Wait for animation
        await page.waitForTimeout(500);

        if (isMobile) {
            await expect(page.getByText('Select a date')).toBeVisible();
        }
        
        const calendar = page.getByTestId('datepicker-calendar');
        await expect(calendar).toBeVisible();
        await expect(calendar.getByRole('grid')).toBeVisible();
    });

    await test.step('Select Date and Verify Auto-Close', async () => {
        const calendar = page.getByTestId('datepicker-calendar');
        // Select today's date (or at least a valid cell)
        // DayPicker v9 uses full date strings for accessible names
        const todayCell = calendar.getByRole('gridcell', { name: /1/ }).first();
        await todayCell.click();

        // Picker should close
        if (isMobile) {
            await expect(page.getByText('Select a date')).not.toBeVisible();
        } else {
            await expect(page.getByTestId('datepicker-calendar')).not.toBeVisible();
        }
        
        // Button should show selected date
        const datePickerBtn = page.getByTestId('datepicker-trigger');
        await expect(datePickerBtn).toBeVisible();
    });
  });

  test('should navigate months in the calendar', async ({ page, user }) => {
    await login(page, user.email, user.password);
    await navigateToTab(page, 'Trips');
    
    const isMobile = page.viewportSize()!.width < 768;

    // Open New Trip modal
    const newTripBtn = page.getByRole('button', { name: /new trip/i });
    await expect(newTripBtn).toBeVisible();
    await newTripBtn.click();
    
    const tripForm = page.getByTestId('trip-form-card');
    await expect(tripForm).toBeVisible();
    await expect(tripForm).toHaveAttribute('data-state', 'ready');

    const datePickerBtn = tripForm.getByTestId('datepicker-trigger');
    await expect(datePickerBtn).toHaveAttribute('data-state', 'ready');
    
    // Ensure UI is settled
    await page.waitForTimeout(1000);
    await datePickerBtn.click();
    
    // Wait for animation
    await page.waitForTimeout(500);

    const calendar = page.getByTestId('datepicker-calendar');
    await expect(calendar).toBeVisible();

    const monthLabel = calendar.locator('[role="status"]');
    
    // We use toPass to ensure we read the label after it potentially hydrates/updates
    let initialMonth = "";
    await expect(async () => {
        initialMonth = await monthLabel.innerText();
        if (!initialMonth) throw new Error("Month label not yet populated");
    }).toPass();
    
    console.log(`[DIAGNOSTIC] Initial Month: "${initialMonth}"`);

    // Navigate to next month
    const nextBtn = page.getByLabel(/Go to (the )?Next Month/i);
    await nextBtn.click({ force: isMobile });

    await expect(async () => {
        const currentMonth = await monthLabel.innerText();
        if (!currentMonth || currentMonth === initialMonth || currentMonth === 'Select a date') {
            throw new Error(`Month did not change. Current: "${currentMonth}", Initial: "${initialMonth}"`);
        }
    }).toPass();

    const finalMonth = await monthLabel.innerText();
    expect(finalMonth).not.toBe(initialMonth);

    // Navigate back
    const prevBtn = page.getByLabel(/Go to (the )?Previous Month/i);
    await prevBtn.click({ force: isMobile });

    await expect(async () => {
        const backMonth = await monthLabel.innerText();
        if (!backMonth || backMonth === finalMonth || backMonth === 'Select a date') {
            throw new Error(`Month did not return. Current: "${backMonth}", Final: "${finalMonth}"`);
        }
    }).toPass();
  });
});
