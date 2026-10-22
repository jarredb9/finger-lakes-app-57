# Implementation Plan: Agent-Resolve Quality Hardening & Token Optimization

## Phase 1: Stage 2 Patch-Based Test Authoring & Unified Patch Engine [checkpoint: 0e79c6e]
- [x] Task: Write failing unit tests for Stage 2 patch-based test authoring and TestPatchManifest (TDD Red phase) [commit: 2ec1b98]
    - [x] Add unit tests in `scripts/agent-resolve/tests/test_stages.py` asserting Stage 2 requests and applies `TestPatchManifest` schema (`patches` and `source_stubs`).
    - [x] Assert that `stage_2_red.py` passes `allowed_files = target_tests` to `apply_patch_manifest` to prevent source file tampering.
    - [x] Assert that `stage_2_red.py` reverts `target_test_files` to git baseline and cleans staged stubs before each retry attempt.
    - [x] Assert removal of `extract_test_suite_names` check and support for empty search blocks when creating brand new test files.
    - [x] Execute `npm run test:agent` and confirm expected test failures.
- [x] Task: Implement Stage 2 patch-based test authoring and TestPatchManifest to pass tests (TDD Green phase) [commit: 4ae00cb]
    - [x] Define `TestPatchManifest` in `scripts/agent-resolve/agent_resolve/models.py`.
    - [x] Generalize `apply_patch_manifest` in `scripts/agent-resolve/agent_resolve/patch_engine.py` to accept new test files for empty search blocks.
    - [x] Update `scripts/agent-resolve/agent_resolve/stages/stage_2_red.py` to use `TestPatchManifest`, apply source stubs, apply test patches with `allowed_files = target_tests`, and reset working tree state between retry attempts.
    - [x] Remove `extract_test_suite_names` and update prompt directives to request surgical search/replace diffs.
    - [x] Run `npm run test:agent` and verify all tests pass.
- [x] Task: Conductor - User Manual Verification 'Stage 2 Patch-Based Test Authoring & Unified Patch Engine' (Protocol in workflow.md) [commit: 0e79c6e]

## Phase 2: Stage 1 Target Test Deduplication & Cohesion
- [x] Task: Write failing unit tests for Stage 1 target test deduplication and blast radius demotion (TDD Red phase) [commit: 1339f17]
    - [x] Add unit tests in `scripts/agent-resolve/tests/test_stages.py` and `scripts/agent-resolve/tests/test_context.py` verifying test file deduplication by component stem (`<stem>.*.test.ts*` vs `<stem>.test.ts*`).
    - [x] Assert that specialized test suites (e.g. `.persist.test.ts`, `.enrichment.test.ts`) are prioritized in `blueprint.target_test_files`, while generic suites (`.test.ts`) are demoted into `blueprint.blast_radius_test_files`.
    - [x] Assert that demoted test files are deduplicated and capped at `MAX_BLAST_RADIUS_TESTS = 8`.
    - [x] Execute `npm run test:agent` and confirm expected test failures.
- [x] Task: Implement Stage 1 test deduplication and blast radius demotion to pass tests (TDD Green phase) [commit: e462558]
    - [x] Implement `deduplicate_target_test_files` in `scripts/agent-resolve/agent_resolve/context.py` / `stages/stage_1_plan.py`.
    - [x] Update `stage_1_plan.py` to retain the primary specialized suite in `target_test_files` and route demoted suites into `blast_radius_test_files`.
    - [x] Add prompt directive in Stage 1 Planner constraining selection to 1 primary test suite per architectural component.
    - [x] Run `npm run test:agent` and verify all tests pass.
- [x] Task: Conductor - User Manual Verification 'Stage 1 Target Test Deduplication & Cohesion' (Protocol in workflow.md) [commit: 8314526]

## Phase 3: Stage 3 Targeted ESLint Gate & Code Hygiene Directives
- [x] Task: Write failing unit tests for Stage 3 ESLint gating, retry diagnostics, and eslint config update (TDD Red phase) [commit: 589af95]
    - [x] Add unit tests in `scripts/agent-resolve/tests/test_stages.py` asserting Stage 3 executes targeted ESLint after type checking and captures truncated diagnostics into `last_error_context` on failure.
    - [x] Add unit tests asserting that ESLint failure triggers retry loop, while exit code 0 proceeds to Jest verification.
    - [x] Execute `npm run test:agent` and confirm expected test failures.
- [x] Task: Implement Stage 3 ESLint verification gate, eslint config update, and refactor existing ternaries to pass tests (TDD Green phase) [commit: f391b83]
    - [x] Add `"no-nested-ternary": "error"` rule to `eslint.config.mjs`.
    - [x] Refactor existing nested ternaries in `lib/utils/adapters/google-v1.ts` and `components/TripCardSimplePresentational.tsx`.
    - [x] Update `scripts/agent-resolve/agent_resolve/stages/stage_3_green.py` to execute `npx eslint --no-warn-ignored <target_src_files>`.
    - [x] Wire ESLint exit code failures into retry loop with sanitized diagnostic error context (`truncate_error_context`).
    - [x] Add code hygiene directive to Stage 3 Green prompt prohibiting nested ternaries (>1 level) and mandating pure helper extraction.
    - [x] Run `npm run test:agent` and verify all tests pass.
- [ ] Task: Conductor - User Manual Verification 'Stage 3 Targeted ESLint Gate & Code Hygiene Directives' (Protocol in workflow.md)

## Phase 4: Edge Function Runtime Boundary & Suitability Gate
- [ ] Task: Write failing unit tests for Edge Function suitability hard gating in context and pipeline (TDD Red phase)
    - [ ] Add unit tests in `scripts/agent-resolve/tests/test_context.py` asserting `is_issue_suitable_for_headless_agent` returns `(False, ...)` for all issues modifying `supabase/functions/` (including `_shared/`).
    - [ ] Add unit tests in `scripts/agent-resolve/tests/test_pipeline.py` asserting that unsuitable issues cause `pipeline.py` to post a comment via `gh_cli` and exit cleanly without executing stages.
    - [ ] Add unit tests in `scripts/agent-resolve/tests/test_pipeline.py` asserting that Stage 0 verified target files touching `supabase/functions/` trigger the same comment and halt.
    - [ ] Execute `npm run test:agent` and confirm expected test failures.
- [ ] Task: Implement Edge Function suitability hard gate in context and pipeline to pass tests (TDD Green phase)
    - [ ] Update `is_issue_suitable_for_headless_agent` in `scripts/agent-resolve/agent_resolve/context.py` to reject issues modifying `supabase/functions/`.
    - [ ] Update `scripts/agent-resolve/agent_resolve/pipeline.py` to enforce the hard gate upfront and after Stage 0 diagnostics, posting a GitHub advisory comment and halting cleanly.
    - [ ] Remove Directive 10 from `stage_1_plan.py` and `stage_2_red.py`.
    - [ ] Run `npm run test:agent` and verify all tests pass.
- [ ] Task: Conductor - User Manual Verification 'Edge Function Runtime Boundary & Suitability Gate' (Protocol in workflow.md)

## Phase 5: Context Pruning & Static Prefix Prompt Caching
- [ ] Task: Write failing unit tests for prompt context pruning and static prefix caching layout (TDD Red phase)
    - [ ] Add unit tests in `scripts/agent-resolve/tests/test_stages.py` and `test_context.py` asserting that `get_project_context(include_tree=False)` omits repository files.
    - [ ] Assert that Stage 2 and Stage 3 prompts do not contain repository file tree dumps.
    - [ ] Assert that prompts in Stages 1, 2, and 3 place static repository guidelines (`CONTEXT.md`, `AGENTS.md`) and immutable role headers at byte 0.
    - [ ] Execute `npm run test:agent` and confirm expected test failures.
- [ ] Task: Implement prompt context pruning and static prefix caching to pass tests (TDD Green phase)
    - [ ] Update `context.py` to support `get_project_context(include_tree: bool = False)` (default `False`).
    - [ ] Update `stage_1_plan.py` to call `get_repository_tree()` explicitly, and update `stage_2_red.py` and `stage_3_green.py` to omit it.
    - [ ] Reorder prompts across all stages to position static guidelines at the prefix.
    - [ ] Run `npm run test:agent` and `npm run test:agent:all` to ensure zero regressions across the entire suite.
- [ ] Task: Conductor - User Manual Verification 'Context Pruning & Static Prefix Prompt Caching' (Protocol in workflow.md)

## Phase 6: Semantic Diagnostic Filtering & Stack Trace Pruning
- [ ] Task: Write failing unit tests for semantic diagnostic filtering and stack trace pruning (TDD Red phase)
    - [ ] Add unit tests in `scripts/agent-resolve/tests/test_diagnostics.py` asserting `truncate_error_context` strips `node_modules/` and runtime internal stack frames while preserving user-space frames.
    - [ ] Assert retention of TypeScript compiler output (`error TS...`), ESLint diagnostics, and Jest multi-line assertion diffs.
    - [ ] Assert collapse of consecutive blank lines and verify the 4,000 character ceiling with split head/tail marker.
    - [ ] Execute `npm run test:agent` and confirm expected test failures.
- [ ] Task: Implement semantic diagnostic filtering and update ADR-0005 to pass tests (TDD Green phase)
    - [ ] Update `truncate_error_context` in `scripts/agent-resolve/agent_resolve/diagnostics.py` with regex-based negative line filtering and newline collapsing.
    - [ ] Lower `max_chars` parameter default to 4000.
    - [ ] Update Section 7 of `docs/adr/0005-autonomous-nightly-agent-workflow.md` to document the 4,000-character cap and diagnostic sanitization.
    - [ ] Run `npm run test:agent` and `npm run test:agent:all` to verify all tests pass.
- [ ] Task: Conductor - User Manual Verification 'Semantic Diagnostic Filtering & Stack Trace Pruning' (Protocol in workflow.md)
