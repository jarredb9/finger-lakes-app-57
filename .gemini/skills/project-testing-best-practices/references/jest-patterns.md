---
title: Jest Colocation, Static Mock Hoisting, and Store State Isolation
impact: HIGH
impactDescription: Eliminates Node 24 JSDOM memory exhaustion, prevents store state leakage, guarantees deterministic fast test suites
tags: jest, unit-tests, mocking, stores, memory-limits
---

## Jest Colocation, Static Mock Hoisting, and Store Isolation

All Jest tests must be colocated with their source files (e.g. `lib/stores/__tests__/wineryStore.test.ts`, `lib/services/__tests__/wineryService.test.ts`).

### 1. 🚨 Anti-Pattern: `jest.resetModules()` & Dynamic `require()` (FORBIDDEN)

**Never** use `jest.resetModules()` or `jest.doMock()` inside `beforeEach` or individual test cases.

**Why this is prohibited:**
- In Node 24 with JSDOM, `jest.resetModules()` continuously re-instantiates module graphs, causing massive memory leaks that exhaust worker heaps (OOM crashes).
- It breaks module-level singletons (e.g., Zustand store references, DB clients).
- It creates duplicate prototypes and slows test suite execution by 5–10x.

**Incorrect (Dynamic resetModules with dynamic require):**

```typescript
// ❌ FORBIDDEN: Memory leak and broken singletons in Node 24 JSDOM
describe('wineryStore', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.doMock('@/utils/supabase/client', () => ({
      createClient: () => ({ ... }),
    }));
  });

  it('fetches wineries', async () => {
    const { useWineryStore } = require('../wineryStore');
    // ...
  });
});
```

**Correct (Top-level static `jest.mock()` + static ES `import` + explicit store reset):**

```typescript
// lib/stores/__tests__/wineryStore.test.ts
import { useWineryStore } from '../wineryStore';
import { createClient } from '@/utils/supabase/client';

// 1. Static mock hoisted to top of file
const mockFrom = jest.fn();
jest.mock('@/utils/supabase/client', () => ({
  createClient: jest.fn(() => ({
    from: mockFrom,
    rpc: jest.fn(),
  })),
}));

describe('wineryStore', () => {
  beforeEach(() => {
    // 2. Explicit store state reset instead of module resetting
    useWineryStore.getState().reset();
    mockFrom.mockReset();
  });

  it('fetches wineries', async () => {
    mockFrom.mockReturnValueOnce({
      select: jest.fn().mockResolvedValue({ data: [], error: null }),
    });
    await useWineryStore.getState().fetchWineries();
    expect(useWineryStore.getState().wineries).toEqual([]);
  });
});
```

---

### 2. Dynamic Mock Delegation Pattern

When different tests in the same suite require different module behavior (e.g., varying Supabase client auth states or error scenarios), use a mutable delegate or mock function at the module scope rather than `jest.doMock()`.

```typescript
// lib/services/__tests__/wineryService.test.ts
import { wineryService } from '../wineryService';

let mockRpcDelegate = jest.fn();

jest.mock('@/utils/supabase/client', () => ({
  createClient: () => ({
    rpc: (...args: unknown[]) => mockRpcDelegate(...args),
  }),
}));

describe('wineryService', () => {
  beforeEach(() => {
    mockRpcDelegate = jest.fn().mockResolvedValue({ data: null, error: null });
  });

  it('handles error responses cleanly', async () => {
    mockRpcDelegate.mockResolvedValueOnce({
      data: null,
      error: { message: 'Database failure' },
    });

    await expect(wineryService.getWineryById(1)).rejects.toThrow('Database failure');
  });
});
```

---

### 3. Jest 30 & Node 24 Infrastructure Standards

1. **Worker Idle Memory Limit:**
   `jest.config.mjs` configures `workerIdleMemoryLimit: '512MB'` to ensure JSDOM worker threads release memory when idle.
2. **Global Mock Clearing:**
   `jest.config.mjs` sets `clearMocks: true` to automatically clear `jest.fn()` call histories between tests without wiping hoisted implementations.
3. **URL & Environment Polyfills:**
   `jest.setup.ts` polyfills `global.URL.createObjectURL` and `global.URL.revokeObjectURL` for consistent blob URL mocking across tests.

---

## UI Component Mocking (Shadcn/Radix)

When testing components that use Radix primitives with `asChild` (like `TooltipTrigger`, `DialogTrigger`), Jest/JSDOM may throw `React.Children.only` errors if children are conditionally rendered or if the `Slot` implementation is not fully resolved.

**Standard:** For unit tests focusing on presentational logic or store interactions, mock complex UI components to isolate the test and prevent JSDOM rendering issues.

```typescript
// Mock UI components simply but functionally
jest.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/components/ui/button', () => {
  const Button = ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  );
  return { 
    Button,
    buttonVariants: jest.fn(() => '')
  };
});
```

---

## Advanced Store & Service Mocking

### 1. Context-Aware RPC Mocking (Chained Dependencies)
Stores often call internal methods (like `ensureInDb`) which perform their own RPC calls (like `ensure_winery`) before the primary action proceeds.
- **Rule:** The `mockRpc` must be name-aware. If it returns a generic success for everything, internal checks like `if (!dbId) return;` will silently terminate the test.
- **Standard:** Always return a valid numeric ID (> 100) for `ensure_winery` and appropriate objects for `log_visit`.

```typescript
const mockRpc = jest.fn((name: string, _params: unknown) => {
  if (name === 'ensure_winery') return Promise.resolve({ data: 101, error: null });
  if (name === 'log_visit') return Promise.resolve({ data: { visit_id: 123 }, error: null });
  return Promise.resolve({ data: { success: true }, error: null });
});
```

### 2. RPC Signature Resilience
Manual header injection via the 3rd argument (`{ headers: getE2EHeaders() }`) is handled globally via `utils/supabase/client.ts`.

- **Standard:** Tests using `toHaveBeenCalledWith` should only specify the RPC name and parameter payload.

```typescript
expect(mockRpc).toHaveBeenCalledWith(
  'toggle_favorite_privacy', 
  { p_winery_id: 101 }
);
```

---

## Zero-Mock Unit Testing (Presentational Purity)

With the **Container/Presentational pattern**, UI components are "Pure." They don't know about Zustand, IDs, or RPCs. This allows for unit testing with zero mocks.

**Standard:** Use `test/factories/dataFactory.ts` to generate mock data structures. NEVER manually write raw untyped JSON objects in individual tests to avoid schema drift.

```typescript
// components/__tests__/TripCardPresentational.test.tsx
import { render } from '@testing-library/react';
import { createMockTrip } from '@/test/factories/dataFactory';
import TripCardPresentational from '../TripCardPresentational';

describe('TripCardPresentational', () => {
  it('renders trip name and date correctly', () => {
    const trip = createMockTrip({ name: "Lake Seneca Tour" });
    const { getByText } = render(
      <TripCardPresentational 
        trip={trip} 
        isOwner={true}
      />
    );
    expect(getByText("Lake Seneca Tour")).toBeInTheDocument();
  });
});
```

### Architectural Benefits:
1. **Refactor Safety:** TypeScript immediately highlights broken tests when prop or schema interfaces change.
2. **Schema Alignment:** `dataFactory` ensures all tests use data adhering to `lib/database.types.ts`.
3. **Speed & Stability:** Zero mocks + static imports run at maximum speed without Node 24 JSDOM worker memory leaks.
