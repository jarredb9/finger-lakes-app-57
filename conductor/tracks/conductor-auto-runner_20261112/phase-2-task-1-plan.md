# Implementation Plan: Phase 2 Task 1 — Write Failing Unit Tests for `--unattended` Checkpoint Prompt Generation (TDD Red phase)

**Track:** `conductor-auto-runner_20261112` (Issue [#162](https://github.com/jarredb9/finger-lakes-app-57/issues/162))  
**Phase:** 2 (Unattended Checkpoint Prompt Generation in `generate-prompt.py`)  
**Task:** 1 (Write failing unit tests for `--unattended` checkpoint prompt generation — TDD Red phase)  
**Track Specification:** [conductor/tracks/conductor-auto-runner_20261112/spec.md](./spec.md)  
**Track Plan:** [conductor/tracks/conductor-auto-runner_20261112/plan.md](./plan.md)  
**Preceding Task Plan:** [conductor/tracks/conductor-auto-runner_20261112/phase-1-task-4-plan.md](./phase-1-task-4-plan.md)  
**Workflow Reference:** [conductor/workflow.md](../../workflow.md)  
**Operating Principles:** [AGENTS.md](../../../AGENTS.md)  

---

## 1. Executive Summary & Objective

### 1.1 Objective
Author failing unit tests in `scripts/__tests__/test_generate_prompt.py` to establish the authoritative test harness for `--unattended` checkpoint prompt generation in `scripts/agent/generate-prompt.py` (TDD Red phase).

Specifically:
1. **Unattended Checkpoint Directives & Absence of Interactive Modals (`test_build_checkpoint_prompt_unattended_skips_modal_pause_and_records_notes`):**  
   Assert that `build_checkpoint_prompt(..., unattended=True)` and `build_exec_prompt(..., unattended=True)`:
   - Strictly omit interactive modal pauses: `ask_question` and `"Pause via `ask_question`"` MUST NOT appear anywhere in the generated prompt.
   - Enforce authoritative automated test execution: contains directives declaring that automated test suites are authoritative for phase closure.
   - Direct manual verification checklist to Git notes: domain-aware manual checklist is recorded into the checkpoint commit git notes rather than halting the turn.
   - Format phase closure directives for unattended execution: directive 4 is titled `4. Verbatim Phase Closure (Unattended Mode):` instead of `4. Verbatim Phase Closure (Execute ONLY After Explicit Affirmative Approval):`.
   - Update git notes template: user confirmation line records `User Confirmation: Unattended execution mode (deferred manual verification).` instead of `User Confirmation: Explicitly approved via interactive modal.`.
2. **Attended Checkpoint Default Backward Compatibility (`test_build_checkpoint_prompt_attended_default_preserves_modal_gate`):**  
   Assert that `build_checkpoint_prompt(..., unattended=False)` (and `build_exec_prompt` without `--unattended`) strictly preserves all existing attended behaviors:
   - Includes `ask_question` and `"Pause via `ask_question`"`.
   - Includes `"Execute ONLY After Explicit Affirmative Approval"`.
   - Includes `"User Confirmation: Explicitly approved via interactive modal."`.
3. **CLI Argument & Flag Integration (`test_cli_checkpoint_unattended_flag`):**  
   Assert that `scripts/agent/generate-prompt.py` CLI supports `--unattended` and `-u` flags when paired with `--checkpoint`:
   - `python3 scripts/agent/generate-prompt.py --checkpoint --unattended` exits with code `0`.
   - Output prompt contains unattended execution directives and omits `ask_question`.
   - `python3 scripts/agent/generate-prompt.py --checkpoint -u` functions identically as the short flag alias.
4. **Empirical Red Phase Confirmation:**  
   Confirm that all new test cases fail with expected `TypeError: ... unexpected keyword argument 'unattended'` or `argparse.ArgumentError: unrecognized arguments: --unattended` / assertion errors against the existing `generate-prompt.py` implementation, while 100% of pre-existing baseline unit tests continue to pass.

---

## 2. Invariants & Critical Guardrails

1. **Strict TDD Red Phase Protocol ([AGENTS.md](../../../AGENTS.md) Section 5 & `conductor/workflow.md`):**
   - The scope of Task 1 is strictly restricted to test authoring in `scripts/__tests__/test_generate_prompt.py`.
   - **Zero Production Changes:** `scripts/agent/generate-prompt.py` and application code MUST NOT be modified in this task. Production implementation is exclusively scheduled for Task 2 (TDD Green phase).
   - The newly added tests MUST fail cleanly with assertion, type, or CLI argument errors, demonstrating that the test harness actively asserts the missing capability.
2. **Backwards Compatibility & Baseline Preservation:**
   - All existing test cases in `scripts/__tests__/test_generate_prompt.py` must continue to pass without failure or regression.
   - Default checkpoint generation (without `--unattended`) must retain the strict modal pause gate required by `AGENTS.md` Guardrail #5 for human-driven sessions.
3. **Execution Environment:**
   - Script unit tests run via host Python runtime:
     `python3.11 -m unittest scripts/__tests__/test_generate_prompt.py -k unattended`
4. **Modal Approval Invariant (`conductor_antigravity.md` & [AGENTS.md](../../../AGENTS.md) Section 2):**
   - Under `/plan` or any confirmation gate, halt and await explicit affirmative user approval via `ask_question` before modifying any files.

---

## 3. Target Files & Semantic Insertion Anchors

### 3.1 Test Suite Seam: Unit Tests
- **Path:** `scripts/__tests__/test_generate_prompt.py`
- **Semantic Insertion Anchors:**
  1. *Module Function Tests Insertion:*  
     Inside class `TestGeneratePromptModule`, immediately after `test_checkpoint_prompt_preserves_database_domain_for_historical_phase` (around line 254):
     Insert:
     - `test_build_checkpoint_prompt_unattended_skips_modal_pause_and_records_notes(self)`
     - `test_build_checkpoint_prompt_attended_default_preserves_modal_gate(self)`
  2. *CLI Flag Integration Tests Insertion:*  
     Inside class `TestGeneratePromptCLI`, immediately after `test_cli_checkpoint_single_prompt_output_and_pending_warning` (around line 518):
     Insert:
     - `test_cli_checkpoint_unattended_flag(self)`

---

## 4. Signatures, Types & Data Contracts

### 4.1 Python Function Signatures & Type Annotations

```python
from typing import Any, Dict, List, Optional, Tuple

def build_checkpoint_prompt(
    track_name: str,
    phase_num: Optional[int],
    task_num: Optional[int],
    task_desc: str,
    strategy: Dict[str, Any],
    unattended: bool = False,
) -> str:
    """Builds a self-contained, diff-gated Phase Checkpoint prompt.
    
    When unattended=True:
    - Omit interactive modal pauses and ask_question.
    - Declare automated test suites as authoritative for phase closure.
    - Direct manual verification checklist to Git notes.
    - Use unattended git notes template.
    """
    ...

def build_exec_prompt(
    track_name: str,
    phase_num: Optional[int],
    task_num: Optional[int],
    task_desc: str = "",
    subtasks: Optional[List[str]] = None,
    mode: Optional[str] = None,
    exempt: Optional[str] = None,
    unattended: bool = False,
) -> str:
    """Generates execution prompt, forwarding unattended flag to checkpoint prompt builder."""
    ...
```

### 4.2 CLI Argument Parser Contract

```python
parser.add_argument(
    "--unattended",
    "-u",
    action="store_true",
    help="Generate unattended checkpoint prompt without interactive modal pauses",
)
```

### 4.3 Test Method Signatures

```python
class TestGeneratePromptModule(unittest.TestCase):
    def test_build_checkpoint_prompt_unattended_skips_modal_pause_and_records_notes(self) -> None:
        """Verifies build_checkpoint_prompt with unattended=True omits ask_question and records manual steps in notes."""
        ...

    def test_build_checkpoint_prompt_attended_default_preserves_modal_gate(self) -> None:
        """Verifies default unattended=False preserves interactive modal confirmation gate and ask_question."""
        ...

class TestGeneratePromptCLI(unittest.TestCase):
    def test_cli_checkpoint_unattended_flag(self) -> None:
        """Verifies CLI --checkpoint --unattended and -u flags generate non-interactive checkpoint prompts."""
        ...
```

---

## 5. Precise Behavioral Logic & Test Scenarios

### 5.1 Test 1: `test_build_checkpoint_prompt_unattended_skips_modal_pause_and_records_notes`
1. **Setup & Inputs:**
   - Define a sample checkpoint strategy dictionary:
     ```python
     strategy = {
         "mode": "checkpoint",
         "commands": [
             "./scripts/containers/run-jest-container.sh lib/services/__tests__/tripService.test.ts",
             "npm run type-check",
         ],
         "checkpoint_context": {
             "clean_phase_name": "Test Phase",
             "raw_heading": "## Phase 1: Test Phase",
             "baseline_sha": "abc1234",
             "end_sha": "def5678",
             "changed_files": ["lib/services/tripService.ts"],
             "domain": "backend_tooling",
             "has_checkpoint_plan": False,
         },
     }
     ```
   - Invoke `generate_prompt.build_checkpoint_prompt("conductor-auto-runner_20261112", 1, 3, "Conductor - User Manual Verification", strategy, unattended=True)`.
   - Also invoke `generate_prompt.build_exec_prompt("conductor-auto-runner_20261112", 1, 3, "Conductor - User Manual Verification", unattended=True)`.
2. **Assertions on Unattended Output:**
   - `self.assertNotIn("ask_question", prompt)`
   - `self.assertNotIn("Pause via `ask_question`", prompt)`
   - `self.assertNotIn("Execute ONLY After Explicit Affirmative Approval", prompt)`
   - `self.assertNotIn("Explicitly approved via interactive modal", prompt)`
   - `self.assertIn("Automated test suites are authoritative", prompt)`
   - `self.assertIn("Unattended Execution Mode", prompt)`
   - `self.assertIn("4. Verbatim Phase Closure (Unattended Mode):", prompt)`
   - `self.assertIn("User Confirmation: Unattended execution mode (deferred manual verification).", prompt)`
   - Check UI domain variant: when `domain="ui"`, assert that the prompt still contains UI manual steps directives but instructs recording them into Git notes instead of halting for `ask_question`.
3. **Expected Red Failure:**
   - `TypeError: build_checkpoint_prompt() got an unexpected keyword argument 'unattended'` (or `build_exec_prompt() got an unexpected keyword argument 'unattended'`).

### 5.2 Test 2: `test_build_checkpoint_prompt_attended_default_preserves_modal_gate`
1. **Setup & Inputs:**
   - Use the same `strategy` fixture.
   - Invoke `generate_prompt.build_checkpoint_prompt("conductor-auto-runner_20261112", 1, 3, "Conductor - User Manual Verification", strategy, unattended=False)` and without the argument `build_checkpoint_prompt(..., strategy)`.
2. **Assertions on Attended Output:**
   - `self.assertIn("ask_question", prompt)`
   - `self.assertIn("Pause via `ask_question` for explicit user approval", prompt)`
   - `self.assertIn("4. Verbatim Phase Closure (Execute ONLY After Explicit Affirmative Approval):", prompt)`
   - `self.assertIn("User Confirmation: Explicitly approved via interactive modal.", prompt)`
   - `self.assertNotIn("Automated test suites are authoritative", prompt)`
   - `self.assertNotIn("Unattended Execution Mode", prompt)`
3. **Expected Red Failure:**
   - `TypeError: build_checkpoint_prompt() got an unexpected keyword argument 'unattended'`.

### 5.3 Test 3: `test_cli_checkpoint_unattended_flag`
1. **Setup & Execution:**
   - Create a temporary track directory with a valid `plan.md` containing a completed task and an incomplete checkpoint task.
   - Run CLI command via `self.run_cli(["--track", str(tmp_path), "--phase", "1", "--checkpoint", "--unattended"])`.
   - Run CLI command via `self.run_cli(["--track", str(tmp_path), "--phase", "1", "--checkpoint", "-u"])`.
2. **Assertions:**
   - Both executions return exit code `0`.
   - `self.assertNotIn("ask_question", result.stdout)`
   - `self.assertIn("Unattended Execution Mode", result.stdout)`
   - `self.assertIn("User Confirmation: Unattended execution mode", result.stdout)`
3. **Expected Red Failure:**
   - CLI returns exit code `2` with `generate-prompt.py: error: unrecognized arguments: --unattended` (and `-u`).

---

## 6. Execution Verification Protocol

### 6.1 Run Targeted Red Unit Tests
Execute the new unattended tests to observe expected Red failures:

```bash
python3.11 -m unittest scripts/__tests__/test_generate_prompt.py -k unattended
```
**Expected Outcome:** `FAILED (errors=2, failures=1)` or similar non-zero failure confirming all unattended tests fail cleanly due to missing `--unattended` argument and `unattended` function parameters.

### 6.2 Run Pre-Existing Baseline Tests (No Regression)
Execute all tests excluding the new unattended tests to verify zero regression across baseline capabilities:

```bash
python3.11 -m unittest scripts/__tests__/test_generate_prompt.py -k "not unattended"
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

Upon confirming the tests fail cleanly with expected assertion/type errors:

### 7.1 Stage & Commit Red Test Changes
```bash
git add scripts/__tests__/test_generate_prompt.py
git commit -m "test(agent): add failing unit tests for --unattended checkpoint prompt generation (TDD Red phase)"
```

### 7.2 Attach Git Note
Obtain commit hash (`COMMIT_HASH=$(git log -1 --format="%H")`) and attach the standard metadata note:

```bash
git notes add -m "Task: Write failing unit tests for --unattended checkpoint prompt generation (TDD Red phase)
Summary: Added unit tests in scripts/__tests__/test_generate_prompt.py covering build_checkpoint_prompt and build_exec_prompt with unattended=True, regression coverage for default attended modal confirmation gates, and CLI support for --unattended and -u flags. Confirmed clean test failures against existing prompt generator implementation (TDD Red phase).
Files: scripts/__tests__/test_generate_prompt.py
Rationale: Strict TDD Red phase for Issue #162 Phase 2 Task 1 establishing the failing test harness prior to implementing --unattended prompt generation in Task 2." $COMMIT_HASH
```

### 7.3 Update Conductor Plan
Update `conductor/tracks/conductor-auto-runner_20261112/plan.md`:
- Change `- [ ] Task: Write failing unit tests for \`--unattended\` checkpoint prompt generation (TDD Red phase)` to `- [x] Task: Write failing unit tests for \`--unattended\` checkpoint prompt generation (TDD Red phase) [commit: <short_sha>]`.
- Stage `conductor/tracks/conductor-auto-runner_20261112/plan.md`.
- Commit with:
  ```bash
  git commit -m "conductor(plan): Mark task 'Write failing unit tests for --unattended checkpoint prompt generation' as complete"
  ```

---

## 8. Confirmation Gate

Halt immediately. Do NOT modify `scripts/__tests__/test_generate_prompt.py` or any repository files until explicit affirmative user approval is received via the `ask_question` modal.
