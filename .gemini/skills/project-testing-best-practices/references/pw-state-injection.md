---
title: Atomic State Injection
impact: CRITICAL
impactDescription: 10x faster tests, eliminates navigation-based flakiness
tags: playwright, zustand, stores, state-injection
---

## Atomic State Injection

Traditional E2E tests are "Long-Chain" (Login -> Sidebar -> Click -> Wait). A single failure in the sidebar breaks the unrelated Trip Sharing test. **Standard:** 90% of feature tests MUST use `page.evaluate` to inject store state directly.

**Incorrect (Fragile Navigation Chain):**
```typescript
test('Invite Friend', async ({ page }) => {
  await login(page, user.email, user.pass); // 15s
  await navigateToTab(page, 'Friends');     // 5s
  await page.click('button:has-text("Add Friend")'); // 2s
  // ... test continues
});
```

**Correct (Atomic State Injection):**
```typescript
test('Invite Friend', async ({ page }) => {
  // 1. Jump straight to the authorized state
  await page.goto('/friends'); 
  await page.evaluate((user) => {
    window.useUserStore.getState().setUser(user);
    window.useFriendStore.getState().setFriends([ /* mock friends */ ]);
  }, mockUser);

  // 2. Trigger the feature directly
  await page.evaluate(() => window.useUIStore.getState().openShareDialog('id', 'name'));

  // 3. Verify the DOM
  await expect(page.getByTestId('trip-share-dialog')).toBeVisible();
});
```

### Why this is Senior-Level:
1.  **Isolation:** If the "Login" page breaks, this test still passes. You only test what the file name says you are testing.
2.  **Speed:** You skip 20 seconds of unnecessary hydration and animations.
3.  **Reliability:** You eliminate the "Race Condition" between the Sidebar rendering and the user clicking.

### Requirements for Injection:
- The target store MUST be exposed to `window` (standardized in `GEMINI.md`).
- The test MUST call `page.goto('/')` or a valid route before injecting to establish the origin.
- Stores using `persist` middleware MUST have persistence disabled in E2E mode to prevent stale data from overwriting injected state.
