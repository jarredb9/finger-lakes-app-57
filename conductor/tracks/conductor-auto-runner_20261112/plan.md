# Implementation Plan: Autonomous Multi-Task Track Execution Runner (`conductor-auto.py`)

## Phase 1: Tooling Extensions in `scripts/agent/generate-prompt.py`
- [ ] Task: Write failing unit tests for `[exempt: <category>]` task parsing and non-TDD verification strategy (TDD Red phase)
    - [ ] Add test cases in `scripts/__tests__/test_generate_prompt.py` for parsing `[exempt: ui]`, `[exempt: styling]`, `[exempt: infra]`, `[exempt: scripts]`, `[exempt: types]`, and `[exempt: docs]`
    - [ ] Add test cases verifying `infer_verification_strategy` selects the appropriate verification command and commit type
    - [ ] Confirm tests fail with expected assertion errors
- [ ] Task: Implement `[exempt: <category>]` parsing and non-TDD verification strategy in `generate-prompt.py` (TDD Green phase)
    - [ ] Update `parse_plan_tasks` to extract the `[exempt: <category>]` annotation
    - [ ] Update `infer_verification_strategy` to assign non-TDD verification commands (`npm run build`, `npm run lint`, `npm run type-check`, markdown check) and commit types (`style(...)`, `chore(...)`, `types(...)`, `docs(...)`)
    - [ ] Run test suite with `python3.11 -m unittest` and confirm all tests pass cleanly
- [ ] Task: Write failing unit tests for `--unattended` checkpoint prompt generation (TDD Red phase)
    - [ ] Add test cases in `scripts/__tests__/test_generate_prompt.py` verifying `--checkpoint --unattended` output
    - [ ] Assert that `--unattended` prompt skips interactive modal pauses, enforces authoritative automated test execution, and directs manual verification steps to Git notes
    - [ ] Confirm tests fail with expected assertion errors
- [ ] Task: Implement `--unattended` checkpoint prompt generation in `generate-prompt.py` (TDD Green phase)
    - [ ] Add `--unattended` CLI flag to argument parser
    - [ ] Extend `build_checkpoint_prompt` to generate non-interactive unattended instructions
    - [ ] Run test suite with `python3.11 -m unittest` and confirm all tests pass cleanly
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Tooling Extensions in scripts/agent/generate-prompt.py' (Protocol in workflow.md)

## Phase 2: Task Parsing, Plan Validation, and Planning Tier (`Tier 1`)
- [ ] Task: Write failing unit tests for track plan parsing, task status extraction, and Tier 1 planning turn assertions (TDD Red phase)
    - [ ] Create `scripts/__tests__/test_conductor_auto.py`
    - [ ] Test parsing active phases, identifying incomplete tasks `[ ]`, skipped tasks, and checkpoint tasks
    - [ ] Test Tier 1 planning prompt construction and invocation via `generate-prompt.py --plan`
    - [ ] Test post-plan assertions: verify markdown plan file exists and assert `git status --porcelain` contains 0 modified production/app files
    - [ ] Confirm tests fail as expected
- [ ] Task: Implement plan parsing, status extraction, and Tier 1 planning dispatch in `conductor-auto.py` (TDD Green phase)
    - [ ] Create `scripts/agent/conductor-auto.py` skeleton and CLI argument parser
    - [ ] Implement `parse_track_plan` to inspect phase headings and task list items
    - [ ] Implement Tier 1 planning runner invoking `agy --print --mode plan` with `gemini-3.8-flash-high`
    - [ ] Implement post-plan invariant check asserting no application code modifications occurred
    - [ ] Confirm all unit tests pass cleanly
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Task Parsing, Plan Validation, and Planning Tier' (Protocol in workflow.md)

## Phase 3: Execution Tier (`Tier 2`) and Supervisor Invariant Verification
- [ ] Task: Write failing unit tests for Tier 2 execution turn, git tree assertions, and active test/build verification audits (TDD Red phase)
    - [ ] Test dispatching `generate-prompt.py --exec` to `agy --print --mode auto` with `gemini-3.8-flash-medium`
    - [ ] Test working tree cleanliness assertions on clean vs dirty working trees
    - [ ] Test active supervisor verification for Red tasks (asserting test command fails with assertion error and 0 code files modified)
    - [ ] Test active supervisor verification for Green tasks (asserting test command and `npm run type-check` pass)
    - [ ] Test active supervisor verification for Exempt tasks (`ui`/`styling`, `infra`/`scripts`, `types`, `docs`)
    - [ ] Test Git commit and Git notes auditing (`git notes show <sha>`, conventional format, `plan.md` commit)
    - [ ] Confirm tests fail as expected
- [ ] Task: Implement Tier 2 execution, supervisor invariant verification, and git notes audit in `conductor-auto.py` (TDD Green phase)
    - [ ] Implement Tier 2 dispatch loop executing tasks sequentially
    - [ ] Implement working tree audit and optional `--auto-recover` single-turn recovery
    - [ ] Implement active verification engine running target test commands and type-checks based on task category
    - [ ] Implement git commit and note auditor verifying task commit SHA, note metadata, and plan update
    - [ ] Confirm all unit tests pass cleanly
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Execution Tier and Supervisor Invariant Verification' (Protocol in workflow.md)

## Phase 4: Phase Boundaries, Checkpoints, Review Handshake, and CLI Dual-Logging
- [ ] Task: Write failing unit tests for Gate 1 checkpoint, Gate 2 review dispatch, review conversation ID capture, exit codes, and subprocess streaming (TDD Red phase)
    - [ ] Test Gate 1 checkpoint dispatch with `--unattended` and verification of checkpoint commit / notes
    - [ ] Test Gate 2 `/conductor:review` dispatch with prompt override and conversation ID extraction
    - [ ] Test exit code behaviors: 0 for clean success, 1 for failures/invariant violations, 2 for Critical/High review findings
    - [ ] Test dual logging (stdout formatted progress + unredacted file persistence in `conductor/tracks/<track>/logs/`)
    - [ ] Test turn timeout handling with configurable `--timeout`
    - [ ] Confirm tests fail as expected
- [ ] Task: Implement Gate 1 checkpoint, Gate 2 review handling, dual-logging tee, and CLI interface in `conductor-auto.py` (TDD Green phase)
    - [ ] Implement Gate 1 execution and post-checkpoint commit/notes verification
    - [ ] Implement Gate 2 unattended review dispatch, conversation ID extraction from brain transcripts, and report generation in `phase-X-review.md`
    - [ ] Implement exit code semantics and interactive resumption command formatting (`agy --conversation <conv-id> ...`)
    - [ ] Implement streaming subprocess runner with real-time stdout updates, turn timeouts, and tee logging to `conductor/tracks/<track>/logs/`
    - [ ] Confirm all unit tests pass cleanly
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Phase Boundaries, Checkpoints, Review Handshake, and CLI Dual-Logging' (Protocol in workflow.md)

## Phase 5: Documentation & End-to-End Dry-Run Validation
- [ ] Task: Author `docs/agents/conductor-auto.md` and update `conductor/workflow.md` with unattended execution guide [exempt: docs]
    - [ ] Create `docs/agents/conductor-auto.md` detailing architecture, execution flow, CLI flags, exit codes, and model matrix
    - [ ] Update `conductor/workflow.md` to reference unattended multi-task runner workflow alongside manual prompt generation
- [ ] Task: Validate `--dry-run` and end-to-end simulation across active and archived tracks [exempt: scripts]
    - [ ] Test `--dry-run` flag across sample tracks and phases to verify prompt sequences, model assignments, and validation steps
    - [ ] Run full test suite with `python3.11 -m unittest discover -s scripts/__tests__` to ensure zero regressions
- [ ] Task: Conductor - User Manual Verification 'Phase 5: Documentation & End-to-End Dry-Run Validation' (Protocol in workflow.md)
