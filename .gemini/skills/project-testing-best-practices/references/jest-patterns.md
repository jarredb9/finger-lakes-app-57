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

## UI Component Mocking (Shadcn/Radix)

When testing components that use Radix primitives with `asChild` (like `TooltipTrigger`, `DialogTrigger`), Jest/JSDOM may throw `React.Children.only` errors if children are conditionally rendered or if the `Slot` implementation is not perfectly handled.

**Standard:** For unit tests focusing on business logic or store interactions, mock complex UI components to isolate the test and prevent JSDOM rendering issues.

```typescript
// Mock UI components simply but functionally
jest.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: any) => children,
  TooltipTrigger: ({ children }: any) => children,
  TooltipContent: ({ children }: any) => <div>{children}</div>,
  TooltipProvider: ({ children }: any) => children,
}));

jest.mock('@/components/ui/button', () => {
  const Button = ({ children, ...props }: any) => <button {...props}>{children}</button>;
  return { 
    Button,
    buttonVariants: jest.fn(() => "") // Calendar and other components may need this
  };
});
```

## Advanced Store Mocking

### 1. Context-Aware RPC Mocking (Chained Dependencies)
Stores often call internal methods (like `ensureInDb`) which perform their own RPC calls (like `ensure_winery`) before the primary action proceeds.
- **Rule:** The `mockRpc` must be name-aware. If it returns a generic success for everything, internal checks like `if (!dbId) return;` will silently terminate the test.
- **Standard:** Always return a valid numeric ID (> 100) for `ensure_winery` and appropriate objects for `log_visit`.

```typescript
const mockRpc = jest.fn((name, params) => {
  if (name === 'ensure_winery') return Promise.resolve({ data: 101, error: null });
  if (name === 'log_visit') return Promise.resolve({ data: { visit_id: 123 }, error: null });
  return Promise.resolve({ data: { success: true }, error: null });
});
```

### 2. RPC Signature Resilience
Store methods now frequently append a 3rd argument for E2E headers (`{ headers: getE2EHeaders() }`).
- **Rule:** Tests using `toHaveBeenCalledWith` will fail if they only specify two arguments.
- **Standard:** Use `expect.any(Object)` for the 3rd argument to ensure tests remain stable even if header logic changes.

```typescript
expect(mockRpc).toHaveBeenCalledWith(
  'toggle_favorite_privacy', 
  { p_winery_id: 101 }, 
  expect.any(Object)
);
```

Reference: [Jest Mocking](https://jestjs.io/docs/manual-mocks)
