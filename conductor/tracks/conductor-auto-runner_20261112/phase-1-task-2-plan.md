# Implementation Plan: Phase 1 Task 2 — Fix `test_classify_phase_domain_ui_vs_database_vs_tooling` in `generate-prompt.py` Test Suite (TDD Green phase)

**Track:** `conductor-auto-runner_20261112` (Issue [#162](https://github.com/jarredb9/finger-lakes-app-57/issues/162))  
**Phase:** 1 (Test Baseline Stabilization & `[exempt: <category>]` Task Taxonomy)  
**Task:** 2 (Fix `test_classify_phase_domain_ui_vs_database_vs_tooling` in `generate-prompt.py` test suite — TDD Green phase)  
**Track Specification:** [conductor/tracks/conductor-auto-runner_20261112/spec.md](./spec.md)  
**Track Plan:** [conductor/tracks/conductor-auto-runner_20261112/plan.md](./plan.md)  
**Preceding Task Plan:** [conductor/tracks/conductor-auto-runner_20261112/phase-1-task-1-plan.md](./phase-1-task-1-plan.md)  
**Workflow Reference:** [conductor/workflow.md](../../workflow.md)  
**Operating Principles:** [AGENTS.md](../../../AGENTS.md)  

---

## 1. Executive Summary & Objective

### 1.1 Objective
Implement production code changes in `scripts/agent/generate-prompt.py` and accompanying unit tests in `scripts/__tests__/test_generate_prompt.py` to resolve the historical phase git diff bleed regression (TDD Green phase).

Specifically:
1. **Implement `resolve_phase_end_sha`:**  
   Introduce helper function `resolve_phase_end_sha` in `scripts/agent/generate-prompt.py` to resolve the terminal commit SHA for a given phase from:
   - Tier 1: Phase header checkpoint tag (`[checkpoint: <sha>]`).
   - Tier 2: Checkpoint task commit SHA or the last completed task commit SHA in the phase.
   - Tier 3: Preceding baseline of subsequent phases (`resolve_phase_baseline_sha(phases, phase_num + 1)`).
   - Tier 4: Fallback to `"HEAD"` for active or in-progress phases.
2. **Scope Phase Checkpoint Git Diff Range:**  
   Update `collect_phase_checkpoint_context` and `build_checkpoint_prompt`:
   - When `end_sha` resolves to a historical commit (`end_sha != "HEAD"` and verified in git), diff exclusively across `baseline_sha..end_sha` and bypass `git diff --name-only HEAD` (uncommitted working tree changes).
   - If `end_sha != "HEAD"` but is not present in local git history (e.g. shallow clone or squashed commit), omit git diff against `HEAD` and rely on sibling plan targets and task descriptions, preventing post-phase UI commits on `main` from bleeding into historical database or backend phase scopes.
   - Provide `end_sha` in the checkpoint context dictionary to format accurate prompt ranges (`- Git range: <baseline_sha>..<end_sha>`).
3. **Achieve 100% Green Test Suite:**  
   Ensure `test_checkpoint_prompt_preserves_database_domain_for_historical_phase` passes cleanly, add isolated unit tests for `resolve_phase_end_sha`, and verify the entire test suite `python3.11 -m unittest scripts/__tests__/test_generate_prompt.py` runs with zero failures or errors.

---

## 2. Invariants & Critical Guardrails

1. **Strict TDD Green Phase Protocol ([AGENTS.md](../../../AGENTS.md) Section 5 & `conductor/workflow.md`):**
   - The task scope implements the minimal surgical production logic in `scripts/agent/generate-prompt.py` to turn the failing regression test green, plus test coverage in `scripts/__tests__/test_generate_prompt.py`.
   - All tests in `scripts/__tests__/test_generate_prompt.py` must pass with exit code `0`.
2. **Backwards Compatibility & In-Progress Phase Safety:**
   - Active, in-progress phases without an established terminal SHA must continue to diff against `HEAD` and include uncommitted working tree changes (`git diff --name-only HEAD`).
   - Sibling plan extraction, task command parsing, and `classify_phase_domain` rules remain unaffected.
3. **Execution Environment:**
   - Script unit tests run via host Python runtime:
     `python3.11 -m unittest scripts/__tests__/test_generate_prompt.py`
4. **Modal Approval Invariant (`conductor_antigravity.md` & [AGENTS.md](../../../AGENTS.md) Section 2):**
   - Under `/plan` or any confirmation gate, halt and await explicit affirmative user approval via `ask_question` before modifying any files.

---

## 3. Target Files & Semantic Insertion Anchors

### 3.1 Production Seam: Prompt Generator
- **Path:** `scripts/agent/generate-prompt.py`
- **Semantic Insertion Anchors:**
  1. *Helper Function Insertion:* Immediately following `resolve_phase_baseline_sha` (around line 285) before `_MUTATING_CMD_RE`:
     Insert `resolve_phase_end_sha(phases: Dict[int, Dict[str, Any]], phase_num: Optional[int], cwd: Path = PROJECT_ROOT) -> str`.
  2. *Context Collector Revision Scoping:* Inside `collect_phase_checkpoint_context` (around lines 525–553):
     Replace unconditional diff against `HEAD` with revision-scoped diff evaluating `end_sha`.
  3. *Context Dictionary Extension:* Inside `collect_phase_checkpoint_context` return dictionary (around line 614):
     Add `"end_sha": end_sha`.
  4. *Prompt Header Range Formatting:* Inside `build_checkpoint_prompt` (around lines 1073–1087):
     Use `end_sha` to format `range_line` and `diff_check_cmd`.

### 3.2 Test Suite: Unit Tests
- **Path:** `scripts/__tests__/test_generate_prompt.py`
- **Semantic Insertion Anchors:**
  1. *Unit Test Additions:* Inside `TestGeneratePromptModule` class immediately following `test_baseline_sha_fallback_when_prior_phase_header_lacks_checkpoint_tag` (around line 219):
     Insert `test_resolve_phase_end_sha_checkpoint_and_task_commits` and `test_collect_phase_checkpoint_context_scopes_diff_to_end_sha_with_mock`.

---

## 4. Signatures, Types & Data Contracts

### 4.1 Python Function Signatures & Type Hints

```python
from typing import Any, Dict, List, Optional, Tuple
from pathlib import Path

def resolve_phase_end_sha(
    phases: Dict[int, Dict[str, Any]],
    phase_num: Optional[int],
    cwd: Path = PROJECT_ROOT,
) -> str:
    """
    Resolves the terminal commit SHA for phase_num.
    
    Resolution Tiers:
    1. Phase header checkpoint tag: phases[phase_num].get("checkpoint_sha")
    2. Last completed task or checkpoint task in phase with a valid commit_sha
    3. Baseline SHA of the next sequential phase: resolve_phase_baseline_sha(phases, next_phase)
    4. Fallback to "HEAD" for active/incomplete phases.
    
    Returns:
        Verified 7-char short SHA, full SHA, or "HEAD".
    """
    ...

def collect_phase_checkpoint_context(
    track_name: str,
    phase_num: Optional[int],
    task_num: Optional[int],
    phases: Optional[Dict[int, Dict[str, Any]]] = None,
    cwd: Path = PROJECT_ROOT,
) -> Dict[str, Any]:
    """
    Returns:
    {
        "baseline_sha": Optional[str],
        "end_sha": str,  # Verified SHA or 'HEAD'
        "changed_files": List[str],
        "sibling_plans": List[str],
        "commands": List[str],
        "domain": str,  # 'ui' | 'database' | 'backend_tooling'
        "has_checkpoint_plan": bool,
        "clean_phase_name": str,
        "raw_heading": str,
    }
    """
    ...
```

---

## 5. Precise Behavioral Logic & Implementation Details

### 5.1 `resolve_phase_end_sha` Algorithm
1. **Validation:** If `phase_num is None` or `phase_num not in phases`, return `"HEAD"`.
2. **Git Availability:** Evaluate `has_git = _verify_git_commit("HEAD", cwd) is not None`.
3. **Tier 1 (Header Checkpoint Tag):**
   - Retrieve `cp_sha = phases[phase_num].get("checkpoint_sha")`.
   - If present:
     - If `has_git`: return `_verify_git_commit(cp_sha, cwd)` if valid.
     - If not `has_git`: return `cp_sha[:7]`.
4. **Tier 2 (Task Commit SHAs in Reverse Order):**
   - Iterate over reversed `phases[phase_num].get("tasks", [])`.
   - If `t.get("commit_sha")`:
     - If `has_git`: return `_verify_git_commit(t["commit_sha"], cwd)` if valid.
     - If not `has_git`: return `t["commit_sha"][:7]`.
5. **Tier 3 (Next Phase Baseline):**
   - Identify `next_phases = [p for p in sorted(phases.keys()) if p > phase_num]`.
   - If `next_phases`:
     - Calculate `next_base = resolve_phase_baseline_sha(phases, next_phases[0], cwd=cwd)`.
     - If `next_base`: return `next_base`.
6. **Tier 4 (Fallback):**
   - Return `"HEAD"`.

### 5.2 Scoped Git Diff in `collect_phase_checkpoint_context`
1. Resolve `baseline_sha = resolve_phase_baseline_sha(phases, phase_num, cwd=cwd)`.
2. Resolve `end_sha = resolve_phase_end_sha(phases, phase_num, cwd=cwd)`.
3. Determine if phase is historical vs active:
   - `is_historical = (end_sha != "HEAD") and (_verify_git_commit(end_sha, cwd=cwd) is not None)`.
4. Build `diff_targets`:
   - If `is_historical`:
     - `diff_targets = [["git", "diff", "--name-only", baseline_sha, end_sha]]`
     - Bypasses `git diff --name-only HEAD` so uncommitted files or subsequent commits do not bleed into `changed_files`.
   - Else if `end_sha == "HEAD"`:
     - `diff_targets = [["git", "diff", "--name-only", baseline_sha, "HEAD"], ["git", "diff", "--name-only", "HEAD"]]`
   - Else (`end_sha != "HEAD"` but not resolvable in local git):
     - `diff_targets = []` (prevents bleeding `HEAD` when git history is shallow/truncated; relies on sibling plans and task text).
5. Pass `"end_sha": end_sha` in the return dictionary.

### 5.3 Prompt Range Formatting in `build_checkpoint_prompt`
1. Retrieve `end_sha = ctx.get("end_sha", "HEAD")`.
2. Format `range_line`:
   - If `baseline_sha`: `- Git range: \`{baseline_sha}..{end_sha}\``
   - Else: `- Git range: current phase commits (\`git status --short\`)`
3. Format `diff_check_cmd`:
   - If `baseline_sha`: `\`git diff --name-only {baseline_sha} {end_sha}\` and \`git status --short\``
   - Else: `\`git status --short\``

### 5.4 Unit Test Augmentation in `test_generate_prompt.py`
1. **`test_resolve_phase_end_sha_checkpoint_and_task_commits`:**
   - Synthesizes plan fixtures in `tempfile.TemporaryDirectory`:
     - Phase with `[checkpoint: a1b2c3d]` -> asserts returns `"a1b2c3d"`.
     - Phase lacking header tag but with task `[commit: d4e5f6a]` -> asserts returns `"d4e5f6a"`.
     - Active phase lacking commits -> asserts returns `"HEAD"`.
2. **`test_collect_phase_checkpoint_context_scopes_diff_to_end_sha_with_mock`:**
   - Uses `unittest.mock.patch("subprocess.run")` and `unittest.mock.patch.object(generate_prompt, "_verify_git_commit")`.
   - Asserts that for a completed phase with `baseline_sha` and `end_sha`, `subprocess.run` is called with `["git", "diff", "--name-only", baseline_sha, end_sha]` and never with `["git", "diff", "--name-only", "HEAD"]`.
3. **Green Assertion Verification:**
   - `test_checkpoint_prompt_preserves_database_domain_for_historical_phase` executes against `db-security-hardening_20261026` Phase 2 and asserts `"no UI changes — do NOT invent \`localhost:3000\` browser steps"` is present.

---

## 6. Execution Verification Protocol

### 6.1 Targeted Regression Verification
Run the regression test to verify transition from RED to GREEN:

```bash
python3.11 -m unittest scripts/__tests__/test_generate_prompt.py -k test_checkpoint_prompt_preserves_database_domain_for_historical_phase
```
**Expected Outcome:** `OK` (exit code `0`, 1 test passed).

### 6.2 New Unit Tests Verification
Run the newly added `resolve_phase_end_sha` tests:

```bash
python3.11 -m unittest scripts/__tests__/test_generate_prompt.py -k test_resolve_phase_end_sha
```
**Expected Outcome:** `OK` (exit code `0`).

### 6.3 Full Suite Baseline Verification
Run the entire prompt generator test suite:

```bash
python3.11 -m unittest scripts/__tests__/test_generate_prompt.py
```
**Expected Outcome:** `OK` (all tests passing, 0 failures, 0 errors, exit code `0`).

---

## 7. Post-Execution Protocol & Git Notes

Upon confirming all tests in `scripts/__tests__/test_generate_prompt.py` pass cleanly:

### 7.1 Stage & Commit Implementation Changes
```bash
git add scripts/agent/generate-prompt.py scripts/__tests__/test_generate_prompt.py
git commit -m "fix(agent): scope phase checkpoint git diff range to resolved end commit (TDD Green phase)"
```

### 7.2 Attach Git Note
Obtain commit hash (`COMMIT_HASH=$(git log -1 --format="%H")`) and attach the standard metadata note:

```bash
git notes add -m "Task: Fix test_classify_phase_domain_ui_vs_database_vs_tooling in generate-prompt.py test suite (TDD Green phase)
Summary: Implemented resolve_phase_end_sha in generate-prompt.py to resolve terminal commit SHAs for completed phases from checkpoint_sha, task commit SHAs, or subsequent phase baselines instead of unconditionally diffing against HEAD. Scoped git diff in collect_phase_checkpoint_context to baseline_sha..end_sha, eliminating post-phase UI commit bleed into historical database phase domains. Added unit tests for resolve_phase_end_sha and verified 100% passing test baseline.
Files: scripts/agent/generate-prompt.py, scripts/__tests__/test_generate_prompt.py
Rationale: Strict TDD Green phase for Issue #162 Phase 1 Task 2 achieving a green test suite baseline across test_generate_prompt.py before introducing [exempt: <category>] parsing in Task 3." $COMMIT_HASH
```

### 7.3 Update Conductor Plan
Update `conductor/tracks/conductor-auto-runner_20261112/plan.md`:
- Change `- [ ] Task: Fix test_classify_phase_domain_ui_vs_database_vs_tooling in generate-prompt.py test suite (TDD Green phase)` to `- [x] Task: Fix test_classify_phase_domain_ui_vs_database_vs_tooling in generate-prompt.py test suite (TDD Green phase) [commit: <short_sha>]`.
- Stage `conductor/tracks/conductor-auto-runner_20261112/plan.md`.
- Commit with:
  ```bash
  git commit -m "conductor(plan): Mark task 'Fix test_classify_phase_domain_ui_vs_database_vs_tooling in generate-prompt.py test suite' as complete"
  ```

---

## 8. Confirmation Gate

Halt immediately. Do NOT modify `scripts/agent/generate-prompt.py` or any repository files until explicit affirmative user approval is received via the `ask_question` modal.
