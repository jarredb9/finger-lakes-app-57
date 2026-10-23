# Implementation Plan — Phase 1, Task 1: Write failing unit tests for Stage 2 patch-based test authoring and TestPatchManifest (TDD Red phase)

## 1. Overview & Objective
Establish authoritative failing unit tests for Phase 1 of `agent-resolve-quality-hardening_20261021`. This Red phase verifies:
1. `TestPatchManifest` Pydantic data model schema in `models.py` containing `patches: List[PatchChunk]` and `source_stubs: List[SourceStubEntry] = []` (field defaults, instance list isolation, and JSON roundtrip serialization).
2. Generalized `apply_patch_manifest` in `patch_engine.py` accepting `TestPatchManifest` and supporting `new_files` (allowing empty search blocks for brand new test files).
3. Stage 2 Red Phase Executor (`stage_2_red.py`) migrating from full-file rewrites to `TestPatchManifest`:
   - Requesting `schema_cls=TestPatchManifest` from Gemini with prompt directives for search/replace patches.
   - Enforcing strict target file boundaries by passing `allowed_files = target_tests` to `apply_patch_manifest`, preventing the LLM from accidentally mutating production code.
   - Managing retry state: reverting `target_test_files` to the git baseline and purging uncommitted source stubs from failed attempts prior to each retry attempt.
   - Removing the brittle `extract_test_suite_names` preflight check, allowing targeted diffs without false positive dropped-suite retries.

As a strict TDD Red phase, all newly authored tests must fail cleanly against the current unadapted codebase and pass cleanly upon completion of Phase 1 Task 2 (Green phase).

---

## 2. Target Files & Semantic Insertion Anchors

### 2.1 Model Schema & Validation Tests
- **Path:** `scripts/agent-resolve/tests/test_models.py`
- **Action:** Modify existing test suite.
- **Semantic Insertion Anchor:** Inside `TestModels` class, directly following `test_test_file_manifest_with_optional_source_stubs` (line 110).
- **Target Additions:**
  - `test_test_patch_manifest_validation_and_defaults`:
    - Asserts that `TestPatchManifest` accepts `patches: List[PatchChunk]` and optional `source_stubs: List[SourceStubEntry]`.
    - Asserts `source_stubs` defaults to `[]` via `Field(default_factory=list)` with instance list isolation (mutating one instance list does not pollute another).
    - Asserts `ValidationError` is raised when required `patches` argument is omitted.
    - Asserts bidirectional JSON serialization (`model_dump_json()` and `TestPatchManifest.model_validate_json()`).

### 2.2 Patch Engine Generalization Tests
- **Path:** `scripts/agent-resolve/tests/test_patch_engine.py`
- **Action:** Modify existing test suite.
- **Semantic Insertion Anchor:** Inside `TestApplyPatchManifest` class, directly after `test_new_file_creation_empty_search_block` (line 364).
- **Target Additions:**
  - `test_apply_patch_manifest_accepts_test_patch_manifest`:
    - Asserts `apply_patch_manifest` accepts `TestPatchManifest` with `patches` and applies search/replace diffs cleanly.
  - `test_apply_patch_manifest_supports_new_files_empty_search_block`:
    - Asserts `apply_patch_manifest` accepts `new_files` parameter (e.g. `new_files=["lib/__tests__/brand_new.test.ts"]`), allowing an empty `search_block = ""` to create brand new test files on disk even when `new_src_files` is omitted.

### 2.3 Stage 2 Patch-Based Authoring, Gating & Retry Tests
- **Path:** `scripts/agent-resolve/tests/test_stages.py`
- **Action:** Modify existing test suite.
- **Semantic Insertion Anchor:** In `TestStage2Red` class:
  - Update `test_writes_tests_scaffolds_stubs_passes_gates_and_commits` (line 539) to supply `TestPatchManifest` and verify patch-based test generation.
  - Replace `test_retries_when_pre_existing_describe_suite_dropped` (line 596) with `test_stage_2_preserves_unmodified_suites_without_extract_test_suite_names_check`.
  - Append new test methods after `test_stage_2_prompt_includes_shared_edge_function_jest_directives` (line 824):
    - `test_stage_2_requests_test_patch_manifest_and_applies_via_patch_engine`: asserts `stage_2_red` invokes `call_gemini_with_fallback` with `schema_cls=TestPatchManifest`, applies stubs and test patches, and commits them.
    - `test_stage_2_passes_allowed_files_to_prevent_source_tampering`: asserts `stage_2_red` enforces `allowed_files = target_tests`. If a returned patch targets a source file outside `target_tests`, `apply_patch_manifest` rejects it and `stage_2_red` captures the error in `last_compiler_error` and retries.
    - `test_stage_2_reverts_target_tests_and_cleans_staged_stubs_before_retry`: asserts that when an attempt fails (e.g. type check or test failure), `stage_2_red` restores `target_test_files` to baseline and unlinks uncommitted source stubs before launching attempt 2.
    - `test_stage_2_supports_empty_search_blocks_for_new_test_files`: asserts that brand new test files in `blueprint.target_test_files` are authored via `search_block = ""` without triggering exist errors.

### 2.4 Conductor Track Registry & Plan Status Updates
- **Path:** `conductor/tracks.md`
  - Update track `agent-resolve-quality-hardening_20261021` status to `[~] In Progress`.
- **Path:** `conductor/tracks/agent-resolve-quality-hardening_20261021/plan.md`
  - Update Phase 1 Task 1 to `[~]`.

---

## 3. Interfaces, Types & Exported Signatures

### 3.1 Pydantic Model Schema (`agent_resolve/models.py`)
```python
class TestPatchManifest(BaseModel):
    patches: List[PatchChunk] = Field(
        description="Ordered list of search/replace patch chunks to apply to target test files"
    )
    source_stubs: List[SourceStubEntry] = Field(
        default_factory=list,
        description="Minimal stubs for brand new source files that do not yet exist on disk",
    )
```

### 3.2 Patch Engine Generalization Signature (`agent_resolve/patch_engine.py`)
```python
def apply_patch_manifest(
    manifest: PatchManifest | TestPatchManifest,
    new_src_files: Sequence[str] | None = None,
    allowed_files: Sequence[str] | None = None,
    new_files: Sequence[str] | None = None,
) -> tuple[bool, list[str]]:
    """
    Applies search/replace patches to target files.
    Accepts PatchManifest or TestPatchManifest.
    Permits empty search_block when target_path does not exist on disk,
    or when target_path is specified in new_src_files or new_files.
    Restricts applied paths strictly to allowed_files when provided.
    """
    ...
```

### 3.3 Stage 2 Executor Signature (`agent_resolve/stages/stage_2_red.py`)
```python
def stage_2_red(
    client: Any,
    issue_number: int,
    issue_title: str,
    blueprint: BlueprintPlan,
    token_tracker: TokenTracker,
    new_src_files: Optional[List[str]] = None,
    initial_error_context: str = "",
    baseline_ref: str = "HEAD",
) -> None:
    """
    Authors failing unit/component tests in target_test_files using surgical search/replace patches.
    Enforces allowed_files = target_tests, resets working tree state between retries,
    and validates clean Jest failure under Red gate.
    """
    ...
```

---

## 4. Behavioral Logic, Conditions & Edge Cases

1. **`TestPatchManifest` Validation Invariants:**
   - `patches` is mandatory. Omitting `patches` raises `pydantic.ValidationError`.
   - `source_stubs` defaults to empty list (`default_factory=list`). Appending to one instance list must never mutate another instance.
   - Serializing to JSON and deserializing back must produce an equivalent model instance.

2. **Patch Engine Acceptance of `TestPatchManifest` & `new_files`:**
   - `apply_patch_manifest` must access `manifest.patches` regardless of whether `manifest` is `PatchManifest` or `TestPatchManifest`.
   - `new_files` is unified with `new_src_files` into candidate new file targets. If a patch specifies `search_block = ""` and the file is in `new_files` or does not exist on disk, the patch replaces or creates the file with `replace_block`.

3. **Stage 2 Target File Confinement (`allowed_files = target_tests`):**
   - Stage 2 must pass `allowed_files = target_tests` to `apply_patch_manifest`.
   - Any patch attempting to alter a file outside `target_tests` (such as a source file `lib/utils/winery.ts` or config file) triggers an immediate validation rejection in `apply_patch_manifest`.
   - `stage_2_red` captures the rejection error into `last_compiler_error` and retries.

4. **Working Tree Reversion & Stub Cleanup Between Retry Attempts:**
   - If Attempt 1 creates dirty or partially applied test files, or writes initial source stubs to disk, and subsequently fails type-checking or Jest validation:
   - At the beginning of Attempt 2, `stage_2_red` reverts `target_test_files` to `baseline_ref` (`git checkout baseline_ref -- <tests>` or unlinks if newly created) and cleans up any uncommitted source stubs on disk (`reset_target_sources(staged_stubs, baseline_ref=baseline_ref)`).
   - This ensures Attempt 2 search/replace patches match against clean baseline disk contents without dirty offsets.

5. **Elimination of `extract_test_suite_names` Check:**
   - Stage 2 no longer parses describe blocks via regex `extract_test_suite_names`.
   - Existing test files can have individual tests or describe blocks patched without requiring the LLM to output untouched describe blocks.
   - No retry is triggered due to "dropped pre-existing test suites".

---

## 5. Execution Verification Protocol

Execute tests to verify that all newly authored unit tests fail cleanly against the current unadapted codebase (TDD Red phase):

1. **Verify `test_models.py` Red Phase:**
   ```bash
   python3.12 -m unittest scripts/agent-resolve/tests/test_models.py
   ```
   *Expected Failure:* `ImportError` or `AssertionError` asserting `TestPatchManifest` schema and defaults.

2. **Verify `test_patch_engine.py` Red Phase:**
   ```bash
   python3.12 -m unittest scripts/agent-resolve/tests/test_patch_engine.py
   ```
   *Expected Failure:* `TypeError` or `AssertionError` when passing `TestPatchManifest` or `new_files` to `apply_patch_manifest`.

3. **Verify `test_stages.py` Red Phase:**
   ```bash
   python3.12 -m unittest scripts/agent-resolve/tests/test_stages.py -k "Stage2"
   ```
   *Expected Failure:* `AssertionError` for `TestPatchManifest` schema requests, `allowed_files` confinement, retry baseline reset, and removal of `extract_test_suite_names`.

4. **Verify Full Modular Agent Test Suite Status:**
   ```bash
   npm run test:agent
   ```
   *Expected Status:* Pre-existing tests pass; newly added Phase 1 tests fail cleanly with expected assertion/import errors.

---

## 6. Post-Execution Commit & Git Notes Protocol

1. **Commit Red Phase Test Changes (requires `BypassSandbox: true`):**
   ```bash
   git add scripts/agent-resolve/tests/test_models.py scripts/agent-resolve/tests/test_patch_engine.py scripts/agent-resolve/tests/test_stages.py
   git commit -m "test(agent-resolve): add failing unit tests for Stage 2 patch-based test authoring and TestPatchManifest"
   ```

2. **Attach Git Note (requires `BypassSandbox: true`):**
   ```bash
   git notes add -m "Task: Write failing unit tests for Stage 2 patch-based test authoring and TestPatchManifest (TDD Red phase)
   Summary: Authored unit test cases across test_models.py, test_patch_engine.py, and test_stages.py asserting TestPatchManifest schema validation, patch engine new_files support, Stage 2 allowed_files enforcement, retry baseline state reversion, and removal of extract_test_suite_names check.
   Files: scripts/agent-resolve/tests/test_models.py, scripts/agent-resolve/tests/test_patch_engine.py, scripts/agent-resolve/tests/test_stages.py
   Rationale: Establishes rigorous TDD Red phase automated assertions to prevent token blowout and source file tampering during Stage 2 test authoring prior to green phase implementation." $(git log -1 --format="%H")
   ```

3. **Update Track Plan & Commit (`conductor/tracks.md` and `plan.md`):**
   Record the 7-character commit SHA on Phase 1 Task 1 in `plan.md` and commit with `conductor(plan): Mark task 'Write failing unit tests for Stage 2 patch-based test authoring and TestPatchManifest (TDD Red phase)' as complete`.
