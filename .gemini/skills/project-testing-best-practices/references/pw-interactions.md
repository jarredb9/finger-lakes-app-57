---
title: Robust Playwright Interactions
impact: HIGH
impactDescription: 10x more reliable mobile clicks and form inputs
tags: playwright, interactions, robust-click, mobile
---

## Robust Playwright Interactions

Mobile sheets and WebKit often fail simple `click()` events. Use `robustClick()` or a hybrid strategy to ensure full event dispatch and state stability.

### 1. Hybrid Click Strategy
For cross-engine stability (especially Chromium vs WebKit), standard Playwright clicks are sometimes more reliable for triggering React's event system if fired at the exact right moment, while `robustClick` is better for overcoming animation/z-index issues.
- **Pattern:** Attempt a `force: true` click, then verify the state change (e.g., Store update). If the state didn't change, fall back to `robustClick`.

```typescript
await btn.click({ force: true });
const isOpened = await page.evaluate(() => window.useUIStore.getState().isModalOpen);
if (!isOpened) {
    await robustClick(page, btn);
}
```

### 2. Toast & Overlay Blocking
Toast notifications (Radix/Shadcn Toaster) are rendered in a fixed-position viewport (`z-[100]`). In mobile viewports, these can physically block clicks on buttons in the top-right (like the Log Visit button) or top-center.
- **Rule:** If an interaction fails only on mobile or after a previous success, check for a visible Toast. 
- **Standard:** Explicitly dismiss the toast or wait for it to hide before the next action.

```typescript
// Incorrect: Clicking while a success toast is still visible
await robustClick(page, logVisitBtn); // Click is eaten by the toast overlay

// Correct: Dismiss toast first
await page.getByRole('button', { name: /Close/i }).click();
await robustClick(page, logVisitBtn);
```

### 3. Scroll-to-Interaction
WebKit/Safari on mobile often reports elements as "visible" but fails to dispatch events if they are partially off-screen or behind a translucent bar.
- **Rule:** Always call `scrollIntoViewIfNeeded()` before critical interaction points in long modals or sidebars.

Reference: [Playwright Clicks](https://playwright.dev/docs/input)
