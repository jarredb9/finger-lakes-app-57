# Implementation Plan: Phase 4 Task 2 — Implement Tier 2 Execution, Supervisor Invariant Verification, Dual-Check Red Parsing, and Git Notes Audit in `conductor-auto.py` (TDD Green phase)

**Track:** `conductor-auto-runner_20261112` (Issue [#162](https://github.com/jarredb9/finger-lakes-app-57/issues/162))  
**Phase:** 4 (Execution Tier (`Tier 2`) and Supervisor Invariant Verification)  
**Task:** 2 (Implement Tier 2 execution, supervisor invariant verification, dual-check Red parsing, and git notes audit in `conductor-auto.py` — TDD Green phase)  
**Track Specification:** [conductor/tracks/conductor-auto-runner_20261112/spec.md](./spec.md)  
**Track Plan:** [conductor/tracks/conductor-auto-runner_20261112/plan.md](./plan.md)  
**Preceding Task Plan:** [conductor/tracks/conductor-auto-runner_20261112/phase-4-task-1-plan.md](./phase-4-task-1-plan.md)  
**Workflow Reference:** [conductor/workflow.md](../../workflow.md)  
**Operating Principles:** [AGENTS.md](../../../AGENTS.md)  

---

## 1. Executive Summary & Objective

### 1.1 Objective
Implement the production code in `scripts/agent/conductor-auto.py` to turn all 23 failing unit tests in `scripts/__tests__/test_conductor_auto.py` completely green (TDD Green phase).

Specifically:
1. **Supervisor Custom Exceptions:** Define `SupervisorInvariantError` and `GitTreeDirtyError` subclassing `ConductorAutoError`.
2. **Working Tree Cleanliness & Recovery Flow:**
   - Implement `check_working_tree_cleanliness(cwd=None)` parsing porcelain git status to detect dirty untracked or modified files.
   - Implement `dispatch_recovery_turn(...)` generating `--recovery` turn prompts and running `agy --mode auto` to commit leftover work.
3. **Failure Marker Parsing Engine:**
   - Implement `parse_test_failure_markers(output, runner_hint=None)` to differentiate valid assertion failures (`expect(...)`, `AssertionError`, `FAIL:`) from syntax, module load, and runtime crashes (`SyntaxError`, `Cannot find module`, `ImportError`, `ERROR:`).
4. **Active Supervisor Verification Gates:**
   - Implement `verify_red_task(...)`: Executes target test, asserts non-zero exit, parses assertion markers, and verifies 0 production files modified.
   - Implement `verify_green_task(...)`: Executes target test and `npm run type-check`, asserting both exit 0.
   - Implement `verify_exempt_task(...)`: Executes category-specific gates (`ui`/`styling` -> `npm run build`, `infra`/`scripts` -> `npm run lint`, `types` -> `npm run type-check`, `docs` -> markdown-only git diff and non-empty file check).
   - Implement `verify_task_execution(...)`: High-level router dispatching to red, green, or exempt verification based on task metadata.
5. **Git Commit & Notes Auditor:**
   - Implement `audit_git_commit_and_notes(...)`: Validates Conventional Commit message format, required `git notes` metadata (`Task:`, `Summary:`, `Files:`, `Rationale:`), `plan.md` task completion mark `[x]` with 7-character commit SHA, and `conductor(plan)` commit existence.
6. **Tier 2 Execution Orchestrator:**
   - Implement `dispatch_tier2_execution(...)`: Orchestrates the complete Tier 2 turn (prompt generation -> agy execution -> working tree check / auto-recovery -> active supervisor verification -> git commit & notes audit).
   - Integrate Tier 2 dispatch into `main()` sequential loop following Tier 1 planning.

---

## 2. Invariants & Critical Guardrails

1. **Strict TDD Green Phase Protocol ([AGENTS.md](../../../AGENTS.md) Section 5 & `conductor/workflow.md`):**
   - The scope of Task 2 is strictly restricted to production implementation in `scripts/agent/conductor-auto.py` to satisfy the tests established in Task 1.
   - Existing unit tests in `scripts/__tests__/test_conductor_auto.py` and `scripts/__tests__/test_generate_prompt.py` MUST NOT be modified or weakened.
2. **Zero-Amnesia Subprocess Flag Order (Spec Section 2.1):**
   - In all `agy` invocations, configuration flags (`--mode`, `--model`, `--dangerously-skip-permissions`) must strictly precede the `--print` flag.
3. **Process Group Isolation & Timeouts (Spec Section 2.1):**
   - All `agy` subprocesses are spawned with `start_new_session=True` (`os.setsid`) and terminated cleanly on timeout or interrupt via process group signals (`SIGTERM` -> `SIGKILL`).
4. **Supervisor Dual-Check Invariant (Spec Section 2.3):**
   - Red task verification must reject test failures caused by syntax, import, or module crashes, ensuring tests fail solely due to assertion mismatches.
   - Red tasks must modify zero production application files (test files and conductor metadata only).
5. **Execution Environment:**
   - Host Python 3.11 runtime:
     `python3.11 -m unittest scripts/__tests__/test_conductor_auto.py`
6. **Modal Approval Invariant (`conductor_antigravity.md` & [AGENTS.md](../../../AGENTS.md) Section 2):**
   - Under `/plan` or any confirmation gate, halt and await explicit affirmative user approval via `ask_question` before modifying any files.

---

## 3. Target Files & Semantic Insertion Anchors

### 3.1 Production Seam: Conductor Auto-Runner
- **Path:** `scripts/agent/conductor-auto.py`
- **Semantic Insertion Anchors:**
  1. **Anchor 1 (Lines 44–61 — Custom Exceptions):**
     Immediately after `ProcessExecutionError(ConductorAutoError)`, insert:
     - `SupervisorInvariantError(ConductorAutoError)`
     - `GitTreeDirtyError(SupervisorInvariantError)`
  2. **Anchor 2 (Lines 504–545 — Production File Detection & Post-Plan Invariants):**
     Immediately after `assert_post_plan_invariants`, insert:
     - `_is_red_task_production_violation(filepath: str) -> bool`
     - `check_working_tree_cleanliness(cwd: Optional[Path] = None) -> Tuple[bool, List[str]]`
     - `dispatch_recovery_turn(track_name: str, phase_num: int, task_num: int, exec_model: str = "gemini-3.8-flash-medium", timeout: float = 900.0, cwd: Optional[Path] = None) -> bool`
     - `parse_test_failure_markers(output: str, runner_hint: Optional[str] = None) -> Tuple[bool, str]`
     - `verify_red_task(test_cmd: str, base_sha: str, head_sha: str = "HEAD", cwd: Optional[Path] = None) -> bool`
     - `verify_green_task(test_cmd: str, cwd: Optional[Path] = None, type_check_cmd: str = "npm run type-check") -> bool`
     - `verify_exempt_task(exempt_category: str, base_sha: Optional[str] = None, head_sha: str = "HEAD", cwd: Optional[Path] = None) -> bool`
     - `audit_git_commit_and_notes(task: TaskInfo, commit_sha: str, plan_path: Path, cwd: Optional[Path] = None) -> bool`
     - `verify_task_execution(track_name: str, phase_num: int, task_num: int, base_sha: Optional[str] = None, cwd: Optional[Path] = None) -> bool`
  3. **Anchor 3 (Lines 602–604 — Tier 1 Dispatch):**
     Immediately after `dispatch_tier1_planning`, insert:
     - `dispatch_tier2_execution(track_name: str, phase_num: int, task_num: int, exec_model: str = "gemini-3.8-flash-medium", auto_recover: bool = False, timeout: float = 900.0, cwd: Optional[Path] = None) -> bool`
  4. **Anchor 4 (Lines 712–733 — CLI Main Loop):**
     Inside `main()`, immediately following `dispatch_tier1_planning(...)`, append the Tier 2 execution invocation:
     - Check `--dry-run` simulation for Tier 2.
     - Call `dispatch_tier2_execution(...)`.
     - Catch `ConductorAutoError` and report failure with exit code 1.

---

## 4. Signatures, Types & Data Contracts

### 4.1 Custom Exceptions (Python 3.11)
```python
class SupervisorInvariantError(ConductorAutoError):
    """Raised when Tier 2 execution violates working tree, test, commit, or git note invariants."""
    pass


class GitTreeDirtyError(SupervisorInvariantError):
    """Raised when uncommitted or untracked changes remain after execution/recovery."""
    pass
```

### 4.2 Function Signatures & Data Contracts
```python
def check_working_tree_cleanliness(
    cwd: Optional[Path] = None,
) -> Tuple[bool, List[str]]:
    """Runs git status --porcelain. Returns (is_clean, dirty_files)."""
    ...


def dispatch_recovery_turn(
    track_name: str,
    phase_num: int,
    task_num: int,
    exec_model: str = "gemini-3.8-flash-medium",
    timeout: float = 900.0,
    cwd: Optional[Path] = None,
) -> bool:
    """Dispatches a single recovery turn via generate-prompt.py --recovery to clean up uncommitted work."""
    ...


def parse_test_failure_markers(
    output: str,
    runner_hint: Optional[str] = None,
) -> Tuple[bool, str]:
    """Parses test runner stdout/stderr for assertion failure markers vs syntax/runtime errors.
    
    Returns:
        (is_valid_assertion_failure: bool, reason: str)
    """
    ...


def _is_red_task_production_violation(filepath: str) -> bool:
    """Returns True if a modified file in Red phase belongs to production application code (violating test purity)."""
    ...


def verify_red_task(
    test_cmd: str,
    base_sha: str,
    head_sha: str = "HEAD",
    cwd: Optional[Path] = None,
) -> bool:
    """Performs dual-check verification for Red tasks:
    1. Test command exits non-zero.
    2. Output contains assertion failure markers, not syntax/import errors.
    3. Zero production files were modified between base_sha and head_sha.
    Raises SupervisorInvariantError on any violation.
    """
    ...


def verify_green_task(
    test_cmd: str,
    cwd: Optional[Path] = None,
    type_check_cmd: str = "npm run type-check",
) -> bool:
    """Performs verification for Green tasks:
    1. Test command exits 0.
    2. Type-check command exits 0.
    Raises SupervisorInvariantError if either fails.
    """
    ...


def verify_exempt_task(
    exempt_category: str,
    base_sha: Optional[str] = None,
    head_sha: str = "HEAD",
    cwd: Optional[Path] = None,
) -> bool:
    """Executes category-specific invariant verification for exempt tasks:
    - 'ui' / 'styling': npm run build (exit 0)
    - 'infra' / 'scripts': npm run lint (exit 0)
    - 'types': npm run type-check (exit 0)
    - 'docs': git diff verifies only .md files modified and non-empty.
    Raises SupervisorInvariantError on violation.
    """
    ...


def audit_git_commit_and_notes(
    task: TaskInfo,
    commit_sha: str,
    plan_path: Path,
    cwd: Optional[Path] = None,
) -> bool:
    """Audits git commit message, git notes metadata, plan.md task mark, and plan commit.
    Raises SupervisorInvariantError on violation.
    """
    ...


def verify_task_execution(
    track_name: str,
    phase_num: int,
    task_num: int,
    base_sha: Optional[str] = None,
    cwd: Optional[Path] = None,
) -> bool:
    """High-level supervisor router: resolves task metadata and dispatches red, green, or exempt verification."""
    ...


def dispatch_tier2_execution(
    track_name: str,
    phase_num: int,
    task_num: int,
    exec_model: str = "gemini-3.8-flash-medium",
    auto_recover: bool = False,
    timeout: float = 900.0,
    cwd: Optional[Path] = None,
) -> bool:
    """Coordinates Tier 2 execution turn:
    1. Captures base HEAD SHA.
    2. Generates execution prompt via generate-prompt.py --exec.
    3. Dispatches agy --mode auto turn.
    4. Checks working tree cleanliness (invoking recovery if --auto-recover).
    5. Audits active task verification (Red, Green, or Exempt).
    6. Audits git commit, notes, and plan.md update.
    Returns True on success; raises ConductorAutoError on failure.
    """
    ...
```

---

## 5. Precise Behavioral Logic & Implementation Details

### 5.1 Working Tree Cleanliness (`check_working_tree_cleanliness`)
- Execute `subprocess.run(["git", "status", "--porcelain"], capture_output=True, text=True, cwd=cwd or PROJECT_ROOT)`.
- If `res.returncode != 0`: raise `ProcessExecutionError(f"git status failed: {res.stderr}")`.
- Parse lines:
  - Strip whitespace. If line is empty, ignore.
  - Extract filename: `file_part = line[2:].strip()`. If `" -> "` in `file_part`, split and take the target file: `file_part.split(" -> ")[-1].strip()`.
  - Collect into `dirty_files`.
- Return `(len(dirty_files) == 0, dirty_files)`.

### 5.2 Single-Turn Auto-Recovery (`dispatch_recovery_turn`)
- Set `work_dir = cwd or PROJECT_ROOT`.
- Resolve `track_dir = resolve_track_dir(track_name) or (work_dir / "conductor" / "tracks" / track_name).resolve()`.
- Set `log_file = track_dir / "logs" / f"phase-{phase_num}-task-{task_num}-recovery.log"`.
- Generate recovery prompt: `prompt = generate_turn_prompt(track=track_name, phase_num=phase_num, task_num=task_num, mode="recovery", cwd=work_dir)`.
- Execute turn: `ret, stdout, stderr = run_agy_turn(prompt=prompt, mode="auto", model=exec_model, timeout=timeout, cwd=work_dir, log_file=log_file)`.
- If `ret != 0`: raise `ProcessExecutionError(f"Recovery turn failed with exit code {ret}: {stderr.strip()}")`.
- Return `True`.

### 5.3 Test Failure Marker Parsing (`parse_test_failure_markers`)
- Define syntax / runtime error patterns (must be rejected even if exit != 0):
  ```python
  SYNTAX_ERROR_PATTERNS = [
      re.compile(r"\bSyntaxError\b", re.IGNORECASE),
      re.compile(r"Cannot find module\b", re.IGNORECASE),
      re.compile(r"\bReferenceError\b", re.IGNORECASE),
      re.compile(r"\bImportError\b", re.IGNORECASE),
      re.compile(r"\bModuleNotFoundError\b", re.IGNORECASE),
      re.compile(r"^ERROR:\s+", re.MULTILINE),
      re.compile(r"\bTS\d{4}:", re.IGNORECASE),
  ]
  ```
- Define assertion failure patterns:
  ```python
  ASSERTION_PATTERNS = [
      re.compile(r"expect\(", re.IGNORECASE),
      re.compile(r"\bExpected:\s+", re.IGNORECASE),
      re.compile(r"\bReceived:\s+", re.IGNORECASE),
      re.compile(r"\bAssertionError\b", re.IGNORECASE),
      re.compile(r"^FAIL:\s+", re.MULTILINE),
      re.compile(r"FAILED \(failures=", re.IGNORECASE),
      re.compile(r"\bassert\s+", re.IGNORECASE),
  ]
  ```
- **Evaluation Order:**
  1. Check `SYNTAX_ERROR_PATTERNS` first. If any matches:
     `return False, f"Syntax/module load error detected: {match.group(0)}"`
  2. Check `ASSERTION_PATTERNS`. If any matches:
     `return True, f"Assertion failure detected: {match.group(0)}"`
  3. If neither matches:
     `return False, "No assertion failure markers detected in test output"`

### 5.4 Production Code Violation Check for Red Tasks (`_is_red_task_production_violation`)
- Normalize path: replace backslashes with slashes.
- Allowed in Red phase (test files and metadata):
  - In directories: `conductor/`, `.conductor/`, `.gemini/`, `.agents/`, `.claude/`
  - In test directories or test files:
    - `"__tests__/"` in path, `"tests/"` in path, `"test/"` in path, `"e2e/"` in path.
    - Suffixes: `.test.ts`, `.test.tsx`, `.test.js`, `.test.jsx`, `.spec.ts`, `.spec.tsx`, `test_*.py`.
- Production violation:
  - Prefixes: `app/`, `lib/`, `components/`, `supabase/`, `hooks/`, `types/`, `public/`, `scripts/`, `src/`.
  - Config files: `package.json`, `package-lock.json`, `tsconfig.json`.
  - Code extensions: `.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.sql`, `.css`.
- Return `True` if file is production code outside test seams; `False` if test/metadata file.

### 5.5 Red Task Active Verification (`verify_red_task`)
- Set `work_dir = cwd or PROJECT_ROOT`.
- Parse command: `cmd = test_cmd if isinstance(test_cmd, list) else test_cmd.split()`.
- Run test command: `res = subprocess.run(cmd, capture_output=True, text=True, cwd=work_dir)`.
- **Dual Check 1 (Exit != 0):**
  If `res.returncode == 0`:
    raise `SupervisorInvariantError(f"Red task test unexpectedly passed (exit code 0): {test_cmd}")`.
- **Dual Check 2 (Assertion Failure Parsing):**
  `combined_output = (res.stdout or "") + "\n" + (res.stderr or "")`.
  `is_valid, reason = parse_test_failure_markers(combined_output)`.
  If not `is_valid`:
    raise `SupervisorInvariantError(f"Red task failed due to syntax/module error, not assertion failure: {reason}")`.
- **Dual Check 3 (Zero Production Files Modified):**
  `diff_res = subprocess.run(["git", "diff", "--name-only", base_sha, head_sha], capture_output=True, text=True, cwd=work_dir)`.
  If `diff_res.returncode != 0`:
    raise `ProcessExecutionError(f"git diff failed: {diff_res.stderr}")`.
  For file in `diff_res.stdout.splitlines()`:
    `f = file.strip()`.
    If not `f`: continue.
    If `_is_red_task_production_violation(f)`:
      raise `SupervisorInvariantError(f"Red task modified production code: {f}")`.
- Return `True`.

### 5.6 Green Task Active Verification (`verify_green_task`)
- Set `work_dir = cwd or PROJECT_ROOT`.
- Run test command:
  `cmd = test_cmd if isinstance(test_cmd, list) else test_cmd.split()`.
  `res = subprocess.run(cmd, capture_output=True, text=True, cwd=work_dir)`.
  If `res.returncode != 0`:
    raise `SupervisorInvariantError(f"Green task test command failed (exit code {res.returncode}): {res.stderr or res.stdout}")`.
- Run typecheck command:
  `tc_cmd = type_check_cmd if isinstance(type_check_cmd, list) else type_check_cmd.split()`.
  `tc_res = subprocess.run(tc_cmd, capture_output=True, text=True, cwd=work_dir)`.
  If `tc_res.returncode != 0`:
    raise `SupervisorInvariantError(f"Green task type-check failed (exit code {tc_res.returncode}): {tc_res.stderr or tc_res.stdout}")`.
- Return `True`.

### 5.7 Exempt Task Active Verification (`verify_exempt_task`)
- Set `work_dir = cwd or PROJECT_ROOT`.
- Normalize category: `cat = exempt_category.lower().strip()`.
- **`ui` / `styling`:**
  Execute `subprocess.run(["npm", "run", "build"], capture_output=True, text=True, cwd=work_dir)`.
  If `returncode != 0`: raise `SupervisorInvariantError(f"Exempt UI task build failed with exit code {res.returncode}")`.
- **`infra` / `scripts`:**
  Execute `subprocess.run(["npm", "run", "lint"], capture_output=True, text=True, cwd=work_dir)`.
  If `returncode != 0`: raise `SupervisorInvariantError(f"Exempt infra/scripts task lint failed with exit code {res.returncode}")`.
- **`types`:**
  Execute `subprocess.run(["npm", "run", "type-check"], capture_output=True, text=True, cwd=work_dir)`.
  If `returncode != 0`: raise `SupervisorInvariantError(f"Exempt types task type-check failed with exit code {res.returncode}")`.
- **`docs`:**
  Base SHA check: `base = base_sha or "HEAD~1"`.
  `res = subprocess.run(["git", "diff", "--name-only", base, head_sha], capture_output=True, text=True, cwd=work_dir)`.
  If `res.returncode != 0`: raise `ProcessExecutionError(f"git diff failed: {res.stderr}")`.
  For file in `res.stdout.splitlines()`:
    `f = file.strip()`.
    If not `f`: continue.
    If not (f.endswith(".md") or f.endswith(".markdown")):
      raise `SupervisorInvariantError(f"Exempt docs task modified non-markdown file: {f}")`.
    Check file non-empty:
      `target_path = work_dir / f`.
      If not target_path.exists() or target_path.stat().st_size == 0:
        raise `SupervisorInvariantError(f"Exempt docs task created empty file or file missing: {f}")`.
- Return `True`.

### 5.8 Git Commit, Notes & Plan Audit (`audit_git_commit_and_notes`)
- Set `work_dir = cwd or PROJECT_ROOT`.
- **Audit 1: Conventional Commit Message:**
  Execute `subprocess.run(["git", "log", "-1", "--format=%B", commit_sha], capture_output=True, text=True, cwd=work_dir)`.
  If `returncode != 0`: raise `ProcessExecutionError(f"git log failed for commit {commit_sha}: {res.stderr}")`.
  `msg = res.stdout.strip()`.
  Conventional Commit regex:
  `CONVENTIONAL_COMMIT_RE = re.compile(r"^(feat|fix|test|refactor|perf|style|chore|docs|types|conductor)(\([a-zA-Z0-9_\-./]+\))?!?: .+$")`.
  If not `CONVENTIONAL_COMMIT_RE.match(msg)`:
    raise `SupervisorInvariantError(f"Commit message does not match Conventional Commit format: '{msg}'")`.
- **Audit 2: Git Notes Metadata:**
  Execute `subprocess.run(["git", "notes", "show", commit_sha], capture_output=True, text=True, cwd=work_dir)`.
  If `returncode != 0`: raise `SupervisorInvariantError(f"Git notes missing on commit {commit_sha}: {res.stderr}")`.
  `note_text = res.stdout`.
  Required fields: `["Task:", "Summary:", "Files:", "Rationale:"]`.
  For field in required fields:
    if field not in note_text:
      raise `SupervisorInvariantError(f"Git note missing required field: {field.rstrip(':')}")`.
- **Audit 3: `plan.md` Task Mark and SHA Update:**
  `plan_content = plan_path.read_text(encoding="utf-8")`.
  Check for completion mark `[x]` associated with `commit_sha`:
  `short_sha = commit_sha[:7]`.
  Verify that `plan_content` contains a task item marked `- [x]` containing `short_sha` (or `task.description` marked with `[x]` and `short_sha`).
  If not found:
    raise `SupervisorInvariantError(f"plan.md not updated with [x] and commit SHA {short_sha} for task '{task.description}'")`.
- **Audit 4: `conductor(plan)` Commit:**
  Execute `subprocess.run(["git", "log", "-1", "--format=%B", str(plan_path)], capture_output=True, text=True, cwd=work_dir)`.
  If `returncode != 0`: raise `ProcessExecutionError(f"git log for plan.md failed: {res.stderr}")`.
  `plan_commit = res.stdout.strip()`.
  If "conductor(plan)" not in plan_commit:
    raise `SupervisorInvariantError(f"Missing conductor(plan) commit for plan update. Latest commit: '{plan_commit}'")`.
- Return `True`.

### 5.9 Tier 2 Execution Dispatch (`dispatch_tier2_execution`)
- Set `work_dir = cwd or PROJECT_ROOT`.
- Resolve `track_dir = resolve_track_dir(track_name) or (work_dir / "conductor" / "tracks" / track_name).resolve()`.
- Set `log_file = track_dir / "logs" / f"phase-{phase_num}-task-{task_num}-exec.log"`.
- Capture `base_sha`:
  `head_res = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, cwd=work_dir)`.
  `base_sha = head_res.stdout.strip() if head_res.returncode == 0 else "HEAD~1"`.
- Generate execution prompt:
  `prompt = generate_turn_prompt(track=track_name, phase_num=phase_num, task_num=task_num, mode="exec", cwd=work_dir)`.
- Run agy turn:
  `ret, stdout, stderr = run_agy_turn(prompt=prompt, mode="auto", model=exec_model, timeout=timeout, cwd=work_dir, log_file=log_file)`.
  If `ret != 0`:
    raise `ProcessExecutionError(f"Tier 2 execution turn failed with exit code {ret}: {stderr.strip()}")`.
- Check working tree cleanliness:
  `is_clean, dirty_files = check_working_tree_cleanliness(cwd=work_dir)`.
  If not `is_clean`:
    if `auto_recover`:
      `dispatch_recovery_turn(track_name=track_name, phase_num=phase_num, task_num=task_num, exec_model=exec_model, timeout=timeout, cwd=work_dir)`.
      `is_clean, dirty_files = check_working_tree_cleanliness(cwd=work_dir)`.
      if not `is_clean`:
        raise `SupervisorInvariantError(f"Working tree remains dirty after recovery turn: {', '.join(dirty_files)}")`.
    else:
      raise `SupervisorInvariantError(f"Working tree contains uncommitted changes ({', '.join(dirty_files)}) and --auto-recover is disabled.")`.
- Execute active verification:
  `verify_task_execution(track_name=track_name, phase_num=phase_num, task_num=task_num, base_sha=base_sha, cwd=work_dir)`.
- Execute commit and notes audit:
  Resolve `task` and `commit_sha`:
  `phases = parse_track_plan(track_dir)`.
  `plan_path = track_dir / "plan.md"`.
  Find task in active phase; retrieve `commit_sha` (or fallback to `git rev-parse HEAD`).
  `audit_git_commit_and_notes(task=task, commit_sha=commit_sha, plan_path=plan_path, cwd=work_dir)`.
- Return `True`.

### 5.10 CLI Integration in `main()`
- In `main()`, for each task in `pending_tasks`:
  1. Skip checkpoint tasks (Gate 1 boundary).
  2. Run Tier 1 planning via `dispatch_tier1_planning(...)`.
  3. Run Tier 2 execution via `dispatch_tier2_execution(...)`.
     - Print progress banner: `Dispatching Tier 2 execution for Phase X Task Y: ...`
     - Handle `--dry-run`: print `[DRY-RUN] Would dispatch Tier 2 execution with model ...`
     - Catch `ConductorAutoError`, print error, return 1.

---

## 6. Execution Verification Protocol

### 6.1 Run Unit Tests for `conductor-auto.py`
Execute the full unit test suite covering Phase 3 and Phase 4:

```bash
python3.11 -m unittest scripts/__tests__/test_conductor_auto.py
```
**Expected Outcome:** `OK` (all tests pass cleanly with exit code `0`, confirming 100% green status across all test suites).

### 6.2 Run Prompt Generator Baseline Tests (Zero Regressions)
Execute all pre-existing prompt generator tests:

```bash
python3.11 -m unittest scripts/__tests__/test_generate_prompt.py
```
**Expected Outcome:** `OK` (all tests pass cleanly with exit code `0`).

### 6.3 Run Full Python Test Suite Discovery
Run unittest test discovery across all scripts:

```bash
python3.11 -m unittest discover -s scripts/__tests__
```
**Expected Outcome:** `OK` (zero failures, zero errors).

### 6.4 Git Tree Cleanliness Verification
Verify that ONLY `scripts/agent/conductor-auto.py` has been modified:

```bash
git status --short
```
**Expected Outcome:** Only `M scripts/agent/conductor-auto.py` is present. No uncommitted scratch files or untracked test artifacts.

---

## 7. Post-Execution Protocol & Git Notes

Upon confirming all unit tests pass with exit code 0:

### 7.1 Stage & Commit Implementation Changes
```bash
git add scripts/agent/conductor-auto.py
git commit -m "feat(agent): implement Tier 2 execution, supervisor invariant verification, and git notes audit in conductor-auto.py"
```

### 7.2 Attach Git Note
Obtain commit hash (`COMMIT_HASH=$(git log -1 --format="%H")`) and attach the standard metadata note:

```bash
git notes add -m "Task: Implement Tier 2 execution, supervisor invariant verification, dual-check Red parsing, and git notes audit in conductor-auto.py (TDD Green phase)
Summary: Implemented Tier 2 execution dispatch in scripts/agent/conductor-auto.py coordinating agy --mode auto execution turns with gemini-3.8-flash-medium. Added working tree cleanliness audit and single-turn recovery via generate-prompt.py --recovery on --auto-recover. Implemented active supervisor dual-check for Red tasks (exit != 0, test failure marker parsing rejecting syntax/import errors, and 0 production files modified), Green task verification (test exit 0 and npm run type-check exit 0), and category-specific Exempt checks (ui, infra, types, docs). Implemented git conventional commit, git notes metadata, plan.md task mark [x], and conductor(plan) commit auditing. All 23 Phase 4 unit tests pass cleanly.
Files: scripts/agent/conductor-auto.py
Rationale: Strict TDD Green phase completing Phase 4 Task 2 of Issue #162, establishing automated Tier 2 execution and supervisor invariant enforcement." $COMMIT_HASH
```

### 7.3 Update Conductor Plan
Update `conductor/tracks/conductor-auto-runner_20261112/plan.md`:
- Change `- [ ] Task: Implement Tier 2 execution, supervisor invariant verification, dual-check Red parsing, and git notes audit in \`conductor-auto.py\` (TDD Green phase)` to `- [x] Task: Implement Tier 2 execution, supervisor invariant verification, dual-check Red parsing, and git notes audit in \`conductor-auto.py\` (TDD Green phase) [commit: <short_sha>]`.
- Check all subtasks under Task 2.
- Stage `conductor/tracks/conductor-auto-runner_20261112/plan.md`.
- Commit with:
  ```bash
  git commit -m "conductor(plan): Mark task 'Implement Tier 2 execution, supervisor invariant verification, dual-check Red parsing, and git notes audit in conductor-auto.py' as complete"
  ```

---

## 8. Confirmation Gate

Halt immediately. Do NOT modify `scripts/agent/conductor-auto.py` or execute code changes until explicit affirmative user approval is received via the `ask_question` modal.
