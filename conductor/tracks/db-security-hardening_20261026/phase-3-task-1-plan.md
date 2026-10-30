# Implementation Plan: Phase 3 Task 1 — Remove pg_graphql from Supabase Configuration

**Track:** `db-security-hardening_20261026` (Issue [#87](https://github.com/jarredb9/finger-lakes-app-57/issues/87))  
**Phase:** 3 (Supabase Configuration & Client Type Synchronization — Tooling)  
**Task:** 1 (Remove pg_graphql from Supabase Configuration)  
**ADR Reference:** [docs/adr/0007-security-invoker-rpc-boundary-and-catalog-immutability.md](../../../docs/adr/0007-security-invoker-rpc-boundary-and-catalog-immutability.md)  
**Domain Context:** [CONTEXT.md](../../../CONTEXT.md)  
**Specification Reference:** [conductor/tracks/db-security-hardening_20261026/spec.md](./spec.md)  
**Track Plan Reference:** [conductor/tracks/db-security-hardening_20261026/plan.md](./plan.md)  
**Preceding Context:** [conductor/tracks/db-security-hardening_20261026/phase-2-task-2-plan.md](./phase-2-task-2-plan.md)  
**Workflow Reference:** [conductor/workflow.md](../../workflow.md)  

---

## 1. Executive Summary & Objective

### 1.1 Objective
Prune `"graphql_public"` from the `[api].schemas` configuration array in both `supabase/config.toml` (local development runtime) and `supabase/config.ci.toml` (Continuous Integration test runtime) to complete the elimination of the `pg_graphql` extension initiated in migration `20261026000000_harden_rls_and_security_invoker_rpcs.sql`.

### 1.2 Operational Context & Background
- **Database Teardown Completed:** In Phase 2 Task 2, migration `supabase/migrations/20261026000000_harden_rls_and_security_invoker_rpcs.sql` executed `DROP EXTENSION IF EXISTS pg_graphql CASCADE;`, tearing down the GraphQL reflection engine in PostgreSQL and removing schema `graphql_public`.
- **PostgREST Schema Exposure:** The Supabase CLI uses the `schemas` array under `[api]` in `config.toml` to configure PostgREST's `PGRST_DB_SCHEMAS`. When `"graphql_public"` remains in this list without the backing extension and schema, PostgREST either logs warnings or attempts to route requests to a dropped schema.
- **Security Advisor Remediation:** Removing `"graphql_public"` completes the resolution of Supabase Security Advisor linter categories `0026_pg_graphql_anon_table_exposed` and `0027_pg_graphql_authenticated_table_exposed` at the runtime configuration level.
- **CI Configuration Parity:** `.github/workflows/ci.yml` performs `cp supabase/config.ci.toml supabase/config.toml` during CI test jobs. Updating both files simultaneously guarantees that local development and CI runner environments operate on an identical PostgREST schema surface.

---

## 2. Invariants & Critical Guardrails

1. **Local vs CI Configuration Parity Invariant:**
   - Both `supabase/config.toml` and `supabase/config.ci.toml` must define identical `schemas = ["public"]` under `[api]`.
   - Any divergence would lead to CI overwriting local settings or failing during containerized test execution.
2. **Comment & Formatting Integrity (`AGENTS.md` Section 1 & Behavioral Guidelines):**
   - Preserve all surrounding comments, whitespace, and formatting in both TOML configuration files.
   - Do not alter unassociated configuration blocks (`[db]`, `[auth]`, `[storage]`, `[realtime]`, etc.).
3. **No GraphQL Client Dependency:**
   - The entire frontend and edge runtime architecture communicates with Supabase exclusively via PostgREST (`@supabase/supabase-js`) targeting `schema: 'public'`.
   - No GraphQL queries, clients, or schemas exist in the codebase.
4. **Production Database Safety (`AGENTS.md` Critical Guardrail 1):**
   - This task operates strictly on local file system configuration files (`supabase/config*.toml`).
   - No remote Supabase mutations or CLI linking commands are executed.
5. **Modal Approval Invariant (`conductor_antigravity.md` & `AGENTS.md` Section 2):**
   - Halt immediately for affirmative user approval via the `ask_question` modal before making any file modifications on disk.

---

## 3. Target Files & Semantic Insertion Anchors

### 3.1 Target 1: Local Supabase Runtime Configuration
- **Path:** `supabase/config.toml`
- **Semantic Insertion Anchor:** Under section `[api]` (lines 7–18):
  ```toml
  [api]
  enabled = true
  # Port to use for the API URL.
  port = 54321
  # Schemas to expose in your API. Tables, views and stored procedures in this schema will get API
  # endpoints. `public` and `graphql_public` schemas are included by default.
  schemas = ["public", "graphql_public"]
  ```
- **Replacement:**
  ```toml
  schemas = ["public"]
  ```

### 3.2 Target 2: CI Supabase Runtime Configuration
- **Path:** `supabase/config.ci.toml`
- **Semantic Insertion Anchor:** Under section `[api]` (lines 3–8):
  ```toml
  [api]
  enabled = true
  port = 54321
  schemas = ["public", "graphql_public"]
  extra_search_path = ["public", "extensions"]
  ```
- **Replacement:**
  ```toml
  schemas = ["public"]
  ```

---

## 4. TypeScript Interfaces & Type Blueprints

To enforce structural correctness and provide runtime / compile-time validation of Supabase configuration shapes, the following TypeScript interfaces and validation function define the schema contract:

```typescript
/**
 * Representation of the [api] table in Supabase config.toml / config.ci.toml.
 */
export interface SupabaseApiConfig {
  /** Whether the PostgREST API is enabled */
  enabled: boolean;
  /** Port on which the API gateway listens */
  port: number;
  /**
   * Schemas exposed via PostgREST endpoints.
   * Hardening invariant: strictly excludes "graphql_public".
   */
  schemas: string[];
  /** Schemas added to search_path on every client request */
  extra_search_path: string[];
  /** Maximum row count returned in a single query */
  max_rows?: number;
}

/**
 * Structural model of Supabase TOML configuration files.
 */
export interface SupabaseTomlConfig {
  project_id: string;
  api: SupabaseApiConfig;
  db?: {
    port: number;
    shadow_port?: number;
    major_version: number;
  };
  auth?: {
    enabled: boolean;
    site_url?: string;
    enable_signup?: boolean;
  };
}

/**
 * Validation result for Supabase API schema configuration audit.
 */
export interface SupabaseConfigValidationResult {
  valid: boolean;
  schemas: string[];
  hasGraphqlPublic: boolean;
  errors: string[];
}

/**
 * Validates that PostgREST schema list contains "public" and forbids "graphql_public".
 *
 * @param schemas - Array of schema names defined in [api].schemas
 * @returns SupabaseConfigValidationResult detailing validation status and violations
 */
export function validateSupabaseApiSchemas(
  schemas: readonly string[]
): SupabaseConfigValidationResult {
  const errors: string[] = [];
  const hasPublic = schemas.includes('public');
  const hasGraphqlPublic = schemas.includes('graphql_public');

  if (!hasPublic) {
    errors.push('Required schema "public" is missing from [api].schemas');
  }
  if (hasGraphqlPublic) {
    errors.push('Forbidden schema "graphql_public" must be removed following pg_graphql teardown');
  }

  return {
    valid: errors.length === 0,
    schemas: [...schemas],
    hasGraphqlPublic,
    errors,
  };
}
```

---

## 5. Precise Behavioral Logic & Edge Cases

### 5.1 State Transitions
1. **Pre-execution State:**
   - `supabase/config.toml`: `[api].schemas` evaluates to `["public", "graphql_public"]`.
   - `supabase/config.ci.toml`: `[api].schemas` evaluates to `["public", "graphql_public"]`.
   - PostgREST initializes routing and OpenAPI discovery for both schemas.
2. **Post-execution State:**
   - `supabase/config.toml`: `[api].schemas` evaluates strictly to `["public"]`.
   - `supabase/config.ci.toml`: `[api].schemas` evaluates strictly to `["public"]`.
   - PostgREST initializes routing and OpenAPI discovery solely for the `public` schema.
   - Zero references to `graphql_public` remain in the configuration tree.

### 5.2 Error Handling & Edge Cases
- **Preservation of `extra_search_path`:**
  - Both configuration files specify `extra_search_path = ["public", "extensions"]`.
  - This parameter must remain untouched so PostgreSQL extensions (e.g. `uuid-ossp`, `pgcrypto`) in the `extensions` schema remain discoverable in search paths.
- **Formatting & Syntax Invariants:**
  - Standard TOML array syntax `["public"]` must be used without trailing commas or syntax corruption.
  - File encoding must remain UTF-8 with standard LF line endings.
- **CI Overwrite Protection:**
  - If only `config.toml` was modified while `config.ci.toml` retained `"graphql_public"`, running CI would execute line 55 of `.github/workflows/ci.yml` (`cp supabase/config.ci.toml supabase/config.toml`) and silently re-introduce the vulnerability during CI builds.
  - Synchronous modification of both files prevents this regression.

---

## 6. Execution Verification Protocol

Following implementation, the executor will execute the following static and dynamic verification commands:

### 6.1 Static Verification: Absence of `graphql_public`
Verify that `graphql_public` no longer appears in any Supabase configuration file:

```bash
git diff supabase/config.toml supabase/config.ci.toml
grep -n "graphql_public" supabase/config.toml supabase/config.ci.toml
```
*Expected Result:*
- `git diff` shows single-line deletions removing `"graphql_public"` from `schemas` in both files.
- `grep` returns exit code `1` (zero matches found).

### 6.2 Supabase CLI Configuration Validation
Confirm the local Supabase stack reads the updated configuration without parsing or schema errors:

```bash
npm run db:status
```
*Execution Note:* Requires `BypassSandbox: true` due to host `/run` Podman socket interaction.  
*Expected Result:* Supabase services report healthy/running status without PostgREST configuration warnings.

### 6.3 Containerized Integration Test Verification
Run the comprehensive integration test suite to verify PostgREST and database RPC connectivity with only `public` exposed:

```bash
npm run test:integration:container -- lib/services/__tests__/supabase-rpc.integration.test.ts
```
*Execution Note:* Requires `BypassSandbox: true` for the Podman container runner.  
*Expected Result:* 100% of integration tests pass cleanly.

### 6.4 Containerized Unit Test Verification
Run unit tests to ensure application test runners remain healthy:

```bash
npm run test:container -- lib/services/__tests__/tripService.mutations.test.ts
```
*Execution Note:* Requires `BypassSandbox: true` for the Podman container runner.  
*Expected Result:* All tests pass cleanly.

---

## 7. Post-Execution Protocol & Git Notes

Upon successful verification:

### 7.1 Stage & Commit
```bash
git add supabase/config.toml supabase/config.ci.toml
git commit -m "chore(supabase): remove pg_graphql from api schemas in local and ci config"
```

### 7.2 Attach Git Note
Obtain the commit SHA (`COMMIT_HASH=$(git log -1 --format="%H")`) and attach the standard metadata note:

```bash
git notes add -m "Task: Remove pg_graphql from Supabase Configuration
Summary: Removed \"graphql_public\" from api.schemas in supabase/config.toml and supabase/config.ci.toml following the removal of pg_graphql in migration 20261026000000_harden_rls_and_security_invoker_rpcs.sql.
Files: supabase/config.toml, supabase/config.ci.toml
Rationale: Eliminates GraphQL schema reflection from PostgREST API exposure, aligns local and CI runtime configurations with the dropped pg_graphql database extension, and resolves Supabase Security Advisor linter categories 0026 and 0027." $COMMIT_HASH
```

### 7.3 Update Conductor Plan
Update `conductor/tracks/db-security-hardening_20261026/plan.md`:
- Mark `- [ ] Task: Remove pg_graphql from Supabase Configuration` as `- [x] Task: Remove pg_graphql from Supabase Configuration [commit: <short_sha>]`.
- Mark subtask `- [ ] Remove "graphql_public" from db.schemas in both supabase/config.toml and supabase/config.ci.toml.` as completed (`- [x]`).
- Stage `conductor/tracks/db-security-hardening_20261026/plan.md`.
- Commit with: `conductor(plan): Mark task 'Remove pg_graphql from Supabase Configuration' as complete`.

---

## 8. Confirmation Gate

Halt immediately. Do NOT modify `supabase/config.toml` or `supabase/config.ci.toml` or execute any commands until explicit affirmative user approval is received via the `ask_question` modal.
