---
title: Singleton Modal Verification
impact: HIGH
impactDescription: Eliminates state loss and ARIA conflicts in global dialogs
tags: modals, singletons, zustand, testing
---

## Singleton Modal Verification

Major feature dialogs (Sharing, Forms, Notes) are implemented as global singletons in `layout.tsx`. Do NOT render dialogs locally inside list items or deeply nested components.

### 1. The Store-First Rule (Jest)
When testing a component that triggers a global modal, do NOT check the local DOM for the dialog. Verify the UI store call instead.
- **Incorrect:** `expect(screen.getByRole('dialog')).toBeInTheDocument()` (The dialog isn't in this component's DOM).
- **Correct:** 
```typescript
const openShareDialog = jest.fn();
jest.mock('@/lib/stores/uiStore', () => ({
  useUIStore: () => ({ openShareDialog })
}));
// ... trigger action
expect(openShareDialog).toHaveBeenCalledWith(tripId);
```

### 2. The Persistence Rule
**NEVER** persist transient UI flags (modal visibility) in Zustand's `persist` middleware. This causes race conditions during hydration where the dialog "remembers" it was open from a previous failed session.

## Singleton Modal Verification (Playwright)

### 1. The Modal Cleanup Rule
Sequential actions involving the same singleton modal (e.g., logging two visits in a row) MUST wait for the previous instance to be fully unmounted from the DOM and cleared from the Store.
- **Problem:** If the Store is updated to `isModalOpen: true` while the previous modal is still in its "closing" animation state, the trigger may be ignored or the state may be immediately overwritten by the completion of the close animation.
- **Standard:** Use a `toPass` block to verify the store is `false` before returning from a helper that closes a modal.

```typescript
// Correct pattern for a modal-closing helper
export async function submitForm(page: Page) {
    await robustClick(page, submitBtn);
    
    // 1. Wait for Store to reflect closed state
    await expect(async () => {
        const isOpen = await page.evaluate(() => window.useUIStore.getState().isModalOpen);
        if (isOpen) throw new Error('Modal still open in store');
    }).toPass({ timeout: 5000 });

    // 2. Wait for DOM unmounting
    await expect(modalLocator).not.toBeVisible();
}
```

### 2. The Auto-Focus Trap
WebKit often steals focus when a singleton modal opens, which can cause subsequent Playwright locators to fail if they rely on the previous focus state.
- **Rule:** Use `onOpenAutoFocus={(e) => e.preventDefault()}` in the `DialogContent` of singleton modals to ensure stable E2E testing environments.

Reference: [Zustand Persistence](https://docs.pmnd.rs/zustand/integrations/persisting-store-data)
