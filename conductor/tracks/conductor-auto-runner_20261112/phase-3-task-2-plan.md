# Implementation Plan: Phase 3 Task 2 — Implement Plan Parsing, Status Extraction, Process Lifecycle, and Tier 1 Planning Dispatch in `conductor-auto.py` (TDD Green phase)

**Track:** `conductor-auto-runner_20261112` (Issue [#162](https://github.com/jarredb9/finger-lakes-app-57/issues/162))  
**Phase:** 3 (Task Parsing, Plan Validation, and Planning Tier (`Tier 1`))  
**Task:** 2 (Implement plan parsing, status extraction, process lifecycle, and Tier 1 planning dispatch in `conductor-auto.py` — TDD Green phase)  
**Track Specification:** [conductor/tracks/conductor-auto-runner_20261112/spec.md](./spec.md)  
**Track Plan:** [conductor/tracks/conductor-auto-runner_20261112/plan.md](./plan.md)  
**Preceding Task Plan (Red Phase):** [conductor/tracks/conductor-auto-runner_20261112/phase-3-task-1-plan.md](./phase-3-task-1-plan.md)  
**Authoritative Test Suite:** [scripts/__tests__/test_conductor_auto.py](../../scripts/__tests__/test_conductor_auto.py)  
**Workflow Reference:** [conductor/workflow.md](../../workflow.md)  
**Operating Principles:** [AGENTS.md](../../../AGENTS.md)  

---

## 1. Executive Summary & Objective

### 1.1 Objective
Implement the core engine of `scripts/agent/conductor-auto.py` to satisfy all unit test assertions established in `scripts/__tests__/test_conductor_auto.py`, transitioning Phase 3 from Red to Green.

Specifically, this task implements:
1. **Core Data Structures & Custom Exceptions:**
   - Define `TaskInfo` and `PhaseInfo` dataclasses encapsulating parsed phase and task states, checkpoint indicators, commit SHAs, exempt tags, and subtasks.
   - Define the exception hierarchy: `ConductorAutoError`, `PlanInvariantError`, and `ProcessExecutionError`.
2. **Track Plan Parsing & Status Extraction:**
   - Implement `parse_track_plan(track_path_or_name)` to parse `plan.md`, identifying phase headings, checkpoint tags (`[checkpoint: <sha>]`), task states (`[x]`, `[~]`, `[ ]`, `[-]`), exempt categories (`[exempt: <cat>]`), commit SHAs, subtasks, and phase completion status.
   - Implement `get_active_phase(phases, target_phase)` to resolve either an explicit target phase or the first incomplete phase.
   - Implement `get_pending_tasks(phase)` to extract pending (`[ ]`) and in-progress (`[~]`) tasks, excluding completed and skipped items.
3. **Subprocess Protocol, Strict Flag Ordering & Process Isolation:**
   - Implement `generate_turn_prompt(track, phase_num, task_num, mode, cwd)` invoking `scripts/agent/generate-prompt.py` via subprocess.
   - Implement `build_agy_command(mode, model, extra_flags)` ensuring all configuration flags (`--mode`, `--model`, `--dangerously-skip-permissions`) strictly precede `--print`.
   - Implement `run_agy_turn(prompt, mode, model, timeout, cwd, log_file)` using POSIX process group isolation (`start_new_session=True` / `os.setsid`), delivering prompts via `stdin` (pipe) to prevent `ARG_MAX` truncation and flag collisions, and cleaning up process groups with `SIGTERM`/`SIGKILL` on timeout or interrupt (`SIGINT`).
4. **Idempotent Plan Caching & Cache Bypass:**
   - Implement `check_plan_cache(track_dir, phase_num, task_num, force_plan)` returning `(is_cached, plan_path)` based on non-empty file existence and the `--force-plan` override flag.
5. **Post-Plan Invariant Auditing:**
   - Implement `assert_post_plan_invariants(track_dir, phase_num, task_num, cwd)` verifying that `phase-X-task-Y-plan.md` exists and is non-empty, and checking `git status --porcelain` to assert 0 production/application files were modified during planning.
6. **Tier 1 Planning Turn Dispatcher:**
   - Implement `dispatch_tier1_planning(...)` coordinating the end-to-end planning turn: checking cache -> generating prompt -> dispatching `agy --mode plan` -> auditing post-plan invariants.
7. **CLI Entrypoint & Flag Parsing:**
   - Implement `parse_args()` and `main()` accepting track arguments, `--phase`, `--task`, `--force-plan`, `--timeout`, `--plan-model`, `--exec-model`, `--review-model`, `--no-review`, `--auto-recover`, and `--dry-run`.

---

## 2. Invariants & Critical Guardrails

1. **Strict TDD Green Phase Protocol ([AGENTS.md](../../../AGENTS.md) Section 5 & `conductor/workflow.md`):**
   - Implement only the logic required to satisfy the failing assertions in `scripts/__tests__/test_conductor_auto.py`.
   - Maintain 100% green pass rate across all tests without breaking existing utilities (`scripts/__tests__/test_generate_prompt.py`).
2. **Flag Ordering Invariant (Spec Section 2.1):**
   - In `build_agy_command`, all option flags (`--mode <mode>`, `--model <model>`, `--dangerously-skip-permissions`, and any extra flags) MUST strictly precede the `--print` flag. `--print` must be the final argument in the returned list.
3. **Subprocess Pipe & Session Invariant (Spec Section 2.1):**
   - Prompts must NEVER be passed via argv CLI positional parameters. Subprocess communication MUST deliver prompt content via `stdin` (`communicate(input=prompt)`).
   - `subprocess.Popen` MUST be invoked with `start_new_session=True` (or `preexec_fn=os.setsid`) to isolate the runner and child processes into a dedicated process group.
4. **Fail-Fast Invariant Auditing (Spec Section 2.2):**
   - If `git status --porcelain` reveals modified production/application files (`app/`, `lib/`, `components/`, `supabase/`, `scripts/`, etc.) following a planning turn, `assert_post_plan_invariants` MUST raise `PlanInvariantError` immediately, preventing premature execution.
5. **Modal Approval Invariant (`conductor_antigravity.md` & [AGENTS.md](../../../AGENTS.md) Section 2):**
   - Under `/plan` or any confirmation gate, halt and await explicit affirmative user approval via `ask_question` before modifying any files.

---

## 3. Target Files & Semantic Insertion Anchors

### 3.1 Production Seam: Conductor Auto-Runner
- **Path:** `scripts/agent/conductor-auto.py`
- **Semantic Insertion Anchor:** New file creation. Contains:
  1. Module docstring and CLI usage documentation.
  2. Standard library imports (`argparse`, `dataclasses`, `importlib`, `os`, `pathlib`, `re`, `signal`, `subprocess`, `sys`, `time`, `typing`).
  3. Exception hierarchy (`ConductorAutoError`, `PlanInvariantError`, `ProcessExecutionError`).
  4. Data contracts (`TaskInfo`, `PhaseInfo`).
  5. Repository and track resolution helpers (`find_project_root`, `get_active_track`, `resolve_track_dir`).
  6. Plan parser functions (`parse_track_plan`, `get_active_phase`, `get_pending_tasks`, `is_checkpoint_task`).
  7. Turn prompt generator (`generate_turn_prompt`).
  8. Subprocess execution protocol (`build_agy_command`, `parse_timeout`, `run_agy_turn`).
  9. Invariant & caching checkers (`check_plan_cache`, `assert_post_plan_invariants`).
  10. Tier 1 orchestrator (`dispatch_tier1_planning`).
  11. CLI argument parser and `main()` entrypoint.

---

## 4. Signatures, Types & Data Contracts

### 4.1 Dataclasses & Custom Exceptions (Python 3.11)

```python
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

class ConductorAutoError(Exception):
    """Base exception for conductor-auto runner failures."""
    pass

class PlanInvariantError(ConductorAutoError):
    """Raised when Tier 1 planning fails to create a blueprint or mutates production code."""
    pass

class ProcessExecutionError(ConductorAutoError):
    """Raised when an agy or child subprocess fails or times out."""
    pass

@dataclass
class TaskInfo:
    task_num: int
    description: str
    status: str              # "pending" | "in_progress" | "complete" | "skipped"
    status_char: str         # " " | "~" | "x" | "-"
    is_checkpoint: bool      # True if manual verification / checkpoint end of phase
    commit_sha: Optional[str] = None
    exempt: Optional[str] = None
    subtasks: List[str] = field(default_factory=list)
    raw_line: str = ""

@dataclass
class PhaseInfo:
    phase_num: int
    name: str
    checkpoint_sha: Optional[str]
    raw_heading: str
    tasks: List[TaskInfo] = field(default_factory=list)
    is_complete: bool = False
```

### 4.2 Exported Function Signatures

```python
def find_project_root() -> Path:
    """Discovers project root containing conductor/ and package.json."""
    ...

def resolve_track_dir(track_name: Optional[str]) -> Optional[Path]:
    """Resolves track directory path whether active in conductor/tracks/ or archived."""
    ...

def get_active_track() -> Optional[str]:
    """Detects active or pending track from conductor/tracks.md."""
    ...

def is_checkpoint_task(task_desc: str) -> bool:
    """Returns True if task description represents a checkpoint or manual verification task."""
    ...

def parse_track_plan(track_path_or_name: Union[str, Path]) -> Dict[int, PhaseInfo]:
    """Parses track plan.md, extracting phases, tasks, subtasks, statuses, and commit SHAs."""
    ...

def get_active_phase(
    phases: Dict[int, PhaseInfo],
    target_phase: Optional[int] = None,
) -> Optional[PhaseInfo]:
    """Resolves target phase or the first incomplete phase from parsed plan."""
    ...

def get_pending_tasks(phase: PhaseInfo) -> List[TaskInfo]:
    """Returns list of pending ([ ]) or in-progress ([~]) tasks for a phase."""
    ...

def generate_turn_prompt(
    track: str,
    phase_num: int,
    task_num: int,
    mode: str = "plan",
    cwd: Optional[Path] = None,
) -> str:
    """Invokes scripts/agent/generate-prompt.py via subprocess to obtain turn prompt."""
    ...

def build_agy_command(
    mode: str,
    model: str,
    extra_flags: Optional[List[str]] = None,
) -> List[str]:
    """Builds agy CLI command ensuring configuration flags strictly precede --print."""
    ...

def parse_timeout(timeout_val: Union[str, float, int]) -> float:
    """Parses timeout string (e.g. '15m', '900s', '900') into seconds as float."""
    ...

def run_agy_turn(
    prompt: str,
    mode: str = "plan",
    model: str = "gemini-3.8-flash-high",
    timeout: float = 900.0,
    cwd: Optional[Path] = None,
    log_file: Optional[Path] = None,
) -> Tuple[int, str, str]:
    """Runs agy subprocess turn in a dedicated process group with stdin prompt delivery."""
    ...

def check_plan_cache(
    track_dir: Path,
    phase_num: int,
    task_num: int,
    force_plan: bool = False,
) -> Tuple[bool, Path]:
    """Checks if phase-X-task-Y-plan.md exists and is non-empty. Returns (is_cached, plan_path)."""
    ...

def assert_post_plan_invariants(
    track_dir: Path,
    phase_num: int,
    task_num: int,
    cwd: Optional[Path] = None,
) -> None:
    """Verifies plan file was created and porcelain git status contains 0 production changes."""
    ...

def dispatch_tier1_planning(
    track_name: str,
    phase_num: int,
    task_num: int,
    plan_model: str = "gemini-3.8-flash-high",
    force_plan: bool = False,
    timeout: float = 900.0,
    cwd: Optional[Path] = None,
) -> bool:
    """Coordinates Tier 1 turn: cache check -> prompt gen -> agy dispatch -> invariant audit."""
    ...

def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    """Configures and parses CLI arguments."""
    ...

def main(argv: Optional[List[str]] = None) -> int:
    """Main CLI entrypoint for conductor-auto."""
    ...
```

---

## 5. Precise Behavioral Logic & Algorithmic Steps

### 5.1 Plan Parsing Algorithm (`parse_track_plan`)
1. **Input Resolution:**
   - If input is a `Path` pointing to a file (e.g. `tmpdir/plan.md`), read directly.
   - If input is a directory path, resolve `input / "plan.md"`.
   - If input is a track name (string), resolve via `resolve_track_dir(name) / "plan.md"`.
   - If file does not exist, return `{}`.
2. **Regex Definitions:**
   - Phase Header: `r"^(#{2,3})\s+Phase(?:\s+(\d+))?[:\s]+(.*)"`
   - Checkpoint Header Tag: `r"\s*(?:\[checkpoint:\s*([a-f0-9]{7,40})\]|\[([a-f0-9]{7,40})\])\s*$"`
   - Exempt Annotation: `r"\[exempt:\s*([a-zA-Z0-9_\-]+)\]"`
   - Task Commit SHA: `r"\s*(?:\(([a-f0-9]{7,40})\)|\[(?:commit:\s*|checkpoint:\s*)?([a-f0-9]{7,40})\]|([a-f0-9]{7,40}))\s*$"`
   - Subtask Line: `r"^(?:\s{2,}|\t+)-\s*\[([ x~X\-])\]\s*(.*)"`
   - Top-Level Task Line: `r"^-\s*\[([ x~X\-])\]\s+(?:Task(?:\s+\d+)?:)?\s*(.*)"`
3. **Line-by-Line State Machine:**
   - For Phase match:
     - Extract `phase_num`: integer if parsed, else `max(keys) + 1` or `1`.
     - Extract `checkpoint_sha`: group 1 or 2 from checkpoint header tag regex search.
     - Extract `name`: title stripped of checkpoint tags.
     - Extract `raw_heading`: full heading line without checkpoint tags.
     - Initialize `PhaseInfo(phase_num, name, checkpoint_sha, raw_heading, tasks=[])`.
   - For Subtask match:
     - If current phase has tasks, append `subtask_match.group(2).strip()` to `phase.tasks[-1].subtasks`.
   - For Task match:
     - Map status character: `'x'` / `'X'` -> `"complete"`, `'~'` -> `"in_progress"`, `'-'` -> `"skipped"`, `' '` -> `"pending"`.
     - Extract `exempt` tag if present, stripping it from description.
     - Extract `commit_sha` if present, stripping it from description.
     - Clean description of trailing checkpoint tags and collapse excessive whitespace.
     - Determine `is_checkpoint = is_checkpoint_task(clean_desc)`.
     - Instantiate `TaskInfo` with `task_num = len(phase.tasks) + 1`.
     - Append to `phase.tasks`.
4. **Phase Completion Calculation:**
   - After processing all lines, for each phase:
     `is_complete = bool(phase.checkpoint_sha) or (len(phase.tasks) > 0 and all(t.status in ("complete", "skipped") for t in phase.tasks))`

### 5.2 Active Phase & Pending Tasks Filtering
1. **`get_active_phase(phases, target_phase)`:**
   - If `target_phase` is given: return `phases.get(target_phase)`.
   - If `target_phase` is `None`: iterate sorted keys and return first phase where `not phase.is_complete`. If all complete, return `None`.
2. **`get_pending_tasks(phase)`:**
   - Filter `phase.tasks` for `t.status in ("pending", "in_progress")`.

### 5.3 Turn Prompt Generation (`generate_turn_prompt`)
1. Path to generator: `PROJECT_ROOT / "scripts" / "agent" / "generate-prompt.py"`.
2. Construct argument list:
   `[sys.executable, str(gen_script), str(track), str(phase_num), str(task_num), f"--{mode}"]`.
3. Execute via `subprocess.run(cmd, capture_output=True, text=True, cwd=cwd or PROJECT_ROOT)`.
4. If `returncode != 0`: raise `ProcessExecutionError(f"generate-prompt.py failed: {res.stderr.strip()}")`.
5. Return `res.stdout.strip()`.

### 5.4 Command Builder & Flag Ordering (`build_agy_command`)
1. Start command with `["agy", "--mode", mode, "--model", model, "--dangerously-skip-permissions"]`.
2. If `extra_flags` provided, append each.
3. Append `"--print"` as the final argument.
4. Guarantee: all option flags strictly precede `"--print"`.

### 5.5 Subprocess Protocol & Process Group Isolation (`run_agy_turn`)
1. Build command via `build_agy_command(mode, model)`.
2. Invoke `subprocess.Popen`:
   ```python
   proc = subprocess.Popen(
       cmd,
       stdin=subprocess.PIPE,
       stdout=subprocess.PIPE,
       stderr=subprocess.PIPE,
       text=True,
       cwd=cwd or PROJECT_ROOT,
       start_new_session=True,  # Isolates process group via os.setsid on POSIX
   )
   ```
3. Communicate with prompt passed to stdin:
   ```python
   try:
       stdout, stderr = proc.communicate(input=prompt, timeout=timeout)
   except subprocess.TimeoutExpired:
       _terminate_process_group(proc.pid)
       raise ProcessExecutionError(f"Turn timed out after {timeout}s")
   except KeyboardInterrupt:
       _terminate_process_group(proc.pid)
       raise
   ```
4. `_terminate_process_group(pid)`:
   - Call `pgid = os.getpgid(pid)`.
   - Call `os.killpg(pgid, signal.SIGTERM)`.
   - Wait up to 5 seconds; if still alive, call `os.killpg(pgid, signal.SIGKILL)`.
5. If `log_file` is specified, write/append combined execution details.
6. Return `(proc.returncode, stdout, stderr)`.

### 5.6 Idempotent Plan Cache (`check_plan_cache`)
1. Target plan file: `track_dir / f"phase-{phase_num}-task-{task_num}-plan.md"`.
2. If `force_plan is True`: return `(False, plan_path)`.
3. If `plan_path.exists()` and `plan_path.stat().st_size > 0`: return `(True, plan_path)`.
4. Return `(False, plan_path)`.

### 5.7 Post-Plan Invariant Auditing (`assert_post_plan_invariants`)
1. Check plan file: `plan_path = track_dir / f"phase-{phase_num}-task-{task_num}-plan.md"`.
   - If not `plan_path.exists()` or `plan_path.stat().st_size == 0`:
     raise `PlanInvariantError(f"Tier 1 plan blueprint missing or empty at {plan_path}")`.
2. Execute `git status --porcelain`:
   - Run `subprocess.run(["git", "status", "--porcelain"], capture_output=True, text=True, cwd=cwd or PROJECT_ROOT)`.
   - For each output line:
     - Ignore empty lines.
     - Extract file path from column 3 onwards (accounting for rename arrows `->`).
     - If path matches the current task plan file, it is permitted.
     - If path belongs to production/app code (e.g. `lib/`, `app/`, `components/`, `supabase/`, `hooks/`, `types/`, `public/`, `scripts/` outside conductor logs):
       Flag as violation!
   - If any production file modifications are detected:
     raise `PlanInvariantError(f"Post-plan invariant violation: modified application code detected ({', '.join(violations)}) during planning turn.")`.

### 5.8 Tier 1 Turn Dispatcher (`dispatch_tier1_planning`)
1. Resolve track directory via `resolve_track_dir(track_name)`.
2. Check cache: `cached, plan_path = check_plan_cache(track_dir, phase_num, task_num, force_plan=force_plan)`.
3. If `cached`:
   - Log cache hit; return `True` (skip `run_agy_turn`).
4. Generate prompt: `prompt = generate_turn_prompt(track_name, phase_num, task_num, mode="plan", cwd=cwd)`.
5. Run turn:
   - `ret, stdout, stderr = run_agy_turn(prompt=prompt, mode="plan", model=plan_model, timeout=timeout, cwd=cwd, log_file=...)`.
   - If `ret != 0`: raise `ProcessExecutionError(f"Tier 1 planning turn failed with exit code {ret}: {stderr}")`.
6. Audit post-plan invariants:
   - `assert_post_plan_invariants(track_dir, phase_num, task_num, cwd=cwd)`.
7. Return `True`.

### 5.9 CLI Parser & Entrypoint (`main`)
1. Flags supported:
   - Positional `track`: optional track name or directory.
   - `--phase <N>`: target specific phase.
   - `--task <N>`: target specific task.
   - `--force-plan`: boolean flag.
   - `--timeout <val>`: parsed with `parse_timeout`.
   - `--plan-model`: default `"gemini-3.8-flash-high"`.
   - `--exec-model`: default `"gemini-3.8-flash-medium"`.
   - `--review-model`: default `"gemini-3.8-flash-high"`.
   - `--no-review`: boolean flag.
   - `--auto-recover`: boolean flag.
   - `--dry-run`: boolean flag.
2. In `main()`:
   - Parse args, resolve track, resolve phase, iterate pending tasks, and dispatch planning turns.
   - Exit with code 0 on success, code 1 on error/invariant violation.

---

## 6. Execution Verification Protocol

### 6.1 Unit Test Execution (Target Seam)
Execute the complete test suite in `scripts/__tests__/test_conductor_auto.py` to confirm all test cases pass:

```bash
python3.11 -m unittest scripts/__tests__/test_conductor_auto.py
```
**Expected Outcome:** `OK` (all tests pass cleanly with exit code `0`, 0 failures, 0 errors).

### 6.2 Regression Test Execution (Pre-Existing Tooling)
Execute `test_generate_prompt.py` to confirm zero regressions in existing prompt generation utilities:

```bash
python3.11 -m unittest scripts/__tests__/test_generate_prompt.py
```
**Expected Outcome:** `OK` (all tests pass cleanly with exit code `0`).

### 6.3 Full Suite Discovery Check
Run discovery across all scripts tests:

```bash
python3.11 -m unittest discover -s scripts/__tests__
```
**Expected Outcome:** `OK` (all tests in test suite pass cleanly).

### 6.4 Git Tree Cleanliness
Verify that only `scripts/agent/conductor-auto.py` has been authored/modified:

```bash
git status --short
```
**Expected Outcome:** Only `?? scripts/agent/conductor-auto.py` (and untracked plan if not committed) is present.

---

## 7. Post-Execution Protocol & Git Notes

Upon confirming all tests pass cleanly:

### 7.1 Stage & Commit Green Implementation
```bash
git add scripts/agent/conductor-auto.py
git commit -m "feat(agent): implement plan parsing, status extraction, process lifecycle, and Tier 1 planning dispatch in conductor-auto.py (TDD Green phase)"
```

### 7.2 Attach Git Note
Obtain commit hash (`COMMIT_HASH=$(git log -1 --format="%H")`) and attach the standard metadata note:

```bash
git notes add -m "Task: Implement plan parsing, status extraction, process lifecycle, and Tier 1 planning dispatch in conductor-auto.py (TDD Green phase)
Summary: Implemented TaskInfo and PhaseInfo dataclasses, custom exception hierarchy (ConductorAutoError, PlanInvariantError, ProcessExecutionError), track plan markdown parser (phases, statuses, commit SHAs, exempt tags, checkpoint tasks), active phase and pending task resolution, generate-prompt subprocess bridge, agy command builder enforcing strict flag ordering before --print, process group isolation (os.setsid) with stdin delivery and timeout/signal termination, idempotent plan caching, post-plan porcelain invariant checking, and full Tier 1 planning dispatch orchestration. All unit tests in scripts/__tests__/test_conductor_auto.py pass cleanly.
Files: scripts/agent/conductor-auto.py
Rationale: Closes Issue #162 Phase 3 Task 2 satisfying TDD Green phase requirements for automated Tier 1 planning turn execution." $COMMIT_HASH
```

### 7.3 Update Conductor Plan
Update `conductor/tracks/conductor-auto-runner_20261112/plan.md`:
- Change `- [ ] Task: Implement plan parsing, status extraction, process lifecycle, and Tier 1 planning dispatch in conductor-auto.py (TDD Green phase)` to `- [x] Task: Implement plan parsing, status extraction, process lifecycle, and Tier 1 planning dispatch in conductor-auto.py (TDD Green phase) [commit: <short_sha>]`.
- Stage `conductor/tracks/conductor-auto-runner_20261112/plan.md`.
- Commit with:
  ```bash
  git commit -m "conductor(plan): Mark task 'Implement plan parsing, status extraction, process lifecycle, and Tier 1 planning dispatch in conductor-auto.py' as complete"
  ```

---

## 8. Confirmation Gate

Halt immediately. Do NOT create or modify `scripts/agent/conductor-auto.py` or any repository files until explicit affirmative user approval is received via the `ask_question` modal.
