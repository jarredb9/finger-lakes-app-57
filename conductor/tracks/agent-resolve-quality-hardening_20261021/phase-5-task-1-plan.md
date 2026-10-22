# Implementation Plan — Phase 5, Task 1: Write failing unit tests for prompt context pruning and static prefix caching layout (TDD Red phase)

## 1. Overview & Objective
Establish authoritative failing unit tests for Phase 5 of `agent-resolve-quality-hardening_20261021`. This Red phase verifies:
1. **Context Pruning in `agent_resolve.context`:**
   - `get_project_context(include_tree: bool = False)` signature with `include_tree = False` default.
   - When `include_tree=False` (default or explicit), repository file tree section (`### EXISTING REPOSITORY SOURCE FILES:`) is omitted from project context and `get_repository_tree()` is not invoked.
   - When `include_tree=True` (explicit), repository file tree section is included via `get_repository_tree()`.
2. **Repository Tree Omission in Execution Stages:**
   - Stage 2 Red Phase Executor (`stage_2_red.py`) prompts omit repository file tree dumps (`### EXISTING REPOSITORY SOURCE FILES:`).
   - Stage 3 Green Phase Executor (`stage_3_green.py`) prompts omit repository file tree dumps (`### EXISTING REPOSITORY SOURCE FILES:`).
3. **Static Prefix Prompt Caching Layout (Stages 1, 2, and 3):**
   - Prompts in Stage 1 (`stage_1_plan.py`), Stage 2 (`stage_2_red.py`), and Stage 3 (`stage_3_green.py`) position an immutable role header at byte 0.
   - The first line / role header does not contain dynamic issue details (`issue_number`, `issue_title`).
   - Static repository guidelines (`### REPOSITORY DOMAIN MODEL (CONTEXT.md):` and `### ARCHITECTURAL RULES & STANDARDS (AGENTS.md):`) appear immediately after the role header, strictly preceding all dynamic context (`ISSUE CONTEXT:`, `Issue #`, `ARCHITECTURAL BLUEPRINT`, code snippets, compiler errors, and retry contexts).

As a strict TDD Red phase, all newly authored tests must fail cleanly against the current unadapted codebase and pass cleanly upon completion of Phase 5 Task 2 (Green phase).

---

## 2. Target Files & Semantic Insertion Anchors

### 2.1 Context Module Tests
- **Path:** `scripts/agent-resolve/tests/test_context.py`
- **Action:** Modify existing test suite.
- **Semantic Insertion Anchor:** Inside `TestGetProjectContext` class, directly after `test_respects_dynamic_project_root_updates` (line 132) and immediately preceding `class TestFindRelatedTestFiles(unittest.TestCase):` (line 134).
- **Target Additions:**
  - `test_get_project_context_defaults_to_omitting_repository_tree`:
    - Asserts that invoking `get_project_context()` with no arguments returns domain model and architectural rules but omits `### EXISTING REPOSITORY SOURCE FILES:`.
  - `test_get_project_context_with_include_tree_false_omits_repository_tree`:
    - Mocks `get_repository_tree` with a non-empty string.
    - Invokes `get_project_context(include_tree=False)`.
    - Asserts `mock_get_tree.assert_not_called()`.
    - Asserts `### EXISTING REPOSITORY SOURCE FILES:` is not present in output string.
  - `test_get_project_context_with_include_tree_true_includes_repository_tree`:
    - Mocks `get_repository_tree` returning `"### EXISTING REPOSITORY SOURCE FILES:\n- lib/app.ts"`.
    - Invokes `get_project_context(include_tree=True)`.
    - Asserts `mock_get_tree.assert_called_once()`.
    - Asserts `### EXISTING REPOSITORY SOURCE FILES:\n- lib/app.ts` is present in output string.

### 2.2 Stage 1 Planner Prompt Caching Layout Tests
- **Path:** `scripts/agent-resolve/tests/test_stages.py`
- **Action:** Modify existing test suite.
- **Semantic Insertion Anchor:** Inside `TestStage1Plan` class, directly after `test_stage_1_prompt_contains_target_test_cohesion_and_deduplication_directive` (line 621) and immediately preceding `class TestStage2Red(unittest.TestCase):` (line 624).
- **Target Additions:**
  - `test_stage_1_prompt_places_static_guidelines_and_role_header_at_prefix`:
    - Runs `stage_1_plan(self.client, 42, "Prompt Caching Optimization", "Body", self.tracker)` with `get_project_context` returning domain guidelines.
    - Captures prompt passed to `call_gemini_with_fallback`.
    - Asserts prompt begins with immutable role header: `prompt.startswith("You are the Staff Principal Architect generating an authoritative implementation blueprint.")`.
    - Asserts the first line does not contain dynamic issue details: `"42" not in first_line` and `"Prompt Caching Optimization" not in first_line`.
    - Asserts static domain guidelines appear before dynamic issue context:
      - `pos_context = prompt.find("### REPOSITORY DOMAIN MODEL (CONTEXT.md):")`
      - `pos_agents = prompt.find("### ARCHITECTURAL RULES & STANDARDS (AGENTS.md):")`
      - `pos_issue = prompt.find("Issue #42")`
      - `pos_context != -1 and pos_agents != -1 and pos_issue != -1`
      - `pos_context < pos_issue` and `pos_agents < pos_issue`.

### 2.3 Stage 2 Red Phase Context Pruning & Prompt Caching Layout Tests
- **Path:** `scripts/agent-resolve/tests/test_stages.py`
- **Action:** Modify existing test suite.
- **Semantic Insertion Anchor:** Inside `TestStage2Red` class, directly after `test_stage_2_authors_brand_new_test_file_with_empty_search_block` (line 1149) and immediately preceding `class TestStage3Green(unittest.TestCase):` (line 1152).
- **Target Additions:**
  - `test_stage_2_prompt_omits_repository_tree`:
    - Creates `task-plan.md` in `self.root`.
    - Defines a valid `BlueprintPlan`.
    - Mocks `get_repository_tree` returning `"### EXISTING REPOSITORY SOURCE FILES:\n- lib/unrelated.ts"`.
    - Runs `stage_2_red(...)` with patched test runners.
    - Captures prompt passed to `call_gemini_with_fallback`.
    - Asserts `"### EXISTING REPOSITORY SOURCE FILES:" not in prompt`.
  - `test_stage_2_prompt_places_static_guidelines_and_role_header_at_prefix`:
    - Runs `stage_2_red(...)` and captures prompt.
    - Asserts prompt begins with immutable role header: `prompt.startswith("You are the Red Phase Executor Agent authoring failing tests.")`.
    - Asserts first line does not contain dynamic issue details: `"42" not in first_line` and `"Issue Title" not in first_line`.
    - Asserts static domain guidelines precede dynamic issue, blueprint, and test context:
      - `pos_context < prompt.find("Issue #42")`
      - `pos_context < prompt.find("ARCHITECTURAL BLUEPRINT")`
      - `pos_agents < prompt.find("Issue #42")`
      - `pos_agents < prompt.find("ARCHITECTURAL BLUEPRINT")`.

### 2.4 Stage 3 Green Phase Context Pruning & Prompt Caching Layout Tests
- **Path:** `scripts/agent-resolve/tests/test_stages.py`
- **Action:** Modify existing test suite.
- **Semantic Insertion Anchor:** Inside `TestStage3Green` class, directly after `test_eslint_config_enforces_no_nested_ternary` (line 2171) and immediately preceding `if __name__ == "__main__":` (line 2173).
- **Target Additions:**
  - `test_stage_3_prompt_omits_repository_tree`:
    - Creates `task-plan.md` in `self.root`.
    - Defines a valid `BlueprintPlan`.
    - Mocks `get_repository_tree` returning `"### EXISTING REPOSITORY SOURCE FILES:\n- lib/unrelated.ts"`.
    - Runs `stage_3_green(...)` with patched verification runners.
    - Captures prompt passed to `call_gemini_with_fallback`.
    - Asserts `"### EXISTING REPOSITORY SOURCE FILES:" not in prompt`.
  - `test_stage_3_prompt_places_static_guidelines_and_role_header_at_prefix`:
    - Runs `stage_3_green(...)` and captures prompt.
    - Asserts prompt begins with immutable role header: `prompt.startswith("You are the Green Phase Executor Agent implementing code to satisfy the requirements.")` (or `prompt.startswith("You are the Green Phase Executor Agent")`).
    - Asserts first line does not contain dynamic issue details: `"42" not in first_line` and `"Issue Title" not in first_line`.
    - Asserts static domain guidelines precede dynamic issue, blueprint, and source code context:
      - `pos_context < prompt.find("Issue #42")`
      - `pos_context < prompt.find("ARCHITECTURAL BLUEPRINT")`
      - `pos_agents < prompt.find("Issue #42")`
      - `pos_agents < prompt.find("ARCHITECTURAL BLUEPRINT")`.

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
    ...
```

### 3.2 Prompt Layout Invariants Across Pipeline Stages
| Stage | Target Role Header (Byte 0) | Static Guidelines Block | Dynamic Context Sequencing |
| :--- | :--- | :--- | :--- |
| **Stage 1 (Plan)** | `"You are the Staff Principal Architect generating an authoritative implementation blueprint."` | `CONTEXT.md` + `AGENTS.md` | Repository tree -> `ISSUE CONTEXT` -> Stage 0 findings -> Instructions |
| **Stage 2 (Red)** | `"You are the Red Phase Executor Agent authoring failing tests."` | `CONTEXT.md` + `AGENTS.md` | `ISSUE CONTEXT` -> `task-plan.md` -> Existing tests -> Target tests -> Stubs -> Retry error -> Directives |
| **Stage 3 (Green)** | `"You are the Green Phase Executor Agent implementing code to satisfy the requirements."` | `CONTEXT.md` + `AGENTS.md` | `ISSUE CONTEXT` -> `task-plan.md` -> Target tests -> Source files -> Resumption context -> Retry error -> Directives |

---

## 4. Precise Behavioral Logic, Conditions & Edge Cases

1. **`get_project_context` Default & Parametric Behavior:**
   - Calling `get_project_context()` with zero arguments evaluates `include_tree=False`.
   - When `include_tree=False`:
     - Does not invoke `get_repository_tree()`.
     - Output contains `### REPOSITORY DOMAIN MODEL (CONTEXT.md):` and `### ARCHITECTURAL RULES & STANDARDS (AGENTS.md):`.
     - Output does not contain `### EXISTING REPOSITORY SOURCE FILES:`.
   - When `include_tree=True`:
     - Invokes `get_repository_tree()` and appends its formatted source inventory.

2. **Immutable Role Headers at Byte 0:**
   - The prompt string must begin at index 0 with an immutable role declaration describing the agent persona.
   - Dynamic parameters `{issue_number}` and `{issue_title}` are prohibited on the first line to prevent invalidating Gemini prefix prompt caching.

3. **Prefix Ordering & Dynamic Partitioning:**
   - For all three stages, static guidelines (`CONTEXT.md` and `AGENTS.md`) must be emitted immediately following the role header.
   - All dynamic sections containing issue specifics, blueprints, snippets, or retry error messages must strictly follow the static guidelines block (`pos_static < pos_dynamic`).

4. **Tree Omission in Stages 2 & 3:**
   - Both `stage_2_red.py` and `stage_3_green.py` execute with pruned project context (`include_tree=False`).
   - Repository source file listings must not appear anywhere in Stage 2 or Stage 3 prompts, reducing token overhead by several thousand tokens per execution attempt.

5. **Expected Red Phase Failure Modes:**
   - `get_project_context(include_tree=False)` raises `TypeError: get_project_context() got an unexpected keyword argument 'include_tree'` on the unadapted `context.py`.
   - `test_get_project_context_defaults_to_omitting_repository_tree` fails with `AssertionError: '### EXISTING REPOSITORY SOURCE FILES:' unexpectedly found in ...`.
   - Stage 1, 2, and 3 prompt caching tests fail because current prompts start with `... for Issue #{issue_number}: {issue_title}.` (violating byte 0 immutability and placing dynamic tokens before `pos_context`).
   - Stage 2 and 3 tree omission tests fail because current stages unconditionally include repository trees via unpruned `get_project_context()`.

---

## 5. Execution Verification Protocol

Execute tests inside the local Python 3.12 test harness:

1. **Verify Context Pruning Tests (Red Failure Expected):**
   ```bash
   python3.12 -m unittest scripts/agent-resolve/tests/test_context.py
   ```
   *Expected Outcome:* Fails with `TypeError` (unexpected keyword argument `include_tree`) or `AssertionError` (presence of repository tree in default context).

2. **Verify Stage Prompt Caching & Omission Tests (Red Failure Expected):**
   ```bash
   python3.12 -m unittest scripts/agent-resolve/tests/test_stages.py
   ```
   *Expected Outcome:* Fails with `AssertionError` indicating dynamic tokens in first line, static guidelines positioned after dynamic issue context, or repository tree present in Stage 2/3 prompts.

3. **Verify Agent Test Suite Entrypoint (Red Failure Expected):**
   ```bash
   npm run test:agent
   ```
   *Expected Outcome:* Exit code != 0, showing failing tests strictly within the newly authored prompt caching and context pruning test methods, with all pre-existing Phase 1-4 tests passing.

---

## 6. Post-Execution Protocol & Git Notes

Upon completing test execution and confirming expected Red phase failures:

1. **Commit Test Additions:**
   - Commit message: `test(agent): Add failing tests for prompt context pruning and static prefix caching (TDD Red phase)`
2. **Attach Git Note:**
   ```bash
   git notes add -m "Task: Phase 5 Task 1 - Write failing unit tests for prompt context pruning and static prefix caching layout (TDD Red phase)
   Summary: Authored failing unit tests verifying get_project_context(include_tree=False) context pruning, Stage 2 and Stage 3 repository tree omission, and byte 0 immutable role header and static prefix guidelines ordering across Stages 1, 2, and 3.
   Files: scripts/agent-resolve/tests/test_context.py, scripts/agent-resolve/tests/test_stages.py
   Rationale: Establishes rigorous test-driven acceptance criteria for optimizing Gemini prompt cache hit rates and eliminating repository tree token bloat in autonomous resolve stages." <commit_hash>
   ```
3. **Update Track Plan:**
   - Mark Phase 5 Task 1 as completed `[x]` with commit SHA in `conductor/tracks/agent-resolve-quality-hardening_20261021/plan.md`.
