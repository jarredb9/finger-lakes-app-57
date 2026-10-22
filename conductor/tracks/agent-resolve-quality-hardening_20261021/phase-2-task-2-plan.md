# Implementation Plan — Phase 2, Task 2: Implement Stage 1 test deduplication and blast radius demotion to pass tests (TDD Green phase)

## 1. Overview & Objective
Transition Phase 2 of `agent-resolve-quality-hardening_20261021` from Red to Green by implementing architectural target test deduplication, blast radius demotion routing, and prompt cohesion directives in the Stage 1 Planner:
1. Implement `extract_test_component_stem` and `deduplicate_target_test_files` in `agent_resolve.context` to partition candidate target test files into primary targets and demoted suites based on component stem grouping and specialization hierarchy.
2. Re-export deduplication functions from `agent_resolve/__init__.py` for seamless package-level availability.
3. Update `stage_1_plan.py` to:
   - Sanitize and deduplicate `blueprint.target_test_files`.
   - Route unselected / demoted suites into `blueprint.blast_radius_test_files` alongside model-specified candidates and `find_related_test_files` results.
   - Enforce deduplication and the `MAX_BLAST_RADIUS_TESTS = 8` bounding ceiling across all blast radius candidates while excluding primary targets.
   - Inject the prompt cohesion directive into Item 7 of the Stage 1 Planner system instructions: `"Select only the single most cohesive test file for each modified source file. Do not duplicate identical unit tests across multiple test files."`.
4. Run all unit tests and verify that the Red phase tests authored in Phase 2 Task 1 pass cleanly with zero regressions across the entire suite.

---

## 2. Target Files & Semantic Insertion Anchors

### 2.1 Context Test Deduplication Engine
- **Path:** `scripts/agent-resolve/agent_resolve/context.py`
- **Action:** Modify existing module.
- **Semantic Insertion Anchors:**
  1. **Constants:** Directly following `JEST_PATHSPECS` (line 16), declare `JEST_EXTENSIONS: tuple[str, ...] = (".test.tsx", ".spec.tsx", ".test.ts", ".spec.ts")`.
  2. **Functions:** Directly after `find_related_test_files` (line 116) and immediately preceding `extract_test_suite_names` (line 118), insert `extract_test_component_stem` and `deduplicate_target_test_files`.
  3. **Module Exports:** In `__all__` list (line 175), insert `"extract_test_component_stem"` and `"deduplicate_target_test_files"`.

### 2.2 Package Re-exports & Facade
- **Path:** `scripts/agent-resolve/agent_resolve/__init__.py`
- **Action:** Modify existing module.
- **Semantic Insertion Anchors:**
  1. **Imports:** In `from agent_resolve.context import (...)` (lines 81-88), add `deduplicate_target_test_files` and `extract_test_component_stem`.
  2. **Package Exports:** In `__all__` list (lines 210-216 under `"context"`), add `"deduplicate_target_test_files"` and `"extract_test_component_stem"`.

### 2.3 Stage 1 Planner Integration & Blast Radius Routing
- **Path:** `scripts/agent-resolve/agent_resolve/stages/stage_1_plan.py`
- **Action:** Modify existing module.
- **Semantic Insertion Anchors:**
  1. **Imports:** In `from agent_resolve.context import find_related_test_files, get_project_context` (line 12), add `deduplicate_target_test_files`.
  2. **Prompt Directive:** In Item 7 of the `stage_1_plan` prompt (line 117), append `" Select only the single most cohesive test file for each modified source file. Do not duplicate identical unit tests across multiple test files."`.
  3. **Target Test Deduplication:** Inside the planner attempt loop (line 135), after `valid_tests, _invalid_tests = sanitize_target_test_files(blueprint.target_test_files)`, execute deduplication to partition `primary_tests` and `demoted_tests`, update `blueprint.target_test_files = primary_tests`, and track `demoted_tests`.
  4. **Blast Radius Routing:** In blast radius assembly (line 157), combine `list(blueprint.blast_radius_test_files or []) + demoted_tests + find_related_test_files(blueprint.target_src_files)`, preserving deduplication and capping at `MAX_BLAST_RADIUS_TESTS = 8`.

---

## 3. Function Signatures & Interfaces

### 3.1 Stem Extraction & Deduplication Signatures (`scripts/agent-resolve/agent_resolve/context.py`)
```python
JEST_EXTENSIONS: tuple[str, ...] = (".test.tsx", ".spec.tsx", ".test.ts", ".spec.ts")

def extract_test_component_stem(path: str) -> tuple[str, str]:
    """
    Extracts (grouping_key, specialization) from a Jest test path.

    Parameters:
        path: Relative or normalized path to a Jest test file.

    Returns:
        tuple[str, str]:
            - grouping_key: Normalized directory path combined with base component stem
              (e.g., 'lib/stores/__tests__/wineryStore').
            - specialization: Component specialization sub-extension
              (e.g., 'persist', 'enrichment', 'variant'), or '' for generic fallback suites.
    """
    ...

def deduplicate_target_test_files(target_test_files: Sequence[str]) -> tuple[list[str], list[str]]:
    """
    Deduplicates candidate target test files by architectural component stem.

    For each unique component stem:
    - Retains only the single most specialized suite (e.g., .persist.test.ts, .enrichment.test.ts)
      in primary target test files.
    - Demotes unselected generic fallback suites (e.g., .test.ts) and extra specialized suites
      into demoted test files for downstream blast radius regression coverage.
    - Retains generic suites when no specialized suite exists for that component stem.
    - Preserves distinct directory namespaces (e.g., lib/utils vs components).

    Parameters:
        target_test_files: Sequence of candidate test file paths.

    Returns:
        tuple[list[str], list[str]]: (primary_target_tests, demoted_tests)
    """
    ...
```

### 3.2 Stage 1 Import Signature (`scripts/agent-resolve/agent_resolve/stages/stage_1_plan.py`)
```python
from agent_resolve.context import (
    deduplicate_target_test_files,
    find_related_test_files,
    get_project_context,
)
```

---

## 4. Precise Behavioral Logic & Edge Cases

### 4.1 Path Normalization and Stem Extraction (`extract_test_component_stem`)
1. **Path Normalization:**
   - Normalize path separators: `norm_path = path.replace("\\", "/").lstrip("./")`.
   - Separate directory and filename: `dir_name = os.path.dirname(norm_path)`, `filename = os.path.basename(norm_path)`.
2. **Extension Stripping:**
   - Iterate over `JEST_EXTENSIONS = (".test.tsx", ".spec.tsx", ".test.ts", ".spec.ts")`.
   - If `filename.endswith(ext)`, strip `ext` to derive `base_name = filename[:-len(ext)]`.
   - If no recognized Jest extension matches, fall back to `base_name = filename`.
3. **Stem vs. Specialization Decomposition:**
   - If `"." in base_name`:
     - Split on the first dot: `stem, specialization = base_name.split(".", 1)`.
   - Else:
     - `stem = base_name`
     - `specialization = ""`
4. **Grouping Key Formulation:**
   - `grouping_key = f"{dir_name}/{stem}"` if `dir_name` else `stem`.
   - Returns `(grouping_key, specialization)`.
   - *Examples:*
     - `"lib/stores/__tests__/wineryStore.persist.test.ts"` -> `("lib/stores/__tests__/wineryStore", "persist")`
     - `"lib/stores/__tests__/wineryStore.test.ts"` -> `("lib/stores/__tests__/wineryStore", "")`
     - `"components/__tests__/TripCard.variant.spec.tsx"` -> `("components/__tests__/TripCard", "variant")`
     - `"lib/utils/__tests__/format.test.ts"` -> `("lib/utils/__tests__/format", "")`
     - `"components/__tests__/format.test.tsx"` -> `("components/__tests__/format", "")` (distinct grouping key from `lib/utils/__tests__/format` due to directory prefix)

### 4.2 Grouping & Prioritization Partitioning (`deduplicate_target_test_files`)
1. **Input Deduplication & Preservation of Arrival Order:**
   - Filter exact duplicate input strings while maintaining order using an ordered set / `seen` pattern:
     ```python
     unique_inputs: list[str] = []
     seen_inputs: set[str] = set()
     for tf in target_test_files:
         if tf not in seen_inputs:
             seen_inputs.add(tf)
             unique_inputs.append(tf)
     ```
2. **Grouping by Component Stem:**
   - Maintain a dictionary mapping `grouping_key -> list[tuple[str, str]]` (`[(tf, specialization), ...]`), preserving the encounter order of stems and files.
3. **Partitioning Rules Per Component Stem:**
   - For each `grouping_key` in the ordered dictionary:
     - Extract `specialized = [tf for tf, spec in items if spec != ""]`.
     - Extract `generic = [tf for tf, spec in items if spec == ""]`.
     - **Branch A — Specialized suite present (`len(specialized) > 0`):**
       - The primary suite is the first specialized suite encountered: `chosen = specialized[0]`.
       - Append `chosen` to `primary_target_tests`.
       - Any other file in `items` for that stem is demoted in original arrival order:
         ```python
         for tf, _ in items:
             if tf != chosen:
                 demoted_tests.append(tf)
         ```
     - **Branch B — Only generic suites present (`len(specialized) == 0`):**
       - The primary suite is the first generic suite: `chosen = generic[0]`.
       - Append `chosen` to `primary_target_tests`.
       - Any subsequent generic suites for the same stem beyond the first are demoted (`for tf in generic[1:]: demoted_tests.append(tf)`). If only one generic suite exists, `demoted_tests` receives no entries for this stem.
4. **Returns:** `(primary_target_tests, demoted_tests)`.

### 4.3 Stage 1 Planner Pipeline Routing (`stage_1_plan`)
1. **Loop State Tracking:**
   - Initialize `latest_demoted_tests: list[str] = []` prior to the `for attempt in range(1, max_planner_attempts + 1):` loop.
2. **Inside Attempt Loop:**
   - After receiving `blueprint` from `call_gemini_with_fallback`:
     ```python
     valid_tests, _invalid_tests = sanitize_target_test_files(blueprint.target_test_files)
     primary_tests, demoted_tests = deduplicate_target_test_files(valid_tests)
     blueprint.target_test_files = primary_tests
     latest_demoted_tests = demoted_tests
     ```
   - If `blueprint.target_test_files` is non-empty, break out of retry loop.
3. **Blast Radius Merging & Capping:**
   - Assemble raw candidate list:
     ```python
     raw_blast_candidates = (
         list(blueprint.blast_radius_test_files or [])
         + latest_demoted_tests
         + find_related_test_files(blueprint.target_src_files)
     )
     ```
   - Filter, deduplicate, and bound:
     - Create `target_tests_set = set(blueprint.target_test_files)`.
     - Iterate through `raw_blast_candidates`:
       - Check `is_valid_target_test_file(candidate)`.
       - Check `candidate not in target_tests_set` (prevents target suites from appearing in blast radius).
       - Check `candidate not in seen_blast`.
       - If valid and unseen, append to `sanitized_blast` and add to `seen_blast`.
       - If `len(sanitized_blast) >= MAX_BLAST_RADIUS_TESTS` (8), break immediately.
   - Assign `blueprint.blast_radius_test_files = sanitized_blast`.
4. **Prompt Directive:**
   - Update Item 7 of `INSTRUCTIONS & ARCHITECTURAL INVARIANTS` in `stage_1_plan.py`:
     ```text
     7. Identify explicit target test files (e.g. `lib/utils/__tests__/foo.test.ts` or `components/__tests__/Bar.test.tsx`). Select only the single most cohesive test file for each modified source file. Do not duplicate identical unit tests across multiple test files.
     ```

---

## 5. Execution Verification Protocol

Execute tests to verify that the Phase 2 Task 1 unit tests now pass cleanly:

1. **Verify Context Test Deduplication Suite (Green Phase):**
   ```bash
   python3.12 -m unittest scripts/agent-resolve/tests/test_context.py -k "TestDeduplicateTargetTestFiles"
   ```
   *Expected Result:* 8/8 tests pass (`OK`).

2. **Verify Stage 1 Planner Integration & Blast Radius Tests (Green Phase):**
   ```bash
   python3.12 -m unittest scripts/agent-resolve/tests/test_stages.py -k "test_stage_1_deduplicates_target_tests|test_stage_1_prompt_contains_target_test_cohesion|test_stage_1_demoted_test_files"
   ```
   *Expected Result:* All matching Stage 1 tests pass (`OK`).

3. **Verify Full Modular Agent Test Suite:**
   ```bash
   npm run test:agent
   ```
   *Expected Result:* All tests pass across the entire modular `agent-resolve` test suite.

4. **Verify Full Extended Agent Suite:**
   ```bash
   npm run test:agent:all
   ```
   *Expected Result:* All tests pass with zero regressions.

---

## 6. Post-Execution Commit & Git Notes Protocol

1. **Commit Implementation Changes (requires `BypassSandbox: true`):**
   ```bash
   git add scripts/agent-resolve/agent_resolve/context.py \
           scripts/agent-resolve/agent_resolve/__init__.py \
           scripts/agent-resolve/agent_resolve/stages/stage_1_plan.py
   git commit -m "feat(agent-resolve): implement Stage 1 test deduplication and blast radius demotion"
   ```

2. **Attach Git Note (requires `BypassSandbox: true`):**
   ```bash
   git notes add -m "Task: Implement Stage 1 test deduplication and blast radius demotion to pass tests (TDD Green phase)
   Summary: Implemented extract_test_component_stem and deduplicate_target_test_files in agent_resolve.context, re-exported in __init__.py, integrated deduplication and demoted suite routing into stage_1_plan, injected the prompt cohesion directive into Stage 1 instructions, and empirically verified all unit tests pass cleanly.
   Files: scripts/agent-resolve/agent_resolve/context.py, scripts/agent-resolve/agent_resolve/__init__.py, scripts/agent-resolve/agent_resolve/stages/stage_1_plan.py
   Rationale: Prevents token bloat and redundant test authoring during Stage 2 by selecting the single most cohesive test file per component stem while demoting generic suites to bounded blast radius regression coverage." $(git log -1 --format="%H")
   ```

3. **Update Track Plan & Commit (`conductor/tracks/agent-resolve-quality-hardening_20261021/plan.md`):**
   Record the 7-character commit SHA on Phase 2 Task 2 in `plan.md` and commit with `conductor(plan): Mark task 'Implement Stage 1 test deduplication and blast radius demotion to pass tests (TDD Green phase)' as complete`.
