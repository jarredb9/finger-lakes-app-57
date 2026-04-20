---
title: Stable Playwright Interactions
impact: HIGH
impactDescription: Eliminates brittle workarounds, forces hydration fixes
tags: playwright, interactions, click, hydration
---

## Stable Playwright Interactions

In a healthy architecture, standard Playwright `.click()` should always work. The project mandates standard Playwright `.click()` for all interactions, supported by `data-testid` and `useRef` synchronous guards in the components.

### 2. Submission Gate Rules
E2E helpers MUST NOT click a submission button (Save, Delete, Log) if the store's "isSaving" state is true.
- **Problem:** Clicking a disabled button during a database mutation causes locator timeouts.
- **Standard:** Use `page.evaluate(() => useVisitStore.getState().isSavingVisit)` as a guard before the final click.

### 3. Interaction Readiness Guards
Every critical UI action must implement a "Readiness Gate."
- **Standard:** Use `data-testid` and `data-state` attributes to verify an element is interactive before clicking.
- **Loading States:** Verify that loading spinners are GONE before attempting to click a "Save" or "Submit" button.

### 4. Modal Closure & State Verification
Closing a modal (especially singletons) is a high-risk transition.
- **Standard:** E2E helpers MUST verify both DOM visibility and Store state (`isModalOpen: false`).
- **Retry Logic:** Use `toPass` to retry the close action (click/Escape) if the store does not update.
- **Fallback:** If the close button is hidden by an overlay or toast, use `page.keyboard.press('Escape')`.

### 5. Toast & Overlay Blocking
Toast notifications (Radix/Shadcn Toaster) can physically block pointer events. 
- **Rule:** If an interaction fails only on mobile or after a previous success, check for a visible Toast. 
- **Standard:** Explicitly dismiss the toast or wait for it to hide before the next action.

### 6. Action Delegation Pattern
UI components (Cards) MUST NOT own complex flows like "Delete Confirmation" or "Sharing Dialogs." They MUST only emit "Intent" events via props.
- **Testing Impact:** Feature tests should verify that clicking a card action (e.g., Delete) triggers the *expected signal* in the Container, rather than testing the internal state of the card.
- **Verification:** Use `page.evaluate` to verify that the container's state reflects the intended action (e.g., `activeTripToDelete` is set).

### 7. DOM Assertions vs. Store Assertions
- **DOM Assertions (UX):** Use these to verify that the user *sees* what they expect.
- **Store Assertions (Logic):** Use `page.evaluate` to verify that the internal state changed. Store assertions are 100x more stable and should be used as the primary gate for complex logic verification.

```typescript
// Correct pattern: Verify logic in store, then UX in DOM
await page.click('[data-testid="save-btn"]');
expect(await page.evaluate(() => useTripStore.getState().isSaving)).toBe(false);
await expect(page.getByText('Saved!')).toBeVisible();
```
