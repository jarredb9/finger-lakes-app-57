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

### 2. The Last Registered Wins Rule
Playwright evaluates routes in the **reverse order** of registration (the last one registered has the highest priority).
- **Pitfall:** If a broad "Wallet Guard" is registered first, and a later specific mock fails to match perfectly, the request will leak through rather than falling back to the guard.
- **Rule:** Register broad "failsafe" patterns as the very **last** route if using multiple `context.route` calls.

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
