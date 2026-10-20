# Implementation Plan — Phase 1, Task 2: Implement blast radius data model, discovery bounds, generic stem qualification, and stage prompt isolation (TDD Green phase)

## 1. Overview & Objective
Satisfy all failing unit tests authored in Phase 1 Task 1 (commit `5a8e6c5`) by implementing the green phase for Phase 1 of `agent-resolve-token-limits_20261019`:
1. **Data Model:** Add `blast_radius_test_files` to `BlueprintPlan` with `default_factory=list` and backward-compatible serialization.
2. **Targeted Context Discovery:** Refactor `find_related_test_files` to enforce strict Jest extensions (`*.test.ts(x)`, `*.spec.ts(x)`), exclude `supabase/` and `e2e/`, qualify generic stems (`index`, `types`, `constants`, `utils`, `helpers`) with directory paths, match import boundaries (`/(?:{pattern})(?:\.[a-zA-Z]+)?['\"]` and `from.*{pattern}`), rank by descending common ancestor depth, and cap results at 8 suites.
3. **Stage Isolation:**
   - `stage_1_plan`: Discovered tests not already in `target_test_files` are placed into `blast_radius_test_files`; `target_test_files` remains unmutated.
   - `stage_2_red`: Restrict authoring, reading, type-checking, and Jest execution strictly to `target_test_files`.
   - `stage_3_green`: Keep `TESTS TO PASS` prompt section restricted strictly to `target_test_files`, while running targeted verification with `["npx", "jest", "--no-color", "--silent"] + target_test_files + blast_radius_test_files`.
4. **VCS Checkpointing & Reporting:** Persist `blast_radius_test_files` in `.agent-state.json` via `preserve_failed_work` and display formatted blast radius suites under `### Observability & Verification` in `update_or_create_pr`.

---

## 2. Target Files & Semantic Insertion Anchors

### 2.1 Pydantic Model Schema
- **Path:** `scripts/agent-resolve/agent_resolve/models.py`
- **Semantic Insertion Anchor:** Inside `class BlueprintPlan(BaseModel):`, immediately following `plan_markdown: str` (line 58).
- **Target Modification:** Add `blast_radius_test_files: List[str]` with `Field(default_factory=list, description="...")`.

### 2.2 Bounded Context Discovery & Proximity Ranking
- **Path:** `scripts/agent-resolve/agent_resolve/context.py`
- **Semantic Insertion Anchors:**
  1. Top-level constants (after imports, before `get_repository_tree`): define `GENERIC_STEMS: frozenset[str] = frozenset({"index", "types", "constants", "utils", "helpers"})`.
  2. Inside `find_related_test_files(target_src_files: List[str]) -> List[str]` (lines 53–68): replace implementation with bounded grep, import boundary regex, generic stem qualification, descending common ancestor depth proximity scoring, and 8-suite cap.
  3. Module export list `__all__`: append `"GENERIC_STEMS"` if exported.

### 2.3 Stage Prompt Isolation & Blast Radius Execution
- **Path:** `scripts/agent-resolve/agent_resolve/stages/stage_1_plan.py`
  - **Semantic Insertion Anchor:** Blast radius discovery loop (lines 98–104).
  - **Target Modification:** Populate `blueprint.blast_radius_test_files` with discovered tests that are not in `blueprint.target_test_files`. Do not mutate `blueprint.target_test_files`.
- **Path:** `scripts/agent-resolve/agent_resolve/stages/stage_2_red.py`
  - **Semantic Insertion Anchor:** `target_tests = blueprint.target_test_files` (line 34).
  - **Target Modification:** Confirm that `blueprint.blast_radius_test_files` is untouched and never passed to prompts, type-check, or test commands.
- **Path:** `scripts/agent-resolve/agent_resolve/stages/stage_3_green.py`
  - **Semantic Insertion Anchor:** Targeted Jest execution command setup (line 120).
  - **Target Modification:** Construct `all_verification_tests = target_tests + getattr(blueprint, "blast_radius_test_files", [])` and execute `["npx", "jest", "--no-color", "--silent"] + all_verification_tests`. Ensure `tests_content` injected into prompt continues to read only `target_tests`.

### 2.4 VCS State Persistence & PR Body Reporting
- **Path:** `scripts/agent-resolve/agent_resolve/vcs.py`
  - **Semantic Insertion Anchor 1:** In `update_or_create_pr` under `### Observability & Verification` (line 102).
    - Format `- **Blast Radius Tests:** {formatted}` when `blueprint.blast_radius_test_files` is non-empty.
  - **Semantic Insertion Anchor 2:** In `preserve_failed_work` inside `state_data` dictionary (lines 192–205).
    - Add `"blast_radius_test_files": getattr(blueprint, "blast_radius_test_files", []) if blueprint else []`.

### 2.5 Resumption Preservation Bridge
- **Path:** `scripts/agent-resolve/agent_resolve/pipeline.py`
  - **Semantic Insertion Anchor:** `BlueprintPlan(...)` instantiations during stateful resumption (line 164 and line 204).
  - **Target Modification:** Pass `blast_radius_test_files=state_data.get("blast_radius_test_files", [])` to retain existing blast radius state across resumption branches.

### 2.6 Conductor Track Plan Status
- **Path:** `conductor/tracks/agent-resolve-token-limits_20261019/plan.md`
  - **Target Modification:** Mark Phase 1 Task 2 completed with commit SHA upon successful test verification.

---

## 3. Signatures, Types & Interfaces

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

### 3.2 Discovery & Proximity Ranking Signature (`agent_resolve/context.py`)
```python
GENERIC_STEMS: frozenset[str] = frozenset({"index", "types", "constants", "utils", "helpers"})
JEST_PATHSPECS: tuple[str, ...] = ("*.test.ts", "*.test.tsx", "*.spec.ts", "*.spec.tsx")

def _compute_ancestor_proximity(sf: str, tf: str) -> int:
    """Computes directory proximity score as length of common ancestor path between source and test file."""
    ...

def find_related_test_files(target_src_files: List[str]) -> List[str]:
    """
    Discovers test files that import target source files.
    Restricts pathspecs to Jest patterns outside supabase/ and e2e/, qualifies generic stems,
    sorts candidates by descending common ancestor depth, and caps results at 8 suites.
    """
    ...
```

### 3.3 Checkpoint Data Model (`.agent-state.json`)
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

## 4. Precise Behavioral Logic, Invariants & Edge Cases

### 4.1 Discovery & Ranking Logic (`agent_resolve/context.py`)
1. **Stem Extraction & Qualification:**
   - For each `sf` in `target_src_files`:
     - `stem = Path(sf).stem.lstrip(".")`
     - If not `stem` or `len(stem) < 3`: skip.
     - If `stem in GENERIC_STEMS`:
       - `ident = (Path(sf).parent / stem).as_posix().lstrip("./")` (e.g. `"lib/constants"` for `lib/constants.ts`).
     - Else:
       - `ident = stem` (e.g. `"winery"` for `lib/utils/winery.ts`).
2. **Git Grep Command Construction:**
   - Regex pattern: `rf"/(?:{ident})(\.[a-zA-Z]+)?['\"]|from\s*['\"][^'\"]*{ident}"`.
   - Command: `["git", "grep", "-E", "-l", regex_pattern, "--", *JEST_PATHSPECS]`.
3. **Candidate Filtering Invariants:**
   - Reject empty lines.
   - Must exist on disk: `(project_root / tf).exists()`.
   - Exclude non-Jest test files: `tf.endswith((".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx"))`.
   - Exclude protected or headless-incompatible subtrees: `not tf.startswith(("supabase/", "e2e/")) and "/supabase/" not in tf and "/e2e/" not in tf`.
4. **Proximity Scoring & Ranking:**
   - For candidate `tf`, score against each source file `sf`:
     ```python
     sf_dir = os.path.dirname(sf)
     tf_dir = os.path.dirname(tf)
     score = len(os.path.commonpath([sf_dir, tf_dir])) if (sf_dir and tf_dir) else 0
     ```
   - Candidate `tf` receives `max(score for sf in target_src_files)`.
   - Candidate list is sorted with `reverse=True` on score (stable sort preserving relative discovery order for identical scores).
5. **Capping:**
   - Return `discovered[:8]`.

### 4.2 Stage Isolation Invariants
- **Stage 1 (`stage_1_plan.py`):**
  - Run `find_related_test_files(blueprint.target_src_files)`.
  - For each `rt` in `related_tests`:
    - If `rt not in blueprint.target_test_files and rt not in blueprint.blast_radius_test_files`:
      - Append to `blueprint.blast_radius_test_files`.
  - Invariant: `blueprint.target_test_files` MUST NOT be modified by blast radius discovery.
- **Stage 2 (`stage_2_red.py`):**
  - Prompt contains only `blueprint.target_test_files`.
  - Type-check and Jest red phase execution run strictly against `blueprint.target_test_files`.
  - `blueprint.blast_radius_test_files` is ignored.
- **Stage 3 (`stage_3_green.py`):**
  - Prompt section `TESTS TO PASS` contains only `blueprint.target_test_files`.
  - Targeted test execution:
    ```python
    all_tests = target_tests + getattr(blueprint, "blast_radius_test_files", [])
    test_cmd = ["npx", "jest", "--no-color", "--silent"] + all_tests
    ```
  - Full regression gate runs unchanged (`npm test` and `npm run type-check`).

### 4.3 VCS Serialization & PR Formatting
- **`preserve_failed_work`:**
  - Sets `"blast_radius_test_files": getattr(blueprint, "blast_radius_test_files", []) if blueprint else []`.
- **`update_or_create_pr`:**
  - If `blueprint.blast_radius_test_files` has items, appends to `### Observability & Verification`:
    `- **Blast Radius Tests:** {", ".join(f"`{f}`" for f in blueprint.blast_radius_test_files)}`.

---

## 5. Execution Verification Protocol

Once edits are made, verify all test suites pass cleanly:

1. **Verify `models.py` Serialization:**
   ```bash
   python3.12 -m unittest scripts/agent-resolve/tests/test_models.py
   ```
   *Expected Result:* All tests pass (including `test_blueprint_plan_blast_radius_test_files_default_and_serialization`).

2. **Verify `context.py` Discovery & Proximity Bounds:**
   ```bash
   python3.12 -m unittest scripts/agent-resolve/tests/test_context.py
   ```
   *Expected Result:* All tests pass (including pathspec bounds, module import boundary regex, generic stem qualification, common ancestor depth sorting, and 8-suite cap).

3. **Verify `stages.py` Prompt Isolation & Execution:**
   ```bash
   python3.12 -m unittest scripts/agent-resolve/tests/test_stages.py
   ```
   *Expected Result:* All tests pass (including Stage 1 blast radius population, Stage 2 target-only isolation, and Stage 3 silent Jest target + blast radius execution).

4. **Verify `vcs.py` State Persistence & PR Body:**
   ```bash
   python3.12 -m unittest scripts/agent-resolve/tests/test_vcs.py
   ```
   *Expected Result:* All tests pass (including state serialization and PR body markdown format).

5. **Verify Full Modular Agent Test Suite:**
   ```bash
   npm run test:agent
   ```
   *Expected Result:* 100% test pass rate across all agent unit test modules.

---

## 6. Post-Execution Commit & Git Notes Protocol

1. **Stage and Commit Implementation Changes (requires `BypassSandbox: true`):**
   ```bash
   git add scripts/agent-resolve/agent_resolve/models.py \
           scripts/agent-resolve/agent_resolve/context.py \
           scripts/agent-resolve/agent_resolve/stages/stage_1_plan.py \
           scripts/agent-resolve/agent_resolve/stages/stage_2_red.py \
           scripts/agent-resolve/agent_resolve/stages/stage_3_green.py \
           scripts/agent-resolve/agent_resolve/agent_resolve/vcs.py \
           scripts/agent-resolve/agent_resolve/pipeline.py
   git commit -m "feat(agent-resolve): implement blast radius data model, discovery bounds, generic stem qualification, and stage prompt isolation"
   ```

2. **Attach Git Note (requires `BypassSandbox: true`):**
   ```bash
   git notes add -m "Task: Implement blast radius data model, discovery bounds, generic stem qualification, and stage prompt isolation (TDD Green phase)
   Summary: Implemented BlueprintPlan.blast_radius_test_files, bounded Jest context discovery with generic stem qualification and ancestor-proximity ranking capped at 8 suites, stage prompt isolation across Stages 1-3, and VCS state serialization and PR summary reporting.
   Files: scripts/agent-resolve/agent_resolve/models.py, scripts/agent-resolve/agent_resolve/context.py, scripts/agent-resolve/agent_resolve/stages/stage_1_plan.py, scripts/agent-resolve/agent_resolve/stages/stage_2_red.py, scripts/agent-resolve/agent_resolve/stages/stage_3_green.py, scripts/agent-resolve/agent_resolve/vcs.py, scripts/agent-resolve/agent_resolve/pipeline.py
   Rationale: Separates downstream regression guard test execution from LLM prompt context to prevent prompt token blowout while preserving thorough regression testing." $(git log -1 --format="%H")
   ```

3. **Update Conductor Track Plan & Commit (`conductor/tracks/agent-resolve-token-limits_20261019/plan.md`):**
   Mark Phase 1 Task 2 as completed (`[x]`) with the commit SHA and commit:
   `git commit -m "conductor(plan): Mark task 'Implement blast radius data model, discovery bounds, generic stem qualification, and stage prompt isolation (TDD Green phase)' as complete"`
