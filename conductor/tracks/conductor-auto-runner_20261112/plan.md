# Implementation Plan: Autonomous Multi-Task Track Execution Runner (`conductor-auto.py`)

## Phase 1: Test Baseline Stabilization & `[exempt: <category>]` Task Taxonomy [checkpoint: ecd9079e]
- [x] Task: Write failing unit test for pre-existing `test_classify_phase_domain_ui_vs_database_vs_tooling` regression (TDD Red phase) [commit: 872670fb]
    - [x] Update `scripts/__tests__/test_generate_prompt.py` to decouple the domain classification test from live git history changes
    - [x] Confirm test fails cleanly on historical range mismatch
- [x] Task: Fix `test_classify_phase_domain_ui_vs_database_vs_tooling` in `generate-prompt.py` test suite (TDD Green phase) [commit: 23586e4d]
    - [x] Mock git diff output or use relative commit revision in `test_classify_phase_domain_ui_vs_database_vs_tooling`
    - [x] Run test suite with `python3.11 -m unittest scripts/__tests__/test_generate_prompt.py` and confirm 100% passing baseline
- [x] Task: Write failing unit tests for `[exempt: <category>]` task parsing and non-TDD verification strategy (TDD Red phase) [commit: b2596440]
    - [x] Add test cases in `scripts/__tests__/test_generate_prompt.py` for parsing `[exempt: ui]`, `[exempt: styling]`, `[exempt: infra]`, `[exempt: scripts]`, `[exempt: types]`, and `[exempt: docs]`
    - [x] Add test cases verifying `infer_verification_strategy` selects the appropriate verification command (`npm run build`, `npm run lint`, `npm run type-check`, markdown diff/existence check) and commit type (`style(...)`, `chore(...)`, `types(...)`, `docs(...)`)
    - [x] Confirm tests fail with expected assertion errors
- [x] Task: Implement `[exempt: <category>]` parsing and non-TDD verification strategy in `generate-prompt.py` (TDD Green phase) [commit: 97f616dd]
    - [x] Update `parse_plan_tasks` to extract the `[exempt: <category>]` annotation
    - [x] Update `infer_verification_strategy` to assign non-TDD verification commands (`npm run build`, `npm run lint`, `npm run type-check`, markdown diff/existence check) and commit types (`style(...)`, `chore(...)`, `types(...)`, `docs(...)`)
    - [x] Run test suite with `python3.11 -m unittest` and confirm all tests pass cleanly
- [x] Task: Conductor - User Manual Verification 'Phase 1: Test Baseline Stabilization & [exempt: <category>] Task Taxonomy' (Protocol in workflow.md) [commit: ecd9079e]

## Phase 2: Unattended Checkpoint Prompt Generation in `generate-prompt.py` [checkpoint: 2601a4b0]
- [x] Task: Write failing unit tests for `--unattended` checkpoint prompt generation (TDD Red phase) [commit: e904ed09]
    - [x] Add test cases in `scripts/__tests__/test_generate_prompt.py` verifying `--checkpoint --unattended` output
    - [x] Assert that `--unattended` prompt skips interactive modal pauses, enforces authoritative automated test execution, and directs manual verification steps to Git notes
    - [x] Confirm tests fail with expected assertion errors
- [x] Task: Implement `--unattended` checkpoint prompt generation in `generate-prompt.py` (TDD Green phase) [commit: b93e4a53]
    - [x] Add `--unattended` CLI flag to argument parser
    - [x] Extend `build_checkpoint_prompt` to generate non-interactive unattended instructions
    - [x] Run test suite with `python3.11 -m unittest` and confirm all tests pass cleanly
- [x] Task: Conductor - User Manual Verification 'Phase 2: Unattended Checkpoint Prompt Generation in generate-prompt.py' (Protocol in workflow.md) [commit: 2601a4b0]

## Phase 3: Task Parsing, Plan Validation, and Planning Tier (`Tier 1`) [checkpoint: ac51a7bf]
- [x] Task: Write failing unit tests for track plan parsing, task status extraction, Tier 1 planning turn assertions, process group isolation, flag ordering, and idempotent plan caching (TDD Red phase) [commit: 607c095a]
    - [x] Create `scripts/__tests__/test_conductor_auto.py`
    - [x] Test parsing active phases, identifying incomplete tasks `[ ]`, skipped tasks, and checkpoint tasks
    - [x] Test Tier 1 planning prompt construction and invocation via `generate-prompt.py --plan`
    - [x] Test CLI flag ordering for `agy` (ensuring `--mode`, `--model`, `--dangerously-skip-permissions` precede `--print`) and prompt passing via stdin/pipe
    - [x] Test process group isolation (`os.setsid`) and timeout/interrupt handling
    - [x] Test idempotent plan caching: skip Tier 1 if plan file exists and is non-empty, unless `--force-plan` is specified
    - [x] Test post-plan assertions: verify markdown plan file exists and assert `git status --porcelain` contains 0 modified production/app files
    - [x] Confirm tests fail as expected
- [x] Task: Implement plan parsing, status extraction, process lifecycle, and Tier 1 planning dispatch in `conductor-auto.py` (TDD Green phase) [commit: 0ddf133b]
    - [x] Create `scripts/agent/conductor-auto.py` skeleton and CLI argument parser (including `--force-plan`, `--timeout`, model flags)
    - [x] Implement `parse_track_plan` to inspect phase headings and task list items
    - [x] Implement subprocess launcher with strict `agy` flag ordering, stdin prompt delivery, and `os.setsid` process group isolation
    - [x] Implement idempotent plan cache check and Tier 1 planning runner invoking `gemini-3.8-flash-high`
    - [x] Implement post-plan invariant check asserting no application code modifications occurred
    - [x] Confirm all unit tests pass cleanly
- [x] Task: Conductor - User Manual Verification 'Phase 3: Task Parsing, Plan Validation, and Planning Tier' (Protocol in workflow.md) [commit: ac51a7bf]

## Phase 4: Execution Tier (`Tier 2`) and Supervisor Invariant Verification [checkpoint: f8415b6c]
- [x] Task: Write failing unit tests for Tier 2 execution turn, git tree assertions, dual-check Red task verification, Exempt checks, and `--auto-recover` flow (TDD Red phase) [commit: 79936ad2]
    - [x] Test dispatching `generate-prompt.py --exec` to `agy --print --mode auto` with `gemini-3.8-flash-medium`
    - [x] Test working tree cleanliness assertions on clean vs dirty working trees and single-turn `--auto-recover` prompt dispatch
    - [x] Test active supervisor verification for Red tasks: assert exit code != 0, assert 0 production files modified, and parse runner output for assertion failure markers (Jest expect()/AssertionError vs SyntaxError/module load error; Python FAIL: vs ERROR:)
    - [x] Test active supervisor verification for Green tasks (asserting test command and `npm run type-check` pass)
    - [x] Test active supervisor verification for Exempt tasks (`ui`/`styling`, `infra`/`scripts`, `types`, `docs` git diff/existence check)
    - [x] Test Git commit and Git notes auditing (`git notes show <sha>`, conventional format, `plan.md` commit)
    - [x] Confirm tests fail as expected
- [x] Task: Implement Tier 2 execution, supervisor invariant verification, dual-check Red parsing, and git notes audit in `conductor-auto.py` (TDD Green phase) [commit: d356b6e9]
    - [x] Implement Tier 2 dispatch loop executing tasks sequentially
    - [x] Implement working tree audit and single-turn recovery prompt via `generate-prompt.py --recovery` on `--auto-recover`
    - [x] Implement active verification engine running target test commands, output parsing for assertion markers, and type-checks based on task category
    - [x] Implement git commit and note auditor verifying task commit SHA, note metadata, and plan update
    - [x] Confirm all unit tests pass cleanly
- [x] Task: Conductor - User Manual Verification 'Phase 4: Execution Tier and Supervisor Invariant Verification' (Protocol in workflow.md) [commit: f8415b6c]

## Phase 5: Phase Boundaries, Checkpoints, Review Handshake, Composable Model Matrix, and CLI Dual-Logging [checkpoint: 9c537b06]
- [x] Task: Write failing unit tests for composable Gemini 4 Hydrogen model resolution, Gate 1 checkpoint, Gate 2 review dispatch, brain snapshotting conversation ID capture, regex severity parsing, exit codes, and subprocess streaming (TDD Red phase) [commit: b5766169]
    - [x] Test composable model configuration (`DEFAULT_MODEL_FAMILY = "gemini-4-hydrogen"`, `ROLE_EFFORT_MAP`, `DEFAULT_PLAN_MODEL`, `DEFAULT_EXEC_MODEL`, `DEFAULT_CHECKPOINT_MODEL`, `DEFAULT_REVIEW_MODEL`) and 3-tier precedence in `resolve_model_config()` (per-role CLI flags > `CONDUCTOR_*_MODEL` env vars > `--model-family` / `CONDUCTOR_MODEL_FAMILY` composition), and decouple existing dispatch tests to reference `DEFAULT_*_MODEL` constants
    - [x] Test Gate 1 checkpoint dispatch with `--unattended`, `DEFAULT_CHECKPOINT_MODEL` (`gemini-4-hydrogen-medium`), and verification of checkpoint commit / notes
    - [x] Test Gate 2 `/conductor:review` dispatch with `DEFAULT_REVIEW_MODEL` (`gemini-4-hydrogen-high`), prompt override, and brain directory snapshotting for conversation ID extraction
    - [x] Test regex severity parsing (`^###\s+\[?(Critical|High)\]?`) and exit code behaviors: 0 for clean success or Medium/Low findings, 1 for failures/invariant violations/review crashes, 2 for Critical/High review findings
    - [x] Test dual logging (stdout formatted progress + unredacted file persistence in `conductor/tracks/<track>/logs/`)
    - [x] Test turn timeout handling with configurable `--timeout`
    - [x] Confirm tests fail as expected
- [x] Task: Implement composable Gemini 4 Hydrogen model matrix, Gate 1 checkpoint, Gate 2 review handling, brain snapshotting, dual-logging tee, and CLI interface in `conductor-auto.py` (TDD Green phase) [commit: f87e9b56]
    - [x] Implement centralized `DEFAULT_MODEL_FAMILY = "gemini-4-hydrogen"`, `ROLE_EFFORT_MAP`, `DEFAULT_*_MODEL` constants, `resolve_model_config()`, and `--model-family` / `--checkpoint-model` CLI flags, updating all turn dispatchers (`run_agy_turn`, Tier 1, Tier 2, Recovery, Gate 1, Gate 2) to use resolved defaults
    - [x] Implement Gate 1 execution and post-checkpoint commit/notes verification
    - [x] Implement Gate 2 unattended review dispatch, brain directory snapshotting, and report generation in `phase-X-review.md`
    - [x] Implement strict regex severity parsing, exit code semantics (0, 1, 2), and interactive resumption command formatting (`agy --conversation <conv-id> ...`)
    - [x] Implement streaming subprocess runner with real-time stdout updates, turn timeouts, process group cleanup, and tee logging to `conductor/tracks/<track>/logs/`
    - [x] Confirm all unit tests pass cleanly
- [x] Task: Conductor - User Manual Verification 'Phase 5: Phase Boundaries, Checkpoints, Review Handshake, Composable Model Matrix, and CLI Dual-Logging' (Protocol in workflow.md) [commit: 9c537b06]

## Phase 6: Documentation & End-to-End Dry-Run Validation
- [x] Task: Author `docs/agents/conductor-auto.md` and update `conductor/workflow.md` with unattended execution guide and phase structuring rules [exempt: docs] [commit: f8bdb88]
    - [x] Create `docs/agents/conductor-auto.md` detailing architecture, execution flow, CLI flags (`--skip-plan`, `--force-review`, `--force-plan`, `--no-review`, `--auto-recover`, `--timeout`), exit codes, composable `gemini-4-hydrogen` model matrix (`--model-family`, `CONDUCTOR_*` env vars), Pro quota pool separation (`Hydrogen` Pool A vs `Argon`/`Orchestrator` Pool B), and `[exempt: docs]` Tier 1 / Gate 2 fast-path
    - [x] Update `conductor/workflow.md` to reference the unattended multi-task runner workflow alongside manual prompt generation and codify "Phase & Task Structuring Rules" (no standalone "run test suite" tasks duplicating Gate 1; right-sizing `[exempt: docs]` placement at the end of the feature phase vs dedicated final docs phase; documenting the `[exempt: docs]` Tier 1 / Gate 2 fast-path)
    - [x] Verify `--dry-run` output via `python3.11 scripts/agent/conductor-auto.py --dry-run` and full unit test suite via `python3.11 -m unittest discover -s scripts/__tests__`
- [ ] Task: Conductor - User Manual Verification 'Phase 6: Documentation & End-to-End Dry-Run Validation' (Protocol in workflow.md)

## Phase: Review Fixes
- [x] Task: Apply review suggestions 5cd2d741
- [x] Task: Apply review suggestions 61a6aa2d
- [x] Task: Apply review suggestions 481d0f85
- [x] Task: Apply review suggestions 7abd5a3
- [x] Task: Apply review suggestions 6e763b99
- [x] Task: Fix agy --print prompt delivery and add CLI contract tests 1a2776f0
