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

Reference: [Zustand Persistence](https://docs.pmnd.rs/zustand/integrations/persisting-store-data)
