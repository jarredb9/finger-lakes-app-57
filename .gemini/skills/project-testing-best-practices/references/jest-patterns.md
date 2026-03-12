---
title: Jest Colocation and Mocking
impact: HIGH
impactDescription: 100% logic coverage, prevents side-effect leakage
tags: jest, unit-tests, mocking, stores
---

## Jest Colocation and Mocking

All Jest tests must be colocated with their source files. Side-effect heavy stores (IDB, Supabase) must be mocked inside `beforeEach` to prevent state leakage between tests.

**Incorrect (External test folder, global mocks):**

```typescript
// tests/unit/wineryStore.test.ts
import { wineryStore } from '@/lib/stores/wineryStore';

// Global mocks leak state across test files
jest.mock('@/lib/services/supabase');

describe('wineryStore', () => {
  it('fetches data', async () => { /* ... */ });
});
```

**Correct (Colocated, encapsulated mocks):**

```typescript
// lib/stores/__tests__/wineryStore.test.ts
describe('wineryStore', () => {
  beforeEach(() => {
    // Reset module state and mocks for every test
    jest.resetModules();
    jest.doMock('@/lib/services/supabase', () => ({
      supabase: { from: jest.fn() }
    }));
  });

  it('fetches data', async () => {
    const { useWineryStore } = require('../wineryStore');
    // ... test logic
  });
});
```

Reference: [Jest Mocking](https://jestjs.io/docs/manual-mocks)
