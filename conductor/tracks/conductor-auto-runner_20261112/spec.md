# Specification: Autonomous Multi-Task Track Execution Runner (`conductor-auto.py`)

**Tracking:** Issue [#162](https://github.com/jarredb9/finger-lakes-app-57/issues/162)  
**Type:** Feature / Developer Tooling & Automation  
**Target Directory:** `scripts/agent/`  

## 1. Overview & Motivation
Working with Conductor in the `agy` CLI currently requires continuous human dispatching: generating prompts via `scripts/agent/generate-prompt.py`, running the plan agent, reviewing interactive modals, running the execution agent, inspecting commits, and manually stepping through each sequential task in `conductor/tracks/<track>/plan.md`.

This track authors an automated, unattended Conductor track runner (`scripts/agent/conductor-auto.py`) to execute multi-task track phases unattended while preserving strict TDD Red/Green task separation, conventional commits, and Git notes.

## 2. Architectural & Technical Specification

### 2.1 Process Model & Execution Cadence
- **Runner Entrypoint**: `scripts/agent/conductor-auto.py [track] [flags]`
- **Zero-Amnesia Print Mode**: Runs non-interactive turns using `agy --print --dangerously-skip-permissions` with fresh conversation contexts per turn.
- **Model Matrix Defaults**:
  - Planning (`--mode plan` / prompt generator `--plan`): `gemini-3.8-flash-high`
  - Implementation (`--mode auto` / prompt generator `--exec`): `gemini-3.8-flash-medium`
  - Phase Verification / Checkpoint: `gemini-3.8-flash-medium`
  - Phase Review (`/conductor:review`): `gemini-3.8-flash-high`
  - All roles overridable via CLI flags (`--plan-model`, `--exec-model`, `--review-model`).
- **Process Guard & Timeouts**: Enforce a default 15-minute timeout per turn (`--print-timeout 15m`), overridable via `--timeout`.
- **Dual Logging**: Stream real-time formatted progress (task title, turn status, test results) to stdout while saving full, unredacted transcripts and tool output to `conductor/tracks/<track>/logs/phase-X-task-Y.log`.

### 2.2 Two-Tier Task Execution Loop (Plan -> Exec)
For each incomplete task `[ ]` in the active phase:
1. **Tier 1: Planning Turn**:
   - Generates plan prompt via `scripts/agent/generate-prompt.py <track> <phase> <task> --plan`.
   - Dispatches to `agy --print --mode plan --dangerously-skip-permissions "$PROMPT"` using `gemini-3.8-flash-high`.
   - **Post-Plan Assertions**:
     - Asserts that `conductor/tracks/<track>/phase-X-task-Y-plan.md` exists and is non-empty.
     - Asserts that `git status --porcelain` contains NO modified application/production files (planning must only generate the markdown blueprint).
     - **Fail-Fast**: If invariant is violated, halts immediately without launching execution.
2. **Tier 2: Execution Turn**:
   - Generates execution prompt via `scripts/agent/generate-prompt.py <track> <phase> <task> --exec`.
   - Dispatches to `agy --print --mode auto --dangerously-skip-permissions "$PROMPT"` using `gemini-3.8-flash-medium`.
   - Agent is instructed to implement changes, verify with tests, commit code with conventional commit message, attach Git notes (`Task`, `Summary`, `Files`, `Rationale`), mark task `[x]` with 7-character commit SHA in `plan.md`, and commit `plan.md`.

### 2.3 Supervisor & Invariant Gate (Post-Exec Audit)
Immediately following Tier 2 execution, `conductor-auto.py` acts as an active supervisor before accepting the task:
1. **Working Tree Cleanliness**: Asserts `git status --porcelain` is clean. If dirty uncommitted changes exist, halts immediately (preserving all files for developer inspection; or invokes single-turn `--recovery` if `--auto-recover` is flagged).
2. **Active Task-Type Test Verification**:
   - **Red Task** (`failing test` / `(red)`): Runner independently executes the target test command and asserts that the tests **fail with assertion errors** (not syntax/compilation errors), and asserts 0 production code files were modified.
   - **Green Task** (`implement to pass` / `(green)`): Runner independently executes the target test command and `npm run type-check` and asserts that **all tests pass cleanly**.
   - **Exempt Task** (`[exempt: <category>]`): Runner skips test failure assertions and executes the category-specific check:
     - `[exempt: ui]` / `[exempt: styling]`: Verified via `npm run build`.
     - `[exempt: infra]` / `[exempt: scripts]`: Verified via `npm run lint`.
     - `[exempt: types]`: Verified via `npm run type-check`.
     - `[exempt: docs]`: Verified via markdown check.
3. **Plan State & Git Audit**:
   - Asserts the code commit matches Conventional Commit format (`<type>(<scope>): <desc>`).
   - Asserts Git notes are attached to the code commit (`git notes show <sha>`).
   - Asserts `plan.md` is updated with `[x]` and the 7-character commit SHA.
   - Asserts `plan.md` commit exists: `conductor(plan): Mark task '...' as complete`.

### 2.4 Phase Boundary Hard-Stop & Review Handshake
When all tasks in the active phase are complete:
1. **Gate 1: Phase Verification Checkpoint Task**:
   - Dispatches `scripts/agent/generate-prompt.py --checkpoint --unattended` to `agy --print`.
   - Agent runs phase automated test suite, generates the domain-aware manual verification checklist into the Git note, creates empty checkpoint commit `conductor(checkpoint): Checkpoint end of Phase X`, updates `plan.md` with `[checkpoint: <sha>]`, and commits `plan.md`.
   - Runner verifies clean working tree, checkpoint commit, and Git notes.
2. **Gate 2: Unattended Phase Review**:
   - Unless `--no-review` is flagged, runner dispatches `/conductor:review` with `gemini-3.8-flash-high`.
   - Prompt override automatically confirms track scope and accepts iterative review mode (>300 lines).
   - Captures review conversation ID from `~/.gemini/antigravity-cli/brain/`.
   - Saves review report to `conductor/tracks/<track>/phase-X-review.md`.
3. **Hard-Stop & Remediation Handshake**:
   - If review findings contain `Critical` or `High` issues:
     - Runner prints a terminal warning banner citing findings.
     - Runner outputs the exact interactive continuation command:
       `agy --conversation <conv-id> "Apply the review suggestions from phase-X-review.md"`
     - Exits with **Exit Code 2**.
   - If clean: prints phase completion summary, exits with **Exit Code 0**, and halts before advancing to Phase N+1.

### 2.5 Tooling Extensions (`scripts/agent/generate-prompt.py`)
1. **`[exempt: <category>]` Parsing**:
   - Update `parse_plan_tasks` to extract `[exempt: <category>]` tag.
   - Update `infer_verification_strategy` to assign appropriate non-TDD verification commands and commit types (`style(...)`, `chore(...)`, `types(...)`, `docs(...)`).
2. **`--unattended` Checkpoint Flag**:
   - Update `build_checkpoint_prompt` with an `--unattended` mode that skips interactive `ask_question` pauses, makes automated test suites authoritative, and logs deferred manual verification steps into the checkpoint Git note.

### 2.6 CLI Interface Specification (`conductor-auto.py`)
```bash
python3 scripts/agent/conductor-auto.py [track] [flags]
```
- **Positional Arguments**:
  - `track` *(optional)*: Track name or directory. Defaults to active track detected in `conductor/tracks.md`.
- **Flags**:
  - `--phase <N>`: Target a specific phase number (defaults to active incomplete phase).
  - `--task <N>`: Run only a single task (Tier 1 Plan + Tier 2 Exec) instead of the entire phase.
  - `--no-review`: Skip the Phase Review turn at the end of the phase.
  - `--auto-recover`: Attempt a single recovery turn via `generate-prompt.py --recovery` if an execution step leaves dirty uncommitted files.
  - `--timeout <duration>`: Turn timeout (default: `15m`).
  - `--plan-model <model>`: Model for planning turn (default: `gemini-3.8-flash-high`).
  - `--exec-model <model>`: Model for execution turn (default: `gemini-3.8-flash-medium`).
  - `--review-model <model>`: Model for review turn (default: `gemini-3.8-flash-high`).
  - `--dry-run`: Parse tasks and print the sequence of prompts, models, and validations without invoking `agy`.
- **Exit Codes**:
  - `0`: Success (phase completed cleanly, review passed or skipped).
  - `1`: Failure / Invariant violation (compilation error, test failure, dirty tree, timeout).
  - `2`: Phase completed with `Critical`/`High` review findings requiring developer resolution.

## 3. Acceptance Criteria
- [ ] `scripts/agent/generate-prompt.py` parses `[exempt: <category>]` and supports `--unattended` checkpoint prompts.
- [ ] `scripts/agent/conductor-auto.py` executes sequential two-tier (Plan -> Exec) turns unattended within a phase.
- [ ] Supervisor actively verifies Red test failures, Green test passes, and Exempt build/lint checks.
- [ ] Preserves atomic commits, conventional scopes, and Git notes.
- [ ] Executes Gate 1 Checkpoint and Gate 2 Review unattended, persisting logs to `conductor/tracks/<track>/logs/` and review report to `phase-X-review.md`.
- [ ] Exits with code 2 and outputs `agy --conversation <id>` command when review findings require human attention.
- [ ] Halts immediately and preserves workspace state if compilation or test verification fails.
- [ ] Unit tests for prompt generation, parser, supervisor validations, CLI arguments, and execution flow in `scripts/__tests__/test_conductor_auto.py` and `scripts/__tests__/test_generate_prompt.py`.
- [ ] Documented in `conductor/workflow.md` and `docs/agents/conductor-auto.md`.
