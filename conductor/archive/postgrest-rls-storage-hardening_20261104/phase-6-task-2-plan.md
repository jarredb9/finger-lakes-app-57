# Implementation Plan: Phase 6 Task 2 — Implement Supabase `<Database>` Typing, Remove Mapbox Shims, and Add Client Directive to Pointer-Capture Patch (TDD Green phase)

**Track:** `postgrest-rls-storage-hardening_20261104` (Issue [#93](https://github.com/jarredb9/finger-lakes-app-57/issues/93))  
**Phase:** 6 (Supabase `<Database>` Typing & Module Seam Rigor — Strict TDD)  
**Task:** 2 (Implement Supabase `<Database>` typing, remove Mapbox shims, and add client directive to pointer-capture patch — TDD Green phase)  
**Preceding Context:** [conductor/tracks/postgrest-rls-storage-hardening_20261104/phase-6-task-1-plan.md](./phase-6-task-1-plan.md)  
**ADR References:**
- [docs/adr/0007-security-invoker-rpc-boundary-and-catalog-immutability.md](../../../docs/adr/0007-security-invoker-rpc-boundary-and-catalog-immutability.md)
- [docs/adr/0010-direct-table-rls-privilege-revocation-and-private-storage.md](../../../docs/adr/0010-direct-table-rls-privilege-revocation-and-private-storage.md)  
**Domain Context:** [CONTEXT.md](../../../CONTEXT.md)  
**Specification Reference:** [conductor/tracks/postgrest-rls-storage-hardening_20261104/spec.md](./spec.md) Section 3.9  
**Track Plan Reference:** [conductor/tracks/postgrest-rls-storage-hardening_20261104/plan.md](./plan.md)  
**Workflow Reference:** [conductor/workflow.md](../../workflow.md)  

---

## 1. Executive Summary & Objective

### 1.1 Objective
Transition the Phase 6 test suite and compile-time type assertions established in [lib/services/__tests__/client-types.test.ts](../../../lib/services/__tests__/client-types.test.ts) and [lib/utils/__tests__/pointer-capture-patch.test.ts](../../../lib/utils/__tests__/pointer-capture-patch.test.ts) from **Red** to **Green**:

1. **Parameterize Supabase Client Factories with `<Database>`:**
   - Supply `<Database>` from `@/lib/database.types` across `utils/supabase/client.ts`, `utils/supabase/server.ts`, `utils/supabase/admin.ts`, and `utils/supabase/auth-helper.ts`.
   - Ensure all `.from(...)` and `.rpc(...)` queries validate against the generated database schema at compile time, eliminating untyped `SupabaseClient<any>`.
2. **Remove Permissive Mapbox `any` Shims:**
   - Delete the `declare module "react-map-gl/mapbox"` `any` block from `lib/shims.d.ts:3-12`.
   - Restore native TypeScript definitions from `@vis.gl/react-mapbox` (re-exported by `react-map-gl/mapbox`), satisfying compile-time type guards `AssertNotAny<MapRef>`, `AssertNotAny<typeof Source>`, `AssertNotAny<typeof Layer>`, `AssertNotAny<typeof Marker>`, `AssertNotAny<typeof MapProvider>`, and `AssertNotAny<typeof useMap>`.
3. **Enforce Next.js App Router Client Boundary on Pointer-Capture Patch:**
   - Add `"use client";` to the top of `lib/utils/pointer-capture-patch.ts`, turning the failing unit test in `lib/utils/__tests__/pointer-capture-patch.test.ts` Green and guaranteeing browser runtime execution.
4. **Remediate Consuming Service & Slice Schema Discrepancies:**
   - Resolve strict column and Json type discrepancies uncovered by binding `<Database>` across `lib/services/wineryService.ts`, `lib/services/tripService.ts`, `lib/stores/slices/visitMutationHelpers.ts`, and `lib/stores/slices/tripPlanningHelpers.ts`.

---

## 2. Invariants & Critical Guardrails

1. **Production Database Safety ([AGENTS.md](../../../AGENTS.md) Critical Guardrail 1):**
   - Strictly zero database mutations or migrations during this task. All changes are TypeScript types, module shims, and client runtime directives.
2. **Containerized Test Execution ([AGENTS.md](../../../AGENTS.md) Section 3):**
   - RHEL 8 glibc (2.28) is incompatible with native SWC. All Jest unit test runs must execute via the container runner:
     `./scripts/containers/run-jest-container.sh [jest_args]` (requires `BypassSandbox: true`).
3. **Type-Check Gate Invariant:**
   - Static type checking is executed via `npm run type-check` (`npx tsc -p tsconfig.json --noEmit --incremental false`). Must exit with code 0.
4. **TDD Green Phase Invariant (`conductor/workflow.md`):**
   - Changes must directly turn the failing tests from Phase 6 Task 1 Green without modifying or weakening test assertions.
   - Commit scope must be strictly `feat(types): ...`.
5. **Trunk Linearity & Modal Approval Invariant ([AGENTS.md](../../../AGENTS.md) Sections 2 & 5):**
   - Halt for explicit affirmative user approval via the `ask_question` modal before modifying any files on disk.

---

## 3. Target Files & Semantic Insertion Anchors

### 3.1 Target 1: Browser Client Factory
- **Path:** `utils/supabase/client.ts`
- **Semantic Insertion Anchor:** Line 1 (import declaration) and line 4 (client initialization).
- **File Role:** Add `import type { Database } from "@/lib/database.types"` and parameterize `createBrowserClient<Database>(...)`.

### 3.2 Target 2: Server Client Factory
- **Path:** `utils/supabase/server.ts`
- **Semantic Insertion Anchor:** Line 2 (import declaration) and line 7 (client initialization).
- **File Role:** Add `import type { Database } from "@/lib/database.types"` and parameterize `createServerClient<Database>(...)`.

### 3.3 Target 3: Admin Client Factory
- **Path:** `utils/supabase/admin.ts`
- **Semantic Insertion Anchor:** Line 2 (import declaration) and line 7 (client initialization).
- **File Role:** Add `import type { Database } from "@/lib/database.types"` and parameterize `createServerClient<Database>(...)`.

### 3.4 Target 4: Auth Session Helper
- **Path:** `utils/supabase/auth-helper.ts`
- **Semantic Insertion Anchor:** Line 2 (import declaration) and line 29 (client initialization).
- **File Role:** Add `import type { Database } from "@/lib/database.types"` and parameterize `createServerClient<Database>(...)`.

### 3.5 Target 5: Ambient Type Declarations & Shims
- **Path:** `lib/shims.d.ts`
- **Semantic Insertion Anchor:** Lines 3–12.
- **File Role:** Completely remove `declare module "react-map-gl/mapbox" { ... }`, preserving `declare global { ... }` from line 14 onwards.

### 3.6 Target 6: Pointer-Capture Defensive Patch
- **Path:** `lib/utils/pointer-capture-patch.ts`
- **Semantic Insertion Anchor:** Line 1 (very top of file before JSDoc comment).
- **File Role:** Add `"use client";` directive at line 1.

### 3.7 Target 7: Consuming Services & Slices (Type-Safe RPC & Column Alignments)
- **Path:** `lib/services/wineryService.ts`
  - **Anchor:** `toggleFavoritePrivacy` (lines 154–166) and `toggleWishlistPrivacy` (lines 176–187).
  - **Adjustment:** Narrow `data` from `Json` to `{ success?: boolean; is_private?: boolean }` so `data.success` and `data.is_private` do not throw TS2339.
- **Path:** `lib/services/tripService.ts`
  - **Anchor:** `getTripById` (lines 125–138), `createTrip` (lines 171–214), `updateTrip` (lines 246–252, 287–293), and `addWineryToNewTrip` (lines 348–357).
  - **Adjustment:**
    - In `getTripById`: Narrow `data` from `Json` before `data.id = Number(data.id)`.
    - In `createTrip`: Narrow `data` from `create_trip_with_winery` (`data.trip_id`) and `create_trip` (`data.id`).
    - In `updateTrip`: Replace string `tripId` with `parsedTripId` in `.from("trip_wineries").delete().eq("trip_id", parsedTripId)` and `.from("trips").update(...).eq("id", parsedTripId)` (matches `trips.id: number` and `trip_wineries.trip_id: number`).
    - In `addWineryToNewTrip`: Narrow `data.trip_id` from `create_trip_with_winery`.
- **Path:** `lib/stores/slices/visitMutationHelpers.ts`
  - **Anchor:** Lines 119–133.
  - **Adjustment:** Narrow `rpcResult` from `log_visit` (`Json`) to `{ visit_id: number; winery_id: number }`.
- **Path:** `lib/stores/slices/tripPlanningHelpers.ts`
  - **Anchor:** Lines 102–110.
  - **Adjustment:** Narrow `data` from `create_trip_with_winery` (`Json`) to `{ trip_id: number; winery_id: number }`.

### 3.8 Target 8: Track Plan
- **Path:** `conductor/tracks/postgrest-rls-storage-hardening_20261104/plan.md`
- **Semantic Insertion Anchor:** Lines 93–98 under `## Phase 6: Supabase <Database> Typing & Module Seam Rigor (Strict TDD)`.
- **File Role:** Mark task complete with commit hash upon verification.

---

## 4. TypeScript Interfaces & Function Blueprints

### 4.1 Client Factories Signature Blueprints

```typescript
// utils/supabase/client.ts
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

export function createClient(): SupabaseClient<Database> {
  const client = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_IS_E2E === 'true')
          ? { 'x-skip-sw-interception': 'true' }
          : {}
      }
    }
  );
  // ... window exposure logic ...
  return client;
}
```

```typescript
// utils/supabase/server.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function createClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) { /* ... */ }
      }
    }
  );
}
```

```typescript
// utils/supabase/admin.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function createAdminClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) { /* ... */ }
      }
    }
  );
}
```

```typescript
// utils/supabase/auth-helper.ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/lib/database.types';

export async function updateSession(request: NextRequest): Promise<{ response: NextResponse; user: any }> {
  // ...
  const supabase = createServerClient<Database>(
    url!,
    key!,
    { /* cookies handler */ }
  );
  // ...
}
```

### 4.2 Helper Result Types for Consuming Seams

```typescript
// RPC Narrowing helpers in consuming services/slices:
export type TogglePrivacyRpcPayload = {
  success?: boolean;
  is_private?: boolean;
};

export type LogVisitRpcPayload = {
  visit_id: number;
  winery_id: number;
  [key: string]: unknown;
};

export type CreateTripRpcPayload = {
  id?: number;
  trip_id?: number;
  winery_id?: number;
  [key: string]: unknown;
};
```

---

## 5. Precise Behavioral Logic & Seam Adjustments

### 5.1 Client Generic Parameterization
- `createBrowserClient<Database>`, `createServerClient<Database>`, and `createAdminClient<Database>` bind the generated schema to all downstream queries.
- In `lib/services/__tests__/client-types.test.ts`:
  - `AssertClientIsDatabaseTyped<ReturnType<typeof createBrowserClient>>` evaluates to `true`.
  - `AssertClientIsDatabaseTyped<Awaited<ReturnType<typeof createServerClient>>>` evaluates to `true`.
  - `AssertClientIsDatabaseTyped<Awaited<ReturnType<typeof createAdminClient>>>` evaluates to `true`.
  - `.from('non_existent_table_seam_check')` causes TypeScript to reject the non-existent table name, making `@ts-expect-error` valid.
  - `.from('wineries').insert({ non_existent_column_seam_check: 123 })` causes TypeScript to reject the invalid column, making `@ts-expect-error` valid.

### 5.2 Mapbox Shims Removal
- Deleting `declare module "react-map-gl/mapbox"` from `lib/shims.d.ts:3-12` stops masking `@vis.gl/react-mapbox` exports.
- `MapRef`, `Source`, `Layer`, `Marker`, `MapProvider`, and `useMap` resolve to their concrete TypeScript types from `@vis.gl/react-mapbox/dist/index.d.ts`.
- In `lib/services/__tests__/client-types.test.ts`:
  - `AssertNotAny<MapRef>` evaluates to `true`.
  - `AssertNotAny<typeof Source>` evaluates to `true`.
  - `AssertNotAny<typeof Layer>` evaluates to `true`.
  - `AssertNotAny<typeof Marker>` evaluates to `true`.
  - `AssertNotAny<typeof MapProvider>` evaluates to `true`.
  - `AssertNotAny<ReturnType<typeof useMap>['current']>` evaluates to `true`.

### 5.3 Pointer Capture Directive
- Adding `"use client";` to line 1 of `lib/utils/pointer-capture-patch.ts`.
- In `lib/utils/__tests__/pointer-capture-patch.test.ts`:
  - Test `includes "use client" directive at top of file for Next.js App Router client execution` reads the file and detects `"use client"`, evaluating to `true`.

### 5.4 Consuming Seams Column & Type Fixes
1. **`lib/services/wineryService.ts`:**
   - In `toggleFavoritePrivacy`: `const result = data as TogglePrivacyRpcPayload | null;` -> `return { success: result?.success, isPrivate: result?.is_private, dbId };`.
   - In `toggleWishlistPrivacy`: `const result = data as TogglePrivacyRpcPayload | null;` -> `return { success: result?.success, isPrivate: result?.is_private, dbId };`.
2. **`lib/services/tripService.ts`:**
   - In `getTripById`: `const tripData = data as Trip | null; if (tripData) { tripData.id = Number(tripData.id); } return tripData;`.
   - In `createTrip`: `const payload = data as CreateTripRpcPayload | null;` -> use `payload?.trip_id` and `payload?.id`.
   - In `updateTrip`: Use `parsedTripId` (number) instead of `tripId` (string) for `.from("trip_wineries").delete().eq("trip_id", parsedTripId)` and `.from("trips").update(otherUpdates).eq("id", parsedTripId)`.
   - In `addWineryToNewTrip`: `const payload = data as CreateTripRpcPayload | null;` -> `tripId: payload?.trip_id`.
3. **`lib/stores/slices/visitMutationHelpers.ts`:**
   - In `saveVisit`: `const payload = rpcResult as LogVisitRpcPayload | null; const visitId = payload?.visit_id; const wineryDbId = payload?.winery_id;`.
4. **`lib/stores/slices/tripPlanningHelpers.ts`:**
   - In `handleAddToTrips`: `const payload = data as CreateTripRpcPayload | null; return { tripId: payload?.trip_id, wineryId: payload?.winery_id, isNew: true };`.

---

## 6. Execution Verification Protocol

### 6.1 Static Inspection Verification (Planning Gate)
Zero test commands or builds were executed during this planning phase, fulfilling the static inspection mandate.

### 6.2 Pre-Execution State
- Ensure local working tree is clean (`git status`).

### 6.3 Test Commands & Expected Green Phase Output

1. **Static Type Assertion Check:**
   ```bash
   npm run type-check
   ```
   - **Expected Result:** `PASS` (exit code 0).
   - Zero compilation errors.
   - All `@ts-expect-error` directives in `lib/services/__tests__/client-types.test.ts` legitimately suppress schema errors.

2. **Pointer Capture Patch Unit Test Suite:**
   ```bash
   ./scripts/containers/run-jest-container.sh lib/utils/__tests__/pointer-capture-patch.test.ts
   ```
   - **Expected Result:** `PASS` (exit code 0).
   - All 8 tests pass (including the `"use client"` directive assertion).

3. **Client Types Jest Seam Suite:**
   ```bash
   ./scripts/containers/run-jest-container.sh lib/services/__tests__/client-types.test.ts
   ```
   - **Expected Result:** `PASS` (exit code 0).
   - All 4 tests pass.

4. **Full Containerized Unit Test Suite (Regression Guard):**
   ```bash
   ./scripts/containers/run-jest-container.sh
   ```
   - **Expected Result:** `PASS` (exit code 0).
   - All existing unit tests pass cleanly without regression.

---

## 7. Post-Execution Protocol & Git Notes

Upon confirming all tests and type checks pass cleanly (Green):

### 7.1 Stage & Commit
```bash
git add utils/supabase/client.ts utils/supabase/server.ts utils/supabase/admin.ts utils/supabase/auth-helper.ts lib/shims.d.ts lib/utils/pointer-capture-patch.ts lib/services/wineryService.ts lib/services/tripService.ts lib/stores/slices/visitMutationHelpers.ts lib/stores/slices/tripPlanningHelpers.ts
git commit -m "feat(types): implement Supabase <Database> typing, remove Mapbox shims, and add client directive to pointer-capture patch (TDD Green phase)"
```

### 7.2 Attach Git Note
Obtain the commit SHA (`COMMIT_HASH=$(git log -1 --format="%H")`) and attach the standard metadata note:

```bash
git notes add -m "Task: Implement Supabase <Database> typing, remove Mapbox shims, and add client directive to pointer-capture patch (TDD Green phase)
Summary: Parameterized Supabase client factories (client.ts, server.ts, admin.ts, auth-helper.ts) with <Database> generic from @/lib/database.types. Removed react-map-gl/mapbox any module declaration from lib/shims.d.ts restoring native library types. Added 'use client' directive to lib/utils/pointer-capture-patch.ts. Resolved column and RPC Json type narrowings in wineryService.ts, tripService.ts, visitMutationHelpers.ts, and tripPlanningHelpers.ts. All Phase 6 compile-time type assertions and unit tests are now Green.
Files: utils/supabase/client.ts, utils/supabase/server.ts, utils/supabase/admin.ts, utils/supabase/auth-helper.ts, lib/shims.d.ts, lib/utils/pointer-capture-patch.ts, lib/services/wineryService.ts, lib/services/tripService.ts, lib/stores/slices/visitMutationHelpers.ts, lib/stores/slices/tripPlanningHelpers.ts
Rationale: Fulfills strict TDD Green phase for Phase 6 of Issue #93, eliminating untyped SupabaseClient<any> and Mapbox any shims while ensuring compiler-enforced schema validation across the application." $COMMIT_HASH
```

### 7.3 Update Conductor Plan
Update `conductor/tracks/postgrest-rls-storage-hardening_20261104/plan.md`:
- Mark subtasks complete and update Task status:
  `- [x] Task: Implement Supabase <Database> typing, remove Mapbox shims, and add client directive to pointer-capture patch (TDD Green phase) [commit: <short_sha>]`
- Stage and commit:
  ```bash
  git add conductor/tracks/postgrest-rls-storage-hardening_20261104/plan.md
  git commit -m "conductor(plan): Mark task 'Implement Supabase <Database> typing, remove Mapbox shims, and add client directive to pointer-capture patch (TDD Green phase)' as complete"
  ```

---

## 8. Confirmation Gate

Halt immediately. Do NOT modify `utils/supabase/*.ts`, `lib/shims.d.ts`, `lib/utils/pointer-capture-patch.ts`, or any consuming service files until explicit affirmative user approval is received via the `ask_question` modal.
