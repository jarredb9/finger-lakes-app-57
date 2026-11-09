# Implementation Plan: Phase 6 Task 1 — Write Failing Type Assertions & Seam Regression Tests for Supabase Clients and Mapbox Types (TDD Red phase)

**Track:** `postgrest-rls-storage-hardening_20261104` (Issue [#93](https://github.com/jarredb9/finger-lakes-app-57/issues/93))  
**Phase:** 6 (Supabase `<Database>` Typing & Module Seam Rigor — Strict TDD)  
**Task:** 1 (Write failing type assertions & seam regression tests for Supabase clients and Mapbox types — TDD Red phase)  
**Preceding Context:** [conductor/tracks/postgrest-rls-storage-hardening_20261104/phase-5-task-1-plan.md](./phase-5-task-1-plan.md)  
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
Establish authoritative failing static type assertions and regression test suites in [lib/services/__tests__/client-types.test.ts](../../../lib/services/__tests__/client-types.test.ts) and [lib/utils/__tests__/pointer-capture-patch.test.ts](../../../lib/utils/__tests__/pointer-capture-patch.test.ts) to empirically validate the 3 module seam and typing boundaries defined in Issue [#93](https://github.com/jarredb9/finger-lakes-app-57/issues/93) and Section 3.9 of the track specification:

1. **Supabase Client `<Database>` Generic Binding & Column Discrepancy Prevention:**
   - Assert at compile time that Supabase client factories (`utils/supabase/client.ts`, `utils/supabase/server.ts`, `utils/supabase/admin.ts`, `utils/supabase/auth-helper.ts`) return `SupabaseClient<Database>` rather than untyped `SupabaseClient<any>`.
   - Assert at compile time via `@ts-expect-error` directives that querying non-existent tables or inserting/updating non-existent columns fails `tsc` compilation.
2. **Mapbox Type Resolution vs. `any` Shim Hardening:**
   - Assert at compile time that `react-map-gl/mapbox` exports (`MapRef`, `Source`, `Layer`, `Marker`, `MapProvider`, `useMap`) resolve to concrete library types and interfaces rather than the fallback `any` types declared in `lib/shims.d.ts:3-12`.
3. **Pointer-Capture Patch Client Boundary & Runtime Safety:**
   - Assert at unit test level that `lib/utils/pointer-capture-patch.ts` begins with the mandatory `"use client"` directive so Next.js App Router packages the defensive monkey-patch in browser runtime instead of dead-code evaluating in Server Component boundaries (`app/layout.tsx`).
   - Assert that `initPointerCaptureDefensivePatch` exports cleanly, is idempotent, handles non-browser / SSR environments (`window` or `Element` undefined) without throwing, and suppresses `NotFoundError`, `InvalidPointerId`, and generic `DOMException` occurrences.

### 1.2 Development Methodology: Strict TDD Red Phase
In compliance with `conductor/workflow.md` and the TDD Task Granularity Invariant ([AGENTS.md](../../../AGENTS.md) Section 5):
- All type assertions and unit tests are authored against the **current unhardened codebase**.
- In the baseline state:
  - `utils/supabase/client.ts`, `server.ts`, `admin.ts`, and `auth-helper.ts` do not pass `<Database>` to `createBrowserClient` / `createServerClient` (returning `SupabaseClient<any>`), causing `@ts-expect-error` directives on invalid tables/columns to trigger `TS2578: Unused '@ts-expect-error' directive` and failing `AssertNotAny` type guards.
  - `lib/shims.d.ts:3-12` shims `react-map-gl/mapbox` as `any`, causing `AssertNotAny<MapRef>` and component type assertions to evaluate to `false` and fail `tsc`.
  - `lib/utils/pointer-capture-patch.ts` lacks the `"use client"` directive, causing the file inspection unit test to fail.
- Modifying application code (`utils/supabase/*.ts`, `lib/shims.d.ts`, `lib/utils/pointer-capture-patch.ts`) and fixing consuming store/service type errors is strictly reserved for Phase 6 Task 2 (Green phase).

---

## 2. Invariants & Critical Guardrails

1. **Production Database Safety ([AGENTS.md](../../../AGENTS.md) Critical Guardrail 1):**
   - Strictly zero database mutations or migrations during this phase.
2. **Containerized Test Execution ([AGENTS.md](../../../AGENTS.md) Section 3):**
   - RHEL 8 glibc (2.28) is incompatible with native SWC. All Jest unit test runs must execute via the container runner:
     `./scripts/containers/run-jest-container.sh [jest_args]` (requires `BypassSandbox: true`).
3. **Type-Check Gate Invariant:**
   - Static type checking is executed via `npm run type-check` (`npx tsc -p tsconfig.json --noEmit --incremental false`).
4. **TDD Red Phase Invariant (`conductor/workflow.md`):**
   - Tests and compiler assertions must be proven failing before any application code changes are authored.
   - Commit scope must be strictly `test(types): ...`.
5. **Modal Approval Invariant (`conductor_antigravity.md` & [AGENTS.md](../../../AGENTS.md) Section 2):**
   - Halt immediately for affirmative user approval via the `ask_question` modal before creating or modifying any files on disk.

---

## 3. Target Files & Semantic Insertion Anchors

### 3.1 Target 1: Type Test & Client Seam Test Suite
- **Path:** `lib/services/__tests__/client-types.test.ts`
- **Semantic Insertion Anchor:** Entirely new test file located in `lib/services/__tests__/`. Automatically included in TypeScript compilation via `tsconfig.json` (`"include": ["**/*.ts"]`).
- **File Role:** Contains static compile-time type assertions and runtime Jest checks for Supabase clients and Mapbox types.

### 3.2 Target 2: Pointer-Capture Patch Unit Test Suite
- **Path:** `lib/utils/__tests__/pointer-capture-patch.test.ts`
- **Semantic Insertion Anchor:** Inside `describe('Pointer Capture Defensive Patch', () => { ... })`, immediately after line 75 (after existing test `catches and suppresses exceptions if setPointerCapture fails on invalid pointer`), before closing `});` on line 76.
- **File Role:** Expanded with assertions verifying function export, SSR safety, idempotency, broader DOMException suppression, and the `"use client"` directive in `lib/utils/pointer-capture-patch.ts`.

### 3.3 Target 3: Track Plan
- **Path:** `conductor/tracks/postgrest-rls-storage-hardening_20261104/plan.md`
- **Semantic Insertion Anchor:** Lines 88–92 under `## Phase 6: Supabase <Database> Typing & Module Seam Rigor (Strict TDD)`.
- **File Role:** Mark task complete with commit hash upon verification.

---

## 4. TypeScript Interfaces & Type Blueprints

The following type utilities and assertions define the compile-time contract in `lib/services/__tests__/client-types.test.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import type { MapRef } from 'react-map-gl/mapbox';
import { Source, Layer, Marker, MapProvider, useMap } from 'react-map-gl/mapbox';

/**
 * Compile-time guard detecting if type T is 'any'.
 * In TypeScript, 0 extends (1 & any) evaluates to true, whereas for any concrete type or unknown it evaluates to false.
 */
export type IsAny<T> = 0 extends 1 & T ? true : false;

/**
 * Asserts that T is NOT 'any'. Evaluates to true if concrete, false if 'any'.
 */
export type AssertNotAny<T> = IsAny<T> extends true ? false : true;

/**
 * Asserts that two types are strictly equal.
 */
export type AssertEqual<T, U> = [T] extends [U] ? ([U] extends [T] ? true : false) : false;

/**
 * Extracts Database generic from SupabaseClient instance C and asserts it matches Database and is not any.
 */
export type AssertClientIsDatabaseTyped<C> = C extends SupabaseClient<infer DB, any, any>
  ? (IsAny<DB> extends true ? false : (DB extends Database ? true : false))
  : false;

/**
 * Type-level assertion constraint. Fails compilation with TS2344 if argument is not true.
 */
export type ExpectTrue<T extends true> = T;
```

---

## 5. Precise Behavioral Logic & Test Design

### 5.1 Type Assertions in `lib/services/__tests__/client-types.test.ts`

1. **Browser Client Factory Typing:**
   - Evaluate `ReturnType<typeof createBrowserClient>` against `AssertClientIsDatabaseTyped`.
   - In Red phase: Evaluates to `false` (fails constraint `T extends true`) because `utils/supabase/client.ts` calls `createBrowserClient(...)` without `<Database>`.
2. **Server Client Factory Typing:**
   - Evaluate `Awaited<ReturnType<typeof createServerClient>>` against `AssertClientIsDatabaseTyped`.
   - In Red phase: Evaluates to `false` (fails constraint `T extends true`) because `utils/supabase/server.ts` calls `createServerClient(...)` without `<Database>`.
3. **Admin Client Factory Typing:**
   - Evaluate `Awaited<ReturnType<typeof createAdminClient>>` against `AssertClientIsDatabaseTyped`.
   - In Red phase: Evaluates to `false` (fails constraint `T extends true`) because `utils/supabase/admin.ts` calls `createServerClient(...)` without `<Database>`.
4. **Compiler Rejection for Invalid Tables & Columns (`@ts-expect-error`):**
   - Assert that invoking `.from('non_existent_table_seam_check')` triggers a compilation error once typed.
   - Assert that invoking `.from('wineries').insert({ non_existent_column_seam_check: 123 })` triggers a compilation error once typed.
   - In Red phase: The current untyped client allows arbitrary strings and fields. TypeScript therefore reports `error TS2578: Unused '@ts-expect-error' directive`, confirming the Red phase failure.
5. **Mapbox Native Type Resolution vs. `any` Shim:**
   - Evaluate `AssertNotAny<MapRef>` against `ExpectTrue`.
   - Evaluate `AssertNotAny<typeof Source>`, `AssertNotAny<typeof Layer>`, `AssertNotAny<typeof Marker>`, `AssertNotAny<typeof MapProvider>`, `AssertNotAny<typeof useMap>` against `ExpectTrue`.
   - In Red phase: `lib/shims.d.ts:3-12` declares all these as `any`. `AssertNotAny` evaluates to `false`, causing `tsc` compilation errors.
6. **Jest Runtime Verification:**
   - Provide runtime `describe('Supabase Client and Mapbox Runtime Seams', () => { ... })` testing that client factory objects instantiate with expected Supabase methods (`auth`, `from`, `rpc`, `storage`) and Mapbox components are defined.

### 5.2 Unit Test Expansion in `lib/utils/__tests__/pointer-capture-patch.test.ts`

Add test cases covering:
1. **Export Callable:** `expect(typeof initPointerCaptureDefensivePatch).toBe('function');`.
2. **SSR / Headless Environment Safety:** Temporarily set `window` / `Element` to `undefined` or delete them in a controlled test block, invoke `initPointerCaptureDefensivePatch()`, and assert no exception is thrown (`expect(...).not.toThrow()`).
3. **Idempotency:** Call `initPointerCaptureDefensivePatch()` multiple times consecutively and assert that `releasePointerCapture` and `setPointerCapture` remain intact and functional without recursive nesting loops.
4. **DOMException Broad Suppression:** Assert that when native `releasePointerCapture` or `setPointerCapture` throws different variants of `DOMException` (e.g. `InvalidPointerId`, `SecurityError`, or generic `DOMException`), the patch catches and swallows the error without re-throwing.
5. **Client Directive Verification (Red Phase Seam):** Read `lib/utils/pointer-capture-patch.ts` using `fs.readFileSync` and assert that the file content starts with or contains `"use client"`:
   ```typescript
   it('includes "use client" directive at top of file for Next.js App Router client execution', () => {
     const filePath = path.resolve(__dirname, '../pointer-capture-patch.ts');
     const fileContent = fs.readFileSync(filePath, 'utf8');
     const lines = fileContent.trim().split('\n');
     const hasUseClient = lines.some(line => line.trim() === '"use client"' || line.trim() === "'use client'");
     expect(hasUseClient).toBe(true);
   });
   ```
   - In Red phase: `lib/utils/pointer-capture-patch.ts` does not contain `"use client"`. This unit test will FAIL (Red).
   - In Green phase: Adding `"use client"` in Phase 6 Task 2 turns this test Green.

---

## 6. Execution Verification Protocol

### 6.1 Static Inspection Verification (Planning Gate)
Zero test commands or builds were executed during this planning phase, fulfilling the static inspection mandate.

### 6.2 Pre-Execution State
- Ensure local working tree is clean.
- Ensure no modifications to `utils/supabase/*.ts`, `lib/shims.d.ts`, or `lib/utils/pointer-capture-patch.ts` are made during Task 1.

### 6.3 Test Commands & Expected Red Phase Output

1. **Static Type Assertion Check:**
   ```bash
   npm run type-check
   ```
   - **Expected Result:** `FAIL` (exit code 2).
   - **Expected TypeScript Errors:**
     - `Type 'false' does not satisfy the constraint 'true'` on client factory type assertions (`AssertClientIsDatabaseTyped`).
     - `Type 'false' does not satisfy the constraint 'true'` on Mapbox type assertions (`AssertNotAny<MapRef>`, `AssertNotAny<typeof Source>`, etc.).
     - `error TS2578: Unused '@ts-expect-error' directive.` on `.from('non_existent_table_seam_check')` and `.from('wineries').insert(...)`.

2. **Pointer Capture Patch Unit Test Suite:**
   ```bash
   ./scripts/containers/run-jest-container.sh lib/utils/__tests__/pointer-capture-patch.test.ts
   ```
   - **Expected Result:** `FAIL` (exit code 1).
   - **Failing Assertion:** `includes "use client" directive at top of file for Next.js App Router client execution` (`expected true, received false`).
   - Existing 4 pointer-capture tests continue to pass.

3. **Client Types Jest Suite:**
   ```bash
   ./scripts/containers/run-jest-container.sh lib/services/__tests__/client-types.test.ts
   ```
   - **Expected Result:** Runtime assertions pass in Jest while static types fail in `npm run type-check`.

---

## 7. Post-Execution Protocol & Git Notes

Upon confirming the expected Red phase failures across `npm run type-check` and `run-jest-container.sh`:

### 7.1 Stage & Commit
```bash
git add lib/services/__tests__/client-types.test.ts lib/utils/__tests__/pointer-capture-patch.test.ts
git commit -m "test(types): add failing type assertions & seam regression tests for Supabase clients and Mapbox types (TDD Red phase)"
```

### 7.2 Attach Git Note
Obtain the commit SHA (`COMMIT_HASH=$(git log -1 --format="%H")`) and attach the standard metadata note:

```bash
git notes add -m "Task: Write failing type assertions & seam regression tests for Supabase clients and Mapbox types (TDD Red phase)
Summary: Added compile-time type assertions in lib/services/__tests__/client-types.test.ts verifying Supabase client factories return SupabaseClient<Database> and Mapbox exports resolve to concrete types rather than any. Added seam tests in lib/utils/__tests__/pointer-capture-patch.test.ts asserting SSR safety, idempotency, DOMException resilience, and 'use client' directive presence. Confirmed type-check and Jest failures against baseline unhardened code.
Files: lib/services/__tests__/client-types.test.ts, lib/utils/__tests__/pointer-capture-patch.test.ts
Rationale: Strict TDD Red phase for Phase 6 of Issue #93, establishing definitive compiler and runtime regression baselines before binding <Database> generic across client factories, removing Mapbox any shims, and adding 'use client' to pointer-capture-patch.ts." $COMMIT_HASH
```

### 7.3 Update Conductor Plan
Update `conductor/tracks/postgrest-rls-storage-hardening_20261104/plan.md`:
- Mark subtasks complete and update Task status:
  `- [x] Task: Write failing type assertions & seam regression tests for Supabase clients and Mapbox types (TDD Red phase) [commit: <short_sha>]`
- Stage and commit:
  ```bash
  git add conductor/tracks/postgrest-rls-storage-hardening_20261104/plan.md
  git commit -m "conductor(plan): Mark task 'Write failing type assertions & seam regression tests for Supabase clients and Mapbox types (TDD Red phase)' as complete"
  ```

---

## 8. Confirmation Gate

Halt immediately. Do NOT create `lib/services/__tests__/client-types.test.ts`, edit `lib/utils/__tests__/pointer-capture-patch.test.ts`, or modify any other repository files until explicit affirmative user approval is received via the `ask_question` modal.
