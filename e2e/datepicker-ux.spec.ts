import { test, expect } from './utils';
import { login, navigateToTab, getSidebarContainer } from './helpers';

test.describe('DatePicker UX', () => {
  test('Desktop: should open popover and close on date selection', async ({ page, user }) => {
    await login(page, user.email, user.password);
    await navigateToTab(page, 'Explore');

    await test.step('Open Winery Modal', async () => {
        const sidebar = getSidebarContainer(page);
        const firstWinery = sidebar.locator('text=Mock Winery One').first();
        await expect(firstWinery).toBeVisible({ timeout: 15000 });
        await firstWinery.scrollIntoViewIfNeeded();
        await firstWinery.click();
        await expect(page.getByRole('dialog')).toBeVisible();
    });

    await test.step('Open DatePicker Popover', async () => {
        const datePickerBtn = page.getByRole('button', { name: 'Pick a date' });
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
  });

  test('Mobile: should open drawer and close on date selection', async ({ page, user }) => {
    // Use Mobile Chrome viewport size
    await page.setViewportSize({ width: 393, height: 851 });
    
    await login(page, user.email, user.password);
    await navigateToTab(page, 'Explore');

    await test.step('Open Winery Modal', async () => {
        const sidebar = getSidebarContainer(page);
        const firstWinery = sidebar.locator('text=Mock Winery One').first();
        await expect(firstWinery).toBeVisible({ timeout: 15000 });
        await firstWinery.scrollIntoViewIfNeeded();
        await firstWinery.click();
        await expect(page.getByRole('dialog')).toBeVisible();
    });

    await test.step('Open DatePicker Drawer', async () => {
        const datePickerBtn = page.getByRole('button', { name: 'Pick a date' });
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
        const datePickerBtn = page.getByRole('button', { name: /2026/ });
        await expect(datePickerBtn).toBeVisible();
    });
  });
});
