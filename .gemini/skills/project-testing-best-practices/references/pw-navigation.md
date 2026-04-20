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

### 4. Why this is Senior-Level:
1.  **Resilience:** Your tests no longer break when the Sidebar, Header, or Bottom Nav are refactored.
2.  **Debugging:** When a test fails, you know the failure is in the *feature logic*, not in the "Login" infrastructure.
3.  **Developer Experience:** Running a 5-second test suite makes for a 10x faster development loop.
