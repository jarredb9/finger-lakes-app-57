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

### 4. Why this is Senior-Level:
1.  **Zero Drift:** You catch backend changes in your frontend tests immediately.
2.  **Predictability:** You eliminate 90% of "400 Bad Request" errors in E2E tests.
3.  **Efficiency:** You spend less time debugging "Why is this field undefined" because TypeScript told you 10 minutes ago.
