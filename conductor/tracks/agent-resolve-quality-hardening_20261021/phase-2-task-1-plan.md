# Implementation Plan — Phase 2, Task 1: Write failing unit tests for Stage 1 target test deduplication and blast radius demotion (TDD Red phase)

## 1. Overview & Objective
Establish authoritative failing unit tests for Phase 2 of `agent-resolve-quality-hardening_20261021`. This Red phase verifies:
1. Deterministic test deduplication helper `deduplicate_target_test_files` in `agent_resolve.context`:
   - Groups candidate test files by base architectural component stem (`<stem>.*.test.ts*` vs `<stem>.test.ts*`).
   - Prioritizes specialized test suites (e.g., `.persist.test.ts`, `.enrichment.test.ts`, `.syncStore.test.ts`) in `primary_target_tests` over generic fallback suites (`.test.ts`).
   - Demotes unselected generic fallback suites into `demoted_tests` for downstream blast radius regression testing.
   - Retains generic suites when no specialized suite exists for that component stem.
   - Retains distinct directory namespaces (e.g. `lib/stores/__tests__/wineryStore` vs `lib/services/__tests__/wineryStore`).
   - Supports all Jest test extensions (`.test.ts`, `.test.tsx`, `.spec.ts`, `.spec.tsx`).
   - Deduplicates identical duplicate paths.
2. Stage 1 Architectural Planner (`stage_1_plan.py`) integration:
   - Invokes `deduplicate_target_test_files` on model-planned `blueprint.target_test_files`.
   - Retains only primary target test files in `blueprint.target_test_files`.
   - Routes demoted test suites into `blueprint.blast_radius_test_files` alongside model-specified blast radius suites and `find_related_test_files` results.
   - Enforces deduplication and the `MAX_BLAST_RADIUS_TESTS = 8` ceiling across all blast radius candidates.
   - Injects the Stage 1 Planner prompt directive: `"Select only the single most cohesive test file for each modified source file. Do not duplicate identical unit tests across multiple test files."`.

As a strict TDD Red phase, all newly authored tests must fail cleanly against the current unadapted codebase and pass cleanly upon completion of Phase 2 Task 2 (Green phase).

---

## 2. Target Files & Semantic Insertion Anchors

### 2.1 Context Test Deduplication Suite
- **Path:** `scripts/agent-resolve/tests/test_context.py`
- **Action:** Modify existing test suite.
- **Semantic Insertion Anchor:** Directly following `TestExtractAgentBrief` (line 534) and immediately preceding `if __name__ == "__main__":` (line 536).
- **Target Additions:**
  - Test Class: `TestDeduplicateTargetTestFiles(unittest.TestCase)`
  - Methods:
    - `test_deduplicate_separates_specialized_from_generic_stem`:
      Asserts that given `["lib/stores/__tests__/wineryStore.persist.test.ts", "lib/stores/__tests__/wineryStore.test.ts"]`, `deduplicate_target_test_files` returns `(["lib/stores/__tests__/wineryStore.persist.test.ts"], ["lib/stores/__tests__/wineryStore.test.ts"])`.
    - `test_deduplicate_prioritizes_specialized_regardless_of_input_order`:
      Asserts that when the generic suite precedes the specialized suite in the input list (`["lib/stores/__tests__/wineryStore.test.ts", "lib/stores/__tests__/wineryStore.enrichment.test.ts"]`), the specialized suite is still selected as primary target and the generic suite is demoted.
    - `test_deduplicate_retains_generic_when_no_specialized_suite_exists`:
      Asserts that given `["lib/utils/__tests__/winery.test.ts"]` without a specialized peer, the generic suite remains in `primary_target_tests` and `demoted_tests` is empty.
    - `test_deduplicate_handles_multiple_independent_component_stems`:
      Asserts that multiple component stems in the same input (e.g. `wineryStore.persist.test.ts`, `wineryStore.test.ts`, and `tripStore.test.ts`) are correctly partitioned per stem (`primary_target_tests` contains `wineryStore.persist.test.ts` and `tripStore.test.ts`; `demoted_tests` contains `wineryStore.test.ts`).
    - `test_deduplicate_handles_multiple_specialized_suites_for_same_stem`:
      Asserts that when multiple specialized suites exist for the same component stem (e.g. `wineryStore.persist.test.ts` and `wineryStore.enrichment.test.ts` along with `wineryStore.test.ts`), the primary specialized suite is retained in `primary_target_tests` and all other suites for that stem are demoted.
    - `test_deduplicate_preserves_distinct_directories_with_same_base_filename`:
      Asserts that `lib/utils/__tests__/format.test.ts` and `components/__tests__/format.test.tsx` are treated as distinct architectural components and neither is demoted.
    - `test_deduplicate_supports_tsx_and_spec_extensions`:
      Asserts that `.test.tsx`, `.spec.ts`, and `.spec.tsx` are properly grouped and separated (e.g. `components/__tests__/TripCard.variant.spec.tsx` vs `components/__tests__/TripCard.spec.tsx`).
    - `test_deduplicate_deduplicates_exact_duplicate_paths`:
      Asserts that identical paths passed multiple times are deduplicated to a single entry in `primary_target_tests`.

### 2.2 Stage 1 Planner Integration & Blast Radius Tests
- **Path:** `scripts/agent-resolve/tests/test_stages.py`
- **Action:** Modify existing test suite.
- **Semantic Insertion Anchor:** Inside `TestStage1Plan` class, directly after `test_stage_1_blast_radius_merging_sanitizing_deduplicating_and_capping_at_8` (line 520).
- **Target Additions:**
  - `test_stage_1_deduplicates_target_tests_and_routes_demoted_to_blast_radius`:
    - Simulates Gemini returning `target_test_files=["lib/stores/__tests__/wineryStore.persist.test.ts", "lib/stores/__tests__/wineryStore.test.ts"]`.
    - Asserts that after `stage_1_plan` executes, `blueprint.target_test_files` contains only `["lib/stores/__tests__/wineryStore.persist.test.ts"]`, while `blueprint.blast_radius_test_files` contains `["lib/stores/__tests__/wineryStore.test.ts"]`.
  - `test_stage_1_demoted_test_files_deduplicated_and_capped_at_max_blast_radius`:
    - Simulates model returning demoted test files, explicit blast radius candidates, and discovered related test files totaling > 8 items.
    - Asserts that `blueprint.blast_radius_test_files` is deduplicated, capped at `MAX_BLAST_RADIUS_TESTS = 8`, and excludes all items in `blueprint.target_test_files`.
  - `test_stage_1_prompt_contains_target_test_cohesion_and_deduplication_directive`:
    - Asserts that the prompt passed to Gemini in `stage_1_plan` contains the directive:
      `"Select only the single most cohesive test file for each modified source file. Do not duplicate identical unit tests across multiple test files."`.

---

## 3. Interfaces, Types & Exported Signatures

### 3.1 Test Deduplication & Stem Extraction Signatures (`agent_resolve/context.py`)
```python
def extract_test_component_stem(path: str) -> tuple[str, str]:
    """
    Extracts (grouping_key, specialization) from a Jest test path.
    - grouping_key: normalized directory + base component stem (e.g. 'lib/stores/__tests__/wineryStore').
    - specialization: variant sub-extension (e.g. 'persist', 'enrichment', 'syncStore'),
      or '' if generic fallback (e.g. '.test.ts').
    """
    ...

def deduplicate_target_test_files(target_test_files: Sequence[str]) -> tuple[list[str], list[str]]:
    """
    Deduplicates candidate target test files by architectural component stem.
    For each component stem:
    - Retains only the single most specialized suite (e.g., .persist.test.ts, .enrichment.test.ts)
      in primary target test files.
    - Demotes unselected generic fallback suites (e.g., .test.ts) into demoted test files
      (destined for blast radius regression coverage).
    Returns (primary_target_tests, demoted_tests).
    """
    ...
```

### 3.2 Context Module Exports (`agent_resolve/context.py`)
```python
__all__: list[str] = [
    ...,
    "extract_test_component_stem",
    "deduplicate_target_test_files",
]
```

### 3.3 Stage 1 Re-export / Integration Signature (`agent_resolve/stages/stage_1_plan.py`)
```python
from agent_resolve.context import (
    deduplicate_target_test_files,
    find_related_test_files,
    get_project_context,
)
```

---

## 4. Behavioral Logic, Conditions & Edge Cases

1. **Test Extension Recognition:**
   - Recognized Jest test extensions: `(".test.tsx", ".spec.tsx", ".test.ts", ".spec.ts")`.
   - Matching inspects normalized paths (forward slashes, stripped `./`).
   - If a path does not match any recognized Jest test extension, it is treated as a raw stem with no specialization.

2. **Stem and Specialization Extraction (`extract_test_component_stem`):**
   - Strip directory prefix to obtain `filename = os.path.basename(norm_path)` and `dir_name = os.path.dirname(norm_path)`.
   - Strip recognized test extension to obtain `base_name`.
   - If `base_name` contains `.`:
     - `stem, specialization = base_name.split(".", 1)`
   - Else:
     - `stem = base_name`
     - `specialization = ""`
   - `grouping_key = f"{dir_name}/{stem}"` if `dir_name` else stem.

3. **Deduplication & Prioritization Partitioning (`deduplicate_target_test_files`):**
   - Input paths are tracked with preservation of arrival order.
   - For each `grouping_key`:
     - If candidate test files include at least one specialized suite (`specialization != ""`):
       - The first specialized suite encountered is assigned to `primary_target_tests`.
       - All generic suites (`specialization == ""`) are assigned to `demoted_tests`.
       - Any subsequent specialized suites for the same stem beyond the first are assigned to `demoted_tests`.
     - If candidate test files contain only generic suites (`specialization == ""`):
       - The first generic suite encountered is assigned to `primary_target_tests`.
       - No suites are demoted.
   - Exact duplicate paths are deduplicated (never appear multiple times in either output list).

4. **Stage 1 Blast Radius Routing & Bounded Capping:**
   - In `stage_1_plan`:
     ```python
     valid_tests, _invalid_tests = sanitize_target_test_files(blueprint.target_test_files)
     primary_tests, demoted_tests = deduplicate_target_test_files(valid_tests)
     blueprint.target_test_files = primary_tests
     ...
     raw_blast_candidates = (
         list(blueprint.blast_radius_test_files or [])
         + demoted_tests
         + find_related_test_files(blueprint.target_src_files)
     )
     ```
   - All blast radius candidates are verified via `is_valid_target_test_file`, checked against `blueprint.target_test_files` (excluding all primary targets), deduplicated, and capped at `MAX_BLAST_RADIUS_TESTS = 8`.

5. **Stage 1 Prompt Cohesion Directive:**
   - The Stage 1 planner prompt includes the explicit directive:
     `"Select only the single most cohesive test file for each modified source file. Do not duplicate identical unit tests across multiple test files."`

---

## 5. Execution Verification Protocol

Execute tests to verify that all newly authored unit tests fail cleanly against the current unadapted codebase (TDD Red phase):

1. **Verify `test_context.py` Red Phase:**
   ```bash
   python3.12 -m unittest scripts/agent-resolve/tests/test_context.py -k "TestDeduplicateTargetTestFiles"
   ```
   *Expected Failure:* `ImportError: cannot import name 'deduplicate_target_test_files' from 'agent_resolve.context'`.

2. **Verify `test_stages.py` Red Phase:**
   ```bash
   python3.12 -m unittest scripts/agent-resolve/tests/test_stages.py -k "test_stage_1_deduplicates_target_tests|test_stage_1_prompt_contains_target_test_cohesion"
   ```
   *Expected Failure:* `AssertionError` for missing target test deduplication, missing blast radius demotion, and missing prompt cohesion directive.

3. **Verify Full Modular Agent Test Suite Status:**
   ```bash
   npm run test:agent
   ```
   *Expected Status:* Pre-existing tests pass; newly added Phase 2 tests fail cleanly with expected assertion/import errors.

---

## 6. Post-Execution Commit & Git Notes Protocol

1. **Commit Red Phase Test Changes (requires `BypassSandbox: true`):**
   ```bash
   git add scripts/agent-resolve/tests/test_context.py scripts/agent-resolve/tests/test_stages.py
   git commit -m "test(agent-resolve): add failing unit tests for Stage 1 target test deduplication and blast radius demotion"
   ```

2. **Attach Git Note (requires `BypassSandbox: true`):**
   ```bash
   git notes add -m "Task: Write failing unit tests for Stage 1 target test deduplication and blast radius demotion (TDD Red phase)
   Summary: Authored comprehensive unit tests in test_context.py and test_stages.py asserting deduplicate_target_test_files behavior, component stem grouping, specialized suite prioritization over generic fallback suites, routing demoted suites to blast radius, capping at MAX_BLAST_RADIUS_TESTS, and Stage 1 prompt cohesion directive.
   Files: scripts/agent-resolve/tests/test_context.py, scripts/agent-resolve/tests/test_stages.py
   Rationale: Establishes authoritative automated TDD Red phase tests ensuring Stage 1 prevents duplicated unit test authoring and maintains bounded regression coverage before implementing deduplication logic." $(git log -1 --format="%H")
   ```

3. **Update Track Plan & Commit (`conductor/tracks/agent-resolve-quality-hardening_20261021/plan.md`):**
   Record the 7-character commit SHA on Phase 2 Task 1 in `plan.md` and commit with `conductor(plan): Mark task 'Write failing unit tests for Stage 1 target test deduplication and blast radius demotion (TDD Red phase)' as complete`.
