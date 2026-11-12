# Implementation Plan: Phase 2 Task 2 — Implement `--unattended` Checkpoint Prompt Generation in `generate-prompt.py` (TDD Green phase)

**Track:** `conductor-auto-runner_20261112` (Issue [#162](https://github.com/jarredb9/finger-lakes-app-57/issues/162))  
**Phase:** 2 (Unattended Checkpoint Prompt Generation in `generate-prompt.py`)  
**Task:** 2 (Implement `--unattended` checkpoint prompt generation in `generate-prompt.py` — TDD Green phase)  
**Track Specification:** [conductor/tracks/conductor-auto-runner_20261112/spec.md](./spec.md)  
**Track Plan:** [conductor/tracks/conductor-auto-runner_20261112/plan.md](./plan.md)  
**Preceding Task Plan:** [conductor/tracks/conductor-auto-runner_20261112/phase-2-task-1-plan.md](./phase-2-task-1-plan.md)  
**Workflow Reference:** [conductor/workflow.md](../../workflow.md)  
**Operating Principles:** [AGENTS.md](../../../AGENTS.md)  

---

## 1. Executive Summary & Objective

### 1.1 Objective
Turn the failing unit tests authored in Phase 2 Task 1 green by implementing `--unattended` (`-u`) CLI flag support and non-interactive checkpoint prompt generation in `scripts/agent/generate-prompt.py` (TDD Green phase).

Specifically:
1. **Extend `build_checkpoint_prompt` Function**:
   - Accept `unattended: bool = False` parameter.
   - When `unattended=True`:
     - Omit interactive modal pause directives and `ask_question`.
     - Update Section 3 heading to `3. Domain-Aware Manual Verification (Unattended Execution Mode):`.
     - Inject directive affirming automated test suites are authoritative for phase closure in unattended runs.
     - Retain domain-specific verification instructions (UI browser steps, DB queries, tooling checks), but instruct the agent to record checklist items directly into Git notes rather than halting for user input.
     - Update Section 4 heading to `4. Verbatim Phase Closure (Unattended Mode):`.
     - Format checkpoint git note template to record `User Confirmation: Unattended execution mode (deferred manual verification).`.
   - When `unattended=False` (default):
     - Strictly preserve pre-existing attended interactive modal gate (`ask_question`), `"Execute ONLY After Explicit Affirmative Approval"`, and `"User Confirmation: Explicitly approved via interactive modal."`.
2. **Extend `build_exec_prompt` Function**:
   - Accept `unattended: bool = False` parameter.
   - Forward `unattended=unattended` to `build_checkpoint_prompt` when `strategy["mode"] == "checkpoint"`.
3. **Extend CLI Argument Parser**:
   - Add `--unattended` and `-u` boolean flags to `argparse.ArgumentParser`.
   - Pass `unattended=parsed.unattended` to `build_exec_prompt` in `main()`.
4. **Empirical Green Phase Confirmation**:
   - Confirm 100% of unit tests in `scripts/__tests__/test_generate_prompt.py` (including all 3 unattended test cases added in Task 1) pass cleanly with zero regressions.

---

## 2. Invariants & Critical Guardrails

1. **Strict TDD Green Phase Protocol ([AGENTS.md](../../../AGENTS.md) Section 5 & `conductor/workflow.md`):**
   - The scope of Task 2 is strictly restricted to production implementation in `scripts/agent/generate-prompt.py`.
   - **Zero Test File Changes:** `scripts/__tests__/test_generate_prompt.py` was finalized in Task 1 (Red phase) and MUST NOT be modified.
   - The executor must implement code strictly aligned with the test assertions until all tests pass.
2. **Attended Backward Compatibility Invariant ([AGENTS.md](../../../AGENTS.md) Guardrail #5):**
   - In standard (attended) execution where `--unattended` is omitted or `unattended=False`, `build_checkpoint_prompt` MUST continue to emit `ask_question` and enforce the interactive modal pause barrier.
3. **Git Cleanliness & Minimal Seam Modification:**
   - Modify only `scripts/agent/generate-prompt.py`. No other files in the repository may be touched during execution.
4. **Modal & Plan Approval Invariant (`conductor_antigravity.md` & [AGENTS.md](../../../AGENTS.md) Section 2):**
   - Under `/plan` or any confirmation gate, halt and await explicit affirmative user approval via `ask_question` before modifying any files.

---

## 3. Target Files & Semantic Insertion Anchors

### 3.1 Production Seam: Conductor Prompt Generator
- **Path:** `scripts/agent/generate-prompt.py`
- **Semantic Insertion Anchors:**
  1. *Docstring / CLI Examples Update:*  
     In module docstring (around line 12) and `ArgumentParser` epilog (around line 1393), add usage example:
     `python3 scripts/agent/generate-prompt.py --checkpoint --unattended`
  2. *`build_checkpoint_prompt` Signature & Logic:*  
     Line 1228: Update signature to `def build_checkpoint_prompt(track_name: str, phase_num: Optional[int], task_num: Optional[int], task_desc: str, strategy: Dict[str, Any], unattended: bool = False) -> str:`.  
     Lines 1293–1300: Branch Section 3 and Section 4 text generation based on `unattended`.
  3. *`build_exec_prompt` Signature & Call:*  
     Line 1309: Update signature to `def build_exec_prompt(..., unattended: bool = False) -> str:`.  
     Line 1325: Forward `unattended=unattended` in `build_checkpoint_prompt(track_name, phase_num, task_num, task_desc, strategy, unattended=unattended)`.
  4. *CLI Argument Parser Setup:*  
     Inside `main()` (around line 1424, directly after `phase_group` definition):  
     Add `parser.add_argument("--unattended", "-u", action="store_true", help="Generate unattended checkpoint prompt without interactive modal pauses")`.
  5. *CLI Execution Dispatch:*  
     Inside `main()` (line 1648):  
     Update `build_exec_prompt` invocation to pass `unattended=parsed.unattended`.

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
    """Builds a self-contained, diff-gated single-session Phase Checkpoint prompt.

    Args:
        track_name: Active or archived track directory name.
        phase_num: Target phase number.
        task_num: Target task number within phase.
        task_desc: Checkpoint task description.
        strategy: Inferred verification strategy dictionary.
        unattended: When True, omits ask_question modal pauses, declares automated test
            suites as authoritative, and formats notes for unattended phase closure.

    Returns:
        Formatted Phase Checkpoint prompt string.
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
    """Generates implementation prompt, forwarding unattended flag to checkpoint prompt builder.

    Args:
        track_name: Target track name.
        phase_num: Target phase number.
        task_num: Target task number.
        task_desc: Task description.
        subtasks: Optional list of subtasks.
        mode: Explicit mode override ('red', 'green', 'checkpoint', 'full').
        exempt: Optional exempt category string.
        unattended: When True, forwards to build_checkpoint_prompt for unattended execution.

    Returns:
        Formatted execution prompt string.
    """
    ...
```

### 4.2 CLI Argument Specification

```python
parser.add_argument(
    "--unattended",
    "-u",
    action="store_true",
    help="Generate unattended checkpoint prompt without interactive modal pauses",
)
```

---

## 5. Precise Behavioral Logic & State Transitions

### 5.1 `build_checkpoint_prompt` Behavioral Logic

1. **Context Resolution (Preserved):**
   - Extract `clean_phase_name`, `raw_heading`, `baseline_sha`, `end_sha`, `changed_files`, `domain`, and `has_checkpoint_plan` from `strategy["checkpoint_context"]`.
   - Determine `manual_directive` based on `domain` (`"ui"`, `"database"`, or default backend/tooling).

2. **Branching on `unattended`:**
   - **When `unattended == True`:**
     - **Section 3 Heading:** `"3. Domain-Aware Manual Verification (Unattended Execution Mode):"`
     - **Section 3 Content:**
       - `"   - Automated test suites are authoritative for phase closure in unattended runs."`
       - `f"   - {manual_directive}"`
       - `"   - Do NOT pause for user input or prompt via interactive dialogs; record the verification steps and observations directly into the git notes below."`
     - **Section 4 Heading:** `"4. Verbatim Phase Closure (Unattended Mode):"`
     - **Git Note Confirmation Line:** `"User Confirmation: Unattended execution mode (deferred manual verification)."`
   - **When `unattended == False`:**
     - **Section 3 Heading:** `"3. Domain-Aware Manual Verification & User Confirmation Gate:"`
     - **Section 3 Content:**
       - `f"   - {manual_directive}"`
       - `"   - Pause via `ask_question` for explicit user approval (`AGENTS.md` Guardrail #5: `User Skipped` or dismissal is strictly non-affirmative — halt immediately without committing)."`
     - **Section 4 Heading:** `"4. Verbatim Phase Closure (Execute ONLY After Explicit Affirmative Approval):"`
     - **Git Note Confirmation Line:** `"User Confirmation: Explicitly approved via interactive modal."`

3. **Template Assembly:**
   - Assemble checkpoint directives with selected Section 3 and Section 4 text.
   - Checkpoint commit (`git commit --allow-empty -m "conductor(checkpoint): Checkpoint end of Phase {phase_num}"`), git notes creation, and `plan.md` update instructions remain identical.

### 5.2 `build_exec_prompt` Delegation Logic

- If `strategy["mode"] == "checkpoint"`:
  - Invoke `build_checkpoint_prompt(track_name, phase_num, task_num, task_desc, strategy, unattended=unattended)` and return result.
- For all other modes (`red`, `green`, `exempt`, `full`):
  - Continue standard prompt building logic unchanged.

### 5.3 `main()` CLI Integration Logic

- Add `--unattended` / `-u` to `parser` (as a global optional flag, NOT inside `phase_group` so it can be combined with `--checkpoint`).
- When calling `build_exec_prompt`:
  ```python
  exec_prompt = build_exec_prompt(
      track_name,
      phase_num,
      task_num,
      task_desc,
      subtasks,
      mode,
      exempt=task_exempt,
      unattended=parsed.unattended,
  )
  ```
- When `--checkpoint` is active and `--plan-only` is not specified, `exec_prompt` (now containing the unattended directives) is printed to stdout or copied to clipboard.

---

## 6. Execution Verification Protocol

### 6.1 Targeted Unattended Unit Tests
Run the 3 tests authored in Task 1 to confirm they transition from Red to Green:

```bash
python3.11 -m unittest scripts/__tests__/test_generate_prompt.py -k unattended
```
**Expected Outcome:** `OK` (Ran 3 tests in <0.1s, 0 failures, 0 errors).

### 6.2 Full Test Suite Regression Check
Run all unit tests in `scripts/__tests__/test_generate_prompt.py` to confirm zero regressions across baseline functionality:

```bash
python3.11 -m unittest scripts/__tests__/test_generate_prompt.py
```
**Expected Outcome:** `OK` (Ran 26 tests, 0 failures, 0 errors).

### 6.3 CLI End-to-End Smoke Test
Verify CLI invocation directly via shell execution:

```bash
python3 scripts/agent/generate-prompt.py --checkpoint --unattended
```
**Expected Outcome:**
- Exits with status code `0`.
- Output contains `Unattended Execution Mode` and `User Confirmation: Unattended execution mode`.
- Output contains `Automated test suites are authoritative`.
- Output contains `4. Verbatim Phase Closure (Unattended Mode):`.
- Output DOES NOT contain `ask_question`.

### 6.4 Git Tree Cleanliness Verification
Verify that ONLY `scripts/agent/generate-prompt.py` was modified:

```bash
git status --short
```
**Expected Outcome:** Only `M scripts/agent/generate-prompt.py` is listed.

---

## 7. Post-Execution Protocol & Git Notes

Upon empirical verification that all tests pass:

### 7.1 Stage & Commit Production Code
```bash
git add scripts/agent/generate-prompt.py
git commit -m "feat(agent): implement --unattended checkpoint prompt generation in generate-prompt.py (TDD Green phase)"
```

### 7.2 Attach Git Note
Obtain the commit SHA (`COMMIT_HASH=$(git log -1 --format="%H")`) and attach the standard metadata note:

```bash
git notes add -m "Task: Implement --unattended checkpoint prompt generation in generate-prompt.py (TDD Green phase)
Summary: Added --unattended and -u CLI flags and extended build_checkpoint_prompt and build_exec_prompt in scripts/agent/generate-prompt.py to support non-interactive phase checkpoint prompt generation. Enforced authoritative automated test execution, manual verification recording into git notes, and unattended phase closure templates while preserving 100% attended modal pause gates by default. Verified all 26 unit tests pass cleanly.
Files: scripts/agent/generate-prompt.py
Rationale: Closes Issue #162 Phase 2 Task 2, providing the unattended checkpoint generation capability required by Gate 1 in conductor-auto.py." $COMMIT_HASH
```

### 7.3 Update Conductor Plan
Update `conductor/tracks/conductor-auto-runner_20261112/plan.md`:
- Change `- [ ] Task: Implement \`--unattended\` checkpoint prompt generation in \`generate-prompt.py\` (TDD Green phase)` to `- [x] Task: Implement \`--unattended\` checkpoint prompt generation in \`generate-prompt.py\` (TDD Green phase) [commit: <short_sha>]`.
- Stage and commit the plan:
  ```bash
  git add conductor/tracks/conductor-auto-runner_20261112/plan.md
  git commit -m "conductor(plan): Mark task 'Implement --unattended checkpoint prompt generation in generate-prompt.py' as complete"
  ```

---

## 8. Confirmation Gate

Halt immediately. Do NOT modify `scripts/agent/generate-prompt.py` or any repository files until explicit affirmative user approval is received via the `ask_question` modal.
