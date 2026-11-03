# Implementation Plan: Phase 4 Task 2 — Execute Full Containerized Test Suite & Production Build

**Track:** `db-security-hardening_20261026` (Issue [#87](https://github.com/jarredb9/finger-lakes-app-57/issues/87))  
**Phase:** 4 (Security Advisor Linter & Final Quality Gates — Verification)  
**Task:** 2 (Execute Full Containerized Test Suite & Production Build)  
**ADR Reference:** [docs/adr/0007-security-invoker-rpc-boundary-and-catalog-immutability.md](../../../docs/adr/0007-security-invoker-rpc-boundary-and-catalog-immutability.md)  
**Domain Context:** [CONTEXT.md](../../../CONTEXT.md)  
**Specification Reference:** [conductor/tracks/db-security-hardening_20261026/spec.md](./spec.md)  
**Track Plan Reference:** [conductor/tracks/db-security-hardening_20261026/plan.md](./plan.md)  
**Workflow Reference:** [conductor/workflow.md](../../workflow.md)  

---

## 1. Executive Summary & Objective

### 1.1 Objective
Execute the comprehensive automated test matrix and production build pipeline to certify the final quality gate of the database security hardening track (Issue #87). Specifically:
1. **Containerized Unit Test Matrix:** Execute the entire Jest unit test suite (`npm run test:container`) inside the isolated container runner (Ubuntu 24.04 / Node.js 24 / glibc 2.39) to verify zero application-layer regressions across stores, hooks, components, and utilities following the removal of legacy RPCs and RLS lockdown.
2. **Containerized Integration Test Matrix:** Execute all database integration test suites (`npm run test:integration:container`) sequentially (`--runInBand`) against the live local PostgreSQL stack (`http://127.0.0.1:54321`), verifying that RLS denials, caller-scoped RPC mutations, catalog immutability, idempotency constraints, and privacy redaction hold under live PostgREST transactions.
3. **Production Next.js Compilation & Serwist PWA Generation:** Execute the production build (`npm run build` and containerized build `npm run build:container`) verifying static type compilation, Webpack/SWC asset compilation, React 19 compiler optimization, Serwist service worker bundling (`swSrc: "app/sw.ts"`, `swDest: "public/sw.js"`), and route compilation.
4. **Artifact Hygiene & Working Tree Sanitization:** Assert that no temporary test artifacts, uncommitted schema dumps, or stray logs remain, leaving the Git working tree in a clean, pristine state (`git status --porcelain` produces 0 lines).

### 1.2 Operational Context & Scope
Throughout Phases 1, 2, 3, and 4 Task 1:
- **Migration & Schema Lockdown:** `20261026000000_harden_rls_and_security_invoker_rpcs.sql` eliminated unauthenticated access, dismantled `pg_graphql`, revoked direct table mutations on `public.wineries`, dropped 10 deprecated RPCs, converted 26 user RPCs to `SECURITY INVOKER`, scoped idempotency keys by `(user_id, idempotency_key)`, and enforced strict boundary guards on 7 `SECURITY DEFINER` functions per ADR-0007.
- **Config & Types Pruned:** `supabase/config.toml` pruned `graphql_public`, and `lib/database.types.ts` was regenerated and verified.
- **Security Advisor Certified:** Phase 4 Task 1 verified 0 warnings across categories `0026`, `0027`, `0028`, and `0029` via `npm run db:verify-advisor` and `scripts/db/verify-security-advisor.sql`.

Task 2 serves as the automated quality firewall before proceeding to Phase 4 Task 3 (Manual Verification & Phase Checkpointing).

---

## 2. Invariants & Critical Guardrails

1. **Production Database Safety (`AGENTS.md` Critical Guardrail 1):**
   - Strictly no DDL or DML mutations against remote Supabase (`jfsxclrdxmvftxacjuqf`).
   - All integration tests target the local Podman Supabase stack (`http://127.0.0.1:54321`).
2. **Container Runner & BypassSandbox Mandates (`AGENTS.md` Section 3):**
   - RHEL 8 glibc (2.28) is incompatible with Next.js 16.3+ native SWC (requires glibc 2.29+).
   - All container runner executions (`./scripts/containers/run-jest-container.sh`, `./scripts/containers/run-build-container.sh`, `npm run test:container`, `npm run test:integration:container`, `npm run build:container`) require `BypassSandbox: true`.
3. **Serial Integration Test Execution (`--runInBand`):**
   - Integration tests share the local PostgreSQL instance. Concurrent execution causes transactional deadlocks and test user collision. All integration tests must execute with `--runInBand` via `npm run test:integration:container`.
4. **PWA Service Worker & Asset Hygiene:**
   - Production builds generate `public/sw.js` and assets. Ensure generated artifacts match `.gitignore` rules and do not create dirty Git status.
5. **Zero Regression Invariant:**
   - 100% of non-deprecated unit test suites and integration test suites must pass with exit code 0.
6. **Modal Approval Gate (`conductor_antigravity.md` & `AGENTS.md` Section 2):**
   - Halt immediately for affirmative user approval via `ask_question` before executing any commands on disk.

---

## 3. Target Files & Semantic Insertion Anchors

### 3.1 Target 1: Conductor Track Plan
- **Path:** `conductor/tracks/db-security-hardening_20261026/plan.md`
- **Semantic Insertion Anchor:** Under `## Phase 4: Security Advisor Linter & Final Quality Gates (Verification)` (lines 65–69):
  ```markdown
  - [ ] Task: Execute Full Containerized Test Suite & Production Build
      - [ ] Run full unit test suite: `npm run test:container`.
      - [ ] Run full integration test suite: `npm run test:integration:container`.
      - [ ] Run production build: `npm run build`.
      - [ ] Remove any temporary log or test artifacts and verify clean git status.
  ```
- **Replacement:** Mark completed with task commit SHA:
  ```markdown
  - [x] Task: Execute Full Containerized Test Suite & Production Build [commit: <short_sha>]
      - [x] Run full unit test suite: `npm run test:container`.
      - [x] Run full integration test suite: `npm run test:integration:container`.
      - [x] Run production build: `npm run build`.
      - [x] Remove any temporary log or test artifacts and verify clean git status.
  ```

### 3.2 Target 2: Quality Gate Execution & Verification Protocol
- **Path:** `scripts/ci/quality-gate-types.ts` (Reference Types Blueprint below)
- **Purpose:** Formalizes the TypeScript contracts, scorecard data models, and exit condition invariants for all quality gate phases.

---

## 4. TypeScript Interfaces & Type Blueprints

The following TypeScript definitions specify the data contracts and exit conditions governing the Phase 4 Task 2 quality gate execution:

```typescript
/**
 * Canonical stages comprising the Phase 4 Task 2 quality gate pipeline.
 */
export type QualityGateStage =
  | 'preflight-db-status'
  | 'unit-test-suite'
  | 'integration-test-suite'
  | 'production-build-host'
  | 'production-build-container'
  | 'artifact-hygiene-check';

/**
 * Execution status for an individual quality gate stage.
 */
export interface StageExecutionResult {
  stage: QualityGateStage;
  command: string;
  exitCode: number;
  durationMs: number;
  passed: boolean;
  totalTestsRan?: number;
  suitesPassed?: number;
  suitesFailed?: number;
  diagnostics?: string[];
}

/**
 * Composite quality gate scorecard certifying deployment readiness.
 */
export interface QualityGateScorecard {
  timestamp: string;
  trackId: 'db-security-hardening_20261026';
  phase: 4;
  task: 2;
  allPassed: boolean;
  stages: Record<QualityGateStage, StageExecutionResult>;
  workingTreeStatus: {
    clean: boolean;
    untrackedFiles: string[];
    modifiedFiles: string[];
  };
}

/**
 * Execution invariant validator signature.
 */
export declare function validateQualityGateExecution(
  scorecard: QualityGateScorecard
): { valid: boolean; failureReasons: string[] };
```

---

## 5. Precise Behavioral Logic & Quality Gate Protocol

### 5.1 Stage 1: Pre-flight Database Stack Health Check
1. **Verification Command:** `npm run db:status`
2. **Assertions:**
   - PostgreSQL is running and accepting connections on `127.0.0.1:54322`.
   - PostgREST API is active on `http://127.0.0.1:54321`.
   - Auth service (GoTrue) is active.
   - Storage service is active.
3. **Failure Handling:** If containers are stopped or unhealthy, run `npm run db:start` and verify restorecon on `./supabase/functions`.

### 5.2 Stage 2: Containerized Unit Test Suite Execution
1. **Verification Command:** `npm run test:container`
2. **Behavioral Invariants:**
   - Runs `./scripts/containers/run-jest-container.sh` with `TEST_TYPE` unset (unit test mode).
   - In accordance with `jest.config.mjs`, all `*.integration.test.*` files are ignored during this run.
   - Every unit test suite across stores (`lib/stores/__tests__/*`), services (`lib/services/__tests__/tripService.mutations.test.ts`), hooks (`hooks/__tests__/*`), components (`components/__tests__/*`), and utilities (`lib/utils/__tests__/*`) must execute cleanly.
   - Zero test suites or individual tests may fail (`suitesFailed === 0`, `testsFailed === 0`).
   - Jest exits with code 0.
3. **Failure Handling:**
   - If any unit test fails due to unexpected mock or environment assumptions, inspect failure trace, apply surgical fix adhering to zero-regression principles, and re-run.

### 5.3 Stage 3: Containerized Integration Test Suite Execution
1. **Verification Command:** `npm run test:integration:container`
2. **Behavioral Invariants:**
   - Runs `TEST_TYPE=integration ./scripts/containers/run-jest-container.sh --runInBand`.
   - Matches all `**/*.integration.test.[jt]s?(x)` files against the local Supabase container stack.
   - Crucial security coverage certified:
     - `lib/services/__tests__/supabase-rpc.integration.test.ts`: Unauthenticated `anon` access denial (RLS), direct `INSERT` prevention on `public.wineries`, `ensure_winery` catalog immutability, `(user_id, idempotency_key)` composite isolation, and email redaction for non-friends.
     - `lib/services/__tests__/supabase-rpc-idempotency.integration.test.ts`: Idempotency key handling and conflict safety.
     - `lib/services/__tests__/db-optimization.integration.test.ts`: RPC schema and performance integrity.
   - All integration tests must pass cleanly (`exitCode === 0`).

### 5.4 Stage 4: Production Next.js Build Compilation
1. **Verification Commands:**
   - Host build: `npm run build` (`next build --webpack`)
   - Container build: `npm run build:container` (`./scripts/containers/run-build-container.sh`)
2. **Behavioral Invariants:**
   - TypeScript static compilation succeeds with 0 type errors.
   - Webpack production bundling completes successfully.
   - React 19 compiler pass validates component optimizations.
   - Serwist PWA service worker compiles from `app/sw.ts` to `public/sw.js` without emitting uncaught errors.
   - Output routes (`/`, `/explore`, `/trips`, `/profile`, `/api/*`) generate valid static and dynamic server artifacts.
   - Exit code must be 0.

### 5.5 Stage 5: Artifact Hygiene & Clean Git Status Check
1. **Verification Command:** `git status --porcelain`
2. **Behavioral Invariants:**
   - Any temporary `.tmp`, `.log`, or test result files must be deleted or verified ignored by `.gitignore`.
   - `public/sw.js` is ignored per `.gitignore`.
   - No untracked files (`??`) or unstaged changes (`M `) remain in the working directory.
   - Output of `git status --porcelain` must be completely empty before staging the task completion commit.

---

## 6. Execution Verification Protocol

The executor will run the following sequence in order:

### 6.1 Database Status Check (Pre-flight)
```bash
npm run db:status
```
*Sandbox Mode:* `BypassSandbox: true` (host Podman socket).  
*Expected Output:* All Supabase local services reported as `running` or `healthy`.

### 6.2 Full Containerized Unit Test Suite
```bash
npm run test:container
```
*Sandbox Mode:* `BypassSandbox: true` (runs inside Podman container).  
*Expected Output:* All unit test suites pass (`Ran all test suites.`), exit code 0.

### 6.3 Full Containerized Integration Test Suite
```bash
npm run test:integration:container
```
*Sandbox Mode:* `BypassSandbox: true` (runs inside Podman container with `--runInBand` targeting local PostgreSQL).  
*Expected Output:* All integration test suites pass (including 5 security regression suites in `supabase-rpc.integration.test.ts`), exit code 0.

### 6.4 Production Next.js Build
```bash
npm run build
```
*Sandbox Mode:* `BypassSandbox: false` (Host WASM fallback).  
*Expected Output:* Compiled successfully, Serwist service worker generated, exit code 0.

### 6.5 Production Container Build Verification
```bash
npm run build:container
```
*Sandbox Mode:* `BypassSandbox: true` (Container native SWC compiler).  
*Expected Output:* Compiled successfully in container, exit code 0.

### 6.6 Artifact Hygiene & Clean Status Verification
```bash
git status --porcelain
```
*Sandbox Mode:* `BypassSandbox: false`.  
*Expected Output:* Completely empty output (no untracked or modified files).

---

## 7. Post-Execution Protocol & Git Notes

Upon successful execution of all quality gates:

### 7.1 Stage & Commit Quality Gate Certification
Create the task completion commit:
```bash
git commit --allow-empty -m "test(quality-gate): execute full containerized test suite and production build (#87)"
```
*Note:* If any minor test assertion adjustments or scaffolding cleanups were required during execution, stage the specific modified files prior to committing (`git add <files>`).

### 7.2 Attach Git Note
Obtain the commit SHA (`COMMIT_HASH=$(git log -1 --format="%H")`) and attach the standard metadata note:

```bash
git notes add -m "Task: Execute Full Containerized Test Suite & Production Build
Summary: Executed the complete automated test matrix (unit tests via npm run test:container, integration tests via npm run test:integration:container) and production build pipeline (npm run build and build:container) verifying zero regressions, robust RLS security enforcement, and clean PWA bundle compilation against the hardened database schema.
Files: conductor/tracks/db-security-hardening_20261026/plan.md
Rationale: Certifies the final automated quality gate for Phase 4 of Issue #87, ensuring complete system stability and static compilation integrity before conducting manual verification." $COMMIT_HASH
```

### 7.3 Update Conductor Plan
Update `conductor/tracks/db-security-hardening_20261026/plan.md`:
- Mark `- [ ] Task: Execute Full Containerized Test Suite & Production Build` as `- [x] Task: Execute Full Containerized Test Suite & Production Build [commit: <short_sha>]`.
- Mark all 4 subtasks as completed (`- [x]`).
- Stage `conductor/tracks/db-security-hardening_20261026/plan.md`.
- Commit with: `conductor(plan): Mark task 'Execute Full Containerized Test Suite & Production Build' as complete`.

---

## 8. Confirmation Gate

Halt immediately. Do NOT execute any test commands or modify any repository files until explicit affirmative user approval is received via the `ask_question` modal.
