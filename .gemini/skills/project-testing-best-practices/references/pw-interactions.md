---
title: Stable Playwright Interactions
impact: HIGH
impactDescription: Eliminates brittle workarounds, forces hydration fixes
tags: playwright, interactions, click, hydration
---

## Stable Playwright Interactions

In a healthy architecture, standard Playwright `.click()` should always work. However, in the current RHEL 8 / WebKit containerized environment, `robustClick` remains necessary for reliable Radix/Shadcn trigger activation.

### 1. The Reality of `robustClick`
While standard `.click()` is preferred, `robustClick()` is the current project standard for interacting with complex Radix primitives (Dialogs, Selects) to bypass hydration-related event drops.
- **Side Effect:** `robustClick` dispatches multiple synthetic events (`pointerdown`, `mousedown`, etc.).
- **The Synchronous Guard Rule:** Because React's `useState` updates (`setIsSubmitting`) are asynchronous, they cannot block rapid event sequences. Components MUST use a `useRef` guard synchronously at the start of submission handlers.

```typescript
// Correct pattern: Component-side protection
const submissionGuard = useRef(false);

const handleSave = async () => {
  if (submissionGuard.current) return;
  submissionGuard.current = true;
  try {
    await saveAction();
  } finally {
    submissionGuard.current = false;
  }
};
```

### 2. Interaction Readiness Guards
Every critical UI action must implement a "Readiness Gate."
- **Standard:** Use `data-testid` and `data-state` attributes to verify an element is interactive before clicking.
- **Loading States:** Verify that loading spinners are GONE before attempting to click a "Save" or "Submit" button.

### 3. Modal Closure & State Verification
Closing a modal (especially singletons) is a high-risk transition.
- **Standard:** E2E helpers MUST verify both DOM visibility and Store state (`isModalOpen: false`).
- **Retry Logic:** Use `toPass` to retry the close action (click/Escape) if the store does not update within the first 2 seconds.

### 4. Toast & Overlay Blocking
Toast notifications (Radix/Shadcn Toaster) can physically block pointer events. 
- **Rule:** If an interaction fails only on mobile or after a previous success, check for a visible Toast. 
- **Standard:** Explicitly dismiss the toast or wait for it to hide before the next action.

### 5. DOM Assertions vs. Store Assertions
- **DOM Assertions (UX):** Use these to verify that the user *sees* what they expect.
- **Store Assertions (Logic):** Use `page.evaluate` to verify that the internal state changed. Store assertions are 100x more stable and should be used as the primary gate for complex logic verification.

```typescript
// Correct pattern: Verify logic in store, then UX in DOM
await page.click('[data-testid="save-btn"]');
expect(await page.evaluate(() => useTripStore.getState().isSaving)).toBe(false);
await expect(page.getByText('Saved!')).toBeVisible();
```
