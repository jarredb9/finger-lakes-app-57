# Implementation Plan: Agent-Resolve Quality Hardening & Token Optimization

## Phase 1: Stage 2 Patch-Based Test Authoring & Unified Patch Engine
- [ ] Task: Write failing unit tests for Stage 2 patch-based test authoring (TDD Red phase)
    - [ ] Add unit tests in `scripts/agent-resolve/tests/test_stages.py` asserting Stage 2 requests and applies `PatchManifest` instead of `TestFileManifest`.
    - [ ] Assert removal of `extract_test_suite_names` check and support for empty search blocks when creating new test files.
    - [ ] Execute `npm run test:agent` and confirm expected test failures.
- [ ] Task: Implement Stage 2 patch-based test authoring to pass tests (TDD Green phase)
    - [ ] Update `scripts/agent-resolve/agent_resolve/stages/stage_2_red.py` to use `PatchManifest` schema and apply patches via `apply_patch_manifest`.
    - [ ] Remove `extract_test_suite_names` and update prompt directives to request surgical search/replace diffs.
    - [ ] Run `npm run test:agent` and verify all tests pass.
- [ ] Task: Conductor - User Manual Verification 'Stage 2 Patch-Based Test Authoring & Unified Patch Engine' (Protocol in workflow.md)

## Phase 2: Stage 1 Target Test Deduplication & Cohesion
- [ ] Task: Write failing unit tests for Stage 1 target test deduplication (TDD Red phase)
    - [ ] Add unit tests in `scripts/agent-resolve/tests/test_stages.py` and `scripts/agent-resolve/tests/test_context.py` verifying test file deduplication and specialized suite prioritization (e.g., preferring `.persist.test.ts` over `.test.ts`).
    - [ ] Execute `npm run test:agent` and confirm expected test failures.
- [ ] Task: Implement Stage 1 test deduplication to pass tests (TDD Green phase)
    - [ ] Implement test suite deduplication filter in `scripts/agent-resolve/agent_resolve/stages/stage_1_plan.py` and `context.py`.
    - [ ] Add prompt directive in Stage 1 Planner constraining selection to 1 primary test suite per architectural component.
    - [ ] Run `npm run test:agent` and verify all tests pass.
- [ ] Task: Conductor - User Manual Verification 'Stage 1 Target Test Deduplication & Cohesion' (Protocol in workflow.md)

## Phase 3: Stage 3 Targeted ESLint Gate & Code Hygiene Directives
- [ ] Task: Write failing unit tests for Stage 3 ESLint gating and retry handling (TDD Red phase)
    - [ ] Add unit tests in `scripts/agent-resolve/tests/test_stages.py` asserting Stage 3 executes targeted ESLint after type checking and captures truncated diagnostics into `last_error_context` on failure.
    - [ ] Execute `npm run test:agent` and confirm expected test failures.
- [ ] Task: Implement Stage 3 ESLint verification gate to pass tests (TDD Green phase)
    - [ ] Update `scripts/agent-resolve/agent_resolve/stages/stage_3_green.py` to execute `npx eslint --no-warn-ignored <target_src_files>`.
    - [ ] Wire ESLint exit code failures into retry loop with sanitized diagnostic error context.
    - [ ] Add code hygiene directive prohibiting nested ternaries (>1 level) and mandating helper functions.
    - [ ] Run `npm run test:agent` and verify all tests pass.
- [ ] Task: Conductor - User Manual Verification 'Stage 3 Targeted ESLint Gate & Code Hygiene Directives' (Protocol in workflow.md)

## Phase 4: Edge Function Runtime Boundary & Suitability Gate
- [ ] Task: Write failing unit tests for Edge Function suitability and boundary gating (TDD Red phase)
    - [ ] Add unit tests in `scripts/agent-resolve/tests/test_context.py` and `test_stages.py` verifying that issues touching `supabase/functions/` are classified as unsuitable for headless overnight execution.
    - [ ] Execute `npm run test:agent` and confirm expected test failures.
- [ ] Task: Implement Edge Function suitability gate to pass tests (TDD Green phase)
    - [ ] Update `is_issue_suitable_for_headless_agent` in `scripts/agent-resolve/agent_resolve/context.py` to reject issues modifying `supabase/functions/`.
    - [ ] Remove cross-runtime Jest testing directives from `stage_2_red.py` and `stage_1_plan.py`.
    - [ ] Run `npm run test:agent` and verify all tests pass.
- [ ] Task: Conductor - User Manual Verification 'Edge Function Runtime Boundary & Suitability Gate' (Protocol in workflow.md)

## Phase 5: Context Pruning & Static Prefix Prompt Caching
- [ ] Task: Write failing unit tests for context pruning and prompt caching structure (TDD Red phase)
    - [ ] Add unit tests in `scripts/agent-resolve/tests/test_stages.py` asserting Stage 2 and Stage 3 prompts omit full repository file trees and place static guidelines in the prefix.
    - [ ] Execute `npm run test:agent` and confirm expected test failures.
- [ ] Task: Implement prompt context pruning to pass tests (TDD Green phase)
    - [ ] Update `context.py`, `stage_2_red.py`, and `stage_3_green.py` to position static guidelines at the prefix and omit `git ls-files` repository dumps.
    - [ ] Run `npm run test:agent` and `npm run test:agent:all` to ensure zero regressions across the entire suite.
- [ ] Task: Conductor - User Manual Verification 'Context Pruning & Static Prefix Prompt Caching' (Protocol in workflow.md)
