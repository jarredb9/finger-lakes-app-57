---
title: Multi-Context Playwright Mocking
impact: HIGH
impactDescription: Prevents inconsistent state between tabs and contexts
tags: playwright, mocking, multi-context, sync
---

## Multi-Context Playwright Mocking

Shared state in Playwright requires centralized mock management to ensure actions in one tab reflect in another after a store refresh.

**Incorrect (Local state mocking):**

```typescript
// Brittle: other tabs/contexts won't see this trip
const myTrip = { id: 1, name: 'Local Trip' };
await page.route('**/rpc/get_trips', (route) => route.fulfill({ body: [myTrip] }));
```

**Correct (Shared global state):**

```typescript
import { sharedMockTrips, initDefaultMocks } from './utils';

// Centralized state management in e2e/utils.ts
sharedMockTrips.push({ id: 2, name: 'Global Trip' });

// Dynamic ownership ensures user IDs match throughout the flow
await initDefaultMocks({ currentUserId: user.id });
```

### 2. The Last Registered Wins Rule (Precedence)
Playwright evaluates routes in the **reverse order** of registration (LIFO) at the same level.
- **CRITICAL:** **Page-level routes (`page.route`) ALWAYS take precedence over context-level routes (`context.route`)**, regardless of registration order. 
- **Pitfall:** If a global fixture (like `e2e/utils.ts`) registers a `page.route('**/*')`, any `context.route` in your test will be **ignored**.
- **Rule:** For test-specific mocks that must override global fixtures, ALWAYS use `page.route`.


### 3. The Catch-All Proxy Pattern
For 100% reliable interception in WebKit, avoid multiple individual routes. Use a single `context.route('**/*', handler)` and dispatch internally. Use `route.fallback()` to allow specific tests to override global mocks.

```typescript
await context.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.includes('supabase.co')) {
        // EXPLICIT OVERRIDE: Let test-level interceptors handle this
        if (url.includes('log_visit')) {
            return route.fallback(); 
        }
        // Handle other Supabase calls...
        return route.fulfill({ ... });
    }
    return route.continue();
});
```

### 4. Zero-Tolerance Monitoring
Always monitor for leaks actively during development.
- **Standard:** Use `context.on('request', ...)` to log all external requests. If a request appears in these logs without a corresponding `[MOCK-HIT]` log from your handler, it has bypassed your mocks.

Reference: [Playwright API Mocking](https://playwright.dev/docs/network)
