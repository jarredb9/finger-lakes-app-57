---
title: Type-Safe Playwright Mocking
impact: CRITICAL
impactDescription: Prevents schema drift, eliminates "Numeric ID" regressions
tags: playwright, mocking, typescript, schema
---

## Type-Safe Playwright Mocking

Manual mocking of RPC responses using raw JSON is **DEPRECATED**. All mocks in `MockMapsManager` MUST be constrained by the types in `lib/database.types.ts`.

### 1. The Schema Contract
You MUST use TypeScript to ensure your mocks match the actual database structure.
- **Rule:** If a database column changes from `text` to `bigint`, your mock MUST fail to compile.
- **Implementation:** Import types from `database.types.ts` and use them in your `route.fulfill` bodies.

**Incorrect (Loose Mocking):**
```typescript
// Brittle: 'id' might be a number in DB but string here
await route.fulfill({ body: JSON.stringify([{ id: '123' }]) }); 
```

**Correct (Type-Constrained Mocking):**
```typescript
import { Database } from '@/lib/database.types';
type Trip = Database['public']['Tables']['trips']['Row'];

const mockTrip: Trip = {
  id: 123, // Compiler ensures this is a number
  name: 'Test Trip',
  user_id: 'user-1',
  created_at: new Date().toISOString()
};
await route.fulfill({ body: JSON.stringify([mockTrip]) });
```

### 2. Numeric ID Consistency
- **Standard:** Use numeric integers for all IDs unless the DB schema explicitly mandates UUIDs.
- **Why:** The frontend often uses `parseInt` on relational IDs. Mocking them as strings causes `NaN` errors in the Store.

### 3. Detail-View ID Filtering
Mocks for "Get By ID" RPCs MUST NOT return the first item in a list. They MUST parse the request and return the matching record.
- **Requirement:** Parse `route.request().postData()` to identify the requested ID.

### 5. Strict Mocking (501 Fail-Fast)
To prevent silent integration failures, the `MockMapsManager` implements a "Strict Mock" policy.
- **Standard:** If the application calls an RPC or REST endpoint that is NOT explicitly handled by the mock registry, the interceptor MUST fulfill with a `501 Not Implemented` status.
- **Why:** This forces E2E tests to fail immediately when new network dependencies are introduced, rather than falling back to slow timeouts or confusing "Empty State" UI.

### 6. The Force-Mock Pivot
Multi-user coordination tests (e.g., Social Feed, Trip Invites) often rely on the `MockMapsManager` shared memory state to bridge data between different browser contexts.
- **Standard:** Tests requiring multi-context shared state MUST use `initDefaultMocks({ forceMocks: true })`.
- **Rationale:** This prevents environment-level flags (like `E2E_REAL_DATA=true` in container environments) from bypassing the mock layer. Bypassing the mock layer for one user but not the other leads to a "split-brain" failure where data is committed to the real DB but read from an empty mock.

### 7. CORS & OPTIONS Preflight for Custom Error Mocks
When injecting network-level errors (400, 500) on REST or Auth endpoints via `page.route` / `page.context().route`, browsers first send an HTTP `OPTIONS` preflight request.
- **Problem:** If the route handler fulfills all requests with 400/500 indiscriminately, browser CORS preflight check fails with `TypeError: Failed to fetch`, masking the expected error payload and crashing the application's catch block.
- **Standard:** Always check `route.request().method() === 'OPTIONS'` and fulfill with `status: 204` and full CORS headers before fulfilling the error response.

```typescript
const commonHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
};

await page.context().route('**/auth/v1/token**', async (route) => {
  if (route.request().method() === 'OPTIONS') {
    return route.fulfill({ status: 204, headers: commonHeaders });
  }
  await route.fulfill({
    status: 400,
    contentType: 'application/json',
    headers: commonHeaders,
    body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid credentials' }),
  });
});
```

### 8. Why this is Senior-Level:
1.  **Zero Drift:** You catch backend changes in your frontend tests immediately.
2.  **Predictability:** You eliminate 90% of "400 Bad Request" errors in E2E tests.
3.  **Efficiency:** You spend less time debugging "Why is this field undefined" because TypeScript told you 10 minutes ago.
