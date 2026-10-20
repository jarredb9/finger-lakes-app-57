# Implementation Plan: Prevent Prompt Token Blowout, Unbounded Jest Output & Cached Token Accounting

## Phase 1: Separate `blast_radius_test_files` from `target_test_files`, Bound Discovery & Prioritize Proximity [checkpoint: 19026b7]
- [x] Task: Write failing unit tests for blast radius data model, discovery bounds, generic stem qualification, and stage prompt isolation (TDD Red phase) [commit: 5a8e6c5]
    - [x] Author unit tests in `scripts/agent-resolve/tests/test_models.py` verifying `BlueprintPlan.blast_radius_test_files` default and serialization
    - [x] Author unit tests in `scripts/agent-resolve/tests/test_context.py` verifying `find_related_test_files` matches only Jest extensions (`*.test.ts(x)`, `*.spec.ts(x)`), excludes `supabase/` and `e2e/`, qualifies generic stems (`index`, `types`, `constants`, `utils`, `helpers`) with directory paths, matches import boundaries (`/(?:{pattern})(?:\.[a-zA-Z]+)?['\"]` and `from.*{pattern}`), sorts by common ancestor directory depth descending, and caps results at 8 suites
    - [x] Author unit tests in `scripts/agent-resolve/tests/test_stages.py` verifying Stage 1 populates blast radius without mutating `target_test_files`, Stage 2 only interacts with `target_test_files`, and Stage 3 only injects `target_test_files` into prompt while executing target + blast radius in Jest with `--no-color` and `--silent`
    - [x] Author unit tests in `scripts/agent-resolve/tests/test_vcs.py` asserting `preserve_failed_work` persists `blast_radius_test_files` in `.agent-state.json` and `update_or_create_pr` formats it in the PR body
- [x] Task: Implement blast radius data model, discovery bounds, generic stem qualification, and stage prompt isolation (TDD Green phase) [commit: 9cde21eb]
    - [x] Add `blast_radius_test_files: List[str]` to `BlueprintPlan` in `agent_resolve/models.py`
    - [x] Update `preserve_failed_work` and `update_or_create_pr` in `agent_resolve/vcs.py` to persist and report blast radius suites
    - [x] Refactor `find_related_test_files` in `agent_resolve/context.py` with import-boundary regex, generic stem path qualification, ancestor-proximity sorting, and 8-suite cap
    - [x] Update `stage_1_plan.py`, `stage_2_red.py`, and `stage_3_green.py` to isolate prompt injection and execute target + blast radius suites
    - [x] Verify all tests pass via `npm run test:agent`
- [x] Task: Conductor - User Manual Verification 'Phase 1: Separate blast_radius_test_files from target_test_files & Bound Discovery' (Protocol in workflow.md) [commit: 19026b7]

## Phase 2: Stage 3 Fail-Fast Type-Check (Targeted & Regression), Silent Jest & Error Truncation [checkpoint: eef39f1]
- [x] Task: Write failing unit tests for Stage 3 fail-fast compilation, silent Jest execution, regression gate sequencing, and 8k character truncation (TDD Red phase) [commit: a30bd98]
    - [x] Author unit tests in `scripts/agent-resolve/tests/test_stages.py` verifying that when `tc_code != 0`, targeted Jest execution is skipped and compiler errors populate `last_error_context`
    - [x] Author unit tests in `scripts/agent-resolve/tests/test_stages.py` verifying `--no-color` and `--silent` flags are passed to `npx jest` in targeted verification
    - [x] Author unit tests in `scripts/agent-resolve/tests/test_stages.py` verifying `npm run type-check` runs before `npm test` in the Mandatory Full Regression Gate
    - [x] Author unit tests verifying ANSI escape code stripping and head-and-tail 8,000 character truncation (4,000 head, 4,000 tail with `... [TRUNCATED {chars} CHARS OF VERIFICATION OUTPUT] ...` marker, leaving $\le 8000$ intact)
- [x] Task: Implement Stage 3 fail-fast compilation, silent Jest execution, regression gate sequencing, and 8k character truncation (TDD Green phase) [commit: a65aa694]
    - [x] Implement fail-fast branch in `agent_resolve/stages/stage_3_green.py` when `tc_code != 0`, skipping Jest execution
    - [x] Add `--no-color` and `--silent` flags to targeted Jest command construction in `stage_3_green.py`
    - [x] Sequence `npm run type-check` before `npm test` in `stage_3_green.py` regression gate
    - [x] Implement ANSI stripping and head/tail 8,000 character truncation helper in `stage_3_green.py` / `diagnostics.py`
    - [x] Verify all tests pass via `npm run test:agent`
- [x] Task: Conductor - User Manual Verification 'Phase 2: Stage 3 Fail-Fast Type-Check, Silent Jest Execution & Error Context Truncation' (Protocol in workflow.md) [commit: eef39f1]

## Phase 3: Discounted Cached Token Budget (25%), Pre-Call Guard & Status-Boundary Matching [checkpoint: dd10837]
- [x] Task: Write failing unit tests for 25% cached token accounting, pre-call budget checks, dual summary metrics, and boundary regex matching (TDD Red phase) [commit: 91f7fdec]
    - [x] Author unit tests in `scripts/agent-resolve/tests/test_tracker.py` asserting `effective_tokens` calculates uncached tokens + 25% cached tokens, `check_budget()` raises `RuntimeError` when `effective_tokens > limit`, and formats dual summary metrics
    - [x] Author unit tests in `scripts/agent-resolve/tests/test_llm.py` asserting pre-call `check_budget()` raises `RuntimeError` before issuing calls or retries
    - [x] Author unit tests in `scripts/agent-resolve/tests/test_llm.py` asserting `is_transient_error` with status boundary regex returns False for `"Token budget exceeded: 500,000 tokens used"` or line `"5020"`
- [x] Task: Implement 25% cached token accounting, pre-call budget checks, dual summary metrics, and boundary regex matching (TDD Green phase) [commit: 03314f5f]
    - [x] Implement `effective_tokens`, `check_budget()`, and dual summary formatting in `agent_resolve/tracker.py`
    - [x] Add pre-call budget checks and isolate `record_usage()` outside transient retry catch in `agent_resolve/llm.py`
    - [x] Update `is_transient_error` in `agent_resolve/llm.py` with numeric/status boundary regex `r"(?<![0-9,])(?:429|500|502|503|504)(?![0-9,])"`
    - [x] Update existing unit tests in `scripts/agent-resolve/tests/test_tracker.py` and `test_llm.py` to match the dual metric summary format
    - [x] Verify all tests pass via `npm run test:agent`
- [x] Task: Conductor - User Manual Verification 'Phase 3: Discounted Cached Token Budget (25%), Pre-Call Guard & Status-Boundary Matching' (Protocol in workflow.md) [commit: dd10837]

## Phase 4: Shared Edge Function (`supabase/functions/_shared/*.ts`) Verification Invariant & Planner Self-Correction [checkpoint: 513f315]
- [x] Task: Write failing unit tests for Edge Function shared module prompt directives, target path guards, and planner self-correction loop (TDD Red phase) [commit: 125f8cc5]
    - [x] Author unit tests in `scripts/agent-resolve/tests/test_stages.py` asserting `stage_1_plan` sanitizes `supabase/**`, `e2e/**`, and non-Jest paths in `target_test_files`, and triggers an internal 2-attempt self-correction loop if `target_test_files` is empty
    - [x] Author unit tests in `scripts/agent-resolve/tests/test_stages.py` asserting Stage 1 & 2 system prompts include directives to author Jest tests under `lib/**/__tests__/*.test.ts` importing from `@/supabase/functions/_shared/<module>`
    - [x] Author unit tests in `scripts/agent-resolve/tests/test_context.py` asserting `is_issue_suitable_for_headless_agent` permits pure-TS shared functions under `supabase/functions/_shared/*` while flagging Deno runtime entrypoints (`Deno.serve`, `jsr:`, `https://deno.land`, `deno.json`)
- [x] Task: Implement Edge Function shared module prompt directives, target path guards, and planner self-correction loop (TDD Green phase) [commit: aed3ca98]
    - [x] Add target test file validation guard and 2-attempt self-correction loop in `agent_resolve/stages/stage_1_plan.py`
    - [x] Add prompt instructions to `stage_1_plan.py` and `stage_2_red.py` for shared edge function testing via `@/supabase/functions/_shared/<module>`
    - [x] Update `is_issue_suitable_for_headless_agent` in `agent_resolve/context.py` to distinguish pure-TS shared modules from Deno runtime files
    - [x] Verify all tests pass via `npm run test:agent`
- [x] Task: Conductor - User Manual Verification 'Phase 4: Shared Edge Function Verification Invariant' (Protocol in workflow.md) [commit: 513f315]

## Phase 5: Resumption Checkpoint Self-Healing & VCS State Persistence [checkpoint: 1d66258b]
- [x] Task: Write failing unit tests for resumption target_test_files self-healing and blast radius merging (TDD Red phase) [commit: 99bf5541]
    - [x] Author unit tests in `scripts/agent-resolve/tests/test_pipeline.py` simulating resumption from a polluted `.agent-state.json`
    - [x] Assert that `resolve_issue` sanitizes `target_test_files` using `git diff-tree` against `red_phase_commit_sha`, demoting extra valid Jest suites to `blast_radius_test_files` (merged with existing checkpoint blast radius, deduplicated, stripped of non-Jest files, and capped at 8)
    - [x] Assert fallback to first 3 valid Jest test files when `red_sha` diff is unavailable
    - [x] Assert that `BlueprintPlan` is instantiated with `blast_radius_test_files` on both clean resumption and checkpoint invalidation rollback
- [x] Task: Implement resumption target_test_files self-healing and blast radius merging (TDD Green phase) [commit: 07990981]
    - [x] Implement checkpoint sanitization and blast radius merging logic in `agent_resolve/pipeline.py`
    - [x] Ensure `BlueprintPlan` instantiations preserve `blast_radius_test_files`
    - [x] Document manual operational instructions for deleting `origin/agent/issue-73` and closing PR #76 post-merge
    - [x] Verify all tests pass via `npm run test:agent`
- [x] Task: Conductor - User Manual Verification 'Phase 5: Stateful Resumption Self-Healing & Issue #73 Reset Checklist' (Protocol in workflow.md) [commit: 1d66258b]

## Phase 6: ADR Documentation & End-to-End Test Suite Verification
- [x] Task: Update ADR-0005 with token budget discounting, test isolation, and verification invariants [commit: 6864d29f]
    - [x] Document separation of `target_test_files` and `blast_radius_test_files`
    - [x] Document 25% cached token budgeting rule and 8,000 character error context cap
    - [x] Document fail-fast compiler gates (targeted and regression) and silent Jest execution
    - [x] Document pure-TS `supabase/functions/_shared/*.ts` Jest testing rule
- [x] Task: Execute full test verification across agent and container suites [commit: 7314e254]
    - [x] Run unit tests via `npm run test:agent`
    - [x] Run full agent integration tests via `npm run test:agent:all`
    - [x] Review manual verification checklist for Issue #73 post-merge reset
- [ ] Task: Conductor - User Manual Verification 'Phase 6: ADR Documentation & End-to-End Test Suite Verification' (Protocol in workflow.md)

## Phase: Review Fixes
- [x] Task: Apply review suggestions e884439
- [x] Task: Apply review suggestions 276d5d9

