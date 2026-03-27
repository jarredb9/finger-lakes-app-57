---
title: Stable Playwright Interactions
impact: HIGH
impactDescription: Eliminates brittle workarounds, forces hydration fixes
tags: playwright, interactions, click, hydration
---

## Stable Playwright Interactions

In a healthy architecture, standard Playwright `.click()` should always work. Workarounds that manually dispatch DOM events are **DEPRECATED**.

### 1. The Death of `robustClick`
The use of `robustClick()` or manual `dispatchEvent` calls is now **FORBIDDEN** in new tests.
- **Why:** If a button requires 5 different events to be triggered manually, the UI is **Event Brittle**. This is usually caused by Radix/Shadcn components being interrupted by hydration flashes.
- **Action:** If a standard click fails, the agent MUST investigate the hydration state. Fix the DOM, don't patch the test.

**Incorrect (Defensive Workaround):**
```typescript
// PATCHING: Dispatches manual events to force a click
await robustClick(page, button); 
```

**Correct (Architectural Fix):**
```typescript
// FIXING: Wait for the UI to be ready, then use standard Playwright
await expect(button).toHaveAttribute('data-hydrated', 'true');
await button.click();
```

### 2. Interaction Readiness Guards
Every critical UI action must implement a "Readiness Gate."
- **Standard:** Use `data-testid` and `data-state` attributes to verify an element is interactive before clicking.
- **Loading States:** Verify that loading spinners are GONE before attempting to click a "Save" or "Submit" button.

### 3. Toast & Overlay Blocking
Toast notifications (Radix/Shadcn Toaster) can physically block pointer events. 
- **Rule:** If an interaction fails only on mobile or after a previous success, check for a visible Toast. 
- **Standard:** Explicitly dismiss the toast or wait for it to hide before the next action.

### 4. DOM Assertions vs. Store Assertions
- **DOM Assertions (UX):** Use these to verify that the user *sees* what they expect.
- **Store Assertions (Logic):** Use `page.evaluate` to verify that the internal state changed. Store assertions are 100x more stable and should be used as the primary gate for complex logic verification.

```typescript
// Correct pattern: Verify logic in store, then UX in DOM
await page.click('[data-testid="save-btn"]');
expect(await page.evaluate(() => useTripStore.getState().isSaving)).toBe(false);
await expect(page.getByText('Saved!')).toBeVisible();
```
