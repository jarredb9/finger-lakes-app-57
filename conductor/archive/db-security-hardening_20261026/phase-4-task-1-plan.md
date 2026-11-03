# Implementation Plan: Phase 4 Task 1 — Verify Security Advisor Linter Warnings Resolution

**Track:** `db-security-hardening_20261026` (Issue [#87](https://github.com/jarredb9/finger-lakes-app-57/issues/87))  
**Phase:** 4 (Security Advisor Linter & Final Quality Gates — Verification)  
**Task:** 1 (Verify Security Advisor Linter Warnings Resolution)  
**ADR Reference:** [docs/adr/0007-security-invoker-rpc-boundary-and-catalog-immutability.md](../../../docs/adr/0007-security-invoker-rpc-boundary-and-catalog-immutability.md)  
**Domain Context:** [CONTEXT.md](../../../CONTEXT.md)  
**Specification Reference:** [conductor/tracks/db-security-hardening_20261026/spec.md](./spec.md)  
**Track Plan Reference:** [conductor/tracks/db-security-hardening_20261026/plan.md](./plan.md)  
**Workflow Reference:** [conductor/workflow.md](../../workflow.md)  

---

## 1. Executive Summary & Objective

### 1.1 Objective
Verify that all 97 Supabase database security linter warnings identified in Issue #87 across categories `0026_pg_graphql_anon_table_exposed`, `0027_pg_graphql_authenticated_table_exposed`, `0028_anon_security_definer_function_executable`, and `0029_authenticated_security_definer_function_executable` are fully and permanently eliminated against the running local PostgreSQL schema. Provide an automated, deterministic verification harness (`scripts/db/verify-security-advisor.sql`, `scripts/db/verify-security-advisor.ts`, and `npm run db:verify-advisor`) wired directly into `scripts/db/db-audit.sh` to prevent future security regressions.

### 1.2 Operational Context & Background
Prior to the security hardening initiative:
- **`pg_graphql` Schema Exposure (Categories 0026 & 0027 — 26 warnings):** The unused `pg_graphql` extension exposed all 13 database tables to GraphQL reflection for both unauthenticated (`anon`) and authenticated callers.
- **Unauthenticated `SECURITY DEFINER` Execution (Category 0028 — ~35 warnings):** Default PostgreSQL privileges granted `EXECUTE` on all functions to `PUBLIC` and `anon`. Unauthenticated visitors could invoke privileged functions (`upsert_wineries_from_search`, `ensure_winery`, etc.) via PostgREST `/rest/v1/rpc/`, bypassing Row-Level Security (RLS).
- **Overprivileged `SECURITY DEFINER` Execution (Category 0029 — ~36 warnings):** ~25 active RPCs were defined as `SECURITY DEFINER` unnecessarily, allowing regular signed-in users to execute mutations outside caller RLS boundaries.

In Phases 2 and 3:
1. Migration `20261026000000_harden_rls_and_security_invoker_rpcs.sql` dropped `pg_graphql` (`CASCADE`), revoked all privileges in schema `public` from `anon` and `PUBLIC`, dropped 10 dead/deprecated RPCs, converted 26 user-facing RPCs (8 read + 18 write) to `SECURITY INVOKER`, locked down trigger functions, and established a strict allowlist of 7 boundary `SECURITY DEFINER` functions with internal `auth.uid()` guards per ADR-0007.
2. Configuration updates in `supabase/config.toml` and `supabase/config.ci.toml` pruned `"graphql_public"` from `[api].schemas`.
3. TypeScript definitions were regenerated and verified via `npm run db:check-types:local`.

This task verifies the empirical resolution of all warnings through:
- Supabase CLI linter execution (`npx supabase db lint --level warning --schema public`).
- PostgreSQL catalog assertions verifying 0 exposed tables and 0 unauthorized `SECURITY DEFINER` execution grants.
- Integration tests asserting API rejection of unauthenticated execution across all boundary RPCs.

---

## 2. Invariants & Critical Guardrails

1. **Production Database Safety (`AGENTS.md` Critical Guardrail 1):**
   - Strictly no DDL or DML mutations against remote Supabase (`jfsxclrdxmvftxacjuqf`).
   - All verification scripts and linter commands target the local Podman Supabase stack (`http://127.0.0.1:54321` / `localhost:54322`).
2. **BypassSandbox Mandates (`AGENTS.md` Section 3):**
   - Commands interacting with the local Podman socket (`/run/user/$(id -u)/podman/podman.sock`) like `npm run db:lint`, `npx supabase db query --local`, and `npm run db:verify-advisor` require `BypassSandbox: true`.
   - Running containerized Jest suites (`./scripts/containers/run-jest-container.sh`) requires `BypassSandbox: true`.
3. **ADR-0007 Allowlist Invariant:**
   - Exactly 7 boundary functions in `schema public` are permitted to execute as `SECURITY DEFINER` and be callable by `authenticated`:
     1. `public.ensure_winery(jsonb)`
     2. `public.is_visible_to_viewer(uuid, boolean)`
     3. `public.is_trip_member(integer)`
     4. `public.add_trip_member_by_email(integer, text)`
     5. `public.send_friend_request(uuid)`
     6. `public.get_friends_and_requests(uuid)`
     7. `public.get_trip_details(integer)`
   - All 26 user-facing RPCs must remain `SECURITY INVOKER` (`prosecdef = false`).
   - Trigger functions (`handle_new_user`, `handle_activity_ledger_notification`) must have `has_function_privilege('authenticated', ..., 'EXECUTE') = false`.
4. **Zero-Warning Elimination Invariant:**
   - Categories `0026`, `0027`, `0028`, and `0029` must produce exactly 0 violations.
5. **Modal Approval Invariant (`conductor_antigravity.md` & `AGENTS.md` Section 2):**
   - Halt immediately for affirmative user approval via the `ask_question` modal before modifying any files or executing test commands on disk.

---

## 3. Target Files & Semantic Insertion Anchors

### 3.1 Target 1: SQL Catalog Verification Script
- **Path:** `scripts/db/verify-security-advisor.sql`
- **Semantic Insertion Anchor:** New file created in `scripts/db/`.
- **Purpose:** Executes a PL/pgSQL assertion block (`DO $$ ... $$;`) against PostgreSQL system catalogs (`pg_extension`, `information_schema.schemata`, `information_schema.role_table_grants`, `pg_proc`, `pg_namespace`) to assert 0 violations for categories 0026, 0027, 0028, and 0029. Raises an exception if any violation is detected.

### 3.2 Target 2: TypeScript Security Advisor Verification Runner
- **Path:** `scripts/db/verify-security-advisor.ts`
- **Semantic Insertion Anchor:** New file created in `scripts/db/`.
- **Purpose:** Standalone CLI runner (executed via `npx tsx scripts/db/verify-security-advisor.ts`) that orchestrates:
  1. Supabase CLI linter execution (`npx supabase db lint --level warning --schema public`).
  2. SQL catalog verification (`npx supabase db query --local -f scripts/db/verify-security-advisor.sql`).
  3. HTTP API verification via `@supabase/supabase-js` (asserting GraphQL endpoint is inactive and unauthenticated RPC calls are rejected).
  4. Formats a structured terminal scorecard.

### 3.3 Target 3: Package Scripts Configuration
- **Path:** `package.json`
- **Semantic Insertion Anchor:** Under `"scripts"` object (after line 36):
  ```json
  "db:lint": "export DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock && npx supabase db lint --level error --schema public",
  ```
- **Insertion:** Add new script command:
  ```json
  "db:verify-advisor": "export DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock && npx tsx scripts/db/verify-security-advisor.ts",
  ```

### 3.4 Target 4: Database Audit Script
- **Path:** `scripts/db/db-audit.sh`
- **Semantic Insertion Anchor:** Under Step 1 (lines 9–12):
  ```bash
  # 1. Database Linting
  echo "Step 1: Linting migrations..."
  npm run db:lint
  ```
- **Insertion:** Insert Step 1b:
  ```bash
  # 1b. Security Advisor Warnings Verification (Categories 0026, 0027, 0028, 0029)
  echo "Step 1b: Verifying Security Advisor linter resolution (0026, 0027, 0028, 0029)..."
  npm run db:verify-advisor
  ```

### 3.5 Target 5: Conductor Track Plan
- **Path:** `conductor/tracks/db-security-hardening_20261026/plan.md`
- **Semantic Insertion Anchor:** Under `## Phase 4: Security Advisor Linter & Final Quality Gates (Verification)` (lines 63–64):
  ```markdown
  - [ ] Task: Verify Security Advisor Linter Warnings Resolution
      - [ ] Verify categories 0026, 0027, 0028, and 0029 warnings are fully eliminated against the local database schema.
  ```
- **Replacement:** Mark completed with commit SHA:
  ```markdown
  - [x] Task: Verify Security Advisor Linter Warnings Resolution [commit: <short_sha>]
      - [x] Verify categories 0026, 0027, 0028, and 0029 warnings are fully eliminated against the local database schema.
  ```

---

## 4. TypeScript Interfaces & Type Blueprints

The following interfaces and function signatures define the verification runner in `scripts/db/verify-security-advisor.ts`:

```typescript
/**
 * Canonical Security Advisor linter categories addressed in Issue #87.
 */
export type SecurityAdvisorCategory =
  | '0026_pg_graphql_anon_table_exposed'
  | '0027_pg_graphql_authenticated_table_exposed'
  | '0028_anon_security_definer_function_executable'
  | '0029_authenticated_security_definer_function_executable';

/**
 * Result of inspecting an individual Security Advisor category.
 */
export interface AdvisorCategoryResult {
  category: SecurityAdvisorCategory;
  name: string;
  passed: boolean;
  violationCount: number;
  violations: string[];
  remediationSummary: string;
}

/**
 * Composite verification scorecard for all Security Advisor checks.
 */
export interface SecurityAdvisorScorecard {
  timestamp: string;
  databaseUrl: string;
  allPassed: boolean;
  totalViolations: number;
  results: Record<SecurityAdvisorCategory, AdvisorCategoryResult>;
  cliLintOutput?: string;
}

/**
 * ADR-0007 strict allowlist of boundary SECURITY DEFINER functions.
 */
export const ALLOWLISTED_SECURITY_DEFINER_RPCS = [
  'ensure_winery',
  'is_visible_to_viewer',
  'is_trip_member',
  'add_trip_member_by_email',
  'send_friend_request',
  'get_friends_and_requests',
  'get_trip_details',
] as const;

/**
 * List of 10 dead/deprecated RPCs that must be completely absent from PostgreSQL catalogs.
 */
export const DROPPED_LEGACY_RPCS = [
  'upsert_wineries_from_search',
  'get_all_user_visits_list',
  'get_user_dashboard',
  'get_user_winery_data_aggregated',
  'get_winery_details',
  'get_wineries_in_bounds',
  'add_winery_to_trips',
  'add_to_wishlist',
  'send_follow_request',
  'respond_to_follow_request',
] as const;

/**
 * List of 26 active user-facing RPCs converted to SECURITY INVOKER.
 */
export const CONVERTED_SECURITY_INVOKER_RPCS = [
  'get_map_markers',
  'get_paginated_wineries',
  'get_winery_details_by_id',
  'get_trips_for_date',
  'get_friend_activity_feed',
  'get_friend_profile_with_visits',
  'get_friends_activity_for_winery',
  'get_friends_ratings_for_winery',
  'create_trip',
  'create_trip_with_winery',
  'delete_trip',
  'add_winery_to_trip',
  'remove_winery_from_trip',
  'reorder_trip_wineries',
  'update_trip_winery_notes',
  'log_visit',
  'update_visit',
  'delete_visit',
  'toggle_favorite',
  'toggle_wishlist',
  'toggle_favorite_privacy',
  'toggle_wishlist_privacy',
  'update_profile_privacy',
  'remove_friend',
  'respond_to_friend_request',
] as const;

/**
 * Execute the SQL catalog verification script via Supabase CLI.
 */
export declare function executeSqlCatalogVerification(): Promise<{
  passed: boolean;
  error?: string;
}>;

/**
 * Execute Supabase CLI lint and parse output for categories 0026, 0027, 0028, 0029.
 */
export declare function executeCliLinter(): Promise<{
  rawOutput: string;
  violationsFound: string[];
}>;

/**
 * Verify HTTP API behavior (GraphQL 404, unauthenticated RPC rejection).
 */
export declare function executeApiVerification(supabaseUrl: string, anonKey: string): Promise<{
  graphqlDisabled: boolean;
  anonRpcBlocked: boolean;
  errors: string[];
}>;

/**
 * Main verification entrypoint that runs all audits and emits the final scorecard.
 */
export declare function runSecurityAdvisorVerification(): Promise<SecurityAdvisorScorecard>;
```

---

## 5. Precise Behavioral Logic & Edge Cases

### 5.1 SQL Catalog Assertion Logic (`verify-security-advisor.sql`)
The SQL file wraps all checks inside an atomic `DO $$ ... $$;` block:

1. **Category 0026 & 0027 (`pg_graphql` Teardown):**
   - Assert `pg_extension` has 0 rows for `extname = 'pg_graphql'`.
   - Assert `information_schema.schemata` has 0 rows for `schema_name = 'graphql_public'`.
   - Assert `information_schema.role_table_grants` has 0 rows where `grantee = 'anon'` and `table_schema = 'public'`.
   - If any count > 0, raise exception with diagnostic message.
2. **Category 0028 (`anon_security_definer_function_executable`):**
   - Query `pg_proc` joined with `pg_namespace`:
     ```sql
     SELECT count(*) INTO v_count
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.prosecdef = true
       AND n.nspname = 'public'
       AND (
         has_function_privilege('anon', p.oid, 'EXECUTE')
         OR has_function_privilege('public', p.oid, 'EXECUTE')
       );
     ```
   - Assert `v_count = 0`. If `v_count > 0`, raise exception listing the flagged functions.
3. **Category 0029 (`authenticated_security_definer_function_executable`):**
   - Query `pg_proc` joined with `pg_namespace` for `SECURITY DEFINER` functions in `public` executable by `authenticated`:
     ```sql
     SELECT count(*) INTO v_count
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.prosecdef = true
       AND n.nspname = 'public'
       AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
       AND p.proname NOT IN (
         'ensure_winery',
         'is_visible_to_viewer',
         'is_trip_member',
         'add_trip_member_by_email',
         'send_friend_request',
         'get_friends_and_requests',
         'get_trip_details'
       );
     ```
   - Assert `v_count = 0`. Any function not on the ADR-0007 allowlist raises an immediate exception.
   - Assert trigger functions (`handle_new_user`, `handle_activity_ledger_notification`) have `has_function_privilege('authenticated', p.oid, 'EXECUTE') = false`.
4. **RPC Invariants Check:**
   - Assert all 10 dropped RPCs have 0 instances in `pg_proc`.
   - Assert all 26 user-facing RPCs have `p.prosecdef = false` (`SECURITY INVOKER`).

### 5.2 TypeScript Runner Logic (`verify-security-advisor.ts`)
1. **Environment & Host Guard:**
   - Resolve `NEXT_PUBLIC_SUPABASE_URL` (defaults to `http://127.0.0.1:54321`).
   - Guard against remote database execution: verify hostname is local (`localhost`, `127.0.0.1`, `0.0.0.0`) per `AGENTS.md` Guardrail 1.
2. **Execution Steps:**
   - Step 1: Execute `npx supabase db query --local -f scripts/db/verify-security-advisor.sql` using `child_process.execSync` with Podman `DOCKER_HOST`.
   - Step 2: Execute `npx supabase db lint --local --level warning --schema public`. Inspect stdout/stderr for any occurrences of `0026`, `0027`, `0028`, or `0029`.
   - Step 3: Perform HTTP request to `${supabaseUrl}/graphql/v1`. Assert response is `404 Not Found` or refused (not a functioning GraphQL gateway).
   - Step 4: Perform unauthenticated RPC invocation to `ensure_winery` using `@supabase/supabase-js` `anonClient`. Assert error is returned (`Not authenticated`).
3. **Scorecard Emission:**
   - Output formatted ASCII table detailing status (`PASS` / `FAIL`), violation count (0), and verification notes for each category.
   - If `totalViolations > 0`, exit with code 1; otherwise exit with code 0.

### 5.3 Error Handling & Edge Cases
- **Missing Podman Socket:** If `podman.sock` is unreachable or Supabase is stopped, the script surfaces a clear guidance error: `Supabase local stack is not running. Run npm run db:start first.`
- **Remote Host Protection:** If `NEXT_PUBLIC_SUPABASE_URL` points to remote Supabase (`jfsxclrdxmvftxacjuqf`), the script halts immediately with an error and non-zero exit code.
- **Overloaded Functions:** `pg_proc` lookups handle overloaded function signatures (e.g. `add_winery_to_trip` having both integer and jsonb variations) by evaluating `p.proname` and checking that all overloads conform to `SECURITY INVOKER`.

---

## 6. Execution Verification Protocol

Following implementation, the executor will run the following sequence of commands to empirically verify the resolution:

### 6.1 Database Status Check
Verify local Supabase services are running and healthy:
```bash
npm run db:status
```
*Execution Note:* Requires `BypassSandbox: true` due to host `/run` Podman socket interaction.

### 6.2 SQL Catalog Verification
Run the SQL assertion script directly against the local database:
```bash
export DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock && npx supabase db query --local -f scripts/db/verify-security-advisor.sql
```
*Execution Note:* Requires `BypassSandbox: true`.  
*Expected Result:* `NOTICE: All Security Advisor checks (0026, 0027, 0028, 0029) passed with 0 violations.` with exit code 0.

### 6.3 Supabase CLI Lint (Warnings Level)
Run the Supabase linter across schema `public` at `warning` level:
```bash
export DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock && npx supabase db lint --local --level warning --schema public
```
*Execution Note:* Requires `BypassSandbox: true`.  
*Expected Result:* Zero warnings matching categories `0026`, `0027`, `0028`, or `0029`.

### 6.4 Standalone Security Advisor Verification Runner
Execute the new TypeScript verification harness:
```bash
npm run db:verify-advisor
```
*Execution Note:* Requires `BypassSandbox: true`.  
*Expected Result:* Formatted scorecard with `allPassed: true` and 0 total violations across all 4 categories.

### 6.5 Full Database Safety Audit
Execute the standard database audit pipeline to ensure end-to-end integration:
```bash
npm run db:audit
```
*Execution Note:* Requires `BypassSandbox: true`.  
*Expected Result:* Step 1 (lint), Step 1b (verify-advisor), and Step 2 (check-types:local) pass cleanly.

### 6.6 Containerized Integration Test Suite
Run the containerized integration tests to verify runtime RPC security behaviors:
```bash
npm run test:integration:container -- lib/services/__tests__/supabase-rpc.integration.test.ts
```
*Execution Note:* Requires `BypassSandbox: true`.  
*Expected Result:* All tests pass (including 5 security regression tests).

### 6.7 Containerized Unit Test Suite
Confirm application unit tests remain healthy:
```bash
npm run test:container -- lib/services/__tests__/tripService.mutations.test.ts
```
*Execution Note:* Requires `BypassSandbox: true`.  
*Expected Result:* All tests pass cleanly.

---

## 7. Post-Execution Protocol & Git Notes

Upon successful verification:

### 7.1 Stage & Commit
```bash
git add scripts/db/verify-security-advisor.sql scripts/db/verify-security-advisor.ts package.json scripts/db/db-audit.sh
git commit -m "test(db): add security advisor linter verification harness for categories 0026-0029"
```

### 7.2 Attach Git Note
Obtain the commit SHA (`COMMIT_HASH=$(git log -1 --format="%H")`) and attach the standard metadata note:

```bash
git notes add -m "Task: Verify Security Advisor Linter Warnings Resolution
Summary: Verified full elimination of Supabase Security Advisor linter warnings across categories 0026, 0027, 0028, and 0029 against the local database schema via Supabase CLI lint, automated catalog verification script, and HTTP API integration.
Files: scripts/db/verify-security-advisor.sql, scripts/db/verify-security-advisor.ts, package.json, scripts/db/db-audit.sh
Rationale: Confirms pg_graphql schema reflection is dismantled, unauthenticated access to tables and SECURITY DEFINER functions is revoked, and user RPCs execute strictly as SECURITY INVOKER with only authorized boundary RPCs permitted, closing Issue #87 Phase 4 Task 1." $COMMIT_HASH
```

### 7.3 Update Conductor Plan
Update `conductor/tracks/db-security-hardening_20261026/plan.md`:
- Mark `- [ ] Task: Verify Security Advisor Linter Warnings Resolution` as `- [x] Task: Verify Security Advisor Linter Warnings Resolution [commit: <short_sha>]`.
- Mark subtask `- [ ] Verify categories 0026, 0027, 0028, and 0029 warnings are fully eliminated against the local database schema.` as completed (`- [x]`).
- Stage `conductor/tracks/db-security-hardening_20261026/plan.md`.
- Commit with: `conductor(plan): Mark task 'Verify Security Advisor Linter Warnings Resolution' as complete`.

---

## 8. Confirmation Gate

Halt immediately. Do NOT modify any implementation files (`scripts/db/verify-security-advisor.*`, `package.json`, `scripts/db/db-audit.sh`) or execute any commands until explicit affirmative user approval is received via the `ask_question` modal.
