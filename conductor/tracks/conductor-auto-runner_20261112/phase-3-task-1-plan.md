# Implementation Plan: Phase 3 Task 1 — Write Failing Unit Tests for Track Plan Parsing, Task Status Extraction, Tier 1 Planning Turn Assertions, Process Group Isolation, Flag Ordering, and Idempotent Plan Caching (TDD Red phase)

**Track:** `conductor-auto-runner_20261112` (Issue [#162](https://github.com/jarredb9/finger-lakes-app-57/issues/162))  
**Phase:** 3 (Task Parsing, Plan Validation, and Planning Tier (`Tier 1`))  
**Task:** 1 (Write failing unit tests for track plan parsing, task status extraction, Tier 1 planning turn assertions, process group isolation, flag ordering, and idempotent plan caching — TDD Red phase)  
**Track Specification:** [conductor/tracks/conductor-auto-runner_20261112/spec.md](./spec.md)  
**Track Plan:** [conductor/tracks/conductor-auto-runner_20261112/plan.md](./plan.md)  
**Preceding Task Plan:** [conductor/tracks/conductor-auto-runner_20261112/phase-2-task-2-plan.md](./phase-2-task-2-plan.md)  
**Workflow Reference:** [conductor/workflow.md](../../workflow.md)  
**Operating Principles:** [AGENTS.md](../../../AGENTS.md)  

---

## 1. Executive Summary & Objective

### 1.1 Objective
Author failing unit tests in `scripts/__tests__/test_conductor_auto.py` establishing the authoritative test harness for Phase 3: Task Parsing, Plan Validation, and Planning Tier (`Tier 1`) of `conductor-auto.py` (TDD Red phase).

Specifically:
1. **Track Plan Parsing & Task Status Extraction (`TestTrackPlanParser`):**
   - Assert `parse_track_plan` correctly identifies phases, checkpoint headers (`[checkpoint: <sha>]`), raw headings, and completion state.
   - Assert extraction of individual task statuses: pending `[ ]`, in-progress `[~]`, completed `[x]`, and skipped `[-]`.
   - Assert detection of checkpoint verification tasks (via `is_checkpoint_task`).
   - Assert extraction of commit SHAs (`[commit: abc1234]`, `(abc1234)`, `abc1234`), `[exempt: <category>]` annotations, and indented subtasks.
   - Assert `get_active_phase` returns the first incomplete phase or matches a requested `--phase <N>`.
   - Assert `get_pending_tasks` extracts only pending (`[ ]`) and in-progress (`[~]`) tasks while filtering completed/skipped items.
2. **Tier 1 Planning Prompt Construction & Invocation (`TestPlanningPromptGeneration`):**
   - Assert `generate_turn_prompt` invokes `scripts/agent/generate-prompt.py <track> <phase> <task> --plan` via subprocess.
   - Assert generated planning prompt is returned non-empty, contains planner directives, and strips trailing whitespace.
   - Assert graceful error handling when `generate-prompt.py` returns a non-zero exit code (raises `RuntimeError` with stderr details).
3. **Subprocess Protocol, Strict Flag Ordering & Stdin Pipe (`TestAgySubprocessProtocol`):**
   - Assert `build_agy_command` positions all configuration flags (`--mode plan`, `--model <model>`, `--dangerously-skip-permissions`) strictly before the `--print` flag.
   - Assert `run_agy_turn` passes prompts via `stdin` (or pipe) rather than CLI positional arguments to avoid `ARG_MAX` collisions and shell escaping corruption.
   - Assert subprocess execution sets `start_new_session=True` (calling `os.setsid` on POSIX) for complete process group isolation.
   - Assert timeout expiration triggers `os.killpg` with `SIGTERM` followed by `SIGKILL` across the process group.
   - Assert interrupt handling (`SIGINT` / `KeyboardInterrupt`) propagates termination across the entire process group.
4. **Idempotent Plan Caching (`TestIdempotentPlanCache`):**
   - Assert `check_plan_cache` returns `(True, plan_file)` (cache hit) if `phase-X-task-Y-plan.md` exists and file size > 0.
   - Assert `check_plan_cache` returns `(False, plan_file)` (cache miss) if `phase-X-task-Y-plan.md` does not exist.
   - Assert `check_plan_cache` returns `(False, plan_file)` (cache miss) if `phase-X-task-Y-plan.md` exists but has size == 0.
   - Assert `check_plan_cache` returns `(False, plan_file)` (cache bypassed) when `force_plan=True`, regardless of file existence or size.
5. **Post-Plan Invariant Verification (`TestPostPlanInvariants`):**
   - Assert `assert_post_plan_invariants` passes when `phase-X-task-Y-plan.md` exists, is non-empty, and `git status --porcelain` contains 0 modified production/application files.
   - Assert `assert_post_plan_invariants` raises `PlanInvariantError` when the plan markdown file is missing or empty.
   - Assert `assert_post_plan_invariants` raises `PlanInvariantError` when `git status --porcelain` reveals modified production code (e.g. `M lib/...` or `M app/...`), preventing premature execution.
6. **Tier 1 Planning Turn Orchestration (`TestTier1PlanningDispatch`):**
   - Assert `dispatch_tier1_planning` orchestrates the complete Tier 1 lifecycle: cache checking -> prompt generation -> `agy` subprocess dispatch -> post-plan invariant verification.
   - Assert Tier 1 skips subprocess invocation when plan cache hits, and dispatches when cache misses or `force_plan=True`.
7. **Empirical Red Phase Confirmation:**
   - Confirm all test cases fail cleanly with `AssertionError` against the non-existent / skeleton implementation of `scripts/agent/conductor-auto.py`, establishing a valid Red baseline without compilation or unhandled module load crashes.

---

## 2. Invariants & Critical Guardrails

1. **Strict TDD Red Phase Protocol ([AGENTS.md](../../../AGENTS.md) Section 5 & `conductor/workflow.md`):**
   - The scope of Task 1 is strictly restricted to test authoring in `scripts/__tests__/test_conductor_auto.py`.
   - **Zero Production Changes:** `scripts/agent/conductor-auto.py` and application code MUST NOT be modified in this task. Production implementation is exclusively scheduled for Task 2 (TDD Green phase).
   - All tests MUST fail cleanly with `AssertionError`, demonstrating that the test harness actively asserts the missing capability.
2. **Supervisor Dual-Check Invariant Alignment (Spec Section 2.3):**
   - Tests must fail via assertion errors (`AssertionError` / `self.fail()`), rejecting syntax or module crash errors.
   - If `scripts/agent/conductor-auto.py` is not yet present during Task 1, the test harness handles module loading gracefully by asserting the missing symbols via `self.fail()`, ensuring standard `unittest` `FAIL:` status rather than `ERROR:`.
3. **Execution Environment:**
   - Host Python 3.11 runtime:
     `python3.11 -m unittest scripts/__tests__/test_conductor_auto.py`
4. **Modal Approval Invariant (`conductor_antigravity.md` & [AGENTS.md](../../../AGENTS.md) Section 2):**
   - Under `/plan` or any confirmation gate, halt and await explicit affirmative user approval via `ask_question` before modifying any files.

---

## 3. Target Files & Semantic Insertion Anchors

### 3.1 Test Suite Seam: Unit Tests
- **Path:** `scripts/__tests__/test_conductor_auto.py`
- **Semantic Insertion Anchor:** New file creation. Contains 6 test classes:
  1. `TestTrackPlanParser(unittest.TestCase)`: Parsing phases, task statuses, checkmarks, commit SHAs, exempt tags, and active phase resolution.
  2. `TestPlanningPromptGeneration(unittest.TestCase)`: Subprocess prompt construction via `generate-prompt.py --plan`.
  3. `TestAgySubprocessProtocol(unittest.TestCase)`: Flag ordering, stdin pipe delivery, process group isolation (`os.setsid`), and timeout/signal propagation.
  4. `TestIdempotentPlanCache(unittest.TestCase)`: Plan file caching, non-empty checks, and `--force-plan` bypass.
  5. `TestPostPlanInvariants(unittest.TestCase)`: Markdown blueprint existence and porcelain git tree cleanliness audit.
  6. `TestTier1PlanningDispatch(unittest.TestCase)`: Full Tier 1 turn lifecycle orchestration and cache branching.

---

## 4. Signatures, Types & Data Contracts

The test suite will exercise and validate the following contracts to be implemented in `scripts/agent/conductor-auto.py` during Task 2:

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

### 4.2 Function Signatures & Behavioral Contracts

```python
def parse_track_plan(track_path_or_name: Union[str, Path]) -> Dict[int, PhaseInfo]:
    """Parses track plan.md, extracting phases, tasks, subtasks, statuses, and commit SHAs."""
    ...

def get_active_phase(
    phases: Dict[int, PhaseInfo],
    target_phase: Optional[int] = None,
) -> Optional[PhaseInfo]:
    """Resolves the target or first incomplete phase from parsed plan."""
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
    """Invokes generate-prompt.py via subprocess to obtain turn prompt (--plan or --exec)."""
    ...

def build_agy_command(
    mode: str,
    model: str,
    extra_flags: Optional[List[str]] = None,
) -> List[str]:
    """Builds agy command ensuring configuration flags strictly precede --print."""
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
```

---

## 5. Precise Behavioral Logic & Test Scenarios

### 5.1 Test Suite 1: `TestTrackPlanParser`
1. **`test_parse_track_plan_phases_and_checkpoints`:**
   - **Setup:** Create a temporary `plan.md` containing completed Phase 1 (`## Phase 1: Setup [checkpoint: abc1234]`), active Phase 2 (`## Phase 2: Core Engine`), and Phase 3 without tasks.
   - **Assertions:**
     - `phases[1].checkpoint_sha == "abc1234"` and `phases[1].is_complete is True`.
     - `phases[2].checkpoint_sha is None` and `phases[2].name == "Core Engine"`.
     - `phases[2].raw_heading == "## Phase 2: Core Engine"`.
2. **`test_parse_track_plan_task_statuses_and_metadata`:**
   - **Setup:** Temporary `plan.md` containing:
     - `- [x] Task: Test baseline (1122334)`
     - `- [~] Task: In progress work`
     - `- [ ] Task: Write failing tests [exempt: scripts]`
     - `- [-] Task: Deprecated subtask`
     - `- [ ] Task: Conductor - User Manual Verification 'Phase 2' (Protocol in workflow.md)`
     - Subtasks indented under tasks.
   - **Assertions:**
     - Task 1: `status == "complete"`, `status_char == "x"`, `commit_sha == "1122334"`, `is_checkpoint is False`.
     - Task 2: `status == "in_progress"`, `status_char == "~"`.
     - Task 3: `status == "pending"`, `status_char == " "`, `exempt == "scripts"`.
     - Task 4: `status == "skipped"`, `status_char == "-"`.
     - Task 5: `status == "pending"`, `is_checkpoint is True`.
     - Subtasks correctly attached to parent task.
3. **`test_get_active_phase_resolution`:**
   - **Assertions:**
     - Calling `get_active_phase(phases)` returns Phase 2 (first incomplete phase).
     - Calling `get_active_phase(phases, target_phase=1)` explicitly returns Phase 1.
     - Calling `get_active_phase(phases, target_phase=99)` returns `None`.
4. **`test_get_pending_tasks_filtering`:**
   - **Assertions:**
     - Calling `get_pending_tasks(phases[2])` includes only Task 2 (`in_progress`) and Task 3 (`pending`), excluding Task 1 (`complete`) and Task 4 (`skipped`).

### 5.2 Test Suite 2: `TestPlanningPromptGeneration`
1. **`test_generate_turn_prompt_invokes_generate_prompt_plan`:**
   - **Setup:** Mock `subprocess.run`.
   - **Action:** Invoke `generate_turn_prompt("conductor-auto-runner_20261112", 3, 1, mode="plan")`.
   - **Assertions:**
     - Assert `subprocess.run` was called with `[sys.executable, str(GENERATE_PROMPT_PATH), "conductor-auto-runner_20261112", "3", "1", "--plan"]`.
     - Assert returns stripped stdout output containing `# Conductor Implementation Plan Request`.
2. **`test_generate_turn_prompt_raises_on_subprocess_error`:**
   - **Setup:** Mock `subprocess.run` returning `returncode=1` with `stderr="Error: track not found"`.
   - **Assertions:**
     - Assert raises `RuntimeError` (or `ProcessExecutionError`) with message citing stderr details.

### 5.3 Test Suite 3: `TestAgySubprocessProtocol`
1. **`test_build_agy_command_strict_flag_ordering`:**
   - **Action:** Call `build_agy_command(mode="plan", model="gemini-3.8-flash-high")`.
   - **Assertions:**
     - Command contains `["agy", "--mode", "plan", "--model", "gemini-3.8-flash-high", "--dangerously-skip-permissions", "--print"]`.
     - Assert `--print` is the final flag.
     - Assert index of `--mode` < index of `--print`.
     - Assert index of `--model` < index of `--print`.
     - Assert index of `--dangerously-skip-permissions` < index of `--print`.
2. **`test_run_agy_turn_stdin_prompt_delivery_and_session_isolation`:**
   - **Setup:** Mock `subprocess.Popen`.
   - **Action:** Call `run_agy_turn(prompt="Sample Planner Prompt", mode="plan", model="gemini-3.8-flash-high")`.
   - **Assertions:**
     - Assert `Popen` received `stdin=subprocess.PIPE`.
     - Assert `Popen` received `start_new_session=True` (or `preexec_fn=os.setsid`).
     - Assert `proc.communicate(input="Sample Planner Prompt")` was called.
     - Assert prompt text was NOT embedded in the CLI argv list.
3. **`test_run_agy_turn_timeout_process_group_termination`:**
   - **Setup:** Mock `subprocess.Popen` where `communicate` raises `subprocess.TimeoutExpired(cmd=["agy"], timeout=900)`. Mock `os.killpg` and `os.getpgid`.
   - **Action:** Call `run_agy_turn(prompt="Prompt", timeout=900.0)`.
   - **Assertions:**
     - Assert `os.killpg` called with `signal.SIGTERM` on process group.
     - Assert `os.killpg` called with `signal.SIGKILL` on process group if process does not exit.
     - Assert raises `subprocess.TimeoutExpired` or `ProcessExecutionError`.
4. **`test_run_agy_turn_sigint_process_group_cleanup`:**
   - **Setup:** Mock `subprocess.Popen` where `communicate` raises `KeyboardInterrupt`. Mock `os.killpg`.
   - **Action:** Call `run_agy_turn(prompt="Prompt")`.
   - **Assertions:**
     - Assert `os.killpg` called with `signal.SIGTERM` / `signal.SIGKILL`.
     - Assert `KeyboardInterrupt` is re-raised cleanly after killing child group.

### 5.4 Test Suite 4: `TestIdempotentPlanCache`
1. **`test_check_plan_cache_missing_file_returns_false`:**
   - With non-existent `phase-3-task-1-plan.md`, `check_plan_cache` returns `(False, path)`.
2. **`test_check_plan_cache_existing_non_empty_returns_true`:**
   - With `phase-3-task-1-plan.md` containing `# Implementation Plan`, `check_plan_cache` returns `(True, path)`.
3. **`test_check_plan_cache_empty_file_returns_false`:**
   - With `phase-3-task-1-plan.md` having 0 bytes, `check_plan_cache` returns `(False, path)`.
4. **`test_check_plan_cache_force_plan_bypasses_cache`:**
   - With non-empty plan file and `force_plan=True`, `check_plan_cache` returns `(False, path)`.

### 5.5 Test Suite 5: `TestPostPlanInvariants`
1. **`test_assert_post_plan_invariants_passes_when_clean`:**
   - **Setup:** Plan file exists with content > 0 bytes; mock `git status --porcelain` returning `?? conductor/tracks/.../phase-3-task-1-plan.md`.
   - **Assertion:** `assert_post_plan_invariants` returns cleanly without raising.
2. **`test_assert_post_plan_invariants_fails_when_plan_missing_or_empty`:**
   - **Setup:** Plan file does not exist or has size 0.
   - **Assertion:** Raises `PlanInvariantError` with message indicating missing/empty blueprint.
3. **`test_assert_post_plan_invariants_fails_when_production_code_modified`:**
   - **Setup:** Plan file exists; mock `git status --porcelain` returning:
     ```
     M lib/services/tripService.ts
     ?? conductor/tracks/test/phase-3-task-1-plan.md
     ```
   - **Assertion:** Raises `PlanInvariantError` citing modified application files (`lib/services/tripService.ts`), asserting strict fail-fast policy.

### 5.6 Test Suite 6: `TestTier1PlanningDispatch`
1. **`test_dispatch_tier1_planning_skips_when_cached`:**
   - Mock `check_plan_cache` returning `(True, plan_file)`.
   - Assert `run_agy_turn` is NOT called.
   - Assert returns `True`.
2. **`test_dispatch_tier1_planning_executes_turn_and_audits_invariants`:**
   - Mock `check_plan_cache` returning `(False, plan_file)`.
   - Mock `generate_turn_prompt` returning `"Planner prompt"`.
   - Mock `run_agy_turn` returning `(0, "Agy output", "")`.
   - Mock `assert_post_plan_invariants`.
   - Assert `run_agy_turn` called with `mode="plan"` and `model="gemini-3.8-flash-high"`.
   - Assert `assert_post_plan_invariants` called.
   - Assert returns `True`.

---

## 6. Execution Verification Protocol

### 6.1 Run Targeted Red Unit Tests
Execute the new test suite to confirm clean Red phase failures (`FAIL:` via `AssertionError`):

```bash
python3.11 -m unittest scripts/__tests__/test_conductor_auto.py
```
**Expected Outcome:** `FAILED (failures=N, errors=0)`. All tests fail cleanly asserting the missing `conductor-auto.py` module or functions, without unexpected syntax crashes or unhandled module errors.

### 6.2 Run Pre-Existing Baseline Tests (No Regression)
Execute all pre-existing prompt generator tests to verify 100% green baseline preservation:

```bash
python3.11 -m unittest scripts/__tests__/test_generate_prompt.py
```
**Expected Outcome:** `OK` (all tests pass cleanly with exit code `0`).

### 6.3 Git Tree Cleanliness Verification
Verify that ONLY the new test file has been authored:

```bash
git status --short
```
**Expected Outcome:** Only `?? scripts/__tests__/test_conductor_auto.py` is present. No application or runner production files modified.

---

## 7. Post-Execution Protocol & Git Notes

Upon confirming the tests fail cleanly with expected assertion errors:

### 7.1 Stage & Commit Red Test Changes
```bash
git add scripts/__tests__/test_conductor_auto.py
git commit -m "test(agent): add failing unit tests for track plan parsing, Tier 1 planning turn assertions, process group isolation, flag ordering, and idempotent plan caching (TDD Red phase)"
```

### 7.2 Attach Git Note
Obtain commit hash (`COMMIT_HASH=$(git log -1 --format="%H")`) and attach the standard metadata note:

```bash
git notes add -m "Task: Write failing unit tests for track plan parsing, task status extraction, Tier 1 planning turn assertions, process group isolation, flag ordering, and idempotent plan caching (TDD Red phase)
Summary: Created scripts/__tests__/test_conductor_auto.py covering track plan parsing (phases, statuses, commit SHAs, exempt annotations, checkpoint tasks), planning prompt generation, agy subprocess flag ordering and stdin delivery, POSIX process group isolation (os.setsid), timeout/signal cleanup, idempotent plan caching, post-plan invariant audits (verifying zero production modifications), and full Tier 1 turn orchestration. Confirmed clean assertion failures establishing the Red baseline for Phase 3 Task 2.
Files: scripts/__tests__/test_conductor_auto.py
Rationale: Strict TDD Red phase for Issue #162 Phase 3 Task 1 establishing the comprehensive test harness for conductor-auto.py Tier 1 planning capabilities." $COMMIT_HASH
```

### 7.3 Update Conductor Plan
Update `conductor/tracks/conductor-auto-runner_20261112/plan.md`:
- Change `- [ ] Task: Write failing unit tests for track plan parsing, task status extraction, Tier 1 planning turn assertions, process group isolation, flag ordering, and idempotent plan caching (TDD Red phase)` to `- [x] Task: Write failing unit tests for track plan parsing, task status extraction, Tier 1 planning turn assertions, process group isolation, flag ordering, and idempotent plan caching (TDD Red phase) [commit: <short_sha>]`.
- Stage `conductor/tracks/conductor-auto-runner_20261112/plan.md`.
- Commit with:
  ```bash
  git commit -m "conductor(plan): Mark task 'Write failing unit tests for track plan parsing, task status extraction, Tier 1 planning turn assertions, process group isolation, flag ordering, and idempotent plan caching' as complete"
  ```

---

## 8. Confirmation Gate

Halt immediately. Do NOT create `scripts/__tests__/test_conductor_auto.py` or modify any repository files until explicit affirmative user approval is received via the `ask_question` modal.
