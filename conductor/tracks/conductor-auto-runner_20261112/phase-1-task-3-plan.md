# Implementation Plan: Phase 1 Task 3 — Write Failing Unit Tests for `[exempt: <category>]` Task Parsing and Non-TDD Verification Strategy (TDD Red phase)

**Track:** `conductor-auto-runner_20261112` (Issue [#162](https://github.com/jarredb9/finger-lakes-app-57/issues/162))  
**Phase:** 1 (Test Baseline Stabilization & `[exempt: <category>]` Task Taxonomy)  
**Task:** 3 (Write failing unit tests for `[exempt: <category>]` task parsing and non-TDD verification strategy — TDD Red phase)  
**Track Specification:** [conductor/tracks/conductor-auto-runner_20261112/spec.md](./spec.md)  
**Track Plan:** [conductor/tracks/conductor-auto-runner_20261112/plan.md](./plan.md)  
**Preceding Task Plan:** [conductor/tracks/conductor-auto-runner_20261112/phase-1-task-2-plan.md](./phase-1-task-2-plan.md)  
**Workflow Reference:** [conductor/workflow.md](../../workflow.md)  
**Operating Principles:** [AGENTS.md](../../../AGENTS.md)  

---

## 1. Executive Summary & Objective

### 1.1 Objective
Author failing unit tests in `scripts/__tests__/test_generate_prompt.py` to establish the authoritative test harness for `[exempt: <category>]` task annotation parsing and non-TDD verification strategy inference (TDD Red phase).

Specifically:
1. **Plan Parser Taxonomy Test (`test_parse_plan_tasks_extracts_exempt_categories`):**  
   Assert that `parse_plan_tasks` extracts the `[exempt: <category>]` tag across all 6 canonical categories (`ui`, `styling`, `infra`, `scripts`, `types`, `docs`) into a dedicated `"exempt"` dictionary field, normalizes values to lowercase (case-insensitivity check), handles coexisting commit SHAs, and cleanly strips the `[exempt: ...]` tag from `description`.
2. **Strategy Inference Taxonomy Test (`test_infer_verification_strategy_exempt_categories`):**  
   Assert that `infer_verification_strategy` maps each canonical exempt category to its designated non-TDD verification command and conventional commit prefix:
   - `ui` & `styling` $\rightarrow$ `["npm run build"]`, commit type `style(...)`, mode `"exempt"`.
   - `infra` & `scripts` $\rightarrow$ `["npm run lint"]`, commit type `chore(...)`, mode `"exempt"`.
   - `types` $\rightarrow$ `["npm run type-check"]`, commit type `types(...)`, mode `"exempt"`.
   - `docs` $\rightarrow$ `["git diff --name-only"]`, commit type `docs(...)`, mode `"exempt"`.
3. **Execution Prompt Formatting Test (`test_build_exec_prompt_formats_exempt_verification_block`):**  
   Assert that `build_exec_prompt` outputs an exempt-specific verification block instructing the agent to run the category-specific check without enforcing test failure assertions or Jest test runners.
4. **Empirical Red Phase Confirmation:**  
   Confirm that all new test cases fail with expected `KeyError: 'exempt'` or `AssertionError` against the existing `generate-prompt.py` implementation, while 100% of pre-existing baseline unit tests continue to pass.

---

## 2. Invariants & Critical Guardrails

1. **Strict TDD Red Phase Protocol ([AGENTS.md](../../../AGENTS.md) Section 5 & `conductor/workflow.md`):**
   - The scope of Task 3 is strictly restricted to test authoring in `scripts/__tests__/test_generate_prompt.py`.
   - **Zero Production Changes:** `scripts/agent/generate-prompt.py` and application code MUST NOT be modified in this task. Production implementation is exclusively scheduled for Task 4 (TDD Green phase).
   - The newly added tests MUST fail cleanly with assertion or key errors, demonstrating that the test harness actively asserts the missing capability.
2. **Backwards Compatibility & Baseline Preservation:**
   - All existing test cases in `scripts/__tests__/test_generate_prompt.py` must continue to pass without failure or regression.
   - Standard TDD Red tasks (`failing unit test`, `red phase`) and Green implementation tasks must retain their existing behavior when `[exempt: ...]` is absent.
3. **Execution Environment:**
   - Script unit tests run via host Python runtime:
     `python3.11 -m unittest scripts/__tests__/test_generate_prompt.py -k exempt`
4. **Modal Approval Invariant (`conductor_antigravity.md` & [AGENTS.md](../../../AGENTS.md) Section 2):**
   - Under `/plan` or any confirmation gate, halt and await explicit affirmative user approval via `ask_question` before modifying any files.

---

## 3. Target Files & Semantic Insertion Anchors

### 3.1 Test Suite Seam: Unit Tests
- **Path:** `scripts/__tests__/test_generate_prompt.py`
- **Semantic Insertion Anchors:**
  1. *Parser Taxonomy Test Insertion:*  
     Inside class `TestGeneratePromptModule`, immediately after `test_parse_plan_tasks_extracts_clean_phase_name_checkpoint_and_commit_shas` (around line 78):
     Insert `test_parse_plan_tasks_extracts_exempt_categories(self)`.
  2. *Strategy Inference & Prompt Formatting Test Insertion:*  
     Inside class `TestGeneratePromptModule`, immediately after `test_infer_verification_strategy_default_fallback` (around line 342):
     Insert `test_infer_verification_strategy_exempt_categories(self)` and `test_build_exec_prompt_formats_exempt_verification_block(self)`.

---

## 4. Signatures, Types & Data Contracts

### 4.1 Data Contract: `TaskDict` Extension

```python
from typing import Any, Dict, List, Optional

TaskDict = Dict[str, Any]
# Contract schema for phases[phase_num]["tasks"][i]:
# {
#     "status": str,          # "complete" | "in_progress" | "pending"
#     "description": str,     # Sanitized task description (exempt tag stripped)
#     "subtasks": List[str],  # Subtask strings
#     "commit_sha": Optional[str],  # 7-character commit SHA or None
#     "is_checkpoint": bool,  # True if phase completion verification task
#     "exempt": Optional[str], # Canonical category: "ui" | "styling" | "infra" | "scripts" | "types" | "docs" | None
#     "raw_line": str,        # Original line from plan.md
# }
```

### 4.2 Data Contract: `StrategyDict` Extension

```python
StrategyDict = Dict[str, Any]
# Contract schema returned by infer_verification_strategy:
# {
#     "commands": List[str],              # E.g. ["npm run build"], ["npm run lint"], ["npm run type-check"], ["git diff --name-only"]
#     "instruction": str,                 # E.g. "- Verify application build passes cleanly with npm run build (UI exempt task)."
#     "commit_msg": str,                  # E.g. "style(core): Update header layout"
#     "mode": str,                        # "exempt" | "red" | "green" | "checkpoint" | "full"
#     "is_red": bool,                     # False for exempt tasks
#     "is_checkpoint": bool,              # False for non-checkpoint exempt tasks
#     "exempt": Optional[str],            # Canonical category or None
#     "checkpoint_context": Optional[Dict[str, Any]],
# }
```

### 4.3 Test Method Signatures

```python
class TestGeneratePromptModule(unittest.TestCase):
    def test_parse_plan_tasks_extracts_exempt_categories(self) -> None:
        """Verifies parse_plan_tasks extracts [exempt: <category>] across all canonical categories."""
        ...

    def test_infer_verification_strategy_exempt_categories(self) -> None:
        """Verifies infer_verification_strategy selects non-TDD commands and commit types for all exempt categories."""
        ...

    def test_build_exec_prompt_formats_exempt_verification_block(self) -> None:
        """Verifies build_exec_prompt formats category-specific verification block without Red phase assertions."""
        ...
```

---

## 5. Precise Behavioral Logic & Test Scenarios

### 5.1 Test 1: `test_parse_plan_tasks_extracts_exempt_categories`
1. **Fixture Creation:**  
   Synthesize a test `plan.md` in `tempfile.TemporaryDirectory` with:
   - `- [ ] Task: Update landing page hero layout [exempt: ui]`
   - `- [ ] Task: Polish button hover animations [exempt: styling]`
   - `- [ ] Task: Configure GitHub Actions workflow [exempt: infra]`
   - `- [ ] Task: Add database backup utility script [exempt: scripts]`
   - `- [ ] Task: Update domain entity type definitions [exempt: types]`
   - `- [ ] Task: Document architecture decisions in ADR-0015 [exempt: docs]`
   - `- [ ] Task: Mixed case test [exempt: UI]` (case-insensitivity assertion)
   - `- [ ] Task: Standard domain feature (TDD Red phase)` (unannotated control)
   - `- [x] Task: Completed chore script [exempt: scripts] [commit: a1b2c3d]` (coexisting commit SHA assertion)
2. **Assertions:**
   - `tasks[0]["exempt"] == "ui"` and `tasks[0]["description"] == "Update landing page hero layout"`
   - `tasks[1]["exempt"] == "styling"` and `tasks[1]["description"] == "Polish button hover animations"`
   - `tasks[2]["exempt"] == "infra"` and `tasks[2]["description"] == "Configure GitHub Actions workflow"`
   - `tasks[3]["exempt"] == "scripts"` and `tasks[3]["description"] == "Add database backup utility script"`
   - `tasks[4]["exempt"] == "types"` and `tasks[4]["description"] == "Update domain entity type definitions"`
   - `tasks[5]["exempt"] == "docs"` and `tasks[5]["description"] == "Document architecture decisions in ADR-0015"`
   - `tasks[6]["exempt"] == "ui"` (normalized to lowercase)
   - `tasks[7]["exempt"] is None`
   - `tasks[8]["exempt"] == "scripts"`, `tasks[8]["commit_sha"] == "a1b2c3d"`, and `tasks[8]["description"] == "Completed chore script"`
   - For all exempt tasks, assert `"[exempt:" not in task["description"]`.
3. **Expected Red Failure:**  
   `KeyError: 'exempt'` because `parse_plan_tasks` does not currently construct the `"exempt"` key.

### 5.2 Test 2: `test_infer_verification_strategy_exempt_categories`
1. **Test Matrix Table:**
   | Category | Task Description | Expected Commands | Expected Commit Prefix | Mode |
   | :--- | :--- | :--- | :--- | :--- |
   | `ui` | `Update landing page hero layout [exempt: ui]` | `["npm run build"]` | `style(` | `exempt` |
   | `styling` | `Polish button hover animations [exempt: styling]` | `["npm run build"]` | `style(` | `exempt` |
   | `infra` | `Configure GitHub Actions workflow [exempt: infra]` | `["npm run lint"]` | `chore(` | `exempt` |
   | `scripts` | `Add database backup utility script [exempt: scripts]` | `["npm run lint"]` | `chore(` | `exempt` |
   | `types` | `Update domain entity type definitions [exempt: types]` | `["npm run type-check"]` | `types(` | `exempt` |
   | `docs` | `Document architecture decisions in ADR-0015 [exempt: docs]` | `["git diff --name-only"]` | `docs(` | `exempt` |
2. **Invocation:**  
   Invoke `generate_prompt.infer_verification_strategy` for each row, testing both embedded tag parsing in `task_desc` and explicit `exempt="<category>"` keyword arguments.
3. **Assertions:**
   - `strategy["exempt"] == expected_category`
   - `strategy["mode"] == "exempt"`
   - `strategy["is_red"] is False`
   - `strategy["commands"] == expected_commands`
   - `strategy["commit_msg"].startswith(expected_prefix)`
   - `strategy["instruction"]` mentions category or command (non-empty string starting with `"- "`).
4. **Expected Red Failure:**  
   `AssertionError` on `strategy.get("exempt")` being `None`, `strategy["mode"]` returning `"green"`, commands returning default Jest runner `["./scripts/containers/run-jest-container.sh", "npm run type-check"]`, and commit prefix defaulting to `feat(`.

### 5.3 Test 3: `test_build_exec_prompt_formats_exempt_verification_block`
1. **Invocation:**  
   Call `generate_prompt.build_exec_prompt` with:
   - `track_name="conductor-auto-runner_20261112"`
   - `phase_num=1`
   - `task_num=1`
   - `task_desc="Author documentation guide [exempt: docs]"`
2. **Assertions:**
   - Assert prompt contains `Targeted Verification (Exempt: docs)` or `Targeted Verification (Exempt)`.
   - Assert prompt contains `git diff --name-only`.
   - Assert prompt contains `docs(conductor): Author documentation guide`.
   - Assert prompt does NOT contain `(Red Phase)` or instructions to run containerized Jest / expect assertion failures.
3. **Expected Red Failure:**  
   `AssertionError` because `build_exec_prompt` currently formats `Targeted Verification (Green Phase)` with containerized Jest.

---

## 6. Execution Verification Protocol

### 6.1 Run Failing Tests (Empirical Red Confirmation)
Execute only the newly added exempt test cases:

```bash
python3.11 -m unittest scripts/__tests__/test_generate_prompt.py -k exempt
```
**Expected Outcome:** `FAILED (failures=2, errors=1)` (or similar non-zero failure confirming all 3 exempt tests fail on `KeyError: 'exempt'` and `AssertionError`).

### 6.2 Run Pre-Existing Baseline Tests (No Regression)
Execute all tests excluding the new exempt tests to verify zero regression across baseline capabilities:

```bash
python3.11 -m unittest scripts/__tests__/test_generate_prompt.py -k "not exempt"
```
**Expected Outcome:** `OK` (all pre-existing baseline unit tests pass with exit code `0`).

### 6.3 Git Tree Cleanliness Verification
Verify that ONLY the test file was touched:

```bash
git status --short
```
**Expected Outcome:** Only `M scripts/__tests__/test_generate_prompt.py` is present. No production code files in `scripts/agent/generate-prompt.py` or elsewhere have been modified.

---

## 7. Post-Execution Protocol & Git Notes

Upon confirming the tests fail cleanly with expected assertion errors:

### 7.1 Stage & Commit Red Test Changes
```bash
git add scripts/__tests__/test_generate_prompt.py
git commit -m "test(agent): add failing unit tests for [exempt: <category>] task parsing and non-TDD strategy (TDD Red phase)"
```

### 7.2 Attach Git Note
Obtain commit hash (`COMMIT_HASH=$(git log -1 --format="%H")`) and attach the standard metadata note:

```bash
git notes add -m "Task: Write failing unit tests for [exempt: <category>] task parsing and non-TDD verification strategy (TDD Red phase)
Summary: Added unit tests in scripts/__tests__/test_generate_prompt.py covering [exempt: <category>] task parsing across all six canonical categories (ui, styling, infra, scripts, types, docs), case-insensitivity, coexisting commit SHA handling, non-TDD verification strategy mapping (commands and commit types), and exempt execution prompt rendering. Confirmed clean test failures against existing un-updated prompt generator (TDD Red phase).
Files: scripts/__tests__/test_generate_prompt.py
Rationale: Strict TDD Red phase for Issue #162 Phase 1 Task 3 establishing the failing test harness prior to implementing exempt parsing and verification strategy in Task 4." $COMMIT_HASH
```

### 7.3 Update Conductor Plan
Update `conductor/tracks/conductor-auto-runner_20261112/plan.md`:
- Change `- [ ] Task: Write failing unit tests for [exempt: <category>] task parsing and non-TDD verification strategy (TDD Red phase)` to `- [x] Task: Write failing unit tests for [exempt: <category>] task parsing and non-TDD verification strategy (TDD Red phase) [commit: <short_sha>]`.
- Stage `conductor/tracks/conductor-auto-runner_20261112/plan.md`.
- Commit with:
  ```bash
  git commit -m "conductor(plan): Mark task 'Write failing unit tests for [exempt: <category>] task parsing and non-TDD verification strategy' as complete"
  ```

---

## 8. Confirmation Gate

Halt immediately. Do NOT modify `scripts/__tests__/test_generate_prompt.py` or any repository files until explicit affirmative user approval is received via the `ask_question` modal.
