# Implementation Plan: Phase 7 Task 1 — Add Missing Verification Steps and Function Deployments to `.github/workflows/ci.yml`

**Track:** `postgrest-rls-storage-hardening_20261104` (Issue [#93](https://github.com/jarredb9/finger-lakes-app-57/issues/93))  
**Phase:** 7 (Wire CI/CD Verification Gates & Docker Reliability — Verification & CI/CD)  
**Task:** 1 (Add missing verification steps and function deployments to `.github/workflows/ci.yml`)  
**Preceding Context:** [conductor/tracks/postgrest-rls-storage-hardening_20261104/phase-6-task-2-plan.md](./phase-6-task-2-plan.md)  
**ADR References:**
- [docs/adr/0007-security-invoker-rpc-boundary-and-catalog-immutability.md](../../../docs/adr/0007-security-invoker-rpc-boundary-and-catalog-immutability.md)
- [docs/adr/0010-direct-table-rls-privilege-revocation-and-private-storage.md](../../../docs/adr/0010-direct-table-rls-privilege-revocation-and-private-storage.md)  
**Domain Context:** [CONTEXT.md](../../../CONTEXT.md)  
**Specification Reference:** [conductor/tracks/postgrest-rls-storage-hardening_20261104/spec.md](./spec.md) Section 3.10  
**Track Plan Reference:** [conductor/tracks/postgrest-rls-storage-hardening_20261104/plan.md](./plan.md) lines 103–110  
**Workflow Reference:** [conductor/workflow.md](../../workflow.md)  

---

## 1. Executive Summary & Objective

### 1.1 Objective
Eliminate critical verification gaps and deployment omissions in the continuous integration pipeline (`.github/workflows/ci.yml`) to guarantee that all automated security, type safety, code quality, and integration assertions introduced across Issue [#87](https://github.com/jarredb9/finger-lakes-app-57/issues/87) and Issue [#93](https://github.com/jarredb9/finger-lakes-app-57/issues/93) are enforced on every push and pull request before code reaches production:

1. **Static Analysis & Fast-Fail Early Quality Gates:**
   - Add `npm run lint` to enforce ESLint standards (including rules preventing timer leaks like `playwright/no-wait-for-timeout`).
   - Add `npm run type-check` to enforce zero TypeScript compiler errors across all application code, store slices, and test suites with strongly-typed `<Database>` generics.
2. **Edge Function Deno Test Verification:**
   - Provision Deno v2.x via `denoland/setup-deno@v2`.
   - Add `npm run test:functions` to execute Deno test assertions for edge function routing, CORS headers, URL resolution, and authentication contracts.
3. **Database Security Advisor Verification Gate:**
   - Add `npm run db:verify-advisor` to assert zero violations across Security Advisor categories `0007`, `0008`, `0010`, `0026`, `0027`, `0028`, and `0029` against a freshly migrated local Supabase database instance.
   - Patch `scripts/db/verify-security-advisor.ts` to ensure portable Docker/Podman socket resolution, preventing socket connection errors when executed in Ubuntu GitHub Actions runners.
4. **Integration Test Suite Enforcement:**
   - Add `npm run test:integration` (`TEST_TYPE=integration jest --runInBand`) to run full PostgREST RLS, storage object access, trip membership validation, and bilateral consent test suites against the running local Supabase stack.
5. **Complete Production Edge Function Deployment Manifest:**
   - Add `supabase functions deploy send-social-notification --remote=jfsxclrdxmvftxacjuqf --yes` to the `deploy` job alongside `get-winery-details` and `search-wineries`, ensuring the webhook target invoked by database triggers is deployed to production.
6. **Workflow Syntax & Schema Integrity:**
   - Validate `.github/workflows/ci.yml` YAML structure and GitHub Actions step syntax using Python YAML parser.

### 1.2 Architectural & Security Context
- Prior to this task, `.github/workflows/ci.yml` only executed `npm run test` (Jest unit tests) in the `build` job. Because `jest.config.mjs` deliberately ignores `*.integration.test.ts` during standard `npm run test`, the entire RLS security regression suite (Phases 1, 2, and 3) was skipped in CI.
- Neither `npm run lint` nor `npm run type-check` ran in CI, allowing TypeScript errors or lint violations to bypass automated gates if not caught locally.
- `send-social-notification` was invoked by database triggers via `pg_net` but omitted from production Edge Function deployments in `ci.yml`, creating risk of dead webhook execution in production.
- Expanding the verification matrix ensures complete automated enforcement of [ADR-0007](../../../docs/adr/0007-security-invoker-rpc-boundary-and-catalog-immutability.md) and [ADR-0010](../../../docs/adr/0010-direct-table-rls-privilege-revocation-and-private-storage.md) invariants.

---

## 2. Invariants & Critical Guardrails

1. **Production Database Safety ([AGENTS.md](../../../AGENTS.md) Critical Guardrail 1):**
   - Strictly zero migrations, DDL, or DML mutations executed against the remote Supabase project (`jfsxclrdxmvftxacjuqf`) during verification or planning.
   - Remote deployments remain isolated strictly to the `deploy` job triggered on `refs/heads/main` push / workflow dispatch.
2. **Expand-and-Contract & Deterministic CI:**
   - Step ordering in `.github/workflows/ci.yml` must follow fail-fast ordering: fast static checks (`lint`, `type-check`, `test:functions`) run before Supabase Docker container provisioning; database security advisor and integration tests run after database bootstrap and `supabase db reset`.
3. **Environment Portability (Docker & Podman):**
   - Commands executed in CI run on `ubuntu-latest` with native Docker (`/var/run/docker.sock`). Local development commands on RHEL 8 use Podman (`/run/user/$UID/podman/podman.sock`). `scripts/db/verify-security-advisor.ts` must conditionally detect socket existence rather than hardcoding Podman.
4. **Modal Approval Invariant (`conductor_antigravity.md` & [AGENTS.md](../../../AGENTS.md) Section 2):**
   - Halt immediately for explicit affirmative user approval via the `ask_question` modal before modifying any files on disk.

---

## 3. Target Files & Semantic Insertion Anchors

### 3.1 Target 1: GitHub Actions CI/CD Pipeline
- **Path:** `.github/workflows/ci.yml`
- **Semantic Insertion Anchors:**
  1. **Anchor 1 (Static Analysis & Deno Edge Function Tests):**
     - *Location:* In `build` job, directly after `Audit Dependencies (High & Critical)` (line 49) and before `Setup Supabase CLI` (line 51).
     - *Inserted Steps:*
       - `name: Lint Source Code` (`run: npm run lint`)
       - `name: Type Check TypeScript` (`run: npm run type-check`)
       - `name: Setup Deno` (`uses: denoland/setup-deno@v2`, `with: deno-version: v2.x`)
       - `name: Run Edge Function Tests` (`run: npm run test:functions`)
  2. **Anchor 2 (Security Advisor & Jest Integration Tests):**
     - *Location:* In `build` job, directly after `Verify Migrations (Fresh Build)` (line 125) and `Run Jest tests` (line 128).
     - *Inserted Steps:*
       - `name: Verify Security Advisor (Zero Warnings)` (`run: npm run db:verify-advisor`)
       - `name: Run Jest Integration Tests` (`run: npm run test:integration`)
  3. **Anchor 3 (Edge Function Production Deployment):**
     - *Location:* In `deploy` job, inside `Deploy Edge Functions` step (line 317).
     - *Inserted Command:*
       `supabase functions deploy send-social-notification --remote=jfsxclrdxmvftxacjuqf --yes`

### 3.2 Target 2: Security Advisor Verification Runner
- **Path:** `scripts/db/verify-security-advisor.ts`
- **Semantic Insertion Anchors:**
  1. **Anchor 1 (Node `fs` Import):**
     - *Location:* Line 8 (alongside `child_process`, `dotenv`, `path`).
     - *Insertion:* `import * as fs from 'fs';`
  2. **Anchor 2 (Portable Docker/Podman Host Resolution Helper):**
     - *Location:* Before `executeSqlCatalogVerification` (line 140).
     - *Insertion:* Helper function `resolveDockerHost(): string | undefined` that inspects `process.env.DOCKER_HOST`, falls back to `unix://${podmanSock}` only if the socket exists on the filesystem (`fs.existsSync(podmanSock)`), and returns `undefined` for standard Docker environments.
  3. **Anchor 3 (Environment Injection in CLI Invocations):**
     - *Location:* In `executeSqlCatalogVerification` (lines 145–151) and `executeCliLinter` (lines 178–184).
     - *Insertion:* Use `resolveDockerHost()` and only pass `DOCKER_HOST` if defined, preserving standard Docker daemon socket access on Ubuntu CI runners.

### 3.3 Target 3: Track Plan
- **Path:** `conductor/tracks/postgrest-rls-storage-hardening_20261104/plan.md`
- **Semantic Insertion Anchor:** Under `## Phase 7: Wire CI/CD Verification Gates & Docker Reliability (Verification & CI/CD)` (lines 103–110):
  Mark task and all subtasks as complete `[x]` with commit hash.

---

## 4. TypeScript Interfaces & Blueprint Signatures

### 4.1 Security Advisor Socket Resolution Signatures (`scripts/db/verify-security-advisor.ts`)
```typescript
/**
 * Detects portable Docker / Podman socket location.
 * Respects explicit DOCKER_HOST if provided, falls back to user Podman socket
 * only if present on disk, or returns undefined for default Docker daemon.
 */
export function resolveDockerHost(): string | undefined;

/**
 * Executes verify-security-advisor.sql against running local Supabase stack.
 */
export async function executeSqlCatalogVerification(): Promise<{
  passed: boolean;
  error?: string;
}>;

/**
 * Executes Supabase CLI linter and collects category violations.
 */
export async function executeCliLinter(): Promise<{
  rawOutput: string;
  violationsFound: string[];
}>;
```

### 4.2 GitHub Actions Step Blueprint Structure
```yaml
# Step 1: Static Code Lint
- name: Lint Source Code
  run: npm run lint

# Step 2: TypeScript Type Check
- name: Type Check TypeScript
  run: npm run type-check

# Step 3: Deno v2 Setup
- name: Setup Deno
  uses: denoland/setup-deno@v2
  with:
    deno-version: v2.x

# Step 4: Edge Function Deno Tests
- name: Run Edge Function Tests
  run: npm run test:functions

# Step 5: Security Advisor Linter Zero-Violation Verification
- name: Verify Security Advisor (Zero Warnings)
  run: npm run db:verify-advisor

# Step 6: Jest Integration Test Suite (RLS & Storage Policies)
- name: Run Jest Integration Tests
  run: npm run test:integration

# Step 7: Deploy send-social-notification Function (Deploy job)
- name: Deploy Edge Functions
  run: |
    supabase functions deploy get-winery-details --remote=jfsxclrdxmvftxacjuqf --yes
    supabase functions deploy search-wineries --remote=jfsxclrdxmvftxacjuqf --yes
    supabase functions deploy send-social-notification --remote=jfsxclrdxmvftxacjuqf --yes
  env:
    SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
```

---

## 5. Precise Behavioral Logic & Step Orchestration

### 5.1 Pipeline Execution Flow (`build` Job)
```
1. Checkout & Node 24 Setup
2. npm ci
3. npm audit --audit-level=high
4. npm run lint                                    <-- NEW: Fails fast on ESLint violations (~15s)
5. npm run type-check                              <-- NEW: Fails fast on TypeScript compiler errors (~20s)
6. Setup Deno v2.x via denoland/setup-deno@v2      <-- NEW: Configures Deno CLI (~10s)
7. npm run test:functions                         <-- NEW: Runs edge function unit/integration tests (~5s)
8. Supabase CLI Setup & supabase start
9. Populate Local Supabase Keys for Secretless CI
10. Verify Edge Function CORS Preflight Headers
11. Check Database Integrity (db:lint, db:check-types:ci)
12. supabase db reset
13. npm run db:verify-advisor                      <-- NEW: Asserts 0 violations on 0007-0029 (~10s)
14. npm run test (Unit tests)
15. npm run test:integration                       <-- NEW: Runs PostgREST RLS & Storage integration tests (~35s)
16. npm run build
17. Upload Build Artifacts
```

### 5.2 Failure Circuit & Error Handling
- **Early Rejection:** If ESLint or TypeScript compile checks fail, the job terminates before provisioning Supabase containers, saving runner minutes.
- **Deno Isolation:** Edge function tests validate request handling and secret resolution using Deno native test runner without coupling to Node runtime quirks.
- **Database Gate:** `db:verify-advisor` executes after `supabase db reset`, guaranteeing that all migrations apply cleanly and no security regression exists.
- **Integration Test Isolation:** `npm run test:integration` executes with `--runInBand` against the booted Supabase stack, ensuring deterministic, non-conflicting test execution across database transactions.
- **Fail-Safe Socket Resolution:** `resolveDockerHost()` checks `fs.existsSync(podmanSock)`. On Ubuntu CI runners, where Podman is not active and Docker runs via standard `/var/run/docker.sock`, `DOCKER_HOST` is left unset, allowing Supabase CLI to communicate with the Docker daemon without throwing `ENOENT`.

---

## 6. Execution Verification Protocol

Perform empirical verification using the following commands:

### 6.1 Validate CI Workflow Syntax
Validate that `.github/workflows/ci.yml` is syntactically valid YAML and free of indentation or schema errors:
```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml')); print('CI workflow YAML syntax valid.')"
```
*Expected Result:* `CI workflow YAML syntax valid.` with exit code 0.

### 6.2 Verify Static Gates Locally
1. **ESLint Gate:**
   ```bash
   npm run lint
   ```
   *Expected Result:* Zero lint errors across codebase (exit code 0).

2. **TypeScript Compilation Gate:**
   ```bash
   npm run type-check
   ```
   *Expected Result:* Zero TypeScript compile errors (exit code 0).

3. **Edge Function Deno Test Gate:**
   ```bash
   npm run test:functions
   ```
   *Expected Result:* All Deno tests in `supabase/functions/` pass (exit code 0).

### 6.3 Verify Database Gates Locally
Execute containerized and local database verification commands per [AGENTS.md](../../../AGENTS.md) Section 3:

1. **Security Advisor Runner:**
   ```bash
   npm run db:verify-advisor
   ```
   *Expected Result:* Scorecard shows `PASS` for all 7 categories (0007, 0008, 0010, 0026, 0027, 0028, 0029) with 0 violations.

2. **Integration Test Suite Verification:**
   ```bash
   ./scripts/containers/run-jest-container.sh --runInBand lib/services/__tests__/supabase-rpc.integration.test.ts
   ```
   *Expected Result:* All Phase 1, 2, and 3 security regression tests pass cleanly.

---

## 7. Post-Execution Protocol & Git Notes

Upon confirming all verifications pass cleanly:

### 7.1 Stage & Commit
```bash
git add .github/workflows/ci.yml scripts/db/verify-security-advisor.ts
git commit -m "feat(ci): add lint, type-check, test:functions, test:integration, verify-advisor, and social notification deployment to ci.yml"
```

### 7.2 Attach Git Note
Obtain commit hash (`COMMIT_HASH=$(git log -1 --format="%H")`) and attach the standard metadata note:

```bash
git notes add -m "Task: Add missing verification steps and function deployments to .github/workflows/ci.yml
Summary: Expanded .github/workflows/ci.yml build job to include npm run lint, npm run type-check, denoland/setup-deno@v2 with npm run test:functions, npm run db:verify-advisor, and npm run test:integration. Added deployment of send-social-notification edge function to deploy job. Updated scripts/db/verify-security-advisor.ts with portable Docker/Podman socket detection to ensure seamless execution on GitHub Actions runners. Validated workflow YAML syntax and verified all verification gates pass locally.
Files: .github/workflows/ci.yml, scripts/db/verify-security-advisor.ts
Rationale: Closes Issue #93 Phase 7 Task 1 verification gaps, ensuring every pull request and push to main enforces complete RLS security regression checks, type safety, linting, edge function tests, and production function deployments." $COMMIT_HASH
```

### 7.3 Update Conductor Plan
Update `conductor/tracks/postgrest-rls-storage-hardening_20261104/plan.md`:
- Mark `[ ] Task: Add missing verification steps and function deployments to .github/workflows/ci.yml` and all subtasks as `[x]` with commit hash.
- Stage `conductor/tracks/postgrest-rls-storage-hardening_20261104/plan.md`.
- Commit with: `chore(conductor): Mark task 'Add missing verification steps and function deployments to .github/workflows/ci.yml' as complete`.

---

## 8. Confirmation Gate

Halt immediately. Do NOT modify any implementation files (`.github/workflows/ci.yml`, `scripts/db/verify-security-advisor.ts`) until explicit affirmative user approval is received via the `ask_question` modal.
