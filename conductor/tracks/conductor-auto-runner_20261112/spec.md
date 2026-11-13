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
- **Model Matrix & Composable Configuration (`DEFAULT_MODEL_FAMILY` + `ROLE_EFFORT_MAP`)**:
  - Centralized at the top of `scripts/agent/conductor-auto.py` to make future model generation upgrades a single-constant or zero-code change:
    - `DEFAULT_MODEL_FAMILY = "gemini-4-hydrogen"`
    - `ROLE_EFFORT_MAP = {"plan": "high", "exec": "high", "checkpoint": "medium", "review": "high"}`
  - **Derived Role Defaults**:
    - Planning (`DEFAULT_PLAN_MODEL` / `--mode plan` / prompt generator `--plan`): `gemini-4-hydrogen-high`
    - Implementation & Recovery (`DEFAULT_EXEC_MODEL` / `--mode auto` / prompt generator `--exec` & `--recovery`): `gemini-4-hydrogen-high`
    - Phase Verification / Checkpoint (`DEFAULT_CHECKPOINT_MODEL` / Gate 1): `gemini-4-hydrogen-medium`
    - Phase Review (`DEFAULT_REVIEW_MODEL` / `/conductor:review` / Gate 2): `gemini-4-hydrogen-high`
  - **3-Tier Resolution Precedence (`resolve_model_config`)**:
    1. Explicit per-role CLI flag (`--plan-model`, `--exec-model`, `--checkpoint-model`, `--review-model`)
    2. Explicit per-role environment variable (`CONDUCTOR_PLAN_MODEL`, `CONDUCTOR_EXEC_MODEL`, `CONDUCTOR_CHECKPOINT_MODEL`, `CONDUCTOR_REVIEW_MODEL`)
    3. Composed `<family>-<effort>` using `ROLE_EFFORT_MAP`, where `<family>` resolves from `--model-family` > `CONDUCTOR_MODEL_FAMILY` > `DEFAULT_MODEL_FAMILY` (`"gemini-4-hydrogen"`).
  - **Architectural & Quota Rationale**: Keeps unattended multi-task execution 100% within the fast-refreshing Google AI Pro Pool A quota (`gemini-4-hydrogen-*`), leaving multi-day Pool B quota (`gemini-4-argon-*` / `Orchestrator (Argon)`) untouched for interactive sessions while preserving disk-cached `phase-X-task-Y-plan.md` blueprints required by `generate-prompt.py` for target and verification command harvesting.
- **Subprocess Protocol & Flag Order**:
  - All configuration flags (`--mode <mode>`, `--model <model>`, `--dangerously-skip-permissions`, `--output-format stream-json`, `--print-timeout <duration>`) must strictly precede `--print <prompt>`.
  - Prompts are delivered as the explicit argument to `--print <prompt>` with `stdin=subprocess.DEVNULL` (matching `agy`'s `--print` string flag contract).
- **Process Group Isolation, Timeouts & Heartbeats**:
  - Subprocesses are spawned in dedicated POSIX process groups (`os.setsid` / `start_new_session=True`).
  - Enforce a default 15-minute timeout per turn (`900s`), overridable via `--timeout <duration>`, and forward `--print-timeout <duration>` to `agy` alongside supervisor wall-clock timeout enforcement.
  - Emit periodic `--heartbeat <duration>` (default `30s`, `0` to disable) status lines showing PID, elapsed/total duration, and last observed activity during silent intervals.
  - On timeout or `SIGINT` (Ctrl+C), the runner issues `SIGTERM` followed by `SIGKILL` to the entire process group to terminate child `agy`, container runners, and subshells, preventing orphaned background processes.
- **Dual Logging**:
  - Streamed turns pass `--output-format stream-json` and parse NDJSON events incrementally via `_StreamJsonTracker` to display real-time session IDs, tool calls, durations, and final responses, while forwarding live `[agy:stderr]` lines.
  - Format runner banners (`log_banner`), status updates (`log_status`), and errors (`log_error`) with `[HH:MM:SS]` timestamps, persisting runner-level output to `conductor/tracks/<track>/logs/conductor-auto.log`.
  - Tee full unredacted transcripts (prompt, raw NDJSON stdout, stderr, exit code) to per-turn log files (`conductor/tracks/<track>/logs/phase-X-task-Y-{plan,exec,recovery}.log`, `phase-X-checkpoint.log`, `phase-X-review.log`).
  - Conductor log files are excluded from git tracking via `*.log` in `.gitignore`.

### 2.2 Two-Tier Task Execution Loop (Plan -> Exec)
For each incomplete task `[ ]` in the active phase:
1. **Tier 1: Planning Turn**:
   - **Documentation & Direct-Execution Fast-Path (`should_skip_tier1_plan`)**: If a task is annotated `[exempt: docs]` (or if `--skip-plan` is passed) and `--force-plan` is not set, the runner skips Tier 1 planning entirely and proceeds directly to Tier 2 (Execution).
   - **Idempotent Plan Check**: If `conductor/tracks/<track>/phase-X-task-Y-plan.md` already exists and is non-empty, the runner skips Tier 1 and proceeds directly to Tier 2 (Execution), unless `--force-plan` is specified.
   - Generates plan prompt via `scripts/agent/generate-prompt.py <track> <phase> <task> --plan`.
   - Dispatches to `agy --mode plan --model <plan-model> --dangerously-skip-permissions --output-format stream-json --print-timeout <duration> --print "$PROMPT"`.
   - **Post-Plan Assertions**:
     - Asserts that `conductor/tracks/<track>/phase-X-task-Y-plan.md` exists and is non-empty.
     - Asserts that `git status --porcelain` contains NO modified application/production files (planning must only generate the markdown blueprint).
     - **Fail-Fast**: If invariant is violated, halts immediately without launching execution.
2. **Tier 2: Execution Turn**:
   - Generates execution prompt via `scripts/agent/generate-prompt.py <track> <phase> <task> --exec` (appending `--skip-plan` when Tier 1 was bypassed). When `phase-X-task-Y-plan.md` is absent on disk for an `[exempt: docs]` or `--skip-plan` task, `generate-prompt.py` references `plan.md` and `spec.md` as authoritative and inlines the task description and `subtasks` directly into `1. Scope & Blueprint:`.
   - Dispatches to `agy --mode auto --model <exec-model> --dangerously-skip-permissions --output-format stream-json --print-timeout <duration> --print "$PROMPT"`.
   - Agent is instructed to implement changes, verify with tests, commit code with conventional commit message, attach Git notes (`Task`, `Summary`, `Files`, `Rationale`), mark task `[x]` with 7-character commit SHA in `plan.md`, and commit `plan.md`.

### 2.3 Supervisor & Invariant Gate (Post-Exec Audit)
Immediately following Tier 2 execution, `conductor-auto.py` acts as an active supervisor before accepting the task:
1. **Working Tree Cleanliness & Recovery**:
   - Asserts `git status --porcelain` is clean.
   - If dirty uncommitted changes exist and `--auto-recover` is set: runner launches a single recovery turn via `generate-prompt.py --recovery` instructing the agent to resolve uncommitted files, commit code, attach Git notes, and mark `plan.md`.
   - If uncommitted changes remain (or `--auto-recover` is unset): halts immediately with **Exit Code 1**, preserving all files for developer inspection.
2. **Active Task-Type Test Verification**:
   - **Red Task** (`failing test` / `(red)`): Runner independently executes the target test command and performs a **dual check**:
     - Asserts the test command exits with a non-zero exit code.
     - Asserts 0 production code files were modified (`git diff --name-only <base> HEAD`).
     - Parses test runner output to assert failure was caused by assertion errors (`expect(...)`, `AssertionError`), and explicitly rejects compilation/syntax/module load errors (`SyntaxError`, `Cannot find module`, container launch failure).
   - **Green Task** (`implement to pass` / `(green)`): Runner independently executes the target test command and `npm run type-check` and asserts that **all tests pass cleanly (exit 0)**.
   - **Exempt Task** (`[exempt: <category>]`): Runner skips test failure assertions and executes the category-specific check:
     - `[exempt: ui]` / `[exempt: styling]`: Verified via `npm run build`.
     - `[exempt: infra]` / `[exempt: scripts]`: Verified via `npm run lint`.
     - `[exempt: types]`: Verified via `npm run type-check`.
     - `[exempt: docs]`: Verified via git diff & existence check (asserts only `.md` files modified and files are non-empty).
3. **Plan State & Git Audit**:
   - Asserts the code commit matches Conventional Commit format (`<type>(<scope>): <desc>`).
   - Asserts Git notes are attached to the code commit (`git notes show <sha>`).
   - Asserts `plan.md` is updated with `[x]` and the 7-character commit SHA.
   - Asserts `plan.md` commit exists: `conductor(plan): Mark task '...' as complete`.

### 2.4 Phase Boundary Hard-Stop & Review Handshake
When all tasks in the active phase are complete:
1. **Gate 1: Phase Verification Checkpoint Task**:
   - Dispatches `scripts/agent/generate-prompt.py --checkpoint --unattended` to `agy --print` using the resolved `checkpoint` model (`DEFAULT_CHECKPOINT_MODEL`: `gemini-4-hydrogen-medium`).
   - Agent runs phase automated test suite, generates the domain-aware manual verification checklist into the Git note, creates empty checkpoint commit `conductor(checkpoint): Checkpoint end of Phase X`, updates `plan.md` with `[checkpoint: <sha>]`, and commits `plan.md`.
   - Runner verifies clean working tree, checkpoint commit, and Git notes.
2. **Gate 2: Unattended Phase Review**:
   - **Documentation-Only Phase Fast-Path (`is_docs_only_phase` / `should_skip_gate2_review`)**: When all non-checkpoint, non-skipped tasks in the phase are `[exempt: docs]`, Gate 2 review is automatically skipped unless `--force-review` is specified.
   - Unless `--no-review` is flagged (or auto-skipped for a documentation-only phase), runner dispatches `/conductor:review` with the resolved `review` model (`DEFAULT_REVIEW_MODEL`: `gemini-4-hydrogen-high`).
   - Prompt override automatically confirms track scope and accepts iterative review mode (>300 lines).
   - **Conversation ID Capture**: Snapshots conversation directories in `~/.gemini/antigravity-cli/brain/` before invocation and captures the newly created directory created during the turn (with newest `transcript.jsonl` fallback).
   - Saves review report to `conductor/tracks/<track>/phase-X-review.md`.
3. **Hard-Stop & Remediation Handshake**:
   - **Severity Parsing**: Evaluates review report headings using strict regex matching (`^###\s+\[?(Critical|High)\]?`).
   - If findings contain `Critical` or `High` issues:
     - Runner prints a terminal warning banner citing findings.
     - Runner outputs the exact interactive continuation command:
       `agy --conversation <conv-id> "Apply the review suggestions from phase-X-review.md"`
     - Exits with **Exit Code 2**.
   - If findings contain only `Medium` or `Low` issues:
     - Prints a summary warning of suggestions and exits with **Exit Code 0** (phase accepted).
   - If the review turn itself fails, times out, or crashes:
     - Exits with **Exit Code 1**.
   - Runner always halts at the phase boundary before advancing to Phase N+1.

### 2.5 Tooling Extensions (`scripts/agent/generate-prompt.py`)
1. **`[exempt: <category>]` Parsing & Direct-Execution Blueprint Inlining**:
   - Update `parse_plan_tasks` to extract `[exempt: <category>]` tag.
   - Update `infer_verification_strategy` to assign appropriate non-TDD verification commands (`npm run build`, `npm run lint`, `npm run type-check`, markdown diff/existence check) and commit types (`style(...)`, `chore(...)`, `types(...)`, `docs(...)`).
   - Strip backticks from resolved commit messages in both `infer_verification_strategy` and `build_exec_prompt` (including `plan_commit_msg` extracted from `phase-X-task-Y-plan.md`) to prevent shell command substitution.
   - Update `build_exec_prompt` (and add `--skip-plan` CLI flag) so that when `phase-X-task-Y-plan.md` does not exist on disk for `[exempt: docs]` or `--skip-plan` tasks, the prompt references `plan.md` and `spec.md` directly and inlines the task description and `subtasks` under `1. Scope & Blueprint:`. Include an `--allow-empty` commit fallback instruction only for non-docs exempt tasks (consistent with §2.3.2's requirement that `[exempt: docs]` modifies non-empty `.md` files).
2. **`--unattended` Checkpoint Flag & Docs-Only Checkpoint Fallback**:
   - Update `build_checkpoint_prompt` with an `--unattended` mode that skips interactive `ask_question` pauses, makes automated test suites authoritative, and logs deferred manual verification steps into the checkpoint Git note.
   - Default `collect_phase_checkpoint_context` verification commands to `["git diff --name-only"]` for pure `[exempt: docs]` phases that declare no explicit test commands.
3. **Test Suite Modernization**:
   - Fix pre-existing `test_classify_phase_domain_ui_vs_database_vs_tooling` test failure in `scripts/__tests__/test_generate_prompt.py` to ensure a green test baseline.

### 2.6 CLI Interface Specification (`conductor-auto.py`)
```bash
python3 scripts/agent/conductor-auto.py [track] [flags]
```
- **Positional Arguments**:
  - `track` *(optional)*: Track name or directory. Defaults to active track detected in `conductor/tracks.md`.
- **Flags**:
  - `--phase <N>`: Target a specific phase number (defaults to active incomplete phase).
  - `--task <N>`: Run only a single task (Tier 1 Plan + Tier 2 Exec) instead of the entire phase.
  - `--force-plan`: Force re-planning in Tier 1 even if a plan file already exists or task is `[exempt: docs]`.
  - `--skip-plan`: Skip Tier 1 planning turn and execute directly from `plan.md` task description and subtasks.
  - `--no-review`: Skip the Phase Review turn at the end of the phase.
  - `--force-review`: Force Gate 2 review even on documentation-only phases.
  - `--auto-recover`: Attempt a single recovery turn via `generate-prompt.py --recovery` if an execution step leaves dirty uncommitted files.
  - `--timeout <duration>`: Turn timeout (default: `15m`).
  - `--heartbeat <duration>`: Heartbeat interval during silent `agy` turns (e.g. `30s`, `1m`, `0` to disable; default: `30s`).
  - `--model-family <family>`: Base model family used to compose role defaults via `ROLE_EFFORT_MAP` (overrides `CONDUCTOR_MODEL_FAMILY`; default: `gemini-4-hydrogen`).
  - `--plan-model <model>`: Model for Tier 1 planning turn (overrides `CONDUCTOR_PLAN_MODEL` and `--model-family`; default: `gemini-4-hydrogen-high`).
  - `--exec-model <model>`: Model for Tier 2 execution and recovery turns (overrides `CONDUCTOR_EXEC_MODEL` and `--model-family`; default: `gemini-4-hydrogen-high`).
  - `--checkpoint-model <model>`: Model for Gate 1 phase verification checkpoint turn (overrides `CONDUCTOR_CHECKPOINT_MODEL` and `--model-family`; default: `gemini-4-hydrogen-medium`).
  - `--review-model <model>`: Model for Gate 2 phase review turn (overrides `CONDUCTOR_REVIEW_MODEL` and `--model-family`; default: `gemini-4-hydrogen-high`).
  - `--dry-run`: Parse tasks and print the sequence of prompts, models, and validations without invoking `agy`.
- **Exit Codes**:
  - `0`: Success (phase completed cleanly; review passed, skipped, or only Medium/Low findings).
  - `1`: Failure / Invariant violation (compilation error, test failure, dirty tree, timeout, subprocess crash).
  - `2`: Phase completed with `Critical`/`High` review findings requiring developer resolution.

## 3. Acceptance Criteria
- [ ] `scripts/agent/generate-prompt.py` parses `[exempt: <category>]` and supports `--unattended` checkpoint prompts.
- [ ] `scripts/agent/conductor-auto.py` centralizes model configuration via `DEFAULT_MODEL_FAMILY = "gemini-4-hydrogen"`, `ROLE_EFFORT_MAP`, and `resolve_model_config()` supporting 3-tier override precedence (per-role CLI flags > `CONDUCTOR_*` env vars > `--model-family` / `CONDUCTOR_MODEL_FAMILY` composition).
- [ ] `scripts/agent/conductor-auto.py` executes sequential two-tier (Plan -> Exec) turns unattended within a phase.
- [ ] Supervisor actively verifies Red test failures (assertion failure vs syntax error), Green test passes, and Exempt checks.
- [ ] Preserves atomic commits, conventional scopes, and Git notes.
- [ ] Executes Gate 1 Checkpoint and Gate 2 Review unattended, persisting logs to `conductor/tracks/<track>/logs/` and review report to `phase-X-review.md`.
- [ ] Exits with code 2 and outputs `agy --conversation <id>` command when review findings require human attention.
- [ ] Halts immediately and preserves workspace state if compilation or test verification fails.
- [ ] Unit tests for prompt generation, parser, supervisor validations, composable model resolution, CLI arguments, and execution flow in `scripts/__tests__/test_conductor_auto.py` (decoupled from hardcoded model version literals via `DEFAULT_*_MODEL` constants) and `scripts/__tests__/test_generate_prompt.py`.
- [ ] Documented in `conductor/workflow.md` and `docs/agents/conductor-auto.md`.
