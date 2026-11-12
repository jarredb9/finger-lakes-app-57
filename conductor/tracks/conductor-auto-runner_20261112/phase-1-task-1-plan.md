# Implementation Plan: Phase 1 Task 1 — Write Failing Unit Test for Pre-Existing `test_classify_phase_domain_ui_vs_database_vs_tooling` Regression (TDD Red phase)

**Track:** `conductor-auto-runner_20261112` (Issue [#162](https://github.com/jarredb9/finger-lakes-app-57/issues/162))  
**Phase:** 1 (Test Baseline Stabilization & `[exempt: <category>]` Task Taxonomy)  
**Task:** 1 (Write failing unit test for pre-existing `test_classify_phase_domain_ui_vs_database_vs_tooling` regression — TDD Red phase)  
**Track Specification:** [conductor/tracks/conductor-auto-runner_20261112/spec.md](./spec.md)  
**Track Plan:** [conductor/tracks/conductor-auto-runner_20261112/plan.md](./plan.md)  
**Workflow Reference:** [conductor/workflow.md](../../workflow.md)  
**Operating Principles:** [AGENTS.md](../../../AGENTS.md)  

---

## 1. Executive Summary & Objective

### 1.1 Objective
Stabilize the Conductor test suite by establishing a strict, isolated failing unit test (TDD Red phase) for the pre-existing domain classification regression in `scripts/__tests__/test_generate_prompt.py`.

Specifically:
1. **Decouple Pure Domain Unit Tests from Live Git Repository State:**  
   `test_classify_phase_domain_ui_vs_database_vs_tooling` in `scripts/__tests__/test_generate_prompt.py` currently couples pure unit test assertions with a call to `generate_prompt.build_exec_prompt("db-security-hardening_20261026", 2, 4, ...)` that executes `git diff --name-only <baseline_sha> HEAD`. As the repository evolved and accumulated post-phase UI commits on `main`, `git diff` against `HEAD` returned `components/` files, incorrectly flipping domain classification from `"database"` to `"ui"` and breaking the test.
2. **Isolate the Historical Range Mismatch Regression:**  
   Separate the pure unit test from the historical checkpoint prompt test into a dedicated regression test method (`test_checkpoint_prompt_preserves_database_domain_for_historical_phase`). In this Red phase, the new test method will cleanly isolate and document the `AssertionError` caused by the un-mocked historical range bleed (`HEAD` vs phase checkpoint).
3. **Preserve Production Code Immutability (TDD Red Invariant):**  
   Zero production code changes in `scripts/agent/generate-prompt.py`. The mock/scoping fix is strictly deferred to Phase 1 Task 2 (Green phase).

---

## 2. Invariants & Critical Guardrails

1. **Strict TDD Red Phase Protocol ([AGENTS.md](../../../AGENTS.md) Section 5 & `conductor/workflow.md`):**
   - The task scope is limited strictly to test file updates in `scripts/__tests__/test_generate_prompt.py`.
   - `scripts/agent/generate-prompt.py` and application files MUST NOT be modified in this task.
   - The test must execute and fail with a clean assertion failure (`AssertionError`), not syntax, module loading, or compilation errors.
2. **Commit Isolation & Scoping:**
   - Commit message must strictly follow Conventional Commits: `test(agent): ...`.
   - The commit must include detailed Git notes (`Task`, `Summary`, `Files`, `Rationale`).
3. **Execution Environment:**
   - Script tests run directly via the host Python 3.11/3.12 runtime:
     `python3.11 -m unittest scripts/__tests__/test_generate_prompt.py`
4. **Modal Approval Invariant (`conductor_antigravity.md` & [AGENTS.md](../../../AGENTS.md) Section 2):**
   - Under `/plan` or any confirmation gate, halt and await explicit affirmative user approval via `ask_question` before modifying any files.

---

## 3. Target Files & Semantic Insertion Anchors

### 3.1 Target Test Suite
- **Path:** `scripts/__tests__/test_generate_prompt.py`
- **Semantic Insertion Anchor:** Inside `TestGeneratePromptModule` class (lines 179–202):
  - Retain `test_classify_phase_domain_ui_vs_database_vs_tooling` focusing strictly on unit domain classification logic without live git dependencies.
  - Insert the dedicated regression test method `test_checkpoint_prompt_preserves_database_domain_for_historical_phase` immediately following `test_classify_phase_domain_ui_vs_database_vs_tooling` (around line 203) before `test_baseline_sha_fallback_when_prior_phase_header_lacks_checkpoint_tag`.

```python
# Semantic Anchor in scripts/__tests__/test_generate_prompt.py ~line 179
    def test_classify_phase_domain_ui_vs_database_vs_tooling(self):
        """Verifies domain classification distinguishes ui, database, and backend_tooling."""
        # ... pure unit assertions on synthetic file lists ...

    # <<< INSERT test_checkpoint_prompt_preserves_database_domain_for_historical_phase HERE >>>

    def test_baseline_sha_fallback_when_prior_phase_header_lacks_checkpoint_tag(self):
```

---

## 4. Signatures, Types & Data Contracts

### 4.1 Python Type Contracts & Signatures

```python
from typing import List, Dict, Any, Optional
from pathlib import Path

# Function under test: Domain classification
def classify_phase_domain(
    changed_files: List[str], 
    non_checkpoint_tasks: List[Dict[str, Any]]
) -> str:
    """
    Returns 'ui', 'database', or 'backend_tooling' based on file paths
    and fallback keyword heuristics.
    """
    ...

# Function under test: Checkpoint prompt builder
def build_exec_prompt(
    track_name: str,
    phase_num: Optional[int],
    task_num: Optional[int],
    task_desc: str = "",
    subtasks: Optional[List[str]] = None,
    mode: Optional[str] = None,
) -> str:
    """
    Constructs the execution prompt. When mode == 'checkpoint' or task_desc
    matches checkpoint heuristics, delegates to build_checkpoint_prompt.
    """
    ...

# Context collector queried by build_checkpoint_prompt
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

## 5. Precise Behavioral Logic & Test Design

### 5.1 Decoupling `test_classify_phase_domain_ui_vs_database_vs_tooling`
1. **Scope:** Pure unit verification of `generate_prompt.classify_phase_domain`.
2. **Assertions:**
   - `["components/WineryModal.tsx"]` with `[]` tasks -> `"ui"`.
   - `["supabase/migrations/20261026_test.sql", "lib/database.types.ts"]` with `[]` tasks -> `"database"`.
   - `["scripts/agent-resolve/pipeline.py", "lib/services/tripService.ts"]` with `[]` tasks -> `"backend_tooling"`.
   - Edge case: Empty `changed_files` with tasks containing `"supabase/"` or `"rls"` -> falls back to `"database"`.
   - Edge case: Empty `changed_files` with tasks containing `"components/"` or `"ui "` -> falls back to `"ui"`.
3. **Invariant:** Does NOT invoke `build_exec_prompt` or trigger subprocess `git diff` operations. Stays 100% green regardless of git repository history.

### 5.2 Authoring Failing Regression Test `test_checkpoint_prompt_preserves_database_domain_for_historical_phase`
1. **Scope:** Targeted verification of checkpoint prompt generation for a database phase (`db-security-hardening_20261026`, Phase 2, Task 4).
2. **Test Setup:**
   - Invoke `generate_prompt.build_exec_prompt` with parameters:
     - `track_name = "db-security-hardening_20261026"`
     - `phase_num = 2`
     - `task_num = 4`
     - `task_desc = "Conductor - User Manual Verification 'Phase 2: Database Hardening & Security Regression' (Protocol in workflow.md)"`
3. **Target Assertion:**
   - `self.assertIn("no UI changes — do NOT invent \`localhost:3000\` browser steps", db_prompt)`
4. **Failure Mechanics (Red Phase):**
   - `build_exec_prompt` invokes `collect_phase_checkpoint_context("db-security-hardening_20261026", 2, 4)`.
   - In the un-mocked baseline, `collect_phase_checkpoint_context` identifies `baseline_sha = "7128b93"` (the baseline commit before Phase 2) and runs:
     `git diff --name-only 7128b93 HEAD`
   - Because `HEAD` on `main` contains numerous commits authored after Phase 2 (including changes in `components/`, `app/`, etc.), `git diff` produces files matching `"components/"`.
   - `classify_phase_domain` scans `changed_files`, matches the UI prefix, and incorrectly classifies the phase domain as `"ui"`.
   - `build_checkpoint_prompt` selects the UI directive template instead of the database directive template.
   - The assertion `self.assertIn("no UI changes — do NOT invent \`localhost:3000\` browser steps", db_prompt)` fails with `AssertionError`.
   - **Clean Failure Invariant:** The test runner exits with code 1 due to `AssertionError`. No unhandled exceptions or import errors occur.

---

## 6. Execution Verification Protocol

### 6.1 Targeted Test Execution
Run the unit test suite targeting the newly decoupled regression test:

```bash
python3.11 -m unittest scripts/__tests__/test_generate_prompt.py -k test_checkpoint_prompt_preserves_database_domain_for_historical_phase
```

### 6.2 Full Test Suite Execution
Run the full prompt generator test suite to verify decoupling:

```bash
python3.11 -m unittest scripts/__tests__/test_generate_prompt.py
```

### 6.3 Expected Red Phase Outcomes
1. `test_classify_phase_domain_ui_vs_database_vs_tooling` passes cleanly (decoupled from git history).
2. `test_checkpoint_prompt_preserves_database_domain_for_historical_phase` **FAILS** with:
   ```
   AssertionError: 'no UI changes — do NOT invent `localhost:3000` browser steps' not found in "Execute Phase 2 Checkpoint (Task 4)... UI / Frontend Phase: Present a concise manual verification checklist..."
   ```
3. Test suite reports: `FAILED (failures=1)` with exit code `1`.
4. Production tree cleanliness:
   `git diff --name-only scripts/agent/` must return empty (0 production files modified).

---

## 7. Post-Execution Protocol & Git Notes

Upon confirming the clean single-test failure in `scripts/__tests__/test_generate_prompt.py`:

### 7.1 Stage & Commit Test Changes
```bash
git add scripts/__tests__/test_generate_prompt.py
git commit -m "test(agent): add failing test for historical phase checkpoint domain classification regression (TDD Red phase)"
```

### 7.2 Attach Git Note
Obtain the commit hash (`COMMIT_HASH=$(git log -1 --format="%H")`) and attach the standard metadata note:

```bash
git notes add -m "Task: Write failing unit test for pre-existing test_classify_phase_domain_ui_vs_database_vs_tooling regression (TDD Red phase)
Summary: Decoupled pure domain classification unit assertions in test_classify_phase_domain_ui_vs_database_vs_tooling from live git state, and added isolated regression test test_checkpoint_prompt_preserves_database_domain_for_historical_phase. Confirmed test fails cleanly on historical git diff range mismatch against HEAD where post-phase UI commits bleed into Phase 2 changed_files.
Files: scripts/__tests__/test_generate_prompt.py
Rationale: Strict TDD Red phase for Issue #162 Phase 1 Task 1 establishing an isolated reproducible regression test before implementing git diff mocking or revision scoping in Task 2." $COMMIT_HASH
```

### 7.3 Update Conductor Plan
Update `conductor/tracks/conductor-auto-runner_20261112/plan.md`:
- Change `- [ ] Task: Write failing unit test for pre-existing test_classify_phase_domain_ui_vs_database_vs_tooling regression (TDD Red phase)` to `- [x] Task: Write failing unit test for pre-existing test_classify_phase_domain_ui_vs_database_vs_tooling regression (TDD Red phase) [commit: <short_sha>]`.
- Stage `conductor/tracks/conductor-auto-runner_20261112/plan.md`.
- Commit with:
  ```bash
  git commit -m "conductor(plan): Mark task 'Write failing unit test for pre-existing test_classify_phase_domain_ui_vs_database_vs_tooling regression' as complete"
  ```

---

## 8. Confirmation Gate

Halt immediately. Do NOT modify `scripts/__tests__/test_generate_prompt.py` or any repository files until explicit affirmative user approval is received via the `ask_question` modal.
