# Implementation Plan — Phase 1, Task 1: Write failing unit tests for blast radius data model, discovery bounds, generic stem qualification, and stage prompt isolation (TDD Red phase)

## 1. Overview & Objective
Establish authoritative failing unit tests for Phase 1 of `agent-resolve-token-limits_20261019`. This Red phase verifies:
1. `BlueprintPlan` data model support for `blast_radius_test_files` (defaults, validation, and JSON serialization).
2. `find_related_test_files` bounded discovery (Jest-only pathspecs excluding `supabase/` and `e2e/`, import boundary regex matching, generic stem path qualification, ancestor-depth proximity sorting, and 8-suite cap).
3. Stage prompt isolation: Stage 1 populating `blast_radius_test_files` without mutating `target_test_files`, Stage 2 isolating authoring and verification to `target_test_files`, and Stage 3 isolating prompt context to `target_test_files` while executing targeted Jest with `--no-color` and `--silent` across `target_test_files + blast_radius_test_files`.
4. VCS state persistence in `.agent-state.json` via `preserve_failed_work` and blast radius reporting in Draft PR summaries via `update_or_create_pr`.

As a strict TDD Red phase, all authored tests must fail against the current unadapted codebase and pass cleanly upon completion of Phase 1 Task 2 (Green phase).

---

## 2. Target Files & Semantic Insertion Anchors

### 2.1 Model Schema & Serialization Tests
- **Path:** `scripts/agent-resolve/tests/test_models.py`
- **Action:** Modify existing test suite.
- **Semantic Insertion Anchor:** Inside `TestModels` class, immediately after `test_blueprint_plan_validation_and_roundtrip` (line 57).
- **Target Additions:**
  - `test_blueprint_plan_blast_radius_test_files_default_and_serialization`:
    - Asserts `BlueprintPlan` instantiated without `blast_radius_test_files` defaults to `[]`.
    - Asserts `default_factory=list` instance isolation (mutating one instance list does not pollute a second instance).
    - Asserts JSON roundtrip (`model_dump_json()` and `BlueprintPlan.model_validate_json()`) preserves `blast_radius_test_files`.
    - Asserts backward compatibility: validating JSON payloads lacking `blast_radius_test_files` defaults to `[]`.

### 2.2 Context Discovery & Proximity Ranking Tests
- **Path:** `scripts/agent-resolve/tests/test_context.py`
- **Action:** Modify existing test suite.
- **Semantic Insertion Anchor:** Inside `TestFindRelatedTestFiles` class, immediately following `test_handles_git_grep_failure_gracefully` (line 192).
- **Target Additions:**
  - `test_find_related_test_files_restricts_to_jest_extensions_and_excludes_supabase_and_e2e`:
    - Asserts `git grep` restricts pathspecs strictly to Jest extensions (`*.test.ts`, `*.test.tsx`, `*.spec.ts`, `*.spec.tsx`).
    - Asserts files under `supabase/` (e.g. `supabase/functions/api.test.ts`), `e2e/` (e.g. `e2e/trip-flow.spec.ts`), or non-Jest files (e.g. `test.py`) are strictly excluded even if matched by grep.
  - `test_find_related_test_files_matches_module_import_boundaries`:
    - Asserts that discovery matches module import boundaries (`/(?:{pattern})(?:\.[a-zA-Z]+)?['\"]` and `from.*{pattern}`) rather than arbitrary substrings or variable names.
  - `test_find_related_test_files_qualifies_generic_stems_with_relative_path`:
    - Asserts that generic stems (`index`, `types`, `constants`, `utils`, `helpers`) are qualified with directory path (e.g. `lib/constants` instead of bare `constants`) to prevent global cross-directory collisions.
  - `test_find_related_test_files_sorts_by_common_ancestor_depth_descending`:
    - Asserts candidate test files are sorted by descending common ancestor directory depth (`len(os.path.commonpath([sf_dir, tf_dir]))`), prioritizing same-directory tests over parent or sibling directory tests.
  - `test_find_related_test_files_caps_results_at_eight_suites`:
    - Asserts that when >8 candidate suites match, only the top 8 proximity-ranked suites are returned.

### 2.3 Stage Prompt Isolation & Blast Radius Execution Tests
- **Path:** `scripts/agent-resolve/tests/test_stages.py`
- **Action:** Modify existing test suite.
- **Semantic Insertion Anchors:**
  - In `TestStage1Plan`: directly after `test_rejects_protected_paths_in_blueprint_files` (line 298).
    - `test_stage_1_populates_blast_radius_without_mutating_target_test_files`: asserts that discovered dependent test files are stored in `blueprint.blast_radius_test_files`, leaving `blueprint.target_test_files` unmutated.
    - Update `test_generates_blueprint_writes_task_plan_and_discovers_blast_radius` (line 197) to assert `blueprint.blast_radius_test_files` receives dependent tests rather than `blueprint.target_test_files`.
  - In `TestStage2Red`: directly after `test_retries_and_raises_runtime_error_on_invalid_red_phase` (line 526).
    - `test_stage_2_ignores_blast_radius_test_files`: asserts that `stage_2_red` does not read, author, type-check, or pass `blueprint.blast_radius_test_files` to `npx jest`.
  - In `TestStage3Green`: directly after `test_resumption_mode_soft_resets_to_baseline_and_removes_checkpoint_files` (line 748).
    - `test_stage_3_isolates_prompt_and_executes_target_plus_blast_radius_silently`: asserts `TESTS TO PASS` prompt section contains strictly `blueprint.target_test_files`, while `run_isolated_test` receives `["npx", "jest", "--no-color", "--silent"] + target_tests + blast_radius_tests`.

### 2.4 VCS State & PR Summary Tests
- **Path:** `scripts/agent-resolve/tests/test_vcs.py`
- **Action:** Modify existing test suite.
- **Semantic Insertion Anchors:**
  - In `TestUpdateOrCreatePr`: directly after `test_labels_and_comments_on_issue_upon_success` (line 606).
    - `test_update_or_create_pr_formats_blast_radius_in_pr_body`: asserts that `update_or_create_pr` formats discovered blast radius suites under `### Observability & Verification` in the Draft PR body.
  - In `TestPreserveFailedWork`: directly after `test_writes_agent_state_json_and_increments_attempt_count` (line 776).
    - `test_preserve_failed_work_persists_blast_radius_test_files_in_state`: asserts `.agent-state.json` contains `"blast_radius_test_files": [...]` matching `blueprint.blast_radius_test_files`.

### 2.5 Conductor Track Registry & Plan Status Updates
- **Path:** `conductor/tracks.md`
  - Update row `agent-resolve-token-limits_20261019` to `[~] In Progress`.
- **Path:** `conductor/tracks/agent-resolve-token-limits_20261019/plan.md`
  - Update Phase 1 Task 1 to `[~]`.

---

## 3. Interfaces, Types & Exported Signatures

### 3.1 Pydantic Model Schema (`agent_resolve/models.py`)
```python
class BlueprintPlan(BaseModel):
    scope: str = Field(description="Conventional commit scope, e.g. winery, trip, geo, ui")
    target_test_files: List[str] = Field(
        description="Explicit list of unit or component test file paths to create or modify"
    )
    target_src_files: List[str] = Field(
        description="Explicit list of application source file paths to create or modify"
    )
    plan_markdown: str = Field(description="Full markdown content for task-plan.md")
    blast_radius_test_files: List[str] = Field(
        default_factory=list,
        description="Downstream test suites executed during Stage 3 verification but excluded from LLM prompts and Stage 2 authoring",
    )
```

### 3.2 Context Discovery Signature (`agent_resolve/context.py`)
```python
GENERIC_STEMS: frozenset[str] = frozenset({"index", "types", "constants", "utils", "helpers"})

def find_related_test_files(target_src_files: List[str]) -> List[str]:
    """
    Discovers downstream Jest test files importing target source files.
    Restricts pathspecs to Jest tests outside supabase/ and e2e/, qualifies generic stems,
    sorts by common ancestor directory depth descending, and caps at 8 suites.
    """
    ...
```

### 3.3 VCS State Serialization Schema (`agent_resolve/vcs.py`)
```typescript
interface AgentStateCheckpoint {
  version: "1.0";
  issue_number: number;
  issue_title: string;
  scope: string;
  plan_markdown: string;
  target_test_files: string[];
  target_src_files: string[];
  blast_radius_test_files: string[];
  red_phase_commit_sha: string;
  failed_phase: "stage_2_red" | "stage_3_green";
  attempt_count: number;
  last_failure_timestamp: string;
  error_summary: string;
}
```

---

## 4. Behavioral Logic, Conditions & Edge Cases

1. **`BlueprintPlan.blast_radius_test_files` Data Invariants:**
   - Default value must be an empty list via `Field(default_factory=list)`.
   - Modifying `plan1.blast_radius_test_files.append("...")` must not affect `plan2.blast_radius_test_files`.
   - Valid JSON deserialization of legacy state files without `blast_radius_test_files` must successfully populate `blast_radius_test_files` as `[]`.

2. **`find_related_test_files` Bounded Discovery & Ranking:**
   - **Allowed Jest Pathspecs:** `"**/*.test.ts"`, `"**/*.test.tsx"`, `"**/*.spec.ts"`, `"**/*.spec.tsx"`.
   - **Excluded Paths:** Any path starting with or containing `supabase/`, `e2e/`, or non-JS/TS files (`.py`, `.sh`, `.md`).
   - **Import Boundary Matching:** Regular expression patterns:
     - `r"/(?:{pattern})(?:\.[a-zA-Z]+)?['\"]"`
     - `r"from\s+['\"][^'\"]*{pattern}"`
   - **Generic Stem Qualification:** If `Path(sf).stem in GENERIC_STEMS`, the matching pattern uses the relative directory prefix (e.g. `lib/constants` for `lib/constants.ts`) rather than bare `constants`.
   - **Proximity Ranking Formula:**
     `score = len(os.path.commonpath([Path(sf).parent, Path(tf).parent]))`
     Sort candidate matches by `score` descending.
   - **Capping Constraint:** Strict cap of `discovered[:8]`.

3. **Stage Isolation & Execution Invariants:**
   - **Stage 1 (Plan):** Discovered tests in `find_related_test_files(blueprint.target_src_files)` not present in `blueprint.target_test_files` are appended to `blueprint.blast_radius_test_files`. `blueprint.target_test_files` is NOT modified.
   - **Stage 2 (Red):** Uses only `blueprint.target_test_files`. `blueprint.blast_radius_test_files` is ignored completely.
   - **Stage 3 (Green):** Prompt `TESTS TO PASS` section contains only `blueprint.target_test_files`. Targeted test execution runs:
     `["npx", "jest", "--no-color", "--silent"] + blueprint.target_test_files + blueprint.blast_radius_test_files`

4. **VCS Serialization Invariants:**
   - `preserve_failed_work` writes `state_data["blast_radius_test_files"] = blueprint.blast_radius_test_files if blueprint else []`.
   - `update_or_create_pr` formats `- Blast Radius Tests: {formatted}` in PR body when blast radius tests are present.

---

## 5. Execution Verification Protocol

Execute tests to verify that all new unit tests fail cleanly (TDD Red phase):

1. **Verify `test_models.py` Red Phase:**
   ```bash
   python3.12 -m unittest scripts/agent-resolve/tests/test_models.py
   ```
   *Expected Failure:* `AttributeError` or `ValidationError` on `blast_radius_test_files`.

2. **Verify `test_context.py` Red Phase:**
   ```bash
   python3.12 -m unittest scripts/agent-resolve/tests/test_context.py
   ```
   *Expected Failure:* `AssertionError` on generic stem qualification, pathspec filtering, ancestor proximity sorting, or 8-suite cap.

3. **Verify `test_stages.py` Red Phase:**
   ```bash
   python3.12 -m unittest scripts/agent-resolve/tests/test_stages.py
   ```
   *Expected Failure:* `AssertionError` on `blast_radius_test_files` population, prompt exclusion, or `--no-color`/`--silent` jest flags.

4. **Verify `test_vcs.py` Red Phase:**
   ```bash
   python3.12 -m unittest scripts/agent-resolve/tests/test_vcs.py
   ```
   *Expected Failure:* `KeyError` or `AssertionError` on `blast_radius_test_files` in `.agent-state.json` or Draft PR body.

5. **Verify Full Modular Agent Test Suite Status:**
   ```bash
   npm run test:agent
   ```
   *Expected Status:* Pre-existing tests pass; newly added Phase 1 tests fail cleanly with expected assertion/attribute errors.

---

## 6. Post-Execution Commit & Git Notes Protocol

1. **Commit Red Phase Test Changes (requires `BypassSandbox: true`):**
   ```bash
   git add scripts/agent-resolve/tests/test_models.py scripts/agent-resolve/tests/test_context.py scripts/agent-resolve/tests/test_stages.py scripts/agent-resolve/tests/test_vcs.py
   git commit -m "test(agent-resolve): add failing unit tests for blast radius data model, discovery bounds, generic stem qualification, and stage prompt isolation"
   ```

2. **Attach Git Note (requires `BypassSandbox: true`):**
   ```bash
   git notes add -m "Task: Write failing unit tests for blast radius data model, discovery bounds, generic stem qualification, and stage prompt isolation (TDD Red phase)
   Summary: Authored unit test cases across test_models.py, test_context.py, test_stages.py, and test_vcs.py asserting BlueprintPlan blast radius defaults, bounded Jest discovery, proximity sorting, stage prompt isolation, and VCS state serialization.
   Files: scripts/agent-resolve/tests/test_models.py, scripts/agent-resolve/tests/test_context.py, scripts/agent-resolve/tests/test_stages.py, scripts/agent-resolve/tests/test_vcs.py
   Rationale: Enforces TDD Red phase verification to ensure downstream token blowout fixes have rigorous automated regression guards before green phase implementation." $(git log -1 --format="%H")
   ```

3. **Update Track Plan & Commit (`conductor/tracks.md` and `plan.md`):**
   Record the 7-character commit SHA on Phase 1 Task 1 in `plan.md` and commit with `conductor(plan): Mark task 'Write failing unit tests for blast radius data model, discovery bounds, generic stem qualification, and stage prompt isolation (TDD Red phase)' as complete`.
