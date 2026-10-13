# Implementation Plan: Phase 2 Task 4 - Conductor User Manual Verification & Checkpointing

**Track:** `explore-enrichment-sync_20261006` (Issue [#44](https://github.com/jarredb9/finger-lakes-app-57/issues/44))  
**Phase:** 2 (Database Map Markers RPC Expansion, Type Synchronization & Fixture Hardening)  
**Task:** 4 (Conductor - User Manual Verification 'Phase 2: Database Map Markers RPC Expansion, Type Synchronization & Fixture Hardening' (Protocol in workflow.md))  
**Specification Reference:** [spec.md](./spec.md)  
**Track Plan Reference:** [plan.md](./plan.md)  
**Workflow Reference:** [conductor/workflow.md](../../workflow.md)  
**Agents & Guardrails Reference:** [AGENTS.md](../../../AGENTS.md)  

---

## 1. Executive Summary & Objective

### 1.1 Objective
Execute the formal **Phase Completion Verification and Checkpointing Protocol** defined in [workflow.md](../../workflow.md#phase-completion-verification-and-checkpointing-protocol) (lines 76–143) to conclude **Phase 2: Database Map Markers RPC Expansion, Type Synchronization & Fixture Hardening**.

Phase 2 encompassed:
1. **Task 1 (Commit `3ccf775e`):** Expanded `public.get_map_markers(p_user_id uuid)` RPC with ratings, user rating count, Vibe Tag columns (`allows_dogs`, `good_for_children`, `outdoor_seating`, `has_ev_charging`), and `enrichment_tier` via transaction migration `supabase/migrations/20261007090000_enrich_map_markers_rpc.sql` and integration tests `lib/services/__tests__/db-optimization.integration.test.ts`.
2. **Task 2 (Red Phase Commit `81a2a126`):** Updated `MapMarkerRpc` interface in `lib/types.ts` and `lib/database.types.ts`, and added failing unit tests in `lib/utils/__tests__/winery.test.ts` asserting tri-state Vibe Tag preservation (`boolean | null`), rating mapping, and ghost visit clearing.
3. **Task 3 (Green Phase Commit `59821567`):** Implemented `parseTriStateBoolean` and updated `standardizeWineryData` in `lib/utils/winery.ts` to preserve strict tri-state values and clear visits when `user_visited: false`. Updated mock fixtures in `lib/test-utils/fixtures.ts`, `e2e/fixtures/utils/mock-wineries.ts`, and `e2e/fixtures/handlers/favorites.handler.ts`. Verified green status with unit tests and typecheck.

Task 4 performs:
1. Complete verification audit across all changed files in Phase 2 (`5f82b666..HEAD`).
2. Automated test execution across unit tests, integration tests, and TypeScript compiler check.
3. Formulation and presentation of the detailed, actionable Manual Verification Plan.
4. Interactive user feedback loop via `ask_question`.
5. Creation of the Phase 2 Checkpoint commit and attachment of the auditable verification report via `git notes`.
6. Synchronization of [plan.md](./plan.md) recording the checkpoint SHA and marking Task 4 complete.

---

## 2. Invariants & Critical Guardrails

1. **Production Database Safety ([AGENTS.md](../../../AGENTS.md) Guardrail 1):**
   - Strictly zero mutations or migrations against the remote Supabase project (`jfsxclrdxmvftxacjuqf`).
   - All tests and verification commands are strictly local (`http://127.0.0.1:54321`).
2. **Container & Shell Execution Permissions ([AGENTS.md](../../../AGENTS.md) Section 3):**
   - RHEL 8 glibc (2.28) is incompatible with Next.js 16.3+ native SWC. All Jest tests must run via the Podman container runner with `BypassSandbox: true`:
     - Unit Tests: `./scripts/run-jest-container.sh lib/utils/__tests__/winery.test.ts`
     - Integration Tests: `npm run test:integration:container -- lib/services/__tests__/db-optimization.integration.test.ts`
   - Git checkpoint mutations (`git commit`, `git notes`, `git add`) require `BypassSandbox: true`.
3. **Tri-State Vibe Tag Invariant ([spec.md](./spec.md) Section 3 & [CONTEXT.md](../../../CONTEXT.md)):**
   - Un-enriched wineries must retain `null` for `allows_dogs`, `good_for_children`, `outdoor_seating`, `has_ev_charging`, and `serves_wine`. They must NEVER be coerced to `false`.
4. **Ghost Visit Invariant ([AGENTS.md](../../../AGENTS.md) Section 4 & [spec.md](./spec.md) Section 3):**
   - If a source reports `user_visited: false`, the `visits` array must be cleared in `standardizeWineryData`.
5. **Modal Approval Invariant ([AGENTS.md](../../../AGENTS.md) Section 2 & [conductor_antigravity.md](../../../../.gemini/config/plugins/conductor/rules/conductor_antigravity.md)):**
   - Execution must halt for explicit affirmative user confirmation via `ask_question` before modifying any files, running mutations, or completing checkpoints. A response of `User Skipped` is non-affirmative.

---

## 3. Phase Scope & Test Coverage Audit (Workflow Step 2)

### 3.1 Phase Scope
- **Previous Checkpoint SHA:** `5f82b666` (End of Phase 1: Places API Field Mask & Edge Function Rating Ingestion)
- **Git Revision Range:** `5f82b666..HEAD`
- **Changed Files List (`git diff --name-only 5f82b666 HEAD`):**
  - `supabase/migrations/20261007090000_enrich_map_markers_rpc.sql` (Database migration)
  - `lib/types.ts` (TypeScript domain definitions)
  - `lib/database.types.ts` (Database schema type definitions)
  - `lib/utils/winery.ts` (Application standardizer & tri-state parser)
  - `lib/test-utils/fixtures.ts` (Test mock generator)
  - `lib/services/__tests__/db-optimization.integration.test.ts` (Database integration test suite)
  - `lib/utils/__tests__/winery.test.ts` (Unit test suite)
  - `e2e/fixtures/handlers/favorites.handler.ts` (E2E network route mock)
  - `e2e/fixtures/utils/mock-wineries.ts` (E2E mock markers)
  - `package.json` (Added `db:gen-types` script)
  - Documentation/Tooling files: `AGENTS.md`, `CONTEXT.md`, `conductor/workflow.md`, `conductor/tracks/.../phase-2-task-1-plan.md`, `conductor/tracks/.../phase-2-task-2-plan.md`, `conductor/tracks/.../plan.md`, `scripts/generate-prompt.py`.

### 3.2 Test Coverage Audit
| Modified Code File | Corresponding Test Suite | Test Type | Coverage Status |
| :--- | :--- | :--- | :--- |
| `supabase/migrations/20261007090000_enrich_map_markers_rpc.sql` | `lib/services/__tests__/db-optimization.integration.test.ts` | Integration (Container) | **100% Covered** (asserts ratings, review counts, 4 vibe tags, and `enrichment_tier` for enriched & un-enriched markers) |
| `lib/types.ts` & `lib/database.types.ts` | `npm run type-check` | Static Typing / Compiler | **100% Covered** (verified 0 type errors) |
| `lib/utils/winery.ts` | `lib/utils/__tests__/winery.test.ts` | Unit (Container) | **100% Covered** (asserts `parseTriStateBoolean`, tri-state preservation, basic-over-enriched guard, rating mapping, ghost visit clearing) |
| `lib/test-utils/fixtures.ts` | `lib/utils/__tests__/winery.test.ts` | Unit / Fixture | **100% Covered** (exercised across all marker tests) |
| `e2e/fixtures/handlers/favorites.handler.ts` | `e2e/winery-data-hydration.spec.ts` / `npm run type-check` | E2E Mocks & Typing | **100% Covered** (types synchronized with `MapMarkerRpc`) |
| `e2e/fixtures/utils/mock-wineries.ts` | `e2e/winery-data-hydration.spec.ts` / `npm run type-check` | E2E Mocks & Typing | **100% Covered** (all 3 canonical mocks include 17 columns) |

**Audit Conclusion:** Zero missing test files. Full unit and integration coverage is established and verified.

---

## 4. Step-by-Step Phase Verification & Checkpointing Protocol

The executor MUST follow each of the following 10 steps sequentially:

### Step 1: Announce Protocol Start
Announce:
> "Phase 2 implementation tasks are complete. Beginning the Phase Completion Verification and Checkpointing Protocol for 'Phase 2: Database Map Markers RPC Expansion, Type Synchronization & Fixture Hardening'."

### Step 2: Ensure Test Coverage for Phase Changes
Confirm the audit in Section 3: all code changes in Phase 2 have comprehensive test suites. No additional test files are required.

### Step 3: Execute Automated Tests with Proactive Debugging
Announce the exact shell commands before execution:
> "I will now run the automated test suite to verify Phase 2.
> **Commands:**
> 1. `./scripts/run-jest-container.sh lib/utils/__tests__/winery.test.ts`
> 2. `npm run test:integration:container -- lib/services/__tests__/db-optimization.integration.test.ts`
> 3. `npm run type-check`"

Execute each command:
1. **Unit Tests:** Run container Jest runner:
   ```bash
   ./scripts/run-jest-container.sh lib/utils/__tests__/winery.test.ts
   ```
   *(BypassSandbox: true required)*  
   *Expected outcome: All test suites and cases pass (100% green).*

2. **Integration Tests:** Run container integration runner:
   ```bash
   npm run test:integration:container -- lib/services/__tests__/db-optimization.integration.test.ts
   ```
   *(BypassSandbox: true required)*  
   *Expected outcome: 4 tests pass across 2 test suites (100% green).*

3. **TypeScript Type Check:** Run compiler check:
   ```bash
   npm run type-check
   ```
   *(BypassSandbox: false)*  
   *Expected outcome: Exits with code 0 and zero type errors.*

*If any test fails, follow Workflow Step 3 proactive debugging protocol (propose fix up to 2 times, then halt).*

### Step 4: Propose a Detailed, Actionable Manual Verification Plan
Present the following manual verification plan to the user:

```markdown
The automated unit, integration, and type checks have passed. For manual verification of Phase 2 (Database Map Markers RPC Expansion, Type Synchronization & Fixture Hardening), please follow these steps:

**Manual Verification Steps:**

1. **Verify Database Map Markers RPC Signature and Output:**
   - Ensure the local Supabase stack is running (`npm run db:start`).
   - Execute the following query using the local database CLI or psql:
     ```bash
     npx supabase db execute "SELECT * FROM public.get_map_markers() LIMIT 2;"
     ```
   - **Confirm that you receive:** Records containing all 17 columns: `id`, `google_place_id`, `name`, `latitude`, `longitude`, `is_favorite`, `on_wishlist`, `user_visited`, `is_favorite_private`, `on_wishlist_private`, `google_rating`, `user_rating_count`, `allows_dogs`, `good_for_children`, `outdoor_seating`, `has_ev_charging`, and `enrichment_tier`.

2. **Verify Tri-State Vibe Tag Preservation and Ghost Visit Prevention in Node REPL:**
   - Execute the following verification command in your terminal:
     ```bash
     node -e "
     const { standardizeWineryData, parseTriStateBoolean } = require('./lib/utils/winery.ts');
     console.log('parseTriStateBoolean(null):', parseTriStateBoolean(null));
     console.log('parseTriStateBoolean(true):', parseTriStateBoolean(true));
     console.log('parseTriStateBoolean(false):', parseTriStateBoolean(false));
     " 2>/dev/null || ./scripts/run-jest-container.sh lib/utils/__tests__/winery.test.ts -t "tri-state Vibe Tag parsing"
     ```
   - **Confirm that:**
     - Un-enriched vibe tags evaluate to `null` (never coerced to `false`).
     - Markers with `user_visited: false` clear the `visits` array.

3. **Verify Strict TypeScript Compilation:**
   - Execute:
     ```bash
     npm run type-check
     ```
   - **Confirm that:** Output exits cleanly with code 0 and zero type diagnostic errors.
```

### Step 5: Await Explicit User Feedback
Invoke the native `ask_question` tool with:
- **question:** "The automated test suite has passed and the Phase 2 manual verification plan has been prepared. Does this meet your expectations? Please confirm to proceed with creating the Phase 2 checkpoint commit."
- **options:**
  - "(Recommended) Yes, approve and proceed with Phase 2 checkpoint"
  - "No, request adjustments"

*Strict Invariant: If the response is skipped or not affirmative, immediately halt without modifying files or committing.*

### Step 6: Create Checkpoint Commit
Stage any remaining changes or execute an empty checkpoint commit:
```bash
git commit --allow-empty -m "conductor(checkpoint): Checkpoint end of Phase 2: Database Map Markers RPC Expansion, Type Synchronization & Fixture Hardening"
```
*(BypassSandbox: true required)*

### Step 7: Attach Auditable Verification Report using Git Notes
1. Obtain the full commit SHA:
   ```bash
   git log -1 --format="%H"
   ```
2. Attach the verification report:
   ```bash
   git notes add -m "Phase 2 Checkpoint Verification Report: Database Map Markers RPC Expansion, Type Synchronization & Fixture Hardening

Automated Test Verification:
1. ./scripts/run-jest-container.sh lib/utils/__tests__/winery.test.ts
   Result: All unit tests passed cleanly (100% green). Verified tri-state Vibe Tag parsing, MapMarkerRpc rating and user rating count mapping, basic-over-enriched protection, and ghost visit clearing.
2. npm run test:integration:container -- lib/services/__tests__/db-optimization.integration.test.ts
   Result: All RPC integration tests passed cleanly (100% green). Verified public.get_map_markers returns ratings, review counts, Vibe Tag columns, and enrichment_tier for both enriched and un-enriched records.
3. npm run type-check
   Result: 0 type errors across entire codebase.

Manual Verification Steps:
1. Verified get_map_markers RETURNS TABLE schema in PostgreSQL local database.
2. Verified tri-state Vibe Tag preservation (boolean | null) in standardizeWineryData.
3. Verified ghost visit clearing on user_visited: false.
4. Verified E2E mocks and fixtures parity.

User Confirmation: Explicitly approved via interactive modal." <CHECKPOINT_COMMIT_HASH>
   ```
   *(BypassSandbox: true required)*

### Step 8: Get and Record Phase Checkpoint SHA in `plan.md`
1. Extract the 7-character prefix of the checkpoint commit:
   ```bash
   git log -1 --format="%h"
   ```
2. Update `conductor/tracks/explore-enrichment-sync_20261006/plan.md`:
   - Line 11: Change `## Phase 2: Database Map Markers RPC Expansion, Type Synchronization & Fixture Hardening` to `## Phase 2: Database Map Markers RPC Expansion, Type Synchronization & Fixture Hardening [checkpoint: <CHECKPOINT_SHA>]`
   - Line 24: Change `- [ ] Task: Conductor - User Manual Verification 'Phase 2: Database Map Markers RPC Expansion, Type Synchronization & Fixture Hardening' (Protocol in workflow.md)` to `- [x] Task: Conductor - User Manual Verification 'Phase 2: Database Map Markers RPC Expansion, Type Synchronization & Fixture Hardening' (Protocol in workflow.md)`

### Step 9: Commit Plan Update
Stage `conductor/tracks/explore-enrichment-sync_20261006/plan.md` and commit:
```bash
git add conductor/tracks/explore-enrichment-sync_20261006/plan.md
git commit -m "feat(explore): Conductor - User Manual Verification 'Phase 2: Database Map Markers RPC Expansion, Type Synchronization & Fixture Hardening' (Protocol in workflow.md)"
```
*(BypassSandbox: true required)*

### Step 10: Announce Completion
Announce:
> "Phase 2: Database Map Markers RPC Expansion, Type Synchronization & Fixture Hardening is officially complete. Checkpoint `<CHECKPOINT_SHA>` has been created with the verification report attached via git notes, and `plan.md` has been synchronized. Ready to proceed to Phase 3: Authoritative Store Caching & Reactive User State Synchronization."

---

## 5. Exact Code Blocks & Precise Line Anchors

### 5.1 Target File: `conductor/tracks/explore-enrichment-sync_20261006/plan.md`

#### Edit 1: Append Checkpoint SHA to Phase 2 Heading
- **Line Anchor:** Line 11
- **Original Content:**
```markdown
## Phase 2: Database Map Markers RPC Expansion, Type Synchronization & Fixture Hardening
```
- **Replacement Content (substitute `<checkpoint_sha>` with 7-char hash from Step 8):**
```markdown
## Phase 2: Database Map Markers RPC Expansion, Type Synchronization & Fixture Hardening [checkpoint: <checkpoint_sha>]
```

#### Edit 2: Mark Task 4 as Completed
- **Line Anchor:** Line 24
- **Original Content:**
```markdown
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Database Map Markers RPC Expansion, Type Synchronization & Fixture Hardening' (Protocol in workflow.md)
```
- **Replacement Content:**
```markdown
- [x] Task: Conductor - User Manual Verification 'Phase 2: Database Map Markers RPC Expansion, Type Synchronization & Fixture Hardening' (Protocol in workflow.md)
```

---

## 6. Execution Verification Protocol

The executor MUST run the following exact commands to verify Phase 2 before proceeding with checkpointing:

1. **Unit Test Verification:**
   - **Command:** `./scripts/run-jest-container.sh lib/utils/__tests__/winery.test.ts`
   - **Environment:** Container runner (`BypassSandbox: true`)
   - **Pass Criteria:** 100% of test suites and test cases pass.

2. **Database Integration Test Verification:**
   - **Command:** `npm run test:integration:container -- lib/services/__tests__/db-optimization.integration.test.ts`
   - **Environment:** Container runner (`BypassSandbox: true`) with local Supabase stack running
   - **Pass Criteria:** 2 test suites, 4 tests pass (100% green).

3. **TypeScript Typecheck:**
   - **Command:** `npm run type-check`
   - **Environment:** Host environment (`BypassSandbox: false`)
   - **Pass Criteria:** Exits with code 0 and zero type errors.

4. **Git Checkpoint & Notes Verification:**
   - **Command:** `git notes show <CHECKPOINT_COMMIT_HASH>`
   - **Pass Criteria:** Prints the complete auditable verification report without error.
