# Implementation Plan: Phase 3 Task 1 - Failing Unit Tests for Store Version Migration and Session-Backed PWA Modal Restoration

**Track:** `winery-hours-resilience_20260930` (Issue #56)  
**Phase:** 3 (PWA Cache Invalidation, Selective Migration & Session-Backed Modal Restore)  
**Task:** 1 (Write failing unit tests for store version migration and session-backed PWA modal restoration)

---

## 1. Objective & Scope

Write comprehensive unit tests in strict adherence to Test-Driven Development (TDD Red Phase) covering the three pillars of Phase 3:
1. **Zustand Persistence Version 2 & Selective Migration:** Tests verifying that bumping `version: 2` in `lib/stores/wineryStore.ts` executes a selective `migrate` function that purges corrupt/stale records claiming `enrichment_tier === 'enriched' | 'full'` that lack `openingHours` or have malformed structures, while preserving basic map marker records (`enrichment_tier === 'basic'` or valid coordinates) to maintain offline map availability.
2. **PWA Update Session Persistence:** Tests in `hooks/__tests__/use-pwa-update.test.ts` verifying that `applyUpdate()` records `_PWA_JUST_UPDATED` timestamp and the currently active winery modal ID (`_PWA_ACTIVE_WINERY_ID`) into `sessionStorage` before posting `SKIP_WAITING` to the waiting service worker, while keeping the hook decoupled from domain data stores.
3. **Session-Backed Modal Restoration & Hydration:** Tests in `components/modals/__tests__/authenticated-modal-host.test.tsx` verifying that `AuthenticatedModalHost` on mount inspects `sessionStorage` for `_PWA_ACTIVE_WINERY_ID`, automatically reopens the modal via `useUIStore.getState().openWineryModal(id)`, triggers background detail hydration via `useWineryStore.getState().ensureWineryDetails(id)`, and cleanses `_PWA_ACTIVE_WINERY_ID` from `sessionStorage`.

All unit tests must fail predictably against the current un-migrated and un-instrumented code (Red Phase).

---

## 2. Seam-Bounded Architecture & Invariants

1. **Selective Purge Invariant:**
   - Corrupt or incomplete enriched entries (`enrichment_tier === 'enriched' | 'full'` with `openingHours == null` or missing periods/weekday_text) must be removed during migration so stale closed/empty hours cannot poison the UI.
   - Basic map marker pins (`enrichment_tier === 'basic'` or records with valid `latitude` and `longitude`) must NEVER be purged, guaranteeing offline map navigation across PWA updates.
2. **Decoupled Update Invariant:**
   - `usePWAUpdate` communicates update intent via `sessionStorage` (`_PWA_JUST_UPDATED` and `_PWA_ACTIVE_WINERY_ID`). It must never invoke data fetching actions like `fetchWineryData` directly.
3. **Single Restoration Invariant:**
   - Modal restoration in `AuthenticatedModalHost` on mount must consume `_PWA_ACTIVE_WINERY_ID` exactly once and remove it from `sessionStorage` immediately, preventing repeated modal popping on subsequent re-renders or client navigation.

---

## 3. Target Files & Exact Drop-in Specifications

### Target File 1: `lib/stores/__tests__/wineryStore.persist.test.ts` (NEW FILE)
- **Path:** `lib/stores/__tests__/wineryStore.persist.test.ts`
- **Action:** Create new test file with isolated unit tests for `useWineryStore.persist` options, migration logic, and IndexedDB rehydration.

#### Complete Drop-in Code:
```typescript
import { act } from '@testing-library/react';
import { useWineryStore } from '../wineryStore';
import { Winery } from '@/lib/types';
import { createMockWinery } from '@/lib/test-utils/fixtures';

// Mock idb-keyval for storage interaction
jest.mock('idb-keyval', () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  setMany: jest.fn(),
}));

// Mock Supabase client & utils to isolate store persistence
const mockRpc = jest.fn().mockResolvedValue({ data: [], error: null });
const mockInvoke = jest.fn().mockResolvedValue({ data: null, error: null });

(globalThis as any)._WINERY_MOCKS = {
  mockRpc,
  mockInvoke,
};

jest.mock('@/utils/supabase/client', () => ({
  createClient: jest.fn(() => ({
    rpc: (...args: any[]) => (globalThis as any)._WINERY_MOCKS.mockRpc(...args),
    functions: {
      invoke: (...args: any[]) => (globalThis as any)._WINERY_MOCKS.mockInvoke(...args),
    },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          single: jest.fn().mockResolvedValue({ data: null, error: null }),
        })),
      })),
    })),
  })),
}));

jest.mock('@/lib/utils', () => {
  const actual = jest.requireActual('@/lib/utils');
  return {
    ...actual,
    invokeFunction: (...args: any[]) => (globalThis as any)._WINERY_MOCKS.mockInvoke(...args),
  };
});

describe('WineryStore Persistence & Version 2 Migration', () => {
  const { get: mockGet } = require('idb-keyval');

  beforeEach(() => {
    act(() => {
      useWineryStore.getState().reset();
    });
    jest.clearAllMocks();
    delete (process.env as any).NEXT_PUBLIC_IS_E2E;
  });

  describe('Persist Options Configuration', () => {
    it('configures Zustand persist with version 2', () => {
      const persistOptions = (useWineryStore as any).persist.getOptions();
      expect(persistOptions.version).toBe(2);
    });

    it('defines a custom migrate callback in persist options', () => {
      const persistOptions = (useWineryStore as any).persist.getOptions();
      expect(typeof persistOptions.migrate).toBe('function');
    });
  });

  describe('Selective Migration Function (v0/v1 -> v2)', () => {
    const validEnrichedWinery: Winery = {
      ...createMockWinery({ id: 'winery-enriched-valid' as any, name: 'Valid Enriched Winery' }),
      enrichment_tier: 'enriched',
      openingHours: {
        weekday_text: ['Monday: 10:00 AM – 5:00 PM'],
        periods: [{ open: { day: 1, hour: 10, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } }],
      },
    };

    const corruptEnrichedWineryNullHours: Winery = {
      ...createMockWinery({ id: 'winery-corrupt-null-hours' as any, name: 'Corrupt Null Hours' }),
      enrichment_tier: 'enriched',
      openingHours: null,
    };

    const corruptEnrichedWineryUndefinedHours: Winery = {
      ...createMockWinery({ id: 'winery-corrupt-undef-hours' as any, name: 'Corrupt Undefined Hours' }),
      enrichment_tier: 'enriched',
      openingHours: undefined,
    };

    const corruptFullWineryNullHours: Winery = {
      ...createMockWinery({ id: 'winery-corrupt-full-tier' as any, name: 'Corrupt Full Tier' }),
      enrichment_tier: 'full',
      openingHours: null,
    };

    const basicMapMarkerWinery: Winery = {
      ...createMockWinery({ id: 'winery-basic-marker' as any, name: 'Basic Marker' }),
      enrichment_tier: 'basic',
      openingHours: null, // Basic markers legitimately do not have hours yet
      latitude: 42.501,
      longitude: -76.852,
    };

    const unEnrichedMarkerWinery: Winery = {
      ...createMockWinery({ id: 'winery-unenriched-marker' as any, name: 'Unenriched Pin' }),
      enrichment_tier: undefined,
      openingHours: null,
      latitude: 42.450,
      longitude: -76.900,
    };

    const malformedRecord = {
      id: '',
      name: undefined,
      latitude: 'invalid-coordinate',
    } as any;

    it('purges corrupt enriched records lacking openingHours while preserving basic map marker records and valid enriched records', () => {
      const persistOptions = (useWineryStore as any).persist.getOptions();
      const oldState = {
        persistentWineries: [
          validEnrichedWinery,
          corruptEnrichedWineryNullHours,
          corruptEnrichedWineryUndefinedHours,
          corruptFullWineryNullHours,
          basicMapMarkerWinery,
          unEnrichedMarkerWinery,
          malformedRecord,
        ],
      };

      const migrated = persistOptions.migrate(oldState, 0);

      expect(migrated.persistentWineries).toBeDefined();
      const ids = migrated.persistentWineries.map((w: Winery) => w.id);

      // Enriched records lacking hours must be purged
      expect(ids).not.toContain('winery-corrupt-null-hours');
      expect(ids).not.toContain('winery-corrupt-undef-hours');
      expect(ids).not.toContain('winery-corrupt-full-tier');
      expect(ids).not.toContain('');

      // Valid enriched and offline basic markers must be preserved
      expect(ids).toContain('winery-enriched-valid');
      expect(ids).toContain('winery-basic-marker');
      expect(ids).toContain('winery-unenriched-marker');
      expect(migrated.persistentWineries).toHaveLength(3);
    });

    it('returns unmodified state when incoming version is already 2', () => {
      const persistOptions = (useWineryStore as any).persist.getOptions();
      const currentState = {
        persistentWineries: [corruptEnrichedWineryNullHours, basicMapMarkerWinery],
      };

      const migrated = persistOptions.migrate(currentState, 2);
      expect(migrated).toEqual(currentState);
    });
  });

  describe('End-to-End IndexedDB Rehydration Migration', () => {
    it('selectively purges corrupt cache on store rehydrate from version 0 storage payload', async () => {
      const validWinery = createMockWinery({
        id: 'winery-keep' as any,
        name: 'Keep Winery',
        openingHours: { weekday_text: ['Mon: Open'] },
        enrichment_tier: 'enriched',
      });

      const corruptWinery = createMockWinery({
        id: 'winery-purge' as any,
        name: 'Purge Winery',
        openingHours: null,
        enrichment_tier: 'enriched',
      });

      const basicWinery = createMockWinery({
        id: 'winery-basic' as any,
        name: 'Basic Winery Pin',
        openingHours: null,
        enrichment_tier: 'basic',
        latitude: 42.6,
        longitude: -76.9,
      });

      (mockGet as jest.Mock).mockResolvedValue(
        JSON.stringify({
          state: {
            persistentWineries: [validWinery, corruptWinery, basicWinery],
          },
          version: 0,
        })
      );

      await useWineryStore.persist.rehydrate();

      const persistent = useWineryStore.getState().persistentWineries;
      const ids = persistent.map((w) => w.id);

      expect(ids).toContain('winery-keep');
      expect(ids).toContain('winery-basic');
      expect(ids).not.toContain('winery-purge');
    });
  });
});
```

---

### Target File 2: `hooks/__tests__/use-pwa-update.test.ts` (MODIFICATION)
- **Path:** `hooks/__tests__/use-pwa-update.test.ts`
- **Line Anchors:**
  - **Imports (Lines 1-3):** Add `useUIStore` and `useWineryStore` imports.
  - **`beforeEach` (Lines 8-36):** Add `sessionStorage.clear()`, `useUIStore.getState().closeWineryModal()`, and reset `useUIStore` active winery ID.
  - **Test Suite Body (Lines 78-79):** Insert new tests asserting `_PWA_JUST_UPDATED` timestamp and active modal ID (`_PWA_ACTIVE_WINERY_ID`) are stored in `sessionStorage` on `applyUpdate()`.

#### Exact Code Changes:

**Anchor 1: Line 1 to 3 Replacement (Imports)**
```typescript
<<<<
import { renderHook, act } from '@testing-library/react';
import { usePWAUpdate } from '../use-pwa-update';
====
import { renderHook, act } from '@testing-library/react';
import { usePWAUpdate } from '../use-pwa-update';
import { useUIStore } from '@/lib/stores/uiStore';
import { useWineryStore } from '@/lib/stores/wineryStore';
>>>>
```

**Anchor 2: In `beforeEach` (around lines 33-36)**
```typescript
<<<<
    delete globalThis._PWA_UPDATING;
    process.env.NEXT_PUBLIC_IS_E2E = '';
  });
====
    delete globalThis._PWA_UPDATING;
    process.env.NEXT_PUBLIC_IS_E2E = '';
    window.sessionStorage.clear();
    act(() => {
      useUIStore.getState().closeWineryModal();
      useUIStore.setState({ activeWineryId: null, isWineryModalOpen: false });
    });
  });
>>>>
```

**Anchor 3: Before closing `describe` block (line 79)**
```typescript
<<<<
    // If it didn't crash, it means it returned early because _PWA_UPDATING was already true
    expect(globalThis._PWA_UPDATING).toBe(true);
  });
});
====
    // If it didn't crash, it means it returned early because _PWA_UPDATING was already true
    expect(globalThis._PWA_UPDATING).toBe(true);
  });

  describe('Session Storage Persistence on applyUpdate', () => {
    it('asserts _PWA_JUST_UPDATED timestamp is stored in sessionStorage on applyUpdate', async () => {
      const mockPostMessage = jest.fn();
      mockRegistration.waiting = { postMessage: mockPostMessage };

      let hookResult: any;
      await act(async () => {
        hookResult = renderHook(() => usePWAUpdate()).result;
      });

      const beforeTime = Date.now();
      act(() => {
        hookResult.current.applyUpdate();
      });
      const afterTime = Date.now();

      const storedTimestampStr = window.sessionStorage.getItem('_PWA_JUST_UPDATED');
      expect(storedTimestampStr).not.toBeNull();
      const storedTimestamp = Number(storedTimestampStr);
      expect(storedTimestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(storedTimestamp).toBeLessThanOrEqual(afterTime);
      expect(mockPostMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    });

    it('asserts _PWA_ACTIVE_WINERY_ID is stored in sessionStorage when an active winery modal is open', async () => {
      const mockPostMessage = jest.fn();
      mockRegistration.waiting = { postMessage: mockPostMessage };

      act(() => {
        useUIStore.getState().openWineryModal('winery-modal-restore-456');
      });
      expect(useUIStore.getState().activeWineryId).toBe('winery-modal-restore-456');

      let hookResult: any;
      await act(async () => {
        hookResult = renderHook(() => usePWAUpdate()).result;
      });

      act(() => {
        hookResult.current.applyUpdate();
      });

      expect(window.sessionStorage.getItem('_PWA_ACTIVE_WINERY_ID')).toBe('winery-modal-restore-456');
      expect(mockPostMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    });

    it('does NOT store _PWA_ACTIVE_WINERY_ID in sessionStorage when no winery modal is open', async () => {
      const mockPostMessage = jest.fn();
      mockRegistration.waiting = { postMessage: mockPostMessage };

      act(() => {
        useUIStore.getState().closeWineryModal();
      });

      let hookResult: any;
      await act(async () => {
        hookResult = renderHook(() => usePWAUpdate()).result;
      });

      act(() => {
        hookResult.current.applyUpdate();
      });

      expect(window.sessionStorage.getItem('_PWA_ACTIVE_WINERY_ID')).toBeNull();
      expect(window.sessionStorage.getItem('_PWA_JUST_UPDATED')).not.toBeNull();
    });

    it('remains decoupled from domain data stores and does not invoke fetchWineryData', async () => {
      const fetchWineryDataSpy = jest.spyOn(useWineryStore.getState(), 'fetchWineryData');
      mockRegistration.waiting = { postMessage: jest.fn() };

      let hookResult: any;
      await act(async () => {
        hookResult = renderHook(() => usePWAUpdate()).result;
      });

      act(() => {
        hookResult.current.applyUpdate();
      });

      expect(fetchWineryDataSpy).not.toHaveBeenCalled();
      fetchWineryDataSpy.mockRestore();
    });
  });
});
>>>>
```

---

### Target File 3: `components/modals/__tests__/authenticated-modal-host.test.tsx` (MODIFICATION)
- **Path:** `components/modals/__tests__/authenticated-modal-host.test.tsx`
- **Line Anchors:**
  - **Imports (Lines 1-4):** Add `useWineryStore` import.
  - **`beforeEach` (Lines 6-14):** Add `window.sessionStorage.clear()`.
  - **Test Suite Body (Lines 43-44):** Insert new tests verifying `_PWA_ACTIVE_WINERY_ID` triggers modal reopening and detail hydration on mount.

#### Exact Code Changes:

**Anchor 1: Line 1 to 4 Replacement (Imports)**
```typescript
<<<<
import { render, act } from "@testing-library/react";
import { AuthenticatedModalHost } from "@/components/modals/authenticated-modal-host";
import { useUIStore } from "@/lib/stores/uiStore";
====
import { render, act } from "@testing-library/react";
import { AuthenticatedModalHost } from "@/components/modals/authenticated-modal-host";
import { useUIStore } from "@/lib/stores/uiStore";
import { useWineryStore } from "@/lib/stores/wineryStore";
>>>>
```

**Anchor 2: In `beforeEach` (around lines 11-14)**
```typescript
<<<<
    document.body.style.pointerEvents = "";
    document.body.style.overflow = "";
  });
====
    document.body.style.pointerEvents = "";
    document.body.style.overflow = "";
    window.sessionStorage.clear();
  });
>>>>
```

**Anchor 3: Before closing `describe` block (line 44)**
```typescript
<<<<
    // Body pointer locks must be cleansed
    expect(document.body.style.pointerEvents).toBe("");
    expect(document.body.style.overflow).toBe("");
  });
});
====
    // Body pointer locks must be cleansed
    expect(document.body.style.pointerEvents).toBe("");
    expect(document.body.style.overflow).toBe("");
  });

  describe("PWA Post-Update Modal Restoration on Mount", () => {
    it("reopens winery modal, invokes ensureWineryDetails, and cleanses _PWA_ACTIVE_WINERY_ID from sessionStorage on mount", async () => {
      const targetWineryId = "winery-pwa-restoration-789";
      window.sessionStorage.setItem("_PWA_ACTIVE_WINERY_ID", targetWineryId);

      const ensureWineryDetailsSpy = jest
        .spyOn(useWineryStore.getState(), "ensureWineryDetails")
        .mockResolvedValue(null as any);
      const openWineryModalSpy = jest.spyOn(useUIStore.getState(), "openWineryModal");

      await act(async () => {
        render(<AuthenticatedModalHost />);
      });

      // Assert modal reopening and detail hydration
      expect(openWineryModalSpy).toHaveBeenCalledWith(targetWineryId);
      expect(ensureWineryDetailsSpy).toHaveBeenCalledWith(targetWineryId);

      // Assert active winery ID state in UI store
      expect(useUIStore.getState().isWineryModalOpen).toBe(true);
      expect(useUIStore.getState().activeWineryId).toBe(targetWineryId);

      // Assert session storage item was cleansed to prevent infinite reopen loops
      expect(window.sessionStorage.getItem("_PWA_ACTIVE_WINERY_ID")).toBeNull();

      ensureWineryDetailsSpy.mockRestore();
      openWineryModalSpy.mockRestore();
    });

    it("does not trigger modal opening or ensureWineryDetails if _PWA_ACTIVE_WINERY_ID is absent from sessionStorage", async () => {
      const ensureWineryDetailsSpy = jest
        .spyOn(useWineryStore.getState(), "ensureWineryDetails")
        .mockResolvedValue(null as any);
      const openWineryModalSpy = jest.spyOn(useUIStore.getState(), "openWineryModal");

      await act(async () => {
        render(<AuthenticatedModalHost />);
      });

      expect(openWineryModalSpy).not.toHaveBeenCalled();
      expect(ensureWineryDetailsSpy).not.toHaveBeenCalled();
      expect(useUIStore.getState().isWineryModalOpen).toBe(false);

      ensureWineryDetailsSpy.mockRestore();
      openWineryModalSpy.mockRestore();
    });
  });
});
>>>>
```

---

## 4. Red-Phase Failure Verification Rationale

Each test is guaranteed to fail prior to Phase 3 Task 2 implementation:

1. **`lib/stores/__tests__/wineryStore.persist.test.ts` Failure Modes:**
   - `expect(persistOptions.version).toBe(2)`: Fails because `wineryStore.ts` does not specify `version` (defaults to `undefined` / `0`).
   - `expect(typeof persistOptions.migrate).toBe('function')`: Fails because `wineryStore.ts` currently has no `migrate` callback.
   - `persistOptions.migrate(oldState, 0)`: Throws `TypeError: persistOptions.migrate is not a function`.
   - `rehydrate()` test: Fails because corrupt records are retained in `persistentWineries`.

2. **`hooks/__tests__/use-pwa-update.test.ts` Failure Modes:**
   - `expect(window.sessionStorage.getItem('_PWA_JUST_UPDATED')).not.toBeNull()`: Fails with `expected not null, received null` because `applyUpdate()` only posts `SKIP_WAITING` without writing to `sessionStorage`.
   - `expect(window.sessionStorage.getItem('_PWA_ACTIVE_WINERY_ID')).toBe('winery-modal-restore-456')`: Fails with `expected 'winery-modal-restore-456', received null`.

3. **`components/modals/__tests__/authenticated-modal-host.test.tsx` Failure Modes:**
   - `expect(openWineryModalSpy).toHaveBeenCalledWith(targetWineryId)`: Fails with `expected 1 call, received 0 calls` because `AuthenticatedModalHost` has no mount effect checking `sessionStorage`.
   - `expect(ensureWineryDetailsSpy).toHaveBeenCalledWith(targetWineryId)`: Fails with `expected 1 call, received 0 calls`.
   - `expect(window.sessionStorage.getItem('_PWA_ACTIVE_WINERY_ID')).toBeNull()`: Fails with `expected null, received 'winery-pwa-restoration-789'`.

---

## 5. Execution & Verification Command (For Next Step)

Once approved via modal, the executor will write these tests and execute the Jest container runner:
```bash
./scripts/run-jest-container.sh \
  lib/stores/__tests__/wineryStore.persist.test.ts \
  hooks/__tests__/use-pwa-update.test.ts \
  components/modals/__tests__/authenticated-modal-host.test.tsx
```
*Expected Result:* All new tests fail with the explicit Red-phase failure modes documented above. Existing tests pass.
