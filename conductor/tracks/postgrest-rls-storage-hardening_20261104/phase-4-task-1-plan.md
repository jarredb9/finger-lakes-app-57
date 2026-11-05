# Implementation Plan: Phase 4 Task 1 — Implement Security Advisor Linter Assertions & TypeScript Sync

**Track:** `postgrest-rls-storage-hardening_20261104` (Issue [#93](https://github.com/jarredb9/finger-lakes-app-57/issues/93))  
**Phase:** 4 (Security Advisor Linter Harness Expansion & Tooling — Verification & Tooling)  
**Task:** 1 (Implement Security Advisor Linter Assertions & TypeScript Sync)  
**Preceding Context:** [conductor/tracks/postgrest-rls-storage-hardening_20261104/phase-3-task-2-plan.md](./phase-3-task-2-plan.md)  
**ADR References:**
- [docs/adr/0007-security-invoker-rpc-boundary-and-catalog-immutability.md](../../../docs/adr/0007-security-invoker-rpc-boundary-and-catalog-immutability.md)
- [docs/adr/0010-direct-table-rls-privilege-revocation-and-private-storage.md](../../../docs/adr/0010-direct-table-rls-privilege-revocation-and-private-storage.md)  
**Domain Context:** [CONTEXT.md](../../../CONTEXT.md)  
**Specification Reference:** [conductor/tracks/postgrest-rls-storage-hardening_20261104/spec.md](./spec.md) Section 3.7  
**Track Plan Reference:** [conductor/tracks/postgrest-rls-storage-hardening_20261104/plan.md](./plan.md)  
**Workflow Reference:** [conductor/workflow.md](../../workflow.md)  

---

## 1. Executive Summary & Objective

### 1.1 Objective
Expand the automated Supabase Security Advisor verification harness (`scripts/db/verify-security-advisor.sql` and `scripts/db/verify-security-advisor.ts`) to assert 0 violations across 3 additional security advisor categories introduced in Issue [#93](https://github.com/jarredb9/finger-lakes-app-57/issues/93) and [ADR-0010](../../../docs/adr/0010-direct-table-rls-privilege-revocation-and-private-storage.md):
1. **`0007_policy_exists_rls_disabled`:** Assert that all tables in schema `public` have Row Level Security enabled (`relrowsecurity = true`) and that zero tables with defined policies have RLS disabled.
2. **`0008_rls_enabled_no_policy`:** Assert that every table in schema `public` with RLS enabled defines at least one explicit access policy in `pg_policy`.
3. **`0010_security_definer_view`:** Assert that zero database views in schema `public` bypass caller RLS via default `SECURITY DEFINER` semantics (requiring `WITH (security_invoker = true)` for any views in `public`).

Synchronize generated TypeScript database definitions (`lib/database.types.ts`) against the local PostgreSQL schema via `npm run db:gen-types`, verifying clean zero-error compilation and zero drift with `npm run db:check-types:local`.

Wire and verify all 7 categories (`0007`, `0008`, `0010`, `0026`, `0027`, `0028`, `0029`) into `scripts/db/verify-security-advisor.ts`, terminal scorecard output, and `scripts/db/db-audit.sh`.

### 1.2 Architectural & Security Context
- Issue [#87](https://github.com/jarredb9/finger-lakes-app-57/issues/87) eliminated categories `0026_pg_graphql_anon_table_exposed`, `0027_pg_graphql_authenticated_table_exposed`, `0028_anon_security_definer_function_executable`, and `0029_authenticated_security_definer_function_executable` ([ADR-0007](../../../docs/adr/0007-security-invoker-rpc-boundary-and-catalog-immutability.md)).
- Issue [#93](https://github.com/jarredb9/finger-lakes-app-57/issues/93) and [ADR-0010](../../../docs/adr/0010-direct-table-rls-privilege-revocation-and-private-storage.md) establish direct PostgREST table RLS hardening across all 13 tables, private storage bucket configuration, and column privilege revocation.
- To prevent regressions, the linter harness must be expanded to guarantee that no future migration can create an unshielded table without RLS, attach policies to a table without enabling RLS, leave an RLS-enabled table without explicit policies, or introduce a view with default `SECURITY DEFINER` behavior.

---

## 2. Invariants & Critical Guardrails

1. **Production Database Safety ([AGENTS.md](../../../AGENTS.md) Critical Guardrail 1):**
   - Strictly zero migrations, DDL, or DML mutations executed against the remote Supabase project (`jfsxclrdxmvftxacjuqf`).
   - All assertions, CLI commands, and type generators run against the local containerized Supabase stack (`http://127.0.0.1:54321` / `localhost:54322`).
2. **BypassSandbox Mandates ([AGENTS.md](../../../AGENTS.md) Section 3):**
   - Local DB stack commands (`npm run db:verify-advisor`, `npm run db:gen-types`, `npm run db:check-types:local`, `npm run db:lint`, `npm run db:audit`) interact with the host Podman socket (`/run/user/$(id -u)/podman/podman.sock`) and require `BypassSandbox: true`.
3. **ADR-0007 & ADR-0010 Allowlist Invariant:**
   - Preserve the 7 boundary `SECURITY DEFINER` allowlisted functions in `scripts/db/verify-security-advisor.ts` (`ensure_winery`, `is_visible_to_viewer`, `is_trip_member`, `add_trip_member_by_email`, `send_friend_request`, `get_friends_and_requests`, `get_trip_details`).
   - Preserve the 10 dropped legacy RPC assertions and 26 `SECURITY INVOKER` RPC assertions.
4. **Modal Approval Invariant (`conductor_antigravity.md` & [AGENTS.md](../../../AGENTS.md) Section 2):**
   - Halt immediately for affirmative user approval via `ask_question` modal before modifying any implementation files on disk.

---

## 3. Target Files & Semantic Insertion Anchors

### 3.1 Target 1: SQL Catalog Verification Script
- **Path:** `scripts/db/verify-security-advisor.sql`
- **Semantic Insertion Anchors:**
  1. Header comment (lines 2–7): Expand category list to include `0007`, `0008`, and `0010`.
  2. Main execution block (after line 14: `RAISE NOTICE 'Starting Security Advisor catalog verification...';`):
     Insert Section 0A (Category 0007), Section 0B (Category 0008), and Section 0C (Category 0010) before existing Category 0026/0027 assertions.
  3. Final notice (line 251): Update summary message to include categories 0007, 0008, 0010:
     `RAISE NOTICE 'NOTICE: All Security Advisor checks (0007, 0008, 0010, 0026, 0027, 0028, 0029) passed with 0 violations.';`

### 3.2 Target 2: TypeScript Security Advisor Verification Runner
- **Path:** `scripts/db/verify-security-advisor.ts`
- **Semantic Insertion Anchors:**
  1. Lines 21–25: Expand `SecurityAdvisorCategory` type union to include `'0007_policy_exists_rls_disabled'`, `'0008_rls_enabled_no_policy'`, and `'0010_security_definer_view'`.
  2. Lines 202–212: Inside `executeCliLinter()`, expand `targetCategories` array to include the new categories and their shorthand prefixes (`'0007'`, `'0008'`, `'0010'`).
  3. Line 324: Update log output message to list all 7 categories:
     `console.log('  ✅ Supabase db lint found 0 warnings for categories 0007, 0008, 0010, 0026, 0027, 0028, 0029.');`
  4. Lines 346–378: In `runSecurityAdvisorVerification()`, add scorecard result mappings for `0007_policy_exists_rls_disabled`, `0008_rls_enabled_no_policy`, and `0010_security_definer_view`.
  5. Line 397: Update banner title to reflect Issue [#93](https://github.com/jarredb9/finger-lakes-app-57/issues/93):
     `           SUPABASE SECURITY ADVISOR VERIFICATION SCORECARD (ISSUES #87, #93)   `

### 3.3 Target 3: Database Audit Pipeline Script
- **Path:** `scripts/db/db-audit.sh`
- **Semantic Insertion Anchors:**
  1. Lines 14–15: Update comment and echo message in Step 1b:
     `# 1b. Security Advisor Warnings Verification (Categories 0007, 0008, 0010, 0026, 0027, 0028, 0029)`
     `echo "Step 1b: Verifying Security Advisor linter resolution (0007, 0008, 0010, 0026, 0027, 0028, 0029)..."`

### 3.4 Target 4: Developer Documentation
- **Path:** `scripts/README.md`
- **Semantic Insertion Anchors:**
  1. Line 38: Update description of `verify-security-advisor.sql` to include `0007`, `0008`, `0010`, and `0026`–`0029`.
  2. Line 40: Update Future Expansion Roadmap note to mark categories 0007, 0008, and 0010 as resolved under Issue [#93](https://github.com/jarredb9/finger-lakes-app-57/issues/93).

### 3.5 Target 5: TypeScript Database Definitions
- **Path:** `lib/database.types.ts`
- **Semantic Insertion Anchor:** Entire file synchronized via `npm run db:gen-types`.

### 3.6 Target 6: Track Plan
- **Path:** `conductor/tracks/postgrest-rls-storage-hardening_20261104/plan.md`
- **Semantic Insertion Anchor:** Under `## Phase 4: Security Advisor Linter Harness Expansion & Tooling (Verification & Tooling)` (lines 69–74):
  Mark task and subtasks complete with commit hash.

---

## 4. TypeScript Interfaces & Type Blueprints

The following interfaces and function signatures define the expanded verification runner contract in `scripts/db/verify-security-advisor.ts`:

```typescript
/**
 * Canonical Security Advisor linter categories addressed across Issues #87 and #93.
 */
export type SecurityAdvisorCategory =
  | '0007_policy_exists_rls_disabled'
  | '0008_rls_enabled_no_policy'
  | '0010_security_definer_view'
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
 * Composite verification scorecard for all 7 Security Advisor checks.
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
 * Validates that target host is local to prevent accidental execution against remote environments.
 */
export declare function assertLocalEnvironment(url: string): void;

/**
 * Execute the SQL catalog verification script via Supabase CLI.
 */
export declare function executeSqlCatalogVerification(): Promise<{
  passed: boolean;
  error?: string;
}>;

/**
 * Execute Supabase CLI lint and parse output across all 7 categories.
 */
export declare function executeCliLinter(): Promise<{
  rawOutput: string;
  violationsFound: string[];
}>;

/**
 * Verify HTTP API behavior (GraphQL disabled, unauthenticated RPC blocked).
 */
export declare function executeApiVerification(
  supabaseUrl: string,
  anonKey: string
): Promise<{
  graphqlDisabled: boolean;
  anonRpcBlocked: boolean;
  errors: string[];
}>;

/**
 * Main verification entrypoint that runs all audits across 7 categories and emits the scorecard.
 */
export declare function runSecurityAdvisorVerification(): Promise<SecurityAdvisorScorecard>;
```

---

## 5. Precise Behavioral Logic & Catalog Assertions

### 5.1 Category 0007: `policy_exists_rls_disabled` & Public Table RLS Enforcement
- **SQL Catalog Assertions (`verify-security-advisor.sql`):**
  1. **Policy with RLS Disabled Check:**
     ```sql
     SELECT count(*) INTO v_count
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND NOT c.relrowsecurity
       AND EXISTS (SELECT 1 FROM pg_policy pol WHERE pol.polrelid = c.oid);
     ```
     If `v_count > 0`, format table names with `string_agg` and raise exception:  
     `Category 0007 Violation: Table(s) have policies defined but RLS disabled: %`
  2. **Public Table RLS Enforcement Check:**
     ```sql
     SELECT count(*) INTO v_count
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND NOT c.relrowsecurity;
     ```
     If `v_count > 0`, format table names with `string_agg` and raise exception:  
     `Category 0007 Violation: Public table(s) have RLS disabled: %`
- **CLI Linter Matching (`verify-security-advisor.ts`):**
  - Extract lines from `lintResult.violationsFound` containing `'0007'` or `'0007_policy_exists_rls_disabled'`.
  - Pass Condition: `catalogResult.passed && violations0007.length === 0`.
  - Scorecard Name: `'Policy Exists With RLS Disabled'`.
  - Remediation Summary: `'All public tables have RLS enabled (relrowsecurity = true); no policies defined on unshielded tables.'`.

### 5.2 Category 0008: `rls_enabled_no_policy`
- **SQL Catalog Assertion (`verify-security-advisor.sql`):**
  - Query tables in schema `public` where `c.relkind = 'r' AND c.relrowsecurity = true` that have no corresponding entries in `pg_policy`:
    ```sql
    SELECT count(*) INTO v_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = true
      AND NOT EXISTS (
        SELECT 1 FROM pg_policy pol WHERE pol.polrelid = c.oid
      );
    ```
  - If `v_count > 0`, format table names with `string_agg` and raise exception:  
    `Category 0008 Violation: Table(s) have RLS enabled but no explicit policies: %`
- **CLI Linter Matching (`verify-security-advisor.ts`):**
  - Extract lines from `lintResult.violationsFound` containing `'0008'` or `'0008_rls_enabled_no_policy'`.
  - Pass Condition: `catalogResult.passed && violations0008.length === 0`.
  - Scorecard Name: `'RLS Enabled With No Policy'`.
  - Remediation Summary: `'All tables with RLS enabled define explicit access policies.'`.

### 5.3 Category 0010: `security_definer_view`
- **SQL Catalog Assertion (`verify-security-advisor.sql`):**
  - Query views in schema `public` (`c.relkind = 'v'`) where `c.reloptions` is null or does not contain `'security_invoker=true'`:
    ```sql
    SELECT count(*) INTO v_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'v'
      AND (
        c.reloptions IS NULL
        OR NOT (c.reloptions @> ARRAY['security_invoker=true'])
      );
    ```
  - If `v_count > 0`, format view names with `string_agg` and raise exception:  
    `Category 0010 Violation: View(s) defined without security_invoker = true (SECURITY DEFINER view): %`
- **CLI Linter Matching (`verify-security-advisor.ts`):**
  - Extract lines from `lintResult.violationsFound` containing `'0010'` or `'0010_security_definer_view'`.
  - Pass Condition: `catalogResult.passed && violations0010.length === 0`.
  - Scorecard Name: `'SECURITY DEFINER View'`.
  - Remediation Summary: `'Zero public views bypass caller RLS via default SECURITY DEFINER semantics; all views require security_invoker = true.'`.

### 5.4 TypeScript Type Parity & Drift Verification
- Run `npm run db:gen-types` to execute `npx supabase gen types typescript --schema public > lib/database.types.ts`.
- Run `npm run db:check-types:local` to generate a temporary types file (`lib/database.types.tmp.ts`), diff against `lib/database.types.ts`, remove the temporary file, and assert 0 differences.

### 5.5 Scorecard Aggregation & CLI Exit Code
- In `runSecurityAdvisorVerification()`:
  - Aggregate violations across all 7 categories:
    `totalViolations = Object.values(results).reduce((acc, curr) => acc + curr.violationCount, 0);`
  - Determine overall success:
    `allPassed = totalViolations === 0 && catalogResult.passed && lintResult.violationsFound.length === 0 && apiResult.graphqlDisabled && apiResult.anonRpcBlocked;`
  - Render formatted terminal table displaying Category, Status (`PASS` / `FAIL`), Violations count, and Notes.
  - In standalone CLI execution: exit with `process.exit(1)` if `!scorecard.allPassed`.

---

## 6. Execution Verification Protocol

### 6.1 Database Verification Commands
Run each command with `BypassSandbox: true` per [AGENTS.md](../../../AGENTS.md) Section 3:

1. **Verify Security Advisor Harness:**
   ```bash
   npm run db:verify-advisor
   ```
   *Expected Verification Result:*
   - Step 1: SQL catalog assertions pass with 0 violations across 0007, 0008, 0010, 0026, 0027, 0028, and 0029.
   - Step 2: CLI linter finds 0 warnings across all 7 categories.
   - Step 3: API boundary behavior tests pass (GraphQL disabled, unauthenticated RPC blocked).
   - Scorecard table outputs `PASS` for all 7 categories with `allPassed = true`.

2. **Regenerate TypeScript Types:**
   ```bash
   npm run db:gen-types
   ```
   *Expected Verification Result:*
   - Updates `lib/database.types.ts` with current PostgreSQL schema.

3. **Verify TypeScript Type Parity:**
   ```bash
   npm run db:check-types:local
   ```
   *Expected Verification Result:*
   - Diff between generated types and `lib/database.types.ts` is empty (exit code 0).

4. **Verify Full Database Audit Pipeline:**
   ```bash
   npm run db:audit
   ```
   *Expected Verification Result:*
   - Step 1 (Linting migrations), Step 1b (Security Advisor verification), and Step 2 (Type Check Local) all pass cleanly.

---

## 7. Post-Execution Protocol & Git Notes

Upon confirming all verifications pass cleanly:

### 7.1 Stage & Commit
```bash
git add scripts/db/verify-security-advisor.sql scripts/db/verify-security-advisor.ts scripts/db/db-audit.sh scripts/README.md lib/database.types.ts
git commit -m "feat(db): expand security advisor assertions to categories 0007, 0008, 0010 and sync database types"
```

### 7.2 Attach Git Note
Obtain commit hash (`COMMIT_HASH=$(git log -1 --format="%H")`) and attach the standard metadata note:

```bash
git notes add -m "Task: Implement Security Advisor Linter Assertions & TypeScript Sync
Summary: Expanded verify-security-advisor.sql and verify-security-advisor.ts to assert zero violations for categories 0007_policy_exists_rls_disabled, 0008_rls_enabled_no_policy, and 0010_security_definer_view alongside 0026-0029. Updated scripts/db/db-audit.sh and scripts/README.md to document the expanded category suite. Regenerated lib/database.types.ts via npm run db:gen-types and verified clean compilation and zero schema drift with npm run db:check-types:local and npm run db:verify-advisor.
Files: scripts/db/verify-security-advisor.sql, scripts/db/verify-security-advisor.ts, scripts/db/db-audit.sh, scripts/README.md, lib/database.types.ts
Rationale: Fulfills Issue #93 Phase 4 Task 1 to permanently guard table RLS enforcement, policy completeness, view security invoker semantics, and TypeScript schema parity in CI/CD and audit pipelines." $COMMIT_HASH
```

### 7.3 Update Conductor Plan
Update `conductor/tracks/postgrest-rls-storage-hardening_20261104/plan.md`:
- Mark `[ ] Task: Implement Security Advisor Linter Assertions & TypeScript Sync` and its subtasks as `[x]` with commit hash.
- Stage `conductor/tracks/postgrest-rls-storage-hardening_20261104/plan.md`.
- Commit with: `chore(conductor): Mark task 'Implement Security Advisor Linter Assertions & TypeScript Sync' as complete`.

---

## 8. Confirmation Gate

Halt immediately. Do NOT modify any implementation files (`scripts/db/verify-security-advisor.*`, `scripts/db/db-audit.sh`, `scripts/README.md`, `lib/database.types.ts`) until explicit affirmative user approval is received via the `ask_question` modal.
