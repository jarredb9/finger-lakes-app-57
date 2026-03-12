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

Reference: [Playwright API Mocking](https://playwright.dev/docs/network)
