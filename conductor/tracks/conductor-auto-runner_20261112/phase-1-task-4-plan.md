# Implementation Plan: Phase 1 Task 4 — Implement `[exempt: <category>]` Parsing and Non-TDD Verification Strategy in `generate-prompt.py` (TDD Green phase)

**Track:** `conductor-auto-runner_20261112` (Issue [#162](https://github.com/jarredb9/finger-lakes-app-57/issues/162))  
**Phase:** 1 (Test Baseline Stabilization & `[exempt: <category>]` Task Taxonomy)  
**Task:** 4 (Implement `[exempt: <category>]` parsing and non-TDD verification strategy in `generate-prompt.py` — TDD Green phase)  
**Track Specification:** [conductor/tracks/conductor-auto-runner_20261112/spec.md](./spec.md)  
**Track Plan:** [conductor/tracks/conductor-auto-runner_20261112/plan.md](./plan.md)  
**Preceding Task Plan:** [conductor/tracks/conductor-auto-runner_20261112/phase-1-task-3-plan.md](./phase-1-task-3-plan.md)  
**Workflow Reference:** [conductor/workflow.md](../../workflow.md)  
**Operating Principles:** [AGENTS.md](../../../AGENTS.md)  

---

## 1. Executive Summary & Objective

### 1.1 Objective
Implement production code changes in `scripts/agent/generate-prompt.py` to turn the failing unit tests from Task 3 green (TDD Green phase), establishing full support for `[exempt: <category>]` task parsing, non-TDD verification strategy inference, and category-specific execution prompt rendering.

Specifically:
1. **Plan Parser Taxonomy Extension (`parse_plan_tasks`):**  
   Parse the `[exempt: <category>]` tag across all 6 canonical categories (`ui`, `styling`, `infra`, `scripts`, `types`, `docs`) into a dedicated `"exempt"` dictionary field, normalize values to lowercase (case-insensitivity), handle coexisting commit SHAs regardless of tag ordering, and cleanly sanitize `description` by stripping the `[exempt: ...]` tag.
2. **Strategy Inference Taxonomy Extension (`infer_verification_strategy`):**  
   Map each canonical exempt category to its designated non-TDD verification command, conventional commit prefix, and human instruction:
   - `ui` & `styling` $\rightarrow$ `["npm run build"]`, commit type `style(...)`, mode `"exempt"`.
   - `infra` & `scripts` $\rightarrow$ `["npm run lint"]`, commit type `chore(...)`, mode `"exempt"`.
   - `types` $\rightarrow$ `["npm run type-check"]`, commit type `types(...)`, mode `"exempt"`.
   - `docs` $\rightarrow$ `["git diff --name-only"]`, commit type `docs(...)`, mode `"exempt"`.
   Ensure `infer_verification_strategy` accepts both embedded tag annotations in `task_desc` and explicit `exempt="<category>"` keyword arguments.
3. **Execution Prompt Formatting Extension (`build_exec_prompt`):**  
   Render an exempt-specific verification block (`2. Targeted Verification (Exempt: <category>):`) instructing the agent to run the category-specific check without enforcing Red phase test failure assertions or containerized Jest runners. Ensure commit messages in the prompt reflect conventional exempt prefixes (`docs(...)`, `style(...)`, `chore(...)`, `types(...)`).
4. **Context Guarding (`extract_post_execution_info`):**  
   Guard plan file post-execution extraction by ensuring the plan document on disk actually corresponds to the target task description, preventing historical/sibling plan files (such as Red test plans) from bleeding commit messages into exempt tasks.
5. **Achieve 100% Green Test Suite:**  
   Confirm all 3 failing unit tests in `scripts/__tests__/test_generate_prompt.py` (`test_parse_plan_tasks_extracts_exempt_categories`, `test_infer_verification_strategy_exempt_categories`, `test_build_exec_prompt_formats_exempt_verification_block`) pass cleanly, and verify 100% passing baseline across the entire test suite.

---

## 2. Invariants & Critical Guardrails

1. **Strict TDD Green Phase Protocol ([AGENTS.md](../../../AGENTS.md) Section 5 & `conductor/workflow.md`):**
   - The task scope is strictly limited to production implementation in `scripts/agent/generate-prompt.py` to turn the Task 3 tests green.
   - Do NOT modify test assertions in `scripts/__tests__/test_generate_prompt.py`; production code must strictly conform to the established test harness contracts.
   - All tests in `scripts/__tests__/test_generate_prompt.py` must pass with exit code `0`.
2. **Backwards Compatibility & Baseline Preservation:**
   - Standard TDD Red tasks (`failing unit test`, `red phase`, `write failing`) and Green tasks (`implement `, `green phase`) must retain their existing behavior when `[exempt: ...]` is absent.
   - Checkpoint tasks (`--checkpoint`, `is_checkpoint_task`) must retain their diff-gated verification and verification prompt rendering.
   - Legacy and existing CLI invocations must remain 100% functional without regressions.
3. **Execution Environment:**
   - Script unit tests run directly via the host Python runtime:
     `python3.11 -m unittest scripts/__tests__/test_generate_prompt.py`
4. **Modal Approval Invariant (`conductor_antigravity.md` & [AGENTS.md](../../../AGENTS.md) Section 2):**
   - Under `/plan` or any confirmation gate, halt and await explicit affirmative user approval via `ask_question` before modifying any files.
   - A response of `User Skipped` is strictly non-affirmative.

---

## 3. Target Files & Semantic Insertion Anchors

### 3.1 Production Seam: Prompt Generator
- **Path:** `scripts/agent/generate-prompt.py`
- **Semantic Insertion Anchors:**
  1. *Parser Taxonomy Extraction:*  
     Inside `parse_plan_tasks` (around lines 178–204), where `task_match` is evaluated:
     Before extracting SHA and finalizing `clean_desc`, extract `[exempt: <category>]` via regex, normalize category to lowercase, strip the tag from `clean_desc`, and include `"exempt": exempt_cat` in the task dictionary.
  2. *Plan Post-Execution Context Guard:*  
     In `extract_post_execution_info` (around lines 1091–1127):
     Accept optional `task_desc: str = ""` argument. If provided, sanitize `clean_desc` (stripping any `[exempt: ...]`) and assert `clean_desc.lower() in content.lower()`; if not found, return `(None, None)` to bypass mismatched plan file commit messages.
  3. *Strategy Inference Taxonomy Mapping:*  
     In `infer_verification_strategy` (around lines 744–1030):
     - Add `exempt: Optional[str] = None` to function signature.
     - Detect exempt category from keyword argument `exempt` or regex search on `all_task_text`.
     - When an exempt category is resolved: set `resolved_mode = "exempt"`, `is_red = False`, assign category-specific verification commands (`npm run build`, `npm run lint`, `npm run type-check`, `git diff --name-only`), category-specific instruction, and conventional commit message (`style(...)`, `chore(...)`, `types(...)`, `docs(...)`).
     - Include `"exempt": resolved_exempt` in the returned dictionary.
  4. *Execution Prompt Formatting:*  
     In `build_exec_prompt` (around lines 1211–1250):
     - Add `exempt: Optional[str] = None` to function signature and forward to `infer_verification_strategy`.
     - Forward `task_desc` to `extract_post_execution_info(plan_path, task_desc)`.
     - For exempt mode (`strategy["mode"] == "exempt"`), if `plan_commit_msg` lacks conventional exempt prefix (`style(`, `chore(`, `types(`, `docs(`), fall back to `strategy["commit_msg"]`.
     - Format `verification_block` with header `2. Targeted Verification (Exempt: <category>):` and category verification commands without Red phase failure instructions.
  5. *CLI Main Task Parameter Forwarding:*  
     In `main()` (around lines 1450–1535):
     Extract `task_exempt = phase_tasks[task_num - 1].get("exempt")` and forward `exempt=task_exempt` to `infer_verification_strategy` and `build_exec_prompt`.

---

## 4. Signatures, Types & Data Contracts

### 4.1 Python Function Signatures & Type Hints

```python
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

def parse_plan_tasks(track_name: Optional[str]) -> Dict[int, Dict[str, Any]]:
    """
    Parses phases, tasks, and subtasks from track plan.md.
    
    TaskDict schema:
    {
        "status": "complete" | "in_progress" | "pending",
        "description": str,           # Sanitized description with [exempt: ...] stripped
        "subtasks": List[str],
        "commit_sha": Optional[str],  # 7-character commit SHA or None
        "is_checkpoint": bool,
        "exempt": Optional[str],      # Canonical category: "ui" | "styling" | "infra" | "scripts" | "types" | "docs" | None
        "raw_line": str,
    }
    """
    ...

def extract_post_execution_info(
    plan_file: Optional[Path],
    task_desc: str = "",
) -> Tuple[Optional[str], Optional[str]]:
    """
    Extracts the post-execution section reference and any explicit task commit message from the plan file.
    Guards against mismatched plan files when task_desc is provided.
    """
    ...

def infer_verification_strategy(
    track_name: str,
    phase_num: Optional[int],
    task_num: Optional[int],
    task_desc: str = "",
    subtasks: Optional[List[str]] = None,
    mode: Optional[str] = None,
    exempt: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Infers the optimal targeted verification strategy and commit message.
    
    StrategyDict schema:
    {
        "commands": List[str],
        "instruction": str,
        "commit_msg": str,
        "mode": "exempt" | "red" | "green" | "checkpoint" | "full",
        "is_red": bool,
        "is_checkpoint": bool,
        "exempt": Optional[str],
        "checkpoint_context": Optional[Dict[str, Any]],
    }
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
) -> str:
    """
    Builds the execution prompt for Tier 2 execution turn.
    Renders exempt verification block when strategy['mode'] == 'exempt'.
    """
    ...
```

---

## 5. Precise Behavioral Logic & Edge Cases

### 5.1 Plan Parser Extraction Logic (`parse_plan_tasks`)
1. **Regex Patterns:**
   - `exempt_re = re.compile(r"\[exempt:\s*([a-zA-Z0-9_\-]+)\]", re.IGNORECASE)`
2. **Extraction Sequence:**
   - On matching top-level task line `task_match`:
     - Search for `exempt_re` anywhere in `task_desc`.
     - If matched:
       `exempt_cat = match.group(1).lower()`
       `task_desc_clean = exempt_re.sub("", task_desc).strip()`
     - Else:
       `exempt_cat = None`
       `task_desc_clean = task_desc`
   - Evaluate `task_sha_re` on `task_desc_clean` to extract `commit_sha` and produce final sanitized `clean_desc`.
   - Also remove trailing `[checkpoint: ...]` tags if present.
   - Clean any trailing or double whitespace from `clean_desc`.
   - Construct task dictionary containing `"exempt": exempt_cat` and sanitized `"description": clean_desc`.
3. **Edge Cases Handled:**
   - Mixed case: `[exempt: UI]` $\rightarrow$ normalized to `"ui"`.
   - Coexisting commit SHA: `- [x] Task: Completed chore script [exempt: scripts] [commit: a1b2c3d]` $\rightarrow$ extracts `exempt="scripts"`, `commit_sha="a1b2c3d"`, and `description="Completed chore script"`.
   - Unannotated tasks: `exempt=None`, standard TDD descriptions preserved verbatim.

### 5.2 Verification Strategy Taxonomy Mapping (`infer_verification_strategy`)
1. **Exempt Resolution Precedence:**
   - Priority 1: Explicit keyword argument `exempt` if provided and non-empty: `resolved_exempt = exempt.lower()`.
   - Priority 2: Embedded tag regex in `task_desc` or `all_task_text`: `re.search(r"\[exempt:\s*([a-zA-Z0-9_\-]+)\]", all_task_text, re.IGNORECASE)`.
   - Priority 3: Fallback check on `phases.get(phase_num, {}).get("tasks", [])[task_num - 1].get("exempt")` if `track_name`, `phase_num`, and `task_num` are supplied.
   - Priority 4: `resolved_exempt = None`.
2. **Exempt Taxonomy Mapping Table:**
   | Canonical Category | Commands | Commit Prefix | Mode | Instruction |
   | :--- | :--- | :--- | :--- | :--- |
   | `ui` | `["npm run build"]` | `style(` | `exempt` | `"- Verify application build passes cleanly with npm run build (UI exempt task)."` |
   | `styling` | `["npm run build"]` | `style(` | `exempt` | `"- Verify application build passes cleanly with npm run build (Styling exempt task)."` |
   | `infra` | `["npm run lint"]` | `chore(` | `exempt` | `"- Verify lint checks pass cleanly with npm run lint (Infra exempt task)."` |
   | `scripts` | `["npm run lint"]` | `chore(` | `exempt` | `"- Verify lint checks pass cleanly with npm run lint (Scripts exempt task)."` |
   | `types` | `["npm run type-check"]` | `types(` | `exempt` | `"- Verify TypeScript types pass cleanly with npm run type-check (Types exempt task)."` |
   | `docs` | `["git diff --name-only"]` | `docs(` | `exempt` | `"- Verify documentation changes with git diff --name-only (Docs exempt task)."` |
   | *(other/unknown)* | `["npm run lint"]` | `chore(` | `exempt` | `f"- Verify exempt task ({resolved_exempt})."` |
3. **Commit Message Formatting:**
   - Sanitize task description for commit message:
     `clean_task_desc = re.sub(r"\s*\[exempt:[^\]]+\]", "", task_desc, flags=re.IGNORECASE).strip() or f"Execute Phase {phase_num} Task {task_num}"`
   - Compose commit message:
     `commit_msg = f"{commit_prefix}{scope}): {clean_task_desc}"`
4. **State Transition:**
   - When `resolved_exempt` is present:
     `resolved_mode = "exempt"`
     `is_red = False`
     Skip Red phase test failure checks and containerized Jest runners.

### 5.3 Execution Prompt Rendering (`build_exec_prompt`)
1. **Verification Block Structure for Exempt Mode:**
   ```python
   elif strategy["mode"] == "exempt":
       cat_suffix = f": {strategy['exempt']}" if strategy.get("exempt") else ""
       verification_block = f"""2. Targeted Verification (Exempt{cat_suffix}):
   - Run category-specific verification check:
{cmd_lines}
   - Confirm verification check passes cleanly before committing."""
   ```
2. **Prompt Commit Message Precedence:**
   - When `strategy["mode"] == "exempt"`, ensure the commit message placed in the prompt matches the exempt strategy:
     If `plan_commit_msg` exists but does not start with an exempt prefix (`style(`, `chore(`, `types(`, `docs(`), use `strategy["commit_msg"]`.

---

## 6. Execution Verification Protocol

### 6.1 Run Failing Exempt Tests (Targeted Green Verification)
Execute only the exempt unit tests added in Task 3 to verify they turn green:

```bash
python3.11 -m unittest scripts/__tests__/test_generate_prompt.py -k exempt
```
**Expected Outcome:** `OK (tests=3)` (exit code `0`).

### 6.2 Run Full Test Suite (Zero Regression Baseline)
Execute all tests across `scripts/__tests__/test_generate_prompt.py` to confirm zero regressions:

```bash
python3.11 -m unittest scripts/__tests__/test_generate_prompt.py
```
**Expected Outcome:** `OK` (all tests pass cleanly with 0 failures, 0 errors, exit code `0`).

### 6.3 Git Tree Cleanliness Verification
Verify that only `scripts/agent/generate-prompt.py` was modified:

```bash
git status --short
```
**Expected Outcome:** Only `M scripts/agent/generate-prompt.py` is present.

---

## 7. Post-Execution Protocol & Git Notes

Upon confirming all tests pass cleanly:

### 7.1 Stage & Commit Implementation Changes
```bash
git add scripts/agent/generate-prompt.py
git commit -m "feat(agent): implement [exempt: <category>] parsing and non-TDD verification strategy (TDD Green phase)"
```

### 7.2 Attach Git Note
Obtain commit hash (`COMMIT_HASH=$(git log -1 --format="%H")`) and attach the standard metadata note:

```bash
git notes add -m "Task: Implement [exempt: <category>] parsing and non-TDD verification strategy in generate-prompt.py (TDD Green phase)
Summary: Implemented [exempt: <category>] extraction in parse_plan_tasks across canonical categories (ui, styling, infra, scripts, types, docs) with case-insensitivity and coexisting commit SHA handling. Extended infer_verification_strategy to map exempt tasks to dedicated non-TDD verification commands (npm run build, npm run lint, npm run type-check, git diff --name-only) and conventional commit prefixes (style, chore, types, docs). Added exempt verification block rendering to build_exec_prompt and guarded plan file post-execution parsing. Confirmed all 3 exempt tests and 100% of test suite pass cleanly (TDD Green phase).
Files: scripts/agent/generate-prompt.py
Rationale: Completes Issue #162 Phase 1 Task 4 (TDD Green phase), enabling the Conductor multi-task runner to parse exempt annotations and apply appropriate non-TDD validation strategies without enforcing false test failure invariants." $COMMIT_HASH
```

### 7.3 Update Conductor Plan
Update `conductor/tracks/conductor-auto-runner_20261112/plan.md`:
- Change `- [ ] Task: Implement [exempt: <category>] parsing and non-TDD verification strategy in generate-prompt.py (TDD Green phase)` to `- [x] Task: Implement [exempt: <category>] parsing and non-TDD verification strategy in generate-prompt.py (TDD Green phase) [commit: <short_sha>]`.
- Also mark subtasks complete `[x]`.
- Stage `conductor/tracks/conductor-auto-runner_20261112/plan.md`.
- Commit with:
  ```bash
  git commit -m "conductor(plan): Mark task 'Implement [exempt: <category>] parsing and non-TDD verification strategy in generate-prompt.py' as complete"
  ```

---

## 8. Confirmation Gate

Halt immediately. Do NOT modify `scripts/agent/generate-prompt.py` or any repository files until explicit affirmative user approval is received via the `ask_question` modal.
