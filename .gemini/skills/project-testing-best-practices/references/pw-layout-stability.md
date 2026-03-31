---
title: Robust Layout & Coordinate Assertions
impact: HIGH
impactDescription: Eliminates "off-by-one" failures and emulation-based layout mismatches
tags: playwright, layout, coordinates, emulation, sub-pixel
---

## Robust Layout & Coordinate Assertions

Testing fixed-position elements (banners, toasts, consent bars) requires handling browser-specific rendering behaviors and emulation differences.

### 1. The Sub-Pixel Rendering Rule
WebKit and high-DPI emulators often report bounding box coordinates with small decimals (e.g., `-0.74` or `0.22`) instead of exact integers.
- **Incorrect:** `expect(box.y).toBe(0);`
- **Correct:** Use a small tolerance.
```typescript
const box = await element.boundingBox();
expect(box?.y).toBeLessThan(5); // Allows for sub-pixel offsets at the edge
expect(box?.x).toBeLessThan(5);
```

### 2. The Project Filtering Rule (Emulation Safety)
Playwright projects (e.g., `Mobile Safari`) emulate more than just viewport size (User Agent, touch support). Overriding viewports manually in a "Desktop" test on a "Mobile" project can cause the application to enter an inconsistent state where hydration logic looks for elements that don't exist.
- **Rule:** Explicitly skip layout-specific tests that don't match the project type.
- **Implementation:**
```typescript
test('Desktop Layout', async ({ page }) => {
  test.skip(test.info().project.name.toLowerCase().includes('mobile'), 'Desktop only');
  // ... test logic
});

test('Mobile Layout', async ({ page }) => {
  test.skip(!test.info().project.name.toLowerCase().includes('mobile'), 'Mobile only');
  // ... test logic
});
```

### 3. State-Dependent Element Verification
Elements like Cookie Consent or PWA Install Prompts often depend on `localStorage` flags or one-time events. 
- **Rule:** For tests requiring these elements to be visible, bypass high-level "auto-login" helpers that might set these flags (e.g., the `login` helper often sets `cookie-consent: true`).
- **Pattern:** Use `clearServiceWorkers` and manual login steps to verify "First Visit" UI components.

Reference: [Playwright Bounding Box](https://playwright.dev/docs/api/class-locator#locator-bounding-box)
