# Implementation Plan: Phase 4 Task 1 — Write Failing Unit Tests for Tier 2 Execution Turn, Git Tree Assertions, Dual-Check Red Task Verification, Exempt Checks, and `--auto-recover` Flow (TDD Red phase)

**Track:** `conductor-auto-runner_20261112` (Issue [#162](https://github.com/jarredb9/finger-lakes-app-57/issues/162))  
**Phase:** 4 (Execution Tier (`Tier 2`) and Supervisor Invariant Verification)  
**Task:** 1 (Write failing unit tests for Tier 2 execution turn, git tree assertions, dual-check Red task verification, Exempt checks, and `--auto-recover` flow — TDD Red phase)  
**Track Specification:** [conductor/tracks/conductor-auto-runner_20261112/spec.md](./spec.md)  
**Track Plan:** [conductor/tracks/conductor-auto-runner_20261112/plan.md](./plan.md)  
**Preceding Task Plan:** [conductor/tracks/conductor-auto-runner_20261112/phase-3-task-2-plan.md](./phase-3-task-2-plan.md)  
**Workflow Reference:** [conductor/workflow.md](../../workflow.md)  
**Operating Principles:** [AGENTS.md](../../../AGENTS.md)  

---

## 1. Executive Summary & Objective

### 1.1 Objective
Author comprehensive, authoritative failing unit tests in `scripts/__tests__/test_conductor_auto.py` covering Phase 4: Execution Tier (`Tier 2`) and Supervisor Invariant Verification of `conductor-auto.py` (TDD Red phase).

Specifically:
1. **Tier 2 Execution Turn Dispatch (`TestTier2ExecutionDispatch`):**
   - Assert `generate_turn_prompt` is invoked with `mode="exec"` for Tier 2.
   - Assert `run_agy_turn` is dispatched with `mode="auto"`, default model `gemini-3.8-flash-medium` (or CLI override `--exec-model`), zero-amnesia flags (`--print --dangerously-skip-permissions`), and stdin prompt delivery.
   - Assert unredacted turn transcripts and tool outputs are teed to `conductor/tracks/<track>/logs/phase-X-task-Y-exec.log`.
   - Assert failure propagation (raising `ProcessExecutionError`) when `agy` execution exits non-zero or times out.
2. **Working Tree Cleanliness & `--auto-recover` Flow (`TestWorkingTreeAndAutoRecover`):**
   - Assert `check_working_tree_cleanliness` passes when `git status --porcelain` is clean (0 untracked or modified files).
   - Assert `check_working_tree_cleanliness` raises `SupervisorInvariantError` when uncommitted changes exist and `--auto-recover` is disabled (Exit code 1).
   - Assert that when dirty changes exist and `--auto-recover` is enabled:
     - Dispatches a single recovery turn via `generate-prompt.py --recovery` (mode `recovery`) using `gemini-3.8-flash-medium`.
     - Re-audits working tree: succeeds if recovery turn committed all changes.
     - Enforces single-turn limit: if working tree remains dirty after recovery turn, raises `SupervisorInvariantError` immediately without looping.
3. **Active Supervisor Verification for Red Tasks (`TestSupervisorRedTaskVerification`):**
   - Assert dual-check test execution: executes target test command and asserts exit code is non-zero (`exit != 0`).
   - If test command unexpectedly exits `0`, raises `SupervisorInvariantError` ("Red task must fail").
   - Assert test runner output parsing (`parse_test_failure_markers`):
     - Validates assertion failure markers: Jest `expect(...)` / `Expected:` / `Received:` / `AssertionError`; Python unittest `FAIL:`.
     - Rejects syntax/compilation/module errors: Jest `SyntaxError` / `Cannot find module` / `ReferenceError` / container launch failure; Python `ERROR:` / `ImportError` / `SyntaxError` / `ModuleNotFoundError`. Raises `SupervisorInvariantError` on syntax/module crashes.
   - Assert production code purity: runs `git diff --name-only <base_sha> HEAD` and asserts 0 modified application/production files (test files only; modifying `lib/`, `app/`, `scripts/agent/`, etc. raises `SupervisorInvariantError`).
4. **Active Supervisor Verification for Green Tasks (`TestSupervisorGreenTaskVerification`):**
   - Assert green task execution independently runs the target test command and asserts it exits `0`.
   - Assert green task execution independently runs `npm run type-check` (or configured typecheck) and asserts it exits `0`.
   - If test command fails or type-check fails, raises `SupervisorInvariantError`.
5. **Active Supervisor Verification for Exempt Tasks (`TestSupervisorExemptTaskVerification`):**
   - Assert bypass of Red/Green test assertions in favor of category-specific commands:
     - `ui` / `styling`: executes `npm run build` and asserts exit `0`.
     - `infra` / `scripts`: executes `npm run lint` and asserts exit `0`.
     - `types`: executes `npm run type-check` and asserts exit `0`.
     - `docs`: audits `git diff --name-only <base_sha> HEAD` ensuring only `.md` files were modified, and verifies modified markdown files exist and are non-empty. Raises `SupervisorInvariantError` if non-markdown files modified or files empty.
   - If verification command exits non-zero, raises `SupervisorInvariantError`.
6. **Git Commit & Git Notes Auditing (`TestGitCommitAndNotesAudit`):**
   - Assert task commit SHA exists and matches `^[a-f0-9]{7,40}$`.
   - Assert commit message matches Conventional Commit format: `^(feat|fix|test|refactor|perf|style|chore|docs|types|conductor)(\([a-zA-Z0-9_\-]+\))?:\s+.+$`.
   - Assert `git notes show <sha>` contains required Conductor metadata fields (`Task:`, `Summary:`, `Files:`, `Rationale:`).
   - Assert `plan.md` has been updated with `[x]` and 7-character commit SHA for the target task.
   - Assert separate plan update commit exists: `conductor(plan): Mark task '...' as complete`.
7. **Tier 2 Execution Turn Coordination (`TestTier2ExecutionCoordination`):**
   - Assert `dispatch_tier2_execution` orchestrates the complete Tier 2 lifecycle: prompt generation -> `agy` subprocess dispatch -> working tree audit / auto-recovery -> active supervisor verification (Red/Green/Exempt) -> git commit & notes audit.
   - Assert fail-fast halting at each step if an invariant is violated.
8. **Empirical Red Phase Confirmation:**
   - Confirm all test cases fail cleanly with `AssertionError` via `get_target(...)` against `scripts/agent/conductor-auto.py`, establishing a valid Red baseline with 0 errors (`failures=N, errors=0`).

---

## 2. Invariants & Critical Guardrails

1. **Strict TDD Red Phase Protocol ([AGENTS.md](../../../AGENTS.md) Section 5 & `conductor/workflow.md`):**
   - The scope of Task 1 is strictly restricted to test authoring in `scripts/__tests__/test_conductor_auto.py`.
   - **Zero Production Changes:** `scripts/agent/conductor-auto.py` and application code MUST NOT be modified in this task. Production implementation is exclusively scheduled for Task 2 (TDD Green phase).
   - All newly added tests MUST fail cleanly with `AssertionError`, demonstrating that the test harness actively asserts the missing capability.
2. **Supervisor Dual-Check Invariant Alignment (Spec Section 2.3):**
   - Red task tests must fail via assertion errors (`AssertionError` / `self.fail()`), rejecting syntax or module crash errors.
   - Missing Phase 4 functions in `scripts/agent/conductor-auto.py` must fail via `get_target(...)` with `self.fail("... is not yet implemented")`, ensuring standard `unittest` `FAIL:` status rather than unhandled `ERROR:`.
3. **Execution Environment:**
   - Host Python 3.11 runtime:
     `python3.11 -m unittest scripts/__tests__/test_conductor_auto.py`
4. **Modal Approval Invariant (`conductor_antigravity.md` & [AGENTS.md](../../../AGENTS.md) Section 2):**
   - Under `/plan` or any confirmation gate, halt and await explicit affirmative user approval via `ask_question` before modifying any files.

---

## 3. Target Files & Semantic Insertion Anchors

### 3.1 Test Suite Seam: Unit Tests
- **Path:** `scripts/__tests__/test_conductor_auto.py`
- **Semantic Insertion Anchor:** Line 576, immediately after class `TestTier1PlanningDispatch` and immediately preceding `if __name__ == "__main__":`.
- **Classes to Append:**
  1. `TestTier2ExecutionDispatch(unittest.TestCase)`: Testing execution prompt generation (`--exec`), `agy --mode auto` dispatch with `gemini-3.8-flash-medium`, tee logging, and process error propagation.
  2. `TestWorkingTreeAndAutoRecover(unittest.TestCase)`: Clean working tree assertion, dirty tree failure, single-turn `--auto-recover` prompt dispatch (`--recovery`), recovery success, and recovery single-turn limit enforcement.
  3. `TestSupervisorRedTaskVerification(unittest.TestCase)`: Dual-check verification (exit != 0, assertion markers parsing vs syntax/module rejection, 0 production files modified).
  4. `TestSupervisorGreenTaskVerification(unittest.TestCase)`: Green task verification (exit 0 for test command AND exit 0 for `npm run type-check`).
  5. `TestSupervisorExemptTaskVerification(unittest.TestCase)`: Category-specific exempt checks (`npm run build` for UI, `npm run lint` for infra, `npm run type-check` for types, git diff & non-empty check for docs).
  6. `TestGitCommitAndNotesAudit(unittest.TestCase)`: Conventional Commit validation, `git notes` metadata parsing, `plan.md` task checkmark / SHA update, and plan commit verification.
  7. `TestTier2ExecutionCoordination(unittest.TestCase)`: End-to-end Tier 2 turn orchestration and fail-fast pipeline.

---

## 4. Signatures, Types & Data Contracts

The test suite will exercise and validate the following contracts to be implemented in `scripts/agent/conductor-auto.py` during Task 2:

### 4.1 Custom Exceptions (Python 3.11)

```python
class SupervisorInvariantError(ConductorAutoError):
    """Raised when Tier 2 execution violates working tree, test, commit, or git note invariants."""
    pass

class GitTreeDirtyError(SupervisorInvariantError):
    """Raised when uncommitted or untracked changes remain after execution/recovery."""
    pass
```

### 4.2 Exported Function Signatures & Behavioral Contracts

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
        - True if output contains assertion failure markers (expect(), AssertionError, FAIL:)
        - False if output contains compilation, syntax, module load errors (SyntaxError, Cannot find module, ERROR:, container error)
    """
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
    1. Generates execution prompt via generate-prompt.py --exec
    2. Dispatches agy --mode auto turn
    3. Checks working tree cleanliness (invoking recovery if --auto-recover)
    4. Audits active task verification (Red, Green, or Exempt)
    5. Audits git commit, notes, and plan.md update.
    Returns True on success; raises ConductorAutoError on failure.
    """
    ...
```

---

## 5. Precise Behavioral Logic & Test Scenarios

### 5.1 Test Suite 1: `TestTier2ExecutionDispatch`
1. **`test_dispatch_tier2_invokes_generate_prompt_exec`:**
   - **Setup:** Mock `generate_turn_prompt`, `run_agy_turn`, and post-execution verifications.
   - **Action:** Call `dispatch_tier2_execution("test-track", 4, 1, exec_model="gemini-3.8-flash-medium")`.
   - **Assertions:**
     - Assert `generate_turn_prompt` called with `track="test-track"`, `phase_num=4`, `task_num=1`, `mode="exec"`.
     - Assert `run_agy_turn` called with `mode="auto"`, `model="gemini-3.8-flash-medium"`, `timeout=900.0`, and log file `conductor/tracks/test-track/logs/phase-4-task-1-exec.log`.
2. **`test_dispatch_tier2_raises_on_agy_failure`:**
   - **Setup:** Mock `run_agy_turn` returning `(1, "", "Process failed")`.
   - **Action:** Call `dispatch_tier2_execution(...)`.
   - **Assertions:**
     - Raises `ProcessExecutionError` with message including exit code 1.
3. **`test_dispatch_tier2_raises_on_timeout`:**
   - **Setup:** Mock `run_agy_turn` raising `ProcessExecutionError("Turn timed out after 900.0s")`.
   - **Assertions:**
     - Exception propagates cleanly, halting runner.

### 5.2 Test Suite 2: `TestWorkingTreeAndAutoRecover`
1. **`test_check_working_tree_cleanliness_clean_tree`:**
   - **Setup:** Mock `subprocess.run(["git", "status", "--porcelain"])` returning empty string.
   - **Action:** Call `check_working_tree_cleanliness()`.
   - **Assertions:** Returns `(True, [])`.
2. **`test_check_working_tree_cleanliness_dirty_tree`:**
   - **Setup:** Mock `git status --porcelain` returning ` M scripts/agent/conductor-auto.py\n?? untracked.txt\n`.
   - **Action:** Call `check_working_tree_cleanliness()`.
   - **Assertions:** Returns `(False, ["scripts/agent/conductor-auto.py", "untracked.txt"])`.
3. **`test_dispatch_recovery_turn_invokes_generate_prompt_recovery`:**
   - **Setup:** Mock `generate_turn_prompt` and `run_agy_turn`.
   - **Action:** Call `dispatch_recovery_turn("test-track", 4, 1)`.
   - **Assertions:**
     - Assert `generate_turn_prompt` called with `mode="recovery"`.
     - Assert `run_agy_turn` called with `mode="auto"` and recovery log file.
4. **`test_auto_recover_succeeds_when_clean_after_recovery`:**
   - **Setup:**
     - `check_working_tree_cleanliness` initially returns `(False, ["file.ts"])`.
     - Mock `dispatch_recovery_turn` returning `True`.
     - `check_working_tree_cleanliness` on second call returns `(True, [])`.
   - **Action:** Call `dispatch_tier2_execution(..., auto_recover=True)`.
   - **Assertions:** Proceeds through remaining supervisor checks without raising error.
5. **`test_auto_recover_fails_when_still_dirty_after_recovery`:**
   - **Setup:**
     - `check_working_tree_cleanliness` returns `(False, ["file.ts"])`.
     - `dispatch_recovery_turn` runs.
     - `check_working_tree_cleanliness` still returns `(False, ["file.ts"])`.
   - **Action:** Call `dispatch_tier2_execution(..., auto_recover=True)`.
   - **Assertions:** Raises `GitTreeDirtyError` or `SupervisorInvariantError`.
6. **`test_uncommitted_changes_fail_fast_when_auto_recover_disabled`:**
   - **Setup:** `check_working_tree_cleanliness` returns `(False, ["file.ts"])`.
   - **Action:** Call `dispatch_tier2_execution(..., auto_recover=False)`.
   - **Assertions:** Raises `GitTreeDirtyError` or `SupervisorInvariantError` immediately without invoking recovery.

### 5.3 Test Suite 3: `TestSupervisorRedTaskVerification`
1. **`test_parse_test_failure_markers_jest_assertion`:**
   - **Input:** `Error: expect(received).toEqual(expected)\n\nExpected: 2\nReceived: 1\n    at Object.<anonymous> (/app/tests/unit.test.ts:25:12)`
   - **Assertions:** Returns `(True, "Jest assertion failure")`.
2. **`test_parse_test_failure_markers_python_assertion`:**
   - **Input:** `FAIL: test_feature (test_mod.TestClass)\nTraceback ...\nAssertionError: False is not true`
   - **Assertions:** Returns `(True, "Python unittest assertion failure")`.
3. **`test_parse_test_failure_markers_rejects_jest_syntax_error`:**
   - **Input:** `SyntaxError: Unexpected token 'export'\n    at Runtime.createScriptFromCode (/node_modules/jest-runtime/build/index.js:1)`
   - **Assertions:** Returns `(False, "Syntax/module load error detected: SyntaxError")`.
4. **`test_parse_test_failure_markers_rejects_jest_cannot_find_module`:**
   - **Input:** `Cannot find module './missingSeam' from 'tests/unit.test.ts'`
   - **Assertions:** Returns `(False, "Syntax/module load error detected: Cannot find module")`.
5. **`test_parse_test_failure_markers_rejects_python_error_traceback`:**
   - **Input:** `ERROR: test_feature (test_mod.TestClass)\nImportError: cannot import name 'missing_func' from 'scripts.agent'`
   - **Assertions:** Returns `(False, "Syntax/module load error detected: ERROR: / ImportError")`.
6. **`test_verify_red_task_passes_on_assertion_failure_and_zero_production_diff`:**
   - **Setup:**
     - Mock test command execution returning exit code 1 with Jest `expect().toEqual()` failure.
     - Mock `git diff --name-only <base> HEAD` returning `["scripts/__tests__/test_conductor_auto.py"]`.
   - **Action:** Call `verify_red_task(test_cmd="npm test", base_sha="abc1234")`.
   - **Assertions:** Returns `True`.
7. **`test_verify_red_task_fails_when_test_exits_zero`:**
   - **Setup:** Mock test command exiting 0.
   - **Assertions:** Raises `SupervisorInvariantError` ("Red task test unexpectedly passed").
8. **`test_verify_red_task_fails_on_syntax_error`:**
   - **Setup:** Mock test command exiting 1 with `SyntaxError: Unexpected identifier`.
   - **Assertions:** Raises `SupervisorInvariantError` ("Red task failed due to syntax/module error, not assertion failure").
9. **`test_verify_red_task_fails_when_production_code_modified`:**
   - **Setup:**
     - Mock test command exiting 1 with valid assertion failure.
     - Mock `git diff --name-only <base> HEAD` returning `["scripts/__tests__/test_conductor_auto.py", "scripts/agent/conductor-auto.py"]`.
   - **Assertions:** Raises `SupervisorInvariantError` ("Red task modified production code: scripts/agent/conductor-auto.py").

### 5.4 Test Suite 4: `TestSupervisorGreenTaskVerification`
1. **`test_verify_green_task_passes_when_test_and_typecheck_pass`:**
   - **Setup:**
     - Mock test command returning exit 0.
     - Mock `npm run type-check` returning exit 0.
   - **Action:** Call `verify_green_task(test_cmd="npm test")`.
   - **Assertions:** Returns `True`.
2. **`test_verify_green_task_fails_when_test_fails`:**
   - **Setup:** Mock test command returning exit 1.
   - **Assertions:** Raises `SupervisorInvariantError` ("Green task test command failed").
3. **`test_verify_green_task_fails_when_typecheck_fails`:**
   - **Setup:**
     - Mock test command returning exit 0.
     - Mock `npm run type-check` returning exit 2 with type errors.
   - **Assertions:** Raises `SupervisorInvariantError` ("Green task type-check failed").

### 5.5 Test Suite 5: `TestSupervisorExemptTaskVerification`
1. **`test_verify_exempt_task_ui_runs_build`:**
   - **Setup:** Mock `npm run build` returning exit 0.
   - **Action:** Call `verify_exempt_task("ui")`.
   - **Assertions:** Returns `True`. (If build exits 1, raises `SupervisorInvariantError`).
2. **`test_verify_exempt_task_infra_runs_lint`:**
   - **Setup:** Mock `npm run lint` returning exit 0.
   - **Action:** Call `verify_exempt_task("infra")`.
   - **Assertions:** Returns `True`.
3. **`test_verify_exempt_task_types_runs_typecheck`:**
   - **Setup:** Mock `npm run type-check` returning exit 0.
   - **Action:** Call `verify_exempt_task("types")`.
   - **Assertions:** Returns `True`.
4. **`test_verify_exempt_task_docs_passes_on_markdown_only`:**
   - **Setup:**
     - Mock `git diff --name-only <base> HEAD` returning `["docs/agents/conductor-auto.md"]`.
     - File exists and stat size > 0.
   - **Action:** Call `verify_exempt_task("docs", base_sha="abc1234")`.
   - **Assertions:** Returns `True`.
5. **`test_verify_exempt_task_docs_fails_on_non_markdown_modification`:**
   - **Setup:** Mock `git diff --name-only` returning `["docs/doc.md", "lib/helper.ts"]`.
   - **Assertions:** Raises `SupervisorInvariantError` ("Exempt docs task modified non-markdown file: lib/helper.ts").
6. **`test_verify_exempt_task_docs_fails_on_empty_file`:**
   - **Setup:** Mock `git diff` returning `["docs/empty.md"]` with size 0.
   - **Assertions:** Raises `SupervisorInvariantError` ("Exempt docs task created empty file: docs/empty.md").

### 5.6 Test Suite 6: `TestGitCommitAndNotesAudit`
1. **`test_audit_git_commit_valid_conventional_format`:**
   - **Setup:**
     - Mock commit message: `"feat(agent): implement tier 2 execution turn in conductor-auto.py"`
     - Mock `git notes show` returning note with `Task:`, `Summary:`, `Files:`, `Rationale:`.
     - Mock `plan.md` containing `- [x] Task: Test task [commit: 1122334]`.
     - Mock `git log -1` on plan.md containing `"conductor(plan): Mark task '...' as complete"`.
   - **Action:** Call `audit_git_commit_and_notes(...)`.
   - **Assertions:** Returns `True`.
2. **`test_audit_git_commit_rejects_non_conventional_message`:**
   - **Setup:** Mock commit message: `"Fixed some stuff and wrote code"`.
   - **Assertions:** Raises `SupervisorInvariantError` ("Commit message does not match Conventional Commit format").
3. **`test_audit_git_notes_rejects_missing_metadata_fields`:**
   - **Setup:**
     - Mock valid commit message.
     - Mock `git notes show` missing `Rationale:` section.
   - **Assertions:** Raises `SupervisorInvariantError` ("Git note missing required field: Rationale").
4. **`test_audit_plan_update_rejects_incomplete_plan_or_missing_sha`:**
   - **Setup:** Mock `plan.md` still showing `- [ ] Task: Test task` (pending).
   - **Assertions:** Raises `SupervisorInvariantError` ("plan.md not updated with [x] and commit SHA").
5. **`test_audit_plan_commit_rejects_missing_plan_commit`:**
   - **Setup:** Mock latest commit is code commit, but no plan commit `conductor(plan): Mark task '...' as complete` found.
   - **Assertions:** Raises `SupervisorInvariantError` ("Missing conductor(plan) commit").

### 5.7 Test Suite 7: `TestTier2ExecutionCoordination`
1. **`test_dispatch_tier2_execution_full_pipeline_success`:**
   - Mock all pipeline stages: prompt gen, agy turn, clean tree, Red/Green verification, git audit.
   - Assert `dispatch_tier2_execution` executes all steps in sequence and returns `True`.
2. **`test_dispatch_tier2_execution_halts_on_audit_failure`:**
   - Mock git notes audit failure.
   - Assert `dispatch_tier2_execution` raises `SupervisorInvariantError` and does not proceed.

---

## 6. Execution Verification Protocol

### 6.1 Run Targeted Red Unit Tests
Execute the updated test suite to confirm clean Red phase failures (`FAIL:` via `AssertionError`):

```bash
python3.11 -m unittest scripts/__tests__/test_conductor_auto.py
```
**Expected Outcome:** `FAILED (failures=N, errors=0)`. All existing Phase 3 tests pass, while the new Phase 4 tests fail cleanly asserting the unimplemented Tier 2 supervisor functions in `scripts/agent/conductor-auto.py`, with zero unhandled syntax or runtime errors.

### 6.2 Run Pre-Existing Baseline Tests (No Regression)
Execute all prompt generator tests to verify 100% green baseline preservation:

```bash
python3.11 -m unittest scripts/__tests__/test_generate_prompt.py
```
**Expected Outcome:** `OK` (all tests pass cleanly with exit code `0`).

### 6.3 Git Tree Cleanliness Verification
Verify that ONLY the test file has been modified:

```bash
git status --short
```
**Expected Outcome:** Only `M scripts/__tests__/test_conductor_auto.py` is present. No application or runner production files modified.

---

## 7. Post-Execution Protocol & Git Notes

Upon confirming the tests fail cleanly with expected assertion errors:

### 7.1 Stage & Commit Red Test Changes
```bash
git add scripts/__tests__/test_conductor_auto.py
git commit -m "test(agent): add failing unit tests for Tier 2 execution turn, git tree assertions, dual-check Red task verification, Exempt checks, and --auto-recover flow (TDD Red phase)"
```

### 7.2 Attach Git Note
Obtain commit hash (`COMMIT_HASH=$(git log -1 --format="%H")`) and attach the standard metadata note:

```bash
git notes add -m "Task: Write failing unit tests for Tier 2 execution turn, git tree assertions, dual-check Red task verification, Exempt checks, and --auto-recover flow (TDD Red phase)
Summary: Extended scripts/__tests__/test_conductor_auto.py with comprehensive failing unit tests covering Tier 2 execution turn dispatch (agy --mode auto with gemini-3.8-flash-medium and tee logging), working tree cleanliness audit and single-turn --auto-recover prompt flow, active supervisor dual-check for Red tasks (exit != 0, output assertion marker parsing rejecting syntax errors, and zero production file diff), active supervisor verification for Green tasks (test exit 0 and npm run type-check exit 0), category-specific Exempt task verifications (ui, infra, types, docs), and Git conventional commit / git notes / plan.md auditing. Confirmed clean assertion failures establishing the Red baseline for Phase 4 Task 2.
Files: scripts/__tests__/test_conductor_auto.py
Rationale: Strict TDD Red phase for Issue #162 Phase 4 Task 1 establishing the supervisor and execution invariant verification test harness for conductor-auto.py." $COMMIT_HASH
```

### 7.3 Update Conductor Plan
Update `conductor/tracks/conductor-auto-runner_20261112/plan.md`:
- Change `- [ ] Task: Write failing unit tests for Tier 2 execution turn, git tree assertions, dual-check Red task verification, Exempt checks, and --auto-recover flow (TDD Red phase)` to `- [x] Task: Write failing unit tests for Tier 2 execution turn, git tree assertions, dual-check Red task verification, Exempt checks, and --auto-recover flow (TDD Red phase) [commit: <short_sha>]`.
- Stage `conductor/tracks/conductor-auto-runner_20261112/plan.md`.
- Commit with:
  ```bash
  git commit -m "conductor(plan): Mark task 'Write failing unit tests for Tier 2 execution turn, git tree assertions, dual-check Red task verification, Exempt checks, and --auto-recover flow' as complete"
  ```

---

## 8. Confirmation Gate

Halt immediately. Do NOT modify `scripts/__tests__/test_conductor_auto.py` or modify any repository files until explicit affirmative user approval is received via the `ask_question` modal.
