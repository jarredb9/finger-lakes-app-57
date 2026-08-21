---
title: Atomic Playwright Navigation
impact: CRITICAL
impactDescription: Eliminates 80% of test overhead, stops hydration race conditions
tags: playwright, navigation, hydration, state-injection
---

## Atomic Playwright Navigation

Standard navigation (`page.goto`) followed by manual UI interaction is **DEPRECATED** for feature verification. Use **State Injection** to jump directly to the target UI state.

### 1. The "State-First" Standard
Tests MUST prioritize state injection over manual navigation chains.
- **Goal:** Verify the *logic* of the feature, not the ability of the browser to click a sidebar.
- **Implementation:** Use `page.evaluate` to populate Zustand stores before the first interaction.

**Incorrect (Fragile Chain):**
```typescript
await login(page); 
await navigateToTab(page, 'Trips');
await page.click('text=My Trip'); // Fails if hydration is slow
```

**Correct (Atomic Injection):**
```typescript
await page.goto('/trips'); 
await page.evaluate((trip) => {
  window.useTripStore.getState().setTrips([trip]);
  window.useTripStore.getState().setSelectedTrip(trip);
}, mockTrip);
// The UI is now immediately in the correct state
```

### 2. When to use `navigateToTab`
Manual navigation helpers (like `navigateToTab`) are restricted to **Smoke Tests** and **Integration Flows** only.
- **Rule:** If you are testing a specific button inside a modal, do NOT use `navigateToTab`. Use state injection to open the modal directly.

### 3. Hydration Readiness
If navigation is strictly required, you MUST verify the "Interaction Readiness" of the page before proceeding.
- **Gate:** Use `expect(page.locator('body')).toHaveAttribute('data-hydrated', 'true')` or `waitForSignal(page, 'container-id', 'ready')` before the first click.

### 4. Click & Navigation Race Conditions (toPass Anti-Pattern)
Do **NOT** wrap both a click interaction that initiates a page navigation (e.g. login submit, tab click) and the subsequent page transition check inside a single `toPass` retry loop.
- **Problem:** If navigation takes longer than the retry interval, `toPass` retries and performs the interaction a second time. This can cause duplicate API requests, cancel ongoing client-side transitions, or trigger severe context-destruction deadlocks (e.g. `page.evaluate()` hanging for 30s in Firefox when called during page teardown).
- **Standard:** Trigger the interaction exactly once, and await the URL/DOM transition deterministically.

**Incorrect:**
```typescript
await expect(async () => {
    await submitLoginForm(page, email, pass);
    await page.waitForTimeout(500);
    const user = await page.evaluate(() => useUserStore.getState().user);
    if (!user) throw new Error('Still waiting');
}).toPass({ timeout: 20000, intervals: [2000] });
```

**Correct:**
```typescript
await submitLoginForm(page, email, pass);
await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000, waitUntil: 'commit' });
await waitForAppReady(page);
```

### 5. Next.js App Router SPA Navigation (`waitUntil: 'commit'`)
Next.js App Router client navigation (`router.push`) updates session history via `history.pushState` without firing a full document `load` event.
- **Problem:** Playwright's `page.waitForURL` defaults `waitUntil` to `'load'`. When waiting for a client-side route change, the assertion may wait indefinitely for a window `load` event that never fires.
- **Standard:** Always specify `{ waitUntil: 'commit' }` when awaiting URL transitions initiated by client-side router pushes.

### 6. Why this is Senior-Level:
1.  **Resilience:** Your tests no longer break when the Sidebar, Header, or Bottom Nav are refactored.
2.  **Debugging:** When a test fails, you know the failure is in the *feature logic*, not in the "Login" infrastructure.
3.  **Developer Experience:** Running a 5-second test suite makes for a 10x faster development loop.
