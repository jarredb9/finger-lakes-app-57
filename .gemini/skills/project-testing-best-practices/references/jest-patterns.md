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

Reference: [Jest Mocking](https://jestjs.io/docs/manual-mocks)
