# Implementation Plan — Phase 1, Task 2: Implement Stage 2 patch-based test authoring and TestPatchManifest to pass tests (TDD Green phase)

## 1. Overview & Objective
Implement the Green phase for Phase 1 of `agent-resolve-quality-hardening_20261021`. This transitions Stage 2 Red Phase test authoring from full-file rewrites to surgical search/replace diffs, resolving the test failures established in Task 1:
1. Define `TestPatchManifest` in `scripts/agent-resolve/agent_resolve/models.py` with `patches: List[PatchChunk]` and `source_stubs: List[SourceStubEntry] = []`, exporting it in `models.py` and `agent_resolve/__init__.py`.
2. Generalize `apply_patch_manifest` in `scripts/agent-resolve/agent_resolve/patch_engine.py` to accept `TestPatchManifest` and accept `new_files` parameter allowing empty search blocks (`search_block = ""`) for new files.
3. Modernize `scripts/agent-resolve/agent_resolve/stages/stage_2_red.py`:
   - Request `schema_cls=TestPatchManifest` from Gemini with prompt directives for search/replace patches.
   - Enforce target test boundary confinement by passing `allowed_files = target_tests` and `new_files = target_tests` to `apply_patch_manifest`.
   - Write `source_stubs` first to disk and stage them alongside `target_tests`.
   - Implement working tree state management between retry attempts: revert `target_test_files` and uncommitted source stubs to `baseline_ref` before launching attempt 2.
   - Deprecate and remove the brittle regex `extract_test_suite_names` preflight check.
   - Maintain backward-compatible fallback for `TestFileManifest` with `.files`.

---

## 2. Target Files & Semantic Insertion Anchors

### 2.1 Pydantic Model Schema & Exports
- **Path:** `scripts/agent-resolve/agent_resolve/models.py`
  - **Semantic Anchor:** After `PatchManifest` class definition (line 103), before `@dataclass class DiagnosticResult:` (line 105).
  - **Export Anchor:** Append `"TestPatchManifest"` to `__all__` list (line 122).
- **Path:** `scripts/agent-resolve/agent_resolve/__init__.py`
  - **Import Anchor:** In `from agent_resolve.models import (...)` (lines 63-73), import `TestPatchManifest`.
  - **Export Anchor:** Append `"TestPatchManifest"` to `__all__` list (line 188) alongside `TestFileManifest`.

### 2.2 Generalized Patch Engine Support for `TestPatchManifest` & `new_files`
- **Path:** `scripts/agent-resolve/agent_resolve/patch_engine.py`
  - **Import Anchor:** Add `TestPatchManifest` to `from agent_resolve.models import (...)` (line 13).
  - **Function Anchor:** `apply_patch_manifest` signature (line 68) and new file target resolution logic (lines 93-100, 128-137).
  - **Target Additions:**
    - Update signature to accept `manifest: PatchManifest | TestPatchManifest` and `new_files: Sequence[str] | None = None`.
    - Combine `new_src_files` and `new_files` into candidate new file targets (`new_file_targets: set[Path]`).
    - In Case 1 (`if not search_block:`), check whether `target_path in new_file_targets`. If the file exists and is not in `new_file_targets`, reject with error diagnostic; otherwise permit empty search block for new file creation.

### 2.3 Stage 2 Red Phase Executor Refactoring
- **Path:** `scripts/agent-resolve/agent_resolve/stages/stage_2_red.py`
  - **Import Anchor:**
    - Remove `extract_test_suite_names` from `from agent_resolve.context import ...` (line 12), retaining `get_project_context`.
    - Import `TestPatchManifest` from `agent_resolve.models` (line 16).
    - Import `apply_patch_manifest`, `reset_target_sources`, and `safe_resolve_repo_path` from `agent_resolve.patch_engine` (lines 17-18).
  - **Function Signature Anchor:** `stage_2_red` (line 22), add parameter `baseline_ref: str = "HEAD"`.
  - **Retry State Reversion Anchor:** At the start of the retry loop (`for attempt in range(1, max_red_retries + 1):`), if `attempt > 1`, invoke `reset_target_sources(list(target_tests) + staged_stubs, baseline_ref=baseline_ref)` and reset staged stubs tracking before authoring.
  - **Prompt Directives Anchor:** Update Directive 7 (patch-based test authoring), Directive 9 (preservation of existing tests via patches), and response schema directive (`TestPatchManifest`).
  - **LLM Call Anchor:** In `call_gemini_with_fallback`, supply `schema_cls=TestPatchManifest`.
  - **Preflight Elimination Anchor:** Remove lines 106-125 (`dropped_suites` check using `extract_test_suite_names`).
  - **Source Stub Application Anchor:** Write `manifest.source_stubs` to disk first and record paths into `staged_stubs`. Scaffold any missing `new_src_files` with fallback `export {};\n`.
  - **Patch Application Anchor:** If `hasattr(manifest, "patches")`, call `apply_patch_manifest(manifest, allowed_files=target_tests, new_files=target_tests)`. If patch application fails, format error context into `last_compiler_error` and trigger retry loop. If `hasattr(manifest, "files")`, fall back to writing full files for backward compatibility.

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
    Applies search/replace patches to target files using a resilient two-tier engine:
      Tier 1: Exact character sequence match.
      Tier 2: Line-by-line whitespace-trimmed fallback matching (must match uniquely).
    Accepts PatchManifest or TestPatchManifest.
    Permits empty search_block when target_path is specified in new_src_files or new_files,
    or does not exist on disk.
    Restricts applied paths strictly to allowed_files when provided.
    Returns (success, error_diagnostics).
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
   - Field `patches` is mandatory (`List[PatchChunk]`). Initializing without `patches` raises `pydantic.ValidationError`.
   - Field `source_stubs` uses `default_factory=list`. Distinct model instances maintain independent list objects.
   - Serialization via `model_dump_json()` and deserialization via `TestPatchManifest.model_validate_json()` maintain parity.

2. **Patch Engine Target Unification & Empty Search Block:**
   - Aggregate all candidate new file paths from `new_src_files` and `new_files`.
   - Resolve candidate paths using `safe_resolve_repo_path` into `new_file_targets: set[Path]`.
   - If `not search_block`:
     - If `current_content is not None` and `target_path.exists()` and `target_path not in new_file_targets`:
       Reject with: `Patch #{idx} specifies empty search_block for '{patch.file_path}', but the file already exists. Empty search_block is only allowed when creating brand new files.`
     - Otherwise stage `replace_block` into `staged_edits[target_path]`.
   - If `allowed_files` is specified, verify `target_path in allowed_targets`. Reject any patch targeting files outside `allowed_files` with `rejected: file is not in allowed target files ...`.

3. **Stage 2 Working Tree Reversion Between Retries:**
   - Maintain `staged_stubs: List[str] = []` and `initial_new_src_files: List[str]`.
   - At the beginning of each retry iteration (`if attempt > 1:`):
     - Call `reset_target_sources(list(target_tests) + staged_stubs, baseline_ref=baseline_ref)`.
     - Reset `staged_stubs = []` and reset active `new_src_files` to `list(initial_new_src_files)`.
     - This ensures modified test files are restored via `git checkout baseline_ref -- <tests>` and newly scaffolded files are removed via `unlink()`.

4. **Stage 2 Patch Execution & Error Routing:**
   - Write all `manifest.source_stubs` to disk first, creating parent directories and adding paths to `staged_stubs`.
   - Scaffold fallback `export {};\n` for any un-stubbed `new_src_files` not yet on disk, adding to `staged_stubs`.
   - If `hasattr(manifest, "patches")`:
     - Invoke `apply_patch_manifest(manifest, allowed_files=target_tests, new_files=target_tests)`.
     - If `not ok`:
       Format `last_compiler_error` containing `"PREVIOUS PATCH APPLICATION FAILED:\n" + "\n".join(patch_errors)`.
       Log diagnostic error, and if `attempt < max_red_retries`, `continue` to attempt 2; if retries exhausted, raise `RuntimeError`.
   - If `hasattr(manifest, "files")`:
     - Write full file contents to disk for backward compatibility with legacy tests.
   - Run `npm run type-check`. On failure, format `last_compiler_error` and retry or raise `Stage2CompilationError`.
   - Run `npx jest --json <target_tests>`. Validate using `validate_jest_red_phase`. On invalid failure, format `last_compiler_error` and retry or raise `RuntimeError`.
   - Stage and commit:
     `git add <target_tests...> <staged_stubs...>`
     `git commit -m "test({scope}): Add failing tests for Issue #{issue_number}"`

5. **Elimination of `extract_test_suite_names`:**
   - The regex-based check in `stage_2_red.py` is removed completely. Unmodified suites are naturally preserved because search/replace patches only modify their targeted hunk.

---

## 5. Execution Verification Protocol

Execute tests to verify that all newly implemented components pass cleanly:

1. **Verify `test_models.py` (Green Phase):**
   ```bash
   python3.12 -m unittest scripts/agent-resolve/tests/test_models.py
   ```
   *Expected Result:* All tests pass (including `test_test_patch_manifest_validation_and_defaults`).

2. **Verify `test_patch_engine.py` (Green Phase):**
   ```bash
   python3.12 -m unittest scripts/agent-resolve/tests/test_patch_engine.py
   ```
   *Expected Result:* All tests pass (including `test_apply_patch_manifest_accepts_test_patch_manifest` and `test_apply_patch_manifest_supports_new_files_empty_search_block`).

3. **Verify `test_stages.py` Stage 2 Suite (Green Phase):**
   ```bash
   python3.12 -m unittest scripts/agent-resolve/tests/test_stages.py -k "Stage2"
   ```
   *Expected Result:* All Stage 2 unit tests pass cleanly.

4. **Verify Full Modular Agent Test Suite:**
   ```bash
   npm run test:agent
   ```
   *Expected Result:* 100% tests passing across all suites in `scripts/agent-resolve/tests`.

5. **Verify Comprehensive Agent Suite:**
   ```bash
   npm run test:agent:all
   ```
   *Expected Result:* 100% tests passing across legacy and modular test suites.

---

## 6. Post-Execution Commit & Git Notes Protocol

1. **Commit Implementation Changes (requires `BypassSandbox: true`):**
   ```bash
   git add scripts/agent-resolve/agent_resolve/models.py scripts/agent-resolve/agent_resolve/__init__.py scripts/agent-resolve/agent_resolve/patch_engine.py scripts/agent-resolve/agent_resolve/stages/stage_2_red.py
   git commit -m "feat(agent-resolve): implement Stage 2 patch-based test authoring and TestPatchManifest"
   ```

2. **Attach Git Note (requires `BypassSandbox: true`):**
   ```bash
   git notes add -m "Task: Implement Stage 2 patch-based test authoring and TestPatchManifest to pass tests (TDD Green phase)
   Summary: Implemented TestPatchManifest schema in models.py and agent_resolve root, generalized apply_patch_manifest in patch_engine.py to accept TestPatchManifest and new_files, and refactored stage_2_red.py to request TestPatchManifest, apply source stubs, confine patches with allowed_files=target_tests, reset working tree state between retries, and eliminate extract_test_suite_names.
   Files: scripts/agent-resolve/agent_resolve/models.py, scripts/agent-resolve/agent_resolve/__init__.py, scripts/agent-resolve/agent_resolve/patch_engine.py, scripts/agent-resolve/agent_resolve/stages/stage_2_red.py
   Rationale: Replaces full-file test rewrites with surgical search/replace patches, eliminating LLM token blowout and source file tampering during the Red phase." $(git log -1 --format="%H")
   ```

3. **Update Track Plan & Commit (`conductor/tracks.md` and `plan.md`):**
   Record the 7-character commit SHA on Phase 1 Task 2 in `plan.md` and commit with `conductor(plan): Mark task 'Implement Stage 2 patch-based test authoring and TestPatchManifest to pass tests (TDD Green phase)' as complete`.
