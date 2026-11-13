# Autonomous Multi-Task Track Execution (`conductor-auto.py`)

Unattended multi-task execution runner for Conductor tracks, orchestrating sequential `plan -> exec -> verify -> checkpoint -> review` lifecycles via `agy --print` mode while enforcing TDD Red/Green separation, Conventional Commits, and Git notes.

**Primary Entrypoint:** [`scripts/agent/conductor-auto.py`](../../scripts/agent/conductor-auto.py)  
**Prompt Generator:** [`scripts/agent/generate-prompt.py`](../../scripts/agent/generate-prompt.py)

---

## 1. Architecture

`conductor-auto.py` operates as a non-interactive supervisor around `agy` CLI subprocesses using **zero-amnesia print mode** (`agy --mode <mode> --model <model> --dangerously-skip-permissions --output-format stream-json --print <prompt>`). Every turn starts in a fresh conversation context grounded by on-disk artifacts (`plan.md`, `spec.md`, and `phase-X-task-Y-plan.md`).

### Key Architectural Guarantees
- **Strict `agy` Flag Ordering:** `build_agy_command()` always places `--mode`, `--model`, `--dangerously-skip-permissions`, and `--output-format` strictly before `--print <prompt>` so multi-kilobyte prompts never collide with CLI option parsing.
- **Process Group Isolation & Timeouts:** Each `agy` turn runs in its own POSIX process group (`start_new_session=True`) with a configurable wall-clock timeout (default `15m`). On timeout or `SIGINT`, `_terminate_process_group()` sends `SIGTERM` followed by `SIGKILL` (after a 2-second grace window) to the entire process group, preventing orphaned container or subshell processes.
- **Live Streaming, Heartbeats & Dual Logging (`DualLogger`):** Streamed turns use `--output-format stream-json` (`_StreamJsonTracker`) to display real-time session IDs, tool invocations, durations, and live `stderr` notices, paired with a periodic `--heartbeat` status line (default `30s`) during silent intervals. Timestamped runner banners/status lines and unredacted turn transcripts (prompt, raw NDJSON stdout, live stderr, exit code) are persisted under `conductor/tracks/<track>/logs/`:
  - `conductor-auto.log` (runner-level banners & timestamped status lines)
  - `phase-<N>-task-<M>-plan.log`
  - `phase-<N>-task-<M>-exec.log`
  - `phase-<N>-task-<M>-recovery.log`
  - `phase-<N>-checkpoint.log`
  - `phase-<N>-review.log`
  *(Log files are excluded from git tracking via `*.log` in `.gitignore`.)*

---

## 2. Execution Flow

For a target track (defaults to the active track in `conductor/tracks.md`) and phase (defaults to the first incomplete phase):

```
Active Phase Tasks ([ ] / [~])
   │
   ├─► [Tier 1: Planning] (skipped if cached, --skip-plan, or [exempt: docs]; overridden by --force-plan)
   │      └─ Post-Plan Audit: plan file non-empty + 0 modified production/test files
   │
   ├─► [Tier 2: Execution] (`generate-prompt.py --exec`, `agy --mode auto`)
   │      ├─ Cleanliness Check (optional single `--auto-recover` turn if dirty)
   │      ├─ Active Verification (Red dual-check | Green test + type-check | Exempt check)
   │      └─ Git & Plan Audit (Conventional Commit, Git notes, `[x] [commit: <sha>]`, `conductor(plan)`)
   │
   ▼ (All tasks before checkpoint complete; omitted when `--task <N>` is set)
[Gate 1: Phase Checkpoint] (`--checkpoint --unattended`, `DEFAULT_CHECKPOINT_MODEL`)
   │  └─ Verifies clean tree, `conductor(checkpoint)` commit, Git notes, `[checkpoint: <sha>]`
   │
   ▼ (Skipped if `--no-review` or docs-only phase without `--force-review`)
[Gate 2: Phase Review] (`/conductor:review`, `DEFAULT_REVIEW_MODEL`)
   │  ├─ Saves `conductor/tracks/<track>/phase-<N>-review.md` & captures conversation ID
   │  ├─ Critical/High findings ──► Exit 2 + prints `agy --conversation <id>` command
   │  └─ Clean / Medium / Low  ──► Exit 0 (halts at phase boundary before Phase N+1)
```

### 2.1 Two-Tier Task Loop (`Plan -> Exec`)
1. **Tier 1 (Planning):** Checks `should_skip_tier1_plan()` and `check_plan_cache()` for `phase-<N>-task-<M>-plan.md`. When planning runs, `assert_post_plan_invariants()` verifies the blueprint file is non-empty and `git status --porcelain` contains zero modified production, test, or manifest files (`PlanInvariantError` halts immediately before execution).
2. **Tier 2 (Execution):** Captures the pre-task `HEAD` SHA, builds the prompt via `generate-prompt.py --exec` (passing `--skip-plan` when Tier 1 was bypassed), and invokes `agy --mode auto`.

### 2.2 Post-Execution Supervisor Gate
Immediately after Tier 2 completes, `conductor-auto.py` independently audits the repository state:
1. **Working Tree Cleanliness:** Runs `git status --porcelain`. If uncommitted files remain:
   - With `--auto-recover`: dispatches one `generate-prompt.py --recovery` turn, then re-checks cleanliness.
   - Without `--auto-recover` (or if still dirty): raises `GitTreeDirtyError` and exits with code `1`.
2. **Active Task-Type Verification (`verify_task_execution`):**
   - **Red Task (`verify_red_task`):** Runs the inferred test command and enforces a **dual check**:
     - Exits non-zero.
     - Matches assertion failure markers (`expect(`, `Expected:`, `Received:`, `AssertionError`, `FAIL:`, `FAILED (failures=`, `assert `) and rejects syntax, import, or TypeScript compiler errors (`SyntaxError`, `Cannot find module`, `ReferenceError`, `ImportError`, `ModuleNotFoundError`, `ERROR:`, `TS\d{4}:`).
     - Zero production files modified between pre-task `HEAD` and `HEAD`.
   - **Green Task (`verify_green_task`):** Runs the inferred test command(s) and `npm run type-check` (omitted for Python-only tasks), asserting exit code `0`.
   - **Exempt Task (`verify_exempt_task`):**
     - `[exempt: ui]` / `[exempt: styling]`: `npm run build` (exit `0`)
     - `[exempt: infra]` / `[exempt: scripts]`: `npm run lint` (exit `0`)
     - `[exempt: types]`: `npm run type-check` (exit `0`)
     - `[exempt: docs]`: `git diff --name-only <base> HEAD` asserts at least one modified file, all modified files are `.md`/`.markdown`, and all are non-empty.
3. **Git Commit, Notes & Plan Audit (`audit_git_commit_and_notes`):** Verifies a new commit exists beyond baseline `HEAD`, matches Conventional Commit syntax, has `git notes` containing `Task:`, `Summary:`, `Files:`, and `Rationale:`, `plan.md` marks the task `[x]` with `[commit: <7-char-sha>]`, and a `conductor(plan)` commit updated `plan.md`.

### 2.3 Phase Boundary Gates (Gate 1 & Gate 2)
When running a full phase (without `--task`), stopping at the checkpoint task triggers two gates and always halts before Phase `N+1`:
- **Gate 1 (Checkpoint):** Dispatches `generate-prompt.py <track> <phase> --checkpoint --exec --unattended`. Automated test suites act as the authoritative gate (interactive `ask_question` pauses are skipped and manual steps are logged into the checkpoint Git note). Verifies a clean tree, `conductor(checkpoint): Checkpoint end of Phase <N>` commit, attached Git notes, `[checkpoint: <sha>]` in `plan.md`, and `conductor(plan)` commit.
- **Gate 2 (Review & Remediation Handshake):** Snapshots `~/.gemini/antigravity-cli/brain/` before invoking `/conductor:review <track>` with unattended overrides (auto-confirming Phase `N` scope, accepting Iterative Review Mode if >300 lines, and saving `phase-<N>-review.md` without auto-applying fixes). Captures the newly created conversation ID (falling back to newest `transcript.jsonl` mtime) and evaluates H3 headings against `REVIEW_SEVERITY_PATTERN` (`^###\s+\[?(Critical|High)(?:\]|(?=$|[\s:]))`). If `Critical` or `High` findings exist, prints the exact interactive resume command and exits with code `2`:
  ```bash
  agy --conversation <conv-id> "Apply the review suggestions from phase-<N>-review.md"
  ```

---

## 3. CLI Reference

```bash
python3.11 scripts/agent/conductor-auto.py [track] [flags]
```

| Flag / Argument | Default | Description |
| --- | --- | --- |
| `track` *(positional)* | Active track in `conductor/tracks.md` | Track name under `conductor/tracks/` (or `conductor/archive/`) or path to track directory. |
| `--phase <N>` | First incomplete phase | Target a specific phase number. |
| `--task <N>` | All pending tasks in phase | Execute only task `N` (Tier 1 + Tier 2) and exit without running Gate 1 or Gate 2. |
| `--skip-plan` | `false` | Skip Tier 1 planning for all selected tasks and execute directly from `plan.md` and `spec.md`. |
| `--force-plan` | `false` | Force Tier 1 planning even if `phase-X-task-Y-plan.md` is cached or the task is `[exempt: docs]` (overrides `--skip-plan`). |
| `--no-review` | `false` | Skip Gate 2 `/conductor:review` at the phase boundary (overrides `--force-review`). |
| `--force-review` | `false` | Force Gate 2 `/conductor:review` even on documentation-only phases. |
| `--auto-recover` | `false` | Dispatch a single `generate-prompt.py --recovery` turn if Tier 2 leaves dirty uncommitted changes. |
| `--timeout <duration>` | `15m` | Per-turn subprocess timeout (`15m`, `900s`, `900`, `1h`). |
| `--heartbeat <duration>` | `30s` | Heartbeat interval during silent `agy` turns (`30s`, `1m`, `0` to disable). |
| `--model-family <family>` | `gemini-4-hydrogen` | Base model family composed with `ROLE_EFFORT_MAP`. |
| `--plan-model <model>` | `gemini-4-hydrogen-high` | Override model for Tier 1 planning turns. |
| `--exec-model <model>` | `gemini-4-hydrogen-high` | Override model for Tier 2 execution and `--auto-recover` turns. |
| `--checkpoint-model <model>` | `gemini-4-hydrogen-medium` | Override model for Gate 1 checkpoint turns. |
| `--review-model <model>` | `gemini-4-hydrogen-high` | Override model for Gate 2 review turns. |
| `--dry-run` | `false` | Parse `plan.md` and print planned turns, models, and gate decisions without invoking `agy`. |

---

## 4. Exit Codes

| Exit Code | Meaning | Behavior / Next Step |
| --- | --- | --- |
| `0` | **Clean Success** | Single `--task` completed, or phase passed Gate 1 and Gate 2 (review clean, skipped, or only `Medium`/`Low` suggestions). |
| `1` | **Failure / Invariant Violation** | Invalid arguments/track, turn timeout or non-zero `agy` exit, `PlanInvariantError`, `GitTreeDirtyError`, failed Red/Green/Exempt verification, or missing commit/Git notes. Workspace is preserved for inspection. |
| `2` | **Review Blocked (`Critical`/`High`)** | Gate 1 passed, but `phase-<N>-review.md` contains `Critical` or `High` findings. Resume interactively using the printed `agy --conversation <conv-id>` command. |

---

## 5. Composable Model Matrix & Quota Pool Separation

### 5.1 `gemini-4-hydrogen` Model Matrix
Model configuration is centralized at the top of `scripts/agent/conductor-auto.py` via `DEFAULT_MODEL_FAMILY` and `ROLE_EFFORT_MAP`:

```python
DEFAULT_MODEL_FAMILY = "gemini-4-hydrogen"

ROLE_EFFORT_MAP = {
    "plan": "high",        # -> gemini-4-hydrogen-high
    "exec": "high",        # -> gemini-4-hydrogen-high
    "checkpoint": "medium",# -> gemini-4-hydrogen-medium
    "review": "high",      # -> gemini-4-hydrogen-high
}
```

`resolve_model_config()` resolves each role using **3-tier precedence** (highest to lowest):
1. **Per-role CLI flag:** `--plan-model`, `--exec-model`, `--checkpoint-model`, `--review-model`
2. **Per-role environment variable:** `CONDUCTOR_PLAN_MODEL`, `CONDUCTOR_EXEC_MODEL`, `CONDUCTOR_CHECKPOINT_MODEL`, `CONDUCTOR_REVIEW_MODEL`
3. **Composed `<family>-<effort>`:** `<family>` resolves from `--model-family` > `CONDUCTOR_MODEL_FAMILY` > `DEFAULT_MODEL_FAMILY` (`gemini-4-hydrogen`)

```bash
# Example: Switch the entire runner to a different model family
CONDUCTOR_MODEL_FAMILY=gemini-4-hydrogen python3.11 scripts/agent/conductor-auto.py --dry-run

# Example: Override only execution via env var while keeping family defaults
CONDUCTOR_EXEC_MODEL=gemini-4-hydrogen-medium python3.11 scripts/agent/conductor-auto.py
```

### 5.2 Pro Quota Pool Separation (`Hydrogen` Pool A vs. `Argon`/`Orchestrator` Pool B)
All default roles (`plan`, `exec`, `checkpoint`, `review`) target **Google AI Pro Pool A (`gemini-4-hydrogen-*`)**, which refreshes quickly and sustains high-frequency multi-turn automation. Multi-day **Pool B (`gemini-4-argon-*` / `Orchestrator (Argon)`)** quota is intentionally left untouched for interactive developer sessions, complex architecture work, and review remediation. Disk-cached `phase-<N>-task-<M>-plan.md` blueprints preserve full implementation and verification context across Pool A `agy --print` turns so `generate-prompt.py` can deterministically harvest target files and test commands without interactive session memory.

---

## 6. `[exempt: docs]` Tier 1 & Gate 2 Fast-Path

Tasks tagged `[exempt: docs]` in `plan.md` follow a streamlined fast-path that avoids redundant planning and code-review turns:

1. **Tier 1 Skip (`should_skip_tier1_plan`):** Skips generating `phase-<N>-task-<M>-plan.md` unless `--force-plan` is passed.
2. **Direct-Execution Blueprint Inlining:** When no on-disk task plan exists for an `[exempt: docs]` or `--skip-plan` task, `conductor-auto.py` passes `--skip-plan` to `generate-prompt.py --exec`. `build_exec_prompt()` references `plan.md` and `spec.md` directly as authoritative and inlines the task description and subtasks into `1. Scope & Blueprint:`.
3. **Tier 2 Verification:** `verify_exempt_task("docs", ...)` runs `git diff --name-only <base> HEAD` and verifies that at least one file changed, every modified file is `.md`/`.markdown`, and every file is non-empty (no `--allow-empty` commit fallback is permitted for docs tasks).
4. **Gate 1 Docs-Only Fallback:** When all active (non-checkpoint, non-skipped) tasks in a phase are `[exempt: docs]`, `collect_phase_checkpoint_context()` defaults the phase verification commands to `["git diff --name-only"]`.
5. **Gate 2 Skip (`is_docs_only_phase` / `should_skip_gate2_review`):** When all active tasks in a phase are `[exempt: docs]`, Gate 2 `/conductor:review` is automatically skipped at the phase boundary unless `--force-review` is specified.
