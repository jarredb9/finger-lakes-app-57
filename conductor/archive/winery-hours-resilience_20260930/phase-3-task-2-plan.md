# Implementation Plan: Phase 3 Task 2 - Implement Store Version 2 Selective Migration and Session-Backed Modal Restoration

**Track:** `winery-hours-resilience_20260930` (Issue #56)  
**Phase:** 3 (PWA Cache Invalidation, Selective Migration & Session-Backed Modal Restore)  
**Task:** 2 (Implement store version 2 selective migration and session-backed modal restoration)

---

## 1. Executive Summary & Objective

In Phase 3 Task 1, failing unit tests were committed in `c29d399` (`lib/stores/__tests__/wineryStore.persist.test.ts`, `hooks/__tests__/use-pwa-update.test.ts`, and `components/modals/__tests__/authenticated-modal-host.test.tsx`) defining the strict behavioral contracts for PWA cache invalidation and post-update modal restoration.

The objective of Task 2 is to transition all tests from **Red to Green** by implementing three targeted, seam-bounded modifications:
1. **Zustand `version: 2` & Selective `migrate` Callback (`lib/stores/wineryStore.ts`):** Bump persistence version from default `0` to `2`. Implement a selective migration callback that purges corrupt or stale records claiming `enrichment_tier === 'enriched' | 'full'` that lack `openingHours` (preventing cached empty/false-closed states from persisting across releases), while strictly preserving basic map markers (`enrichment_tier === 'basic'` or records with valid coordinates) to ensure offline map functionality is never compromised.
2. **Decoupled PWA Update State Serialization (`hooks/use-pwa-update.ts`):** Enhance `applyUpdate()` to record `_PWA_JUST_UPDATED` (timestamp) and `_PWA_ACTIVE_WINERY_ID` (from `useUIStore.getState().activeWineryId`) into `sessionStorage` before posting `SKIP_WAITING` to the waiting service worker. The hook remains completely decoupled from domain data stores and never invokes `fetchWineryData`.
3. **Mount-Time Session Modal Restoration (`components/modals/authenticated-modal-host.tsx`):** Add an idempotent mount effect that inspects `sessionStorage` for `_PWA_ACTIVE_WINERY_ID`. If present, it cleanses the key from `sessionStorage` immediately, reopens the winery modal via `useUIStore.getState().openWineryModal(id)`, and initiates background detail hydration via `useWineryStore.getState().ensureWineryDetails(id)`.

---

## 2. Seam-Bounded Architecture & Invariants

1. **Selective Purge vs. Marker Retention Invariant:**
   - Enriched entries (`enrichment_tier === 'enriched' | 'full'`) without valid `openingHours` (containing `periods` or `weekday_text`) or malformed records (empty `id`, missing `name`, non-numeric coordinates) are purged from persistent state.
   - Basic map markers (`enrichment_tier === 'basic'` or unenriched records) with valid geographic coordinates are preserved unconditionally.
   - When incoming persistence version is `>= 2`, state is returned unmodified.

2. **Decoupled Update Hook Invariant:**
   - `usePWAUpdate` only reads `useUIStore.getState().activeWineryId` and writes to `sessionStorage`. It must never import or invoke `wineryStore.fetchWineryData()`.

3. **Single Restoration Invariant:**
   - `AuthenticatedModalHost` consumes `_PWA_ACTIVE_WINERY_ID` and removes it from `sessionStorage` synchronously before triggering store actions, guaranteeing that subsequent client-side route navigations or component re-renders cannot re-trigger the modal.

---

## 3. Target File Modifications & Precise Drop-in Code Chunks

### File 1: [lib/stores/wineryStore.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/stores/wineryStore.ts)

#### Anchor: Lines 574–584 (Persist Options Configuration)
**Existing Context (Lines 574–584):**
```typescript
    {
      name: process.env.NEXT_PUBLIC_IS_E2E === 'true' ? 'winery-data-storage-e2e' : 'winery-data-storage',
      storage: createJSONStorage(() => idbStorage),
      partialize: (state): Partial<WineryState> => {
        if (process.env.NEXT_PUBLIC_IS_E2E === 'true') return {};
        return {
          persistentWineries: state.persistentWineries.slice(0, 50),
        };
      },
    }
```

**Replacement / Drop-in Chunk:**
```typescript
    {
      name: process.env.NEXT_PUBLIC_IS_E2E === 'true' ? 'winery-data-storage-e2e' : 'winery-data-storage',
      version: 2,
      storage: createJSONStorage(() => idbStorage),
      migrate: (persistedState: any, version: number) => {
        if (version >= 2) {
          return persistedState;
        }

        const state = persistedState as Partial<WineryState>;
        if (!state || !Array.isArray(state.persistentWineries)) {
          return persistedState;
        }

        const migratedWineries = state.persistentWineries.filter((w: any) => {
          if (!w || typeof w !== 'object') return false;
          if (!w.id || typeof w.id !== 'string' || w.id.trim().length === 0) return false;
          if (typeof w.name !== 'string' || w.name.trim().length === 0) return false;
          if (
            typeof w.latitude !== 'number' ||
            isNaN(w.latitude) ||
            typeof w.longitude !== 'number' ||
            isNaN(w.longitude)
          ) {
            return false;
          }

          // If record claims to be enriched or full, it MUST have valid openingHours
          if (w.enrichment_tier === 'enriched' || w.enrichment_tier === 'full') {
            const hasHours =
              w.openingHours &&
              typeof w.openingHours === 'object' &&
              ((Array.isArray(w.openingHours.weekday_text) && w.openingHours.weekday_text.length > 0) ||
                (Array.isArray(w.openingHours.periods) && w.openingHours.periods.length > 0));
            if (!hasHours) return false;
          }

          return true;
        });

        return {
          ...state,
          persistentWineries: migratedWineries,
        };
      },
      partialize: (state): Partial<WineryState> => {
        if (process.env.NEXT_PUBLIC_IS_E2E === 'true') return {};
        return {
          persistentWineries: state.persistentWineries.slice(0, 50),
        };
      },
    }
```

---

### File 2: [hooks/use-pwa-update.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/hooks/use-pwa-update.ts)

#### Anchor 1: Lines 1–4 (Imports)
**Existing Context (Lines 1–4):**
```typescript
'use client';

import { useEffect, useCallback, useState } from 'react';

export function usePWAUpdate() {
```

**Replacement / Drop-in Chunk:**
```typescript
'use client';

import { useEffect, useCallback, useState } from 'react';
import { useUIStore } from '@/lib/stores/uiStore';

export function usePWAUpdate() {
```

#### Anchor 2: Lines 57–61 (`applyUpdate` Callback)
**Existing Context (Lines 57–61):**
```typescript
  const applyUpdate = useCallback(() => {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  }, [registration]);
```

**Replacement / Drop-in Chunk:**
```typescript
  const applyUpdate = useCallback(() => {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        window.sessionStorage.setItem('_PWA_JUST_UPDATED', String(Date.now()));
        const activeWineryId = useUIStore.getState().activeWineryId;
        if (activeWineryId) {
          window.sessionStorage.setItem('_PWA_ACTIVE_WINERY_ID', String(activeWineryId));
        }
      } catch (err) {
        console.warn('[usePWAUpdate] Failed to persist session data on update', err);
      }
    }

    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  }, [registration]);
```

---

### File 3: [components/modals/authenticated-modal-host.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/modals/authenticated-modal-host.tsx)

#### Anchor 1: Lines 1–7 (Imports)
**Existing Context (Lines 1–7):**
```typescript
"use client";

import { useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useUIStore } from "@/lib/stores/uiStore";
```

**Replacement / Drop-in Chunk:**
```typescript
"use client";

import { useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useUIStore } from "@/lib/stores/uiStore";
import { useWineryStore } from "@/lib/stores/wineryStore";
import type { GooglePlaceId } from "@/lib/types";
```

#### Anchor 2: Line 97 (Preceding Route Transition Cleanup Effect)
**Existing Context (Lines 96–105):**
```typescript
    return undefined;
  }, []);

  // Clean up open modal state and body locks on route transitions
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    cleanupModalsAndBody();
  }, [pathname, cleanupModalsAndBody]);
```

**Replacement / Drop-in Chunk:**
```typescript
    return undefined;
  }, []);

  // Restore open winery modal if triggered by PWA update
  useEffect(() => {
    if (typeof window === "undefined" || !window.sessionStorage) return;
    const restoredWineryId = window.sessionStorage.getItem("_PWA_ACTIVE_WINERY_ID");
    if (restoredWineryId) {
      window.sessionStorage.removeItem("_PWA_ACTIVE_WINERY_ID");
      useUIStore.getState().openWineryModal(restoredWineryId);
      useWineryStore.getState().ensureWineryDetails(restoredWineryId as GooglePlaceId);
    }
  }, []);

  // Clean up open modal state and body locks on route transitions
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    cleanupModalsAndBody();
  }, [pathname, cleanupModalsAndBody]);
```

---

## 4. Verification Plan & Container Test Execution

Following user approval, apply the exact code drops and execute the containerized Jest test suite:

### Test Suite Execution Command
```bash
./scripts/run-jest-container.sh \
  lib/stores/__tests__/wineryStore.persist.test.ts \
  hooks/__tests__/use-pwa-update.test.ts \
  components/modals/__tests__/authenticated-modal-host.test.tsx
```

### Expected Green Phase Results
1. **`lib/stores/__tests__/wineryStore.persist.test.ts`**:
   - `configures Zustand persist with version 2` passes.
   - `defines a custom migrate callback in persist options` passes.
   - `purges corrupt enriched records lacking openingHours while preserving basic map marker records and valid enriched records` passes (3 preserved records: `winery-enriched-valid`, `winery-basic-marker`, `winery-unenriched-marker`).
   - `returns unmodified state when incoming version is already 2` passes.
   - `selectively purges corrupt cache on store rehydrate from version 0 storage payload` passes.
2. **`hooks/__tests__/use-pwa-update.test.ts`**:
   - `asserts _PWA_JUST_UPDATED timestamp is stored in sessionStorage on applyUpdate` passes.
   - `asserts _PWA_ACTIVE_WINERY_ID is stored in sessionStorage when an active winery modal is open` passes.
   - `does NOT store _PWA_ACTIVE_WINERY_ID in sessionStorage when no winery modal is open` passes.
   - `remains decoupled from domain data stores and does not invoke fetchWineryData` passes.
3. **`components/modals/__tests__/authenticated-modal-host.test.tsx`**:
   - `reopens winery modal, invokes ensureWineryDetails, and cleanses _PWA_ACTIVE_WINERY_ID from sessionStorage on mount` passes.
   - `does not trigger modal opening or ensureWineryDetails if _PWA_ACTIVE_WINERY_ID is absent from sessionStorage` passes.
   - Existing route navigation/unmount cleanup tests remain 100% passing.

---

## 5. Halt Gate for User Approval

In adherence to Conductor workflow rules and the AGENTS.md Invariant, this plan has been generated via static inspection without running test commands or modifying implementation source files.

Awaiting user approval via `ask_question` modal before proceeding with code modifications.
