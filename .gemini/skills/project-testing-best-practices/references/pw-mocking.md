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

### 2. User-Aware Profile Mocking
In multi-context tests (e.g., social or collaborative flows), the default `/rest/v1/profiles` mock MUST be bypassed to allow each context to receive its correct profile data.
- **Problem:** If both `pageA` and `pageB` receive the same "Test User" mock, `ensureProfileReady` will fail or stores will hydrate with incorrect data.
- **Standard:** Use `manager.useRealSocial()` to trigger the fallback for profile requests in `MockMapsManager`.
- **Implementation (Fixture):**
```typescript
const manager = new MockMapsManager(page);
await manager.useRealSocial(); // MUST be called before initDefaultMocks
await manager.initDefaultMocks({ currentUserId: user.id });
```

### 3. The Last Registered Wins Rule (Precedence)
Playwright evaluates routes in the **reverse order** of registration (LIFO) at the same level.
- **CRITICAL:** **Page-level routes (`page.route`) ALWAYS take precedence over context-level routes (`context.route`)**, regardless of registration order. 
- **Pitfall:** If a global fixture (like `e2e/utils.ts`) registers a `page.route('**/*')`, any `context.route` in your test will be **ignored**.
- **Rule:** For test-specific mocks that must override global fixtures, ALWAYS use `page.route`.


### 4. The Catch-All Proxy Pattern
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

### 5. Shared Mock State & Mutations
Collaborative tests require a single source of truth for mock data across multiple contexts.
- **Rule:** Use `static` properties in `MockMapsManager` (e.g., `sharedMockTrips`) to persist changes.
- **Stateful RPCs:** RPC interceptors for mutating actions (e.g., `create_trip`, `delete_trip`) MUST update the corresponding static state property. If the mock state is not updated, the UI will not reflect changes after a store refresh, causing locator failures.
- **Cleanup:** Always call `MockMapsManager.resetSharedState()` in the `mockMaps` fixture to prevent cross-test leakage.

### 6. RPC Payload & Schema Parity
Mocks that return incorrect data structures trigger silent failures or 400/404 errors in the UI.
- **Rule:** Mock return values MUST match the exact JSON structure of the real Supabase RPC.
- **Incorrect:** Returning `newTrip` object for `create_trip`.
- **Correct:** Returning `{ id: newId }` (matching the real `RETURNS jsonb` signature).
- **Rationale:** The frontend service (e.g., `TripService.createTrip`) often accesses specific properties like `data.id` or `data.trip_id` to perform follow-up actions like navigation or detail fetching.

### 7. Detail-View ID Filtering
Mocks for "Get By ID" RPCs (like `get_trip_details`) must not lazily return the first item in the list.
- **Rule:** Interceptors MUST parse the request body and filter the shared state by the requested ID parameter.
- **Implementation:** 
```typescript
const postData = JSON.parse(req.postData() || '{}');
const requestedId = postData.trip_id_param;
const found = sharedMockTrips.find(t => t.id === Number(requestedId));
return route.fulfill({ body: JSON.stringify(found || {}) });
```

### 8. The Real-Data Priority Rule
Flags for real data (e.g., `realTripsEnabled`) must be evaluated before explicit RPC mocks in the catch-all handler.
- **Rule:** The logic MUST check for real data fallback at the very top of the RPC block.
- **Rationale:** Prevents "ghost" state where a test expects to write to the real DB but a mock interceptor captures the call and returns a temporary ID that doesn't exist in the real database.

### 9. Zero-Tolerance Monitoring
Always monitor for leaks actively during development.
- **Standard:** Use `context.on('request', ...)` to log all external requests. If a request appears in these logs without a corresponding `[MOCK-HIT]` log from your handler, it has bypassed your mocks.
- **WebKit Note:** If leaks persist despite correct headers, apply **The SW Sabotage Rule** (see `pw-webkit-stability.md`) to block Service Worker interference entirely.

### 10. The Cross-Cutting Mock Rule
RPCs that serve multiple features (e.g., `ensure_winery` is used by Trips, Visits, and Favorites) MUST check all dependent real-data flags before fulfilling with a mock.
- **Problem:** If `realFavoritesEnabled` is true but `ensure_winery` fulfills with a mock ID `999123`, a subsequent real RPC like `toggle_favorite_privacy` will fail in the database because the winery record doesn't exist.
- **Rule:** The catch-all handler MUST evaluate fallback conditions for all related features before fulfilling generic helper RPCs.

Reference: [Playwright API Mocking](https://playwright.dev/docs/network)
