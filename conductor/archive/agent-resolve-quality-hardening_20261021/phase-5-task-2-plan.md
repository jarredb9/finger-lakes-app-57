# Implementation Plan — Phase 5, Task 2: Implement prompt context pruning and static prefix caching to pass tests (TDD Green phase)

## 1. Overview & Objective
Implement the production code changes required to transition Phase 5 of `agent-resolve-quality-hardening_20261021` from the TDD Red phase to the Green phase.

### Primary Objectives:
1. **Context Pruning in `agent_resolve.context`:**
   - Extend `get_project_context(include_tree: bool = False) -> str` with default `include_tree = False`.
   - When `include_tree=False`, return strictly the domain model (`CONTEXT.md`) and architectural rules (`AGENTS.md`), omitting repository file tree listings and bypassing `get_repository_tree()` invocation.
   - When `include_tree=True`, invoke `get_repository_tree()` and append the repository source inventory.
2. **Explicit Tree Inclusion in Stage 1 (Plan):**
   - Import `get_repository_tree` in `stage_1_plan.py` and invoke it explicitly.
   - Format and append the repository file inventory to the Stage 1 prompt to support authoritative file selection during architectural planning.
3. **Repository Tree Omission in Stage 2 (Red) & Stage 3 (Green):**
   - In `stage_2_red.py` and `stage_3_green.py`, invoke `get_project_context()` with default `include_tree=False` (and omit all calls to `get_repository_tree()`).
   - Pruning the repository file tree saves several thousand tokens per execution attempt across executor retry cycles.
4. **Static Prefix Prompt Caching Layout (Stages 1, 2, and 3):**
   - Position an immutable stage role declaration at byte 0 across all three stages:
     - Stage 1: `"You are the Staff Principal Architect generating an authoritative implementation blueprint."`
     - Stage 2: `"You are the Red Phase Executor Agent authoring failing tests."`
     - Stage 3: `"You are the Green Phase Executor Agent implementing code to satisfy the requirements."`
   - Omit dynamic tokens (`issue_number`, `issue_title`) from the first line / role header.
   - Structure static repository guidelines (`### REPOSITORY DOMAIN MODEL (CONTEXT.md):` and `### ARCHITECTURAL RULES & STANDARDS (AGENTS.md):`) immediately after the byte 0 role declaration.
   - Ensure all dynamic context (`ISSUE CONTEXT:`, `Issue #`, blueprints, snippets, stubs, retry errors, resumption contexts) strictly succeeds the static guidelines block to maximize Gemini prompt caching hit rates (>70%).
5. **Legacy Context Test Alignment:**
   - Update pre-existing tests in `scripts/agent-resolve/tests/test_context.py` that explicitly verify repository tree inclusion (`test_combines_context_md_agents_md_and_repository_tree` and `test_handles_missing_context_and_agents_files_gracefully`) to pass `include_tree=True`.

---

## 2. Target Files & Semantic Insertion Anchors

### 2.1 Context Module
- **Path:** `scripts/agent-resolve/agent_resolve/context.py`
- **Semantic Insertion Anchor:** Function `get_project_context()` at lines 56–80, preceding `find_related_test_files()`.
- **Target Modifications:**
  - Update signature to `def get_project_context(include_tree: bool = False) -> str:`.
  - Assemble `base_context` containing domain model (`CONTEXT.md`) and architectural rules (`AGENTS.md`).
  - Conditionally invoke `get_repository_tree()` if and only if `include_tree` is `True`.
  - Append non-empty repository tree string when `include_tree=True`.
  - Return formatted string ending in newline.

### 2.2 Stage 1 Planner
- **Path:** `scripts/agent-resolve/agent_resolve/stages/stage_1_plan.py`
- **Semantic Insertion Anchor:**
  - Import block at lines 12–16: add `get_repository_tree` to imports from `agent_resolve.context`.
  - Prompt construction inside `stage_1_plan()` loop at lines 105–128.
- **Target Modifications:**
  - Import `get_repository_tree`.
  - Invoke `repo_tree = get_repository_tree()`.
  - Restructure prompt string:
    - Byte 0 role header: `"You are the Staff Principal Architect generating an authoritative implementation blueprint."`.
    - Follow immediately with `{project_context}`.
    - Follow with repository tree block (if present).
    - Follow with dynamic issue context: `ISSUE CONTEXT:\nIssue #{issue_number}: {issue_title}\n\n{issue_body}`.
    - Follow with `{feedback_section}`, `{diagnostic_section}`, instructions, and JSON schema directive.

### 2.3 Stage 2 Red Phase Executor
- **Path:** `scripts/agent-resolve/agent_resolve/stages/stage_2_red.py`
- **Semantic Insertion Anchor:** Prompt construction inside `stage_2_red()` retry loop at lines 78–105.
- **Target Modifications:**
  - Restructure prompt string:
    - Byte 0 role header: `"You are the Red Phase Executor Agent authoring failing tests."`.
    - Follow immediately with `{project_context}` (which omits repository tree via `include_tree=False`).
    - Follow with dynamic issue context: `ISSUE CONTEXT:\nIssue #{issue_number}: {issue_title}`.
    - Follow with `ARCHITECTURAL BLUEPRINT (task-plan.md):`, `EXISTING TEST CONTEXT:`, `TARGET TEST FILES:`, `new_src_prompt_section`, `last_compiler_error`, directives, and JSON schema directive.

### 2.4 Stage 3 Green Phase Executor
- **Path:** `scripts/agent-resolve/agent_resolve/stages/stage_3_green.py`
- **Semantic Insertion Anchor:** Prompt construction inside `stage_3_green()` retry loop at lines 78–104.
- **Target Modifications:**
  - Restructure prompt string:
    - Byte 0 role header: `"You are the Green Phase Executor Agent implementing code to satisfy the requirements."`.
    - Follow immediately with `{project_context}` (which omits repository tree via `include_tree=False`).
    - Follow with dynamic issue context: `ISSUE CONTEXT:\nIssue #{issue_number}: {issue_title}`.
    - Follow with `ARCHITECTURAL BLUEPRINT:`, `TESTS TO PASS:`, `CURRENT SOURCE FILES:`, `resumption_section`, `last_error_context`, directives, and JSON schema directive.

### 2.5 Context Unit Test Suite
- **Path:** `scripts/agent-resolve/tests/test_context.py`
- **Semantic Insertion Anchor:** Inside `TestGetProjectContext` class at lines 83–115.
- **Target Modifications:**
  - Update `test_combines_context_md_agents_md_and_repository_tree` (line 93) to invoke `get_project_context(include_tree=True)`.
  - Update `test_handles_missing_context_and_agents_files_gracefully` (line 110) to invoke `get_project_context(include_tree=True)`.

---

## 3. Interfaces, Types & Exported Signatures

### 3.1 Context Module Signature (`scripts/agent-resolve/agent_resolve/context.py`)
```python
def get_project_context(include_tree: bool = False) -> str:
    """
    Extracts essential project standards and architecture guidelines (CONTEXT.md and AGENTS.md).
    When include_tree is True, appends the repository source file tree from get_repository_tree().
    Defaults to False to optimize static prompt caching prefixes and reduce token overhead.

    Parameters:
        include_tree: Whether to append the repository file inventory. Defaults to False.

    Returns:
        str: Formatted markdown string containing domain model and architectural rules.
    """
```

### 3.2 Stage Functions Signatures (`scripts/agent-resolve/agent_resolve/stages/*.py`)
```python
# stage_1_plan.py
def stage_1_plan(
    client: Any,
    issue_number: int,
    issue_title: str,
    issue_body: str,
    token_tracker: TokenTracker,
    negative_feedback: str = "",
    diagnostic_result: Optional[DiagnosticResult] = None,
) -> BlueprintPlan: ...

# stage_2_red.py
def stage_2_red(
    client: Any,
    issue_number: int,
    issue_title: str,
    blueprint: BlueprintPlan,
    token_tracker: TokenTracker,
    new_src_files: Optional[List[str]] = None,
    initial_error_context: str = "",
    baseline_ref: str = "HEAD",
) -> None: ...

# stage_3_green.py
def stage_3_green(
    client: Any,
    issue_number: int,
    issue_title: str,
    blueprint: BlueprintPlan,
    token_tracker: TokenTracker,
    new_src_files: Optional[List[str]] = None,
    baseline_ref: str = "HEAD",
    resumption_context: Optional[str] = None,
) -> None: ...
```

### 3.3 Prompt Layout Structural Blueprint Across Pipeline Stages
| Component / Offset | Stage 1 (Planner) | Stage 2 (Red Executor) | Stage 3 (Green Executor) |
| :--- | :--- | :--- | :--- |
| **Byte 0 Header** | `"You are the Staff Principal Architect generating an authoritative implementation blueprint."` | `"You are the Red Phase Executor Agent authoring failing tests."` | `"You are the Green Phase Executor Agent implementing code to satisfy the requirements."` |
| **Static Guidelines** | `get_project_context(include_tree=False)` | `get_project_context(include_tree=False)` | `get_project_context(include_tree=False)` |
| **Repo File Tree** | `get_repository_tree()` (explicit) | *Omitted* | *Omitted* |
| **Dynamic Issue Info** | `ISSUE CONTEXT:\nIssue #{issue_number}: {issue_title}\n\n{issue_body}` | `ISSUE CONTEXT:\nIssue #{issue_number}: {issue_title}` | `ISSUE CONTEXT:\nIssue #{issue_number}: {issue_title}` |
| **Dynamic Artifacts** | `feedback_section` + `diagnostic_section` | `task-plan.md` + Existing Tests + Target Tests + Stubs + Compiler Error | `task-plan.md` + Target Tests + Target Sources + Resumption + Error Context |
| **Directives & Schema** | Stage 1 Invariants + BlueprintPlan JSON directive | Stage 2 Red Directives + TestPatchManifest JSON directive | Stage 3 Green Directives + PatchManifest JSON directive |

---

## 4. Precise Behavioral Logic, Conditions & Edge Cases

1. **`get_project_context` Implementation Details:**
   - Read `CONTEXT.md` from `project_root / "CONTEXT.md"` if it exists; otherwise empty string `""`.
   - Read `AGENTS.md` from `project_root / "AGENTS.md"` if it exists; otherwise empty string `""`.
   - Format static markdown block:
     ```markdown
     ### REPOSITORY DOMAIN MODEL (CONTEXT.md):
     {context_md}

     ### ARCHITECTURAL RULES & STANDARDS (AGENTS.md):
     {agents_md}
     ```
   - When `include_tree` is `False`:
     - Do not call `get_repository_tree()`.
     - Return `{base_context}\n`.
   - When `include_tree` is `True`:
     - Invoke `repo_tree = get_repository_tree()`.
     - If `repo_tree` is non-empty, return `{base_context}\n\n{repo_tree}\n`.
     - If `repo_tree` is empty, return `{base_context}\n`.

2. **Stage 1 Prompt Construction:**
   - Retrieve `project_context = get_project_context()` (pruned).
   - Retrieve `repo_tree = get_repository_tree()`.
   - Format optional `repo_tree_section = f"\n{repo_tree}\n" if repo_tree else ""`.
   - Compose prompt beginning with immutable role header at index 0, followed by `{project_context}`, `{repo_tree_section}`, dynamic issue context, feedback, diagnostics, and instructions.

3. **Stage 2 Prompt Construction:**
   - Retrieve `project_context = get_project_context()` (pruned).
   - Compose prompt beginning with immutable role header at index 0:
     `"You are the Red Phase Executor Agent authoring failing tests."`.
   - Follow with `\n\n{project_context}\n\nISSUE CONTEXT:\nIssue #{issue_number}: {issue_title}\n\nARCHITECTURAL BLUEPRINT (task-plan.md):\n{plan_md}...`.
   - Do not invoke or inject `get_repository_tree()`.

4. **Stage 3 Prompt Construction:**
   - Retrieve `project_context = get_project_context()` (pruned).
   - Compose prompt beginning with immutable role header at index 0:
     `"You are the Green Phase Executor Agent implementing code to satisfy the requirements."`.
   - Follow with `\n\n{project_context}\n\nISSUE CONTEXT:\nIssue #{issue_number}: {issue_title}\n\nARCHITECTURAL BLUEPRINT:\n{plan_md}...`.
   - Do not invoke or inject `get_repository_tree()`.

5. **Legacy Test Alignment (`scripts/agent-resolve/tests/test_context.py`):**
   - Lines 93 and 110 of `test_context.py` test tree inclusion and graceful handling of missing guidelines when the tree is included. Both tests must pass `include_tree=True` to reflect the parametric signature.
   - The newly authored Red phase tests (`test_get_project_context_defaults_to_omitting_repository_tree` and `test_get_project_context_with_include_tree_false_omits_repository_tree`) verify that default and explicit `False` calls omit the tree.

---

## 5. Execution Verification Protocol

Execute tests inside the local Python 3.12 test harness:

1. **Verify Context Pruning Tests Pass:**
   ```bash
   python3.12 -m unittest scripts/agent-resolve/tests/test_context.py
   ```
   *Expected Outcome:* Exit code 0, all 13 tests in `test_context.py` pass.

2. **Verify Stage Prompt Caching & Omission Tests Pass:**
   ```bash
   python3.12 -m unittest scripts/agent-resolve/tests/test_stages.py
   ```
   *Expected Outcome:* Exit code 0, all stage tests pass, including prefix positioning and tree omission assertions across Stages 1, 2, and 3.

3. **Run Isolated Targeted Tests for Context & Stages:**
   ```bash
   python3.12 -m unittest scripts.agent-resolve.tests.test_context scripts.agent-resolve.tests.test_stages
   ```
   *Expected Outcome:* Exit code 0, all tests pass.

4. **Run Full Agent Test Suites:**
   ```bash
   npm run test:agent
   npm run test:agent:all
   ```
   *Expected Outcome:* Exit code 0, zero failures across the entire suite.

---

## 6. Post-Execution Protocol & Git Notes

Upon completing test execution and confirming clean Green phase test results:

1. **Commit Implementation:**
   - Commit message: `feat(agent): Implement prompt context pruning and static prefix caching (TDD Green phase)`
2. **Attach Git Note:**
   ```bash
   git notes add -m "Task: Phase 5 Task 2 - Implement prompt context pruning and static prefix caching to pass tests (TDD Green phase)
   Summary: Implemented get_project_context(include_tree=False) context pruning, explicit repository tree inclusion in Stage 1 Planner, repository tree omission in Stages 2 and 3, and immutable byte 0 role headers and static guidelines ordering across all stages to maximize Gemini prompt caching hit rates.
   Files: scripts/agent-resolve/agent_resolve/context.py, scripts/agent-resolve/agent_resolve/stages/stage_1_plan.py, scripts/agent-resolve/agent_resolve/stages/stage_2_red.py, scripts/agent-resolve/agent_resolve/stages/stage_3_green.py, scripts/agent-resolve/tests/test_context.py
   Rationale: Eliminates thousands of redundant repository tree tokens in executor retry attempts and locks static prompt prefixes at byte 0 to enable >70% prompt caching hit rates on Gemini models." <commit_hash>
   ```
3. **Update Track Plan:**
   - Mark Phase 5 Task 2 as completed `[x]` with commit SHA in `conductor/tracks/agent-resolve-quality-hardening_20261021/plan.md`.
