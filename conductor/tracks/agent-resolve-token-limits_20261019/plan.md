# Implementation Plan: Prevent Prompt Token Blowout, Unbounded Jest Output & Cached Token Accounting

## Phase 1: Separate `blast_radius_test_files` from `target_test_files` & Bound Discovery
- [ ] Task: Write failing unit tests for blast radius data model, discovery bounds, and stage prompt isolation (TDD Red phase)
    - [ ] Author unit tests in `scripts/agent-resolve/tests/test_models.py` verifying `BlueprintPlan.blast_radius_test_files` default and serialization
    - [ ] Author unit tests in `scripts/agent-resolve/tests/test_context.py` verifying `find_related_test_files` matches only Jest extensions (`*.test.ts(x)`, `*.spec.ts(x)`), excludes `supabase/` and `e2e/`, matches import boundaries (`/{stem}['"]`, `from.*{stem}`), and caps results at 8 suites
    - [ ] Author unit tests in `scripts/agent-resolve/tests/test_stages.py` verifying Stage 1 populates blast radius without mutating `target_test_files`, Stage 2 only interacts with `target_test_files`, and Stage 3 only injects `target_test_files` into prompt while executing target + blast radius in Jest
- [ ] Task: Implement blast radius data model, discovery bounds, and stage prompt isolation (TDD Green phase)
    - [ ] Add `blast_radius_test_files: List[str]` to `BlueprintPlan` in `agent_resolve/models.py` and state serialization in `agent_resolve/vcs.py`
    - [ ] Refactor `find_related_test_files` in `agent_resolve/context.py` with import-boundary regex, directory-proximity prioritization, and 8-suite cap
    - [ ] Update `stage_1_plan.py`, `stage_2_red.py`, and `stage_3_green.py` to isolate prompt injection
    - [ ] Verify all tests pass via `npm run test:agent`
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Separate blast_radius_test_files from target_test_files & Bound Discovery' (Protocol in workflow.md)

## Phase 2: Stage 3 Fail-Fast Type-Check, Silent Jest Execution & Error Context Truncation
- [ ] Task: Write failing unit tests for Stage 3 fail-fast compilation, silent Jest execution, and 8k character truncation (TDD Red phase)
    - [ ] Author unit tests in `scripts/agent-resolve/tests/test_stages.py` verifying that when `tc_code != 0`, Jest execution is skipped and compiler errors populate `last_error_context`
    - [ ] Author unit tests in `scripts/agent-resolve/tests/test_stages.py` verifying `--no-color` and `--silent` flags are passed to `npx jest` in targeted verification
    - [ ] Author unit tests verifying ANSI escape code stripping and head-and-tail 8,000 character truncation (4,000 head, 4,000 tail with truncation marker)
- [ ] Task: Implement Stage 3 fail-fast compilation, silent Jest execution, and 8k character truncation (TDD Green phase)
    - [ ] Implement fail-fast branch in `agent_resolve/stages/stage_3_green.py` when `tc_code != 0`, skipping Jest execution
    - [ ] Add `--no-color` and `--silent` flags to targeted Jest command construction in `stage_3_green.py`
    - [ ] Implement ANSI stripping and head/tail 8,000 character truncation helper in `stage_3_green.py` / `diagnostics.py`
    - [ ] Verify all tests pass via `npm run test:agent`
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Stage 3 Fail-Fast Type-Check, Silent Jest Execution & Error Context Truncation' (Protocol in workflow.md)

## Phase 3: Discounted Cached Token Budget (25%), Pre-Call Guard & Status-Boundary Matching
- [ ] Task: Write failing unit tests for 25% cached token accounting, pre-call budget checks, and boundary regex matching (TDD Red phase)
    - [ ] Author unit tests in `scripts/agent-resolve/tests/test_tracker.py` asserting `effective_tokens` calculates uncached tokens + 25% cached tokens and formats dual summary metrics
    - [ ] Author unit tests in `scripts/agent-resolve/tests/test_llm.py` asserting pre-call `check_budget()` raises `RuntimeError` before issuing calls or retries
    - [ ] Author unit tests asserting `is_transient_error("Token budget exceeded: 500,000 tokens used")` returns False
- [ ] Task: Implement 25% cached token accounting, pre-call budget checks, and boundary regex matching (TDD Green phase)
    - [ ] Implement `effective_tokens`, `check_budget()`, and dual summary formatting in `agent_resolve/tracker.py`
    - [ ] Add pre-call budget checks and isolate `record_usage()` outside transient retry catch in `agent_resolve/llm.py`
    - [ ] Update `is_transient_error` in `agent_resolve/llm.py` with numeric/status boundary regex `r"(?<![0-9,])(?:429|500|502|503|504)(?![0-9,])"`
    - [ ] Verify all tests pass via `npm run test:agent`
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Discounted Cached Token Budget (25%), Pre-Call Guard & Status-Boundary Matching' (Protocol in workflow.md)

## Phase 4: Shared Edge Function (`supabase/functions/_shared/*.ts`) Verification Invariant
- [ ] Task: Write failing unit tests for Edge Function shared module prompt directives and test path guards (TDD Red phase)
    - [ ] Author unit tests in `scripts/agent-resolve/tests/test_stages.py` asserting `stage_1_plan` rejects `supabase/**`, `e2e/**`, and non-Jest paths in `target_test_files`
    - [ ] Author unit tests in `scripts/agent-resolve/tests/test_stages.py` asserting Stage 1 & 2 system prompts include directives to author Jest tests under `lib/**/__tests__/*.test.ts` for `supabase/functions/_shared/*.ts` files
    - [ ] Author unit tests in `scripts/agent-resolve/tests/test_context.py` asserting `is_issue_suitable_for_headless_agent` permits pure-TS shared functions but flags Deno runtime entrypoints
- [ ] Task: Implement Edge Function shared module prompt directives and test path guards (TDD Green phase)
    - [ ] Add target test file validation guard in `agent_resolve/stages/stage_1_plan.py`
    - [ ] Add prompt instructions to `stage_1_plan.py` and `stage_2_red.py` for shared edge function testing via `@/supabase/functions/_shared/<module>`
    - [ ] Update `is_issue_suitable_for_headless_agent` in `agent_resolve/context.py` to distinguish pure-TS shared modules from Deno runtime files
    - [ ] Verify all tests pass via `npm run test:agent`
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Shared Edge Function Verification Invariant' (Protocol in workflow.md)

## Phase 5: Stateful Resumption Self-Healing & Issue #73 Reset Checklist
- [ ] Task: Write failing unit tests for resumption target_test_files self-healing (TDD Red phase)
    - [ ] Author unit tests in `scripts/agent-resolve/tests/test_pipeline.py` simulating resumption from a polluted `.agent-state.json`
    - [ ] Assert that `resolve_issue` sanitizes `target_test_files` using `git diff-tree` against `red_phase_commit_sha`, demoting extra suites to `blast_radius_test_files`
- [ ] Task: Implement resumption target_test_files self-healing (TDD Green phase)
    - [ ] Implement checkpoint sanitization logic in `agent_resolve/pipeline.py`
    - [ ] Document manual operational instructions for deleting `origin/agent/issue-73` and closing PR #76 post-merge
    - [ ] Verify all tests pass via `npm run test:agent`
- [ ] Task: Conductor - User Manual Verification 'Phase 5: Stateful Resumption Self-Healing & Issue #73 Reset Checklist' (Protocol in workflow.md)

## Phase 6: ADR Documentation & End-to-End Test Suite Verification
- [ ] Task: Update ADR-0005 with token budget discounting, test isolation, and verification invariants
    - [ ] Document separation of `target_test_files` and `blast_radius_test_files`
    - [ ] Document 25% cached token budgeting rule and 8,000 character error context cap
    - [ ] Document pure-TS `supabase/functions/_shared/*.ts` Jest testing rule
- [ ] Task: Execute full test verification across agent and container suites
    - [ ] Run unit tests via `npm run test:agent`
    - [ ] Run full agent integration tests via `npm run test:agent:all`
    - [ ] Review manual verification checklist for Issue #73 post-merge reset
- [ ] Task: Conductor - User Manual Verification 'Phase 6: ADR Documentation & End-to-End Test Suite Verification' (Protocol in workflow.md)
