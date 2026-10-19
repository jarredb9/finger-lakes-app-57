# Implementation Plan — Phase 5, Task 1: Write failing unit tests for pipeline stages and resolution orchestrator (TDD Red phase)

## 1. Target Files & Insertion Anchors

- **Path:** `scripts/agent-resolve/tests/test_stages.py`
  - **Operation:** Create new modular unit test file (TDD Red phase).
  - **Semantic Anchor:** Top-level imports of `agent_resolve.stages` (`stage_0_diagnose`, `stage_1_plan`, `stage_2_red`, `stage_3_green`) and submodule references (`agent_resolve.stages.stage_0_diagnose`, `agent_resolve.stages.stage_1_plan`, `agent_resolve.stages.stage_2_red`, `agent_resolve.stages.stage_3_green`), followed by `unittest.TestCase` suites covering all four TDD pipeline stages.

- **Path:** `scripts/agent-resolve/tests/test_pipeline.py`
  - **Operation:** Create new modular unit test file (TDD Red phase).
  - **Semantic Anchor:** Top-level import of `from agent_resolve.pipeline import resolve_issue`, followed by `unittest.TestCase` suites covering the end-to-end issue resolution orchestrator, provenance security gate, idempotency guard, fresh vs. resumption execution paths, circuit breaker, autonomous checkpoint invalidation, Tier 3 blueprint invalidation, dry-run mode, and failure preservation.

- **Path:** `conductor/tracks/agent-resolve-decomposition_20261015/plan.md`
  - **Operation:** Update task status marker during execution (`[ ]` -> `[~]` -> `[x] <sha>`).
  - **Semantic Anchor:** Under `## Phase 5: Pipeline Stages & CLI Orchestrator`, line 80 (`- [ ] Task: Write failing unit tests for pipeline stages and resolution orchestrator (TDD Red phase)`).

---

## 2. TypeScript / Python Interfaces & Exported Function Signatures Under Test

### Target Module: `agent_resolve.stages` (`scripts/agent-resolve/agent_resolve/stages/`)

```python
from typing import Any, List, Optional
from agent_resolve.models import BlueprintPlan, DiagnosticResult
from agent_resolve.tracker import TokenTracker

# agent_resolve/stages/stage_0_diagnose.py
def stage_0_diagnose(
    client: Any,
    issue_title: str,
    issue_body: str,
    token_tracker: TokenTracker,
) -> DiagnosticResult: ...

# agent_resolve/stages/stage_1_plan.py
def stage_1_plan(
    client: Any,
    issue_number: int,
    issue_title: str,
    issue_body: str,
    token_tracker: TokenTracker,
    negative_feedback: str = "",
    diagnostic_result: Optional[DiagnosticResult] = None,
) -> BlueprintPlan: ...

# agent_resolve/stages/stage_2_red.py
def stage_2_red(
    client: Any,
    issue_number: int,
    issue_title: str,
    blueprint: BlueprintPlan,
    token_tracker: TokenTracker,
    new_src_files: Optional[List[str]] = None,
    initial_error_context: str = "",
) -> None: ...

# agent_resolve/stages/stage_3_green.py
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

### Target Module: `agent_resolve.pipeline` (`scripts/agent-resolve/agent_resolve/pipeline.py`)

```python
from typing import Any, Dict

def resolve_issue(
    client: Any,
    issue_data: Dict[str, Any],
    dry_run: bool = False,
) -> bool: ...
```

### Test Class Signatures (`scripts/agent-resolve/tests/test_stages.py` & `test_pipeline.py`)

```python
import unittest

# scripts/agent-resolve/tests/test_stages.py
class TestStage0Diagnose(unittest.TestCase):
    def setUp(self) -> None: ...
    def tearDown(self) -> None: ...
    def test_verifies_explicit_files_on_disk_without_llm_calls(self) -> None: ...
    def test_falls_back_to_find_files_when_explicit_file_missing_on_disk(self) -> None: ...
    def test_logs_error_and_falls_back_to_loop_when_explicit_path_protected(self) -> None: ...
    def test_iterative_loop_executes_tools_and_concludes(self) -> None: ...
    def test_iterative_loop_stops_at_max_5_tool_calls(self) -> None: ...

class TestStage1Plan(unittest.TestCase):
    def setUp(self) -> None: ...
    def tearDown(self) -> None: ...
    def test_generates_blueprint_writes_task_plan_and_discovers_blast_radius(self) -> None: ...
    def test_includes_negative_feedback_and_diagnostic_findings_in_prompt(self) -> None: ...
    def test_rejects_protected_paths_in_blueprint_files(self) -> None: ...

class TestStage2Red(unittest.TestCase):
    def setUp(self) -> None: ...
    def tearDown(self) -> None: ...
    def test_raises_runtime_error_when_target_test_files_empty(self) -> None: ...
    def test_writes_tests_scaffolds_stubs_passes_gates_and_commits(self) -> None: ...
    def test_retries_when_pre_existing_describe_suite_dropped(self) -> None: ...
    def test_self_corrects_on_compiler_failure_then_succeeds(self) -> None: ...
    def test_raises_stage2_compilation_error_after_max_compiler_retries(self) -> None: ...
    def test_retries_and_raises_runtime_error_on_invalid_red_phase(self) -> None: ...

class TestStage3Green(unittest.TestCase):
    def setUp(self) -> None: ...
    def tearDown(self) -> None: ...
    def test_raises_runtime_error_when_target_src_files_empty(self) -> None: ...
    def test_applies_patches_runs_targeted_and_full_regression_gates_and_commits(self) -> None: ...
    def test_retries_on_patch_application_failure_and_resets_baseline(self) -> None: ...
    def test_retries_on_targeted_or_regression_gate_failure_and_raises_after_3_attempts(self) -> None: ...
    def test_resumption_mode_soft_resets_to_baseline_and_removes_checkpoint_files(self) -> None: ...

# scripts/agent-resolve/tests/test_pipeline.py
class TestResolveIssueSecurityAndGuards(unittest.TestCase):
    def setUp(self) -> None: ...
    def tearDown(self) -> None: ...
    def test_rejects_untrusted_author_and_updates_labels_when_not_dry_run(self) -> None: ...
    def test_rejects_untrusted_author_without_gh_mutations_in_dry_run(self) -> None: ...
    def test_skips_issue_when_open_pr_already_in_review_without_requeue_label(self) -> None: ...

class TestResolveIssueFreshExecutionAndDryRun(unittest.TestCase):
    def setUp(self) -> None: ...
    def tearDown(self) -> None: ...
    def test_executes_full_4_stage_pipeline_and_submits_pr(self) -> None: ...
    def test_dry_run_deletes_local_branch_and_skips_push_and_pr(self) -> None: ...
    def test_tier_3_blueprint_invalidation_replans_stage_1_on_stage2_compilation_error(self) -> None: ...
    def test_invokes_preserve_failed_work_and_returns_false_on_unhandled_exception(self) -> None: ...

class TestResolveIssueResumptionAndCircuitBreaker(unittest.TestCase):
    def setUp(self) -> None: ...
    def tearDown(self) -> None: ...
    def test_circuit_breaker_halts_and_cleans_branch_when_attempt_count_reaches_2(self) -> None: ...
    def test_fast_forwards_to_stage_3_green_when_checkpoint_red_gate_valid(self) -> None: ...
    def test_rebase_conflict_aborts_rebase_and_falls_back_to_fresh_pipeline(self) -> None: ...
    def test_invalid_checkpoint_rolls_back_to_parent_and_reruns_stage_2_and_stage_3(self) -> None: ...
```

---

## 3. Precise Behavioral Logic & Test Specifications

### 3.1 `scripts/agent-resolve/tests/test_stages.py`

> **Mocking Invariant for Submodules in `agent_resolve.stages`:** Because `agent_resolve/stages/__init__.py` will export functions `stage_0_diagnose`, `stage_1_plan`, `stage_2_red`, and `stage_3_green` whose names match their respective submodule filenames, string-based `@patch("agent_resolve.stages.stage_0_diagnose.<dep>")` would resolve the exported function rather than the submodule in `unittest.mock._importer`. All tests in `test_stages.py` MUST therefore either patch via `patch.object(sys.modules["agent_resolve.stages.<stage_module>"], "<dep>", ...)` or `patch.object(agent_resolve, "<dep>", ...)` (exercising `_AgentResolveModule.__setattr__` propagation across loaded submodules).

1. **`TestStage0Diagnose`**:
   - **Setup/Teardown:** Save original `config.get_project_root()`, create a `TemporaryDirectory`, set `config.set_project_root(self.root)`, and restore in `tearDown`.
   - **Explicit Files Verified (`test_verifies_explicit_files_on_disk_without_llm_calls`):**
     - Write `lib/utils/geo.ts` in `self.root` with sample lines.
     - Pass `issue_body` containing `### Target Files & Suspected Components\n- \`lib/utils/geo.ts\`\n\n### Root Cause\nClamp coordinates.`.
     - Patch `call_gemini_with_fallback` and assert it is **not called**.
     - Assert returned `DiagnosticResult` has `target_files == ["lib/utils/geo.ts"]`, `"lib/utils/geo.ts"` in `code_snippets` containing `"=== File: lib/utils/geo.ts"`, and `root_cause` containing `"Clamp coordinates."`.
   - **Missing Explicit File Fallback (`test_falls_back_to_find_files_when_explicit_file_missing_on_disk`):**
     - Create `components/map/WineryMarker.tsx` in `self.root`, but specify `### Target Files\n- \`legacy/WineryMarker.tsx\`` in `issue_body`.
     - Mock `find_files` to return `"components/map/WineryMarker.tsx\n"`.
     - Assert `find_files` is called with `"WineryMarker.tsx"`, `result.target_files` contains `"components/map/WineryMarker.tsx"`, and `result.code_snippets["components/map/WineryMarker.tsx"]` is populated.
   - **Protected Explicit Path Handling (`test_logs_error_and_falls_back_to_loop_when_explicit_path_protected`):**
     - Pass `### Target Files\n- \`supabase/migrations/001.sql\`` in `issue_body`.
     - Mock `call_gemini_with_fallback` to return `DiagnosticAction(action="conclude", reasoning="Done", discovered_target_files=[])`.
     - Assert `result.investigation_summary` contains `"Could not resolve explicit file 'supabase/migrations/001.sql'"` and `"Concluded diagnosis at step 1: Done"`.
   - **Iterative Exploration Loop (`test_iterative_loop_executes_tools_and_concludes`):**
     - Create `lib/winery.ts` in `self.root`.
     - Configure `call_gemini_with_fallback` side effects across 4 steps:
       1. `DiagnosticAction(action="grep_search", query="standardizeWineryData", path_prefix="lib/", reasoning="Search standardizer")`
       2. `DiagnosticAction(action="find_files", pattern="*winery*", reasoning="Find winery modules")`
       3. `DiagnosticAction(action="read_file_snippet", file_path="lib/winery.ts", start_line=1, end_line=20, reasoning="Read winery module")`
       4. `DiagnosticAction(action="conclude", reasoning="Root cause identified", discovered_target_files=["lib/winery.ts"])`
     - Patch `grep_search` and `find_files` on the stage module (or `agent_resolve`).
     - Assert `grep_search("standardizeWineryData", "lib/")` and `find_files("*winery*")` were invoked, `"lib/winery.ts"` is in `result.target_files` and `result.code_snippets`, and `result.investigation_summary` contains `"Concluded diagnosis at step 4: Root cause identified"`.
   - **Max Tool Calls Bound (`test_iterative_loop_stops_at_max_5_tool_calls`):**
     - Configure `call_gemini_with_fallback` to always return `DiagnosticAction(action="grep_search", query="foo", reasoning="Still looking")`.
     - Patch `grep_search` to return `"No matches"`.
     - Assert `call_gemini_with_fallback` is called exactly 5 times (`max_tool_calls == 5`).

2. **`TestStage1Plan`**:
   - **Blueprint Generation & Blast Radius (`test_generates_blueprint_writes_task_plan_and_discovers_blast_radius`):**
     - Mock `get_project_context` -> `"PROJECT_CONTEXT"`, `find_related_test_files` -> `["components/__tests__/Dependent.test.tsx", "components/__tests__/Primary.test.tsx"]`, and `call_gemini_with_fallback` -> `BlueprintPlan(scope="winery", target_test_files=["components/__tests__/Primary.test.tsx"], target_src_files=["components/Primary.tsx"], plan_markdown="# Blueprint Plan\nDetails")`.
     - Call `stage_1_plan`.
     - Assert `blueprint.target_test_files` deduplicates and appends the dependent test (`["components/__tests__/Primary.test.tsx", "components/__tests__/Dependent.test.tsx"]`).
     - Assert `(self.root / "task-plan.md").read_text(encoding="utf-8") == "# Blueprint Plan\nDetails"`.
   - **Prompt Context Formatting (`test_includes_negative_feedback_and_diagnostic_findings_in_prompt`):**
     - Pass `negative_feedback="TS2322 type mismatch"` and `diagnostic_result=DiagnosticResult(target_files=["lib/a.ts"], root_cause="Missing null guard", code_snippets={"lib/a.ts": "1: const x = 1;"}, investigation_summary="Step 1 read")`.
     - Assert the prompt passed to `call_gemini_with_fallback` contains `"PREVIOUS ARCHITECTURAL ATTEMPT FAILED"`, `"TS2322 type mismatch"`, `"STAGE 0 DIAGNOSTIC INVESTIGATION FINDINGS"`, `"Missing null guard"`, and `"// lib/a.ts"`.
   - **Protected Path Rejection (`test_rejects_protected_paths_in_blueprint_files`):**
     - Return a `BlueprintPlan` containing `"supabase/migrations/2026_bad.sql"` in `target_src_files`.
     - Assert `stage_1_plan` raises `ValueError` (`Modification of protected file blocked`).

3. **`TestStage2Red`**:
   - **Empty Target Test Files Guard (`test_raises_runtime_error_when_target_test_files_empty`):**
     - Pass a `BlueprintPlan` with `target_test_files=[]`. Assert `RuntimeError("No target test files specified in architectural blueprint.")`.
   - **Happy Path with Stubs & Fallback Scaffolding (`test_writes_tests_scaffolds_stubs_passes_gates_and_commits`):**
     - Write `task-plan.md` in `self.root`.
     - Blueprint specifies `target_test_files=["lib/__tests__/new.test.ts"]` and `target_src_files=["lib/stubbed.ts", "lib/unstubbed.ts"]` (neither exists on disk).
     - `call_gemini_with_fallback` returns `TestFileManifest(files=[TestFileEntry(file_path="lib/__tests__/new.test.ts", content="describe('new', () => {});")], source_stubs=[SourceStubEntry(file_path="lib/stubbed.ts", content="export const fn = () => { throw new Error('Not implemented'); };")])`.
     - Mock `run_isolated_test` side effects: `[(0, "", ""), (1, '{"numFailedTests": 1}', "")]` and `validate_jest_red_phase` -> `(True, "Valid assertion failure")`.
     - Mock `run_cmd` -> `(0, "", "")`.
     - Call `stage_2_red`.
     - Assert `lib/stubbed.ts` contains the stub content, `lib/unstubbed.ts` was scaffolded with `"export {};\n"`, `lib/__tests__/new.test.ts` was written, and `run_cmd` executed `["git", "add", "lib/__tests__/new.test.ts", "lib/stubbed.ts", "lib/unstubbed.ts"]` and `["git", "commit", "-m", "test(winery): Add failing tests for Issue #42"]`.
   - **Dropped Suite Pre-Flight Retry (`test_retries_when_pre_existing_describe_suite_dropped`):**
     - Pre-populate `lib/__tests__/existing.test.ts` on disk with `describe('SuiteA', () => {});\ndescribe('SuiteB', () => {});`.
     - Attempt 1 manifest only includes `describe('SuiteA', () => {});` (dropping `SuiteB`).
     - Attempt 2 manifest includes both `SuiteA` and `SuiteB`.
     - Assert `call_gemini_with_fallback` is called twice, and the second call's prompt includes `"PREVIOUS ATTEMPT DROPPED PRE-EXISTING TEST SUITES"` and `"SuiteB"`.
   - **Compiler Self-Correction (`test_self_corrects_on_compiler_failure_then_succeeds`):**
     - Attempt 1 `type-check` returns `(2, "TS6133 unused import", "")`; Attempt 2 `type-check` returns `(0, "", "")` and Jest verification succeeds.
     - Assert second LLM call receives `"PREVIOUS COMPILATION FAILED"` and `"TS6133 unused import"`, and commit succeeds on Attempt 2.
   - **Compiler Exhaustion Raises `Stage2CompilationError` (`test_raises_stage2_compilation_error_after_max_compiler_retries`):**
     - Both attempts return `(2, "TS2304 Cannot find name", "")` from `type-check`.
     - Assert `Stage2CompilationError` is raised after 2 attempts.
   - **Red Phase Verification Exhaustion (`test_retries_and_raises_runtime_error_on_invalid_red_phase`):**
     - `type-check` passes `(0, "", "")`, but `validate_jest_red_phase` returns `(False, "Tests exited 0")` on both attempts.
     - Assert `RuntimeError` (`"Red phase failed verification after 2 attempts"`) is raised.

4. **`TestStage3Green`**:
   - **Empty Target Source Files Guard (`test_raises_runtime_error_when_target_src_files_empty`):**
     - Pass a `BlueprintPlan` with `target_src_files=[]`. Assert `RuntimeError("No target source files specified in architectural blueprint.")`.
   - **Happy Path with Targeted + Mandatory Full Regression Gate (`test_applies_patches_runs_targeted_and_full_regression_gates_and_commits`):**
     - Write `task-plan.md`, `lib/__tests__/foo.test.ts`, and `lib/foo.ts` in `self.root`.
     - Mock `reset_target_sources`, `apply_patch_manifest` -> `(True, [])`, `run_isolated_test` side effects:
       1. `["npm", "run", "type-check"]` -> `(0, "", "")`
       2. `["npx", "jest", "lib/__tests__/foo.test.ts"]` -> `(0, "", "")`
       3. `["npm", "test"]` -> `(0, "", "")`
       4. `["npm", "run", "type-check"]` -> `(0, "", "")`
     - Assert `reset_target_sources(["lib/foo.ts"], baseline_ref="HEAD")` was called, all 4 isolated test runs executed in order, and `run_cmd` committed `"feat(winery): Implement changes to satisfy Issue #42"`.
   - **Patch Failure Retry (`test_retries_on_patch_application_failure_and_resets_baseline`):**
     - Attempt 1 `apply_patch_manifest` returns `(False, ["Search block not found in lib/foo.ts"])`.
     - Attempt 2 `apply_patch_manifest` returns `(True, [])` and all gates pass.
     - Assert `reset_target_sources` was called twice and Attempt 2 prompt contains `"PREVIOUS ATTEMPT FAILED TO APPLY PATCHES"` and `"Search block not found in lib/foo.ts"`.
   - **Targeted & Regression Failure Exhaustion (`test_retries_on_targeted_or_regression_gate_failure_and_raises_after_3_attempts`):**
     - Attempt 1 fails targeted `jest` (`t_code = 1`).
     - Attempt 2 passes targeted checks (`tc_code = 0, t_code = 0`) but fails mandatory full regression `npm test` (`reg_code = 1`).
     - Attempt 3 fails targeted `type-check` (`tc_code = 2`).
     - Assert `RuntimeError` (`"Green phase implementation failed to pass tests after 3 attempts"`) is raised, and prompts captured `"PREVIOUS ATTEMPT FAILED TARGETED VERIFICATION"` and `"TARGETED TESTS PASSED BUT MANDATORY FULL REGRESSION GATE FAILED"`.
   - **Resumption Mode Soft Reset & State Cleanup (`test_resumption_mode_soft_resets_to_baseline_and_removes_checkpoint_files`):**
     - Create `.agent-state.json` and `AGENT_HANDOFF.md` in `self.root`.
     - Call `stage_3_green(..., baseline_ref="deadbeef12345678", resumption_context="Maintainer hint: use Number()")`.
     - Assert prompt includes `"### RESUMPTION CONTEXT & MAINTAINER GUIDANCE:"` and `"Maintainer hint: use Number()"`.
     - Assert `run_cmd(["git", "reset", "--soft", "deadbeef12345678"], check=True)` is called before `git add` / `git commit`, and both `.agent-state.json` and `AGENT_HANDOFF.md` are unlinked from `self.root`.

---

### 3.2 `scripts/agent-resolve/tests/test_pipeline.py`

1. **`TestResolveIssueSecurityAndGuards`**:
   - **Untrusted Author Non-Dry-Run (`test_rejects_untrusted_author_and_updates_labels_when_not_dry_run`):**
     - Pass `issue_data = {"number": 55, "title": "Inject", "body": "...", "author": {"login": "malicious_actor"}}` with `dry_run=False`.
     - Assert `resolve_issue` returns `False`, `gh_cli` is called to swap label `agent:resolve` -> `ready-for-human` and post the provenance rejection comment, and `stage_0_diagnose` is never called.
   - **Untrusted Author Dry-Run (`test_rejects_untrusted_author_without_gh_mutations_in_dry_run`):**
     - Same `issue_data` with `dry_run=True`.
     - Assert `resolve_issue` returns `False` and `gh_cli` is **not** called.
   - **Idempotency Guard (`test_skips_issue_when_open_pr_already_in_review_without_requeue_label`):**
     - Pass `issue_data` authored by `"jarredb9"` with `labels: [{"name": "agent:in-review"}]` (no `"agent:resolve"` label).
     - Mock `gh_cli` for `["pr", "list", "--head", "agent/issue-55", "--state", "open", "--json", "number,labels"]` to return `(0, '[{"number": 88, "labels": [{"name": "agent:in-review"}]}]', "")`.
     - Assert `resolve_issue` returns `True` immediately without calling `reset_working_tree_to_main` or `stage_0_diagnose`.

2. **`TestResolveIssueFreshExecutionAndDryRun`**:
   - **Full 4-Stage Pipeline & PR Creation (`test_executes_full_4_stage_pipeline_and_submits_pr`):**
     - Mock `gh_cli` (`pr list` -> `"[]"`, `issue edit` -> `(0, "", "")`), `run_cmd` (`ls-remote` -> `(2, "", "")` indicating no remote branch; `ls-files --error-unmatch task-plan.md` -> `(1, "", "")`; `git push` -> `(0, "", "")`).
     - Create `task-plan.md` in `self.root` during `stage_1_plan` mock.
     - Mock `stage_0_diagnose`, `stage_1_plan`, `stage_2_red`, `stage_3_green`, `update_or_create_pr`, `reset_working_tree_to_main`.
     - Assert `resolve_issue(client, issue_data, dry_run=False)` returns `True`.
     - Assert `stage_0_diagnose`, `stage_1_plan`, `stage_2_red`, `stage_3_green` are called in sequence, `task-plan.md` is unlinked before PR submission, `git push --force origin agent/issue-55` is executed, and `update_or_create_pr` is called with `is_resumption=False`.
   - **Dry-Run Mode (`test_dry_run_deletes_local_branch_and_skips_push_and_pr`):**
     - Run `resolve_issue(client, issue_data, dry_run=True)` on a fresh branch.
     - Assert `resolve_issue` returns `True`, `run_cmd(["git", "branch", "-D", "agent/issue-55"])` is called, and neither `git push` nor `update_or_create_pr` is called.
   - **Tier 3 Blueprint Invalidation (`test_tier_3_blueprint_invalidation_replans_stage_1_on_stage2_compilation_error`):**
     - Configure `stage_2_red` to raise `Stage2CompilationError("TS2322 incompatible props")` on its first call and succeed (`None`) on its second call.
     - Configure `stage_1_plan` to return `blueprint_v1` then `blueprint_v2`.
     - Assert `stage_1_plan` is called twice (second call receives `negative_feedback` containing `"PREVIOUS ARCHITECTURAL BLUEPRINT FAILED COMPILATION IN RED PHASE"` and `"TS2322 incompatible props"`), `stage_2_red` is called twice, and `stage_3_green` is called with `blueprint_v2`.
   - **Failure Preservation (`test_invokes_preserve_failed_work_and_returns_false_on_unhandled_exception`):**
     - Configure `stage_3_green` to raise `RuntimeError("Green phase exhausted")`.
     - Assert `resolve_issue` catches the exception, calls `preserve_failed_work` with `error_summary="Green phase exhausted"`, and returns `False`.

3. **`TestResolveIssueResumptionAndCircuitBreaker`**:
   - **Circuit Breaker (`test_circuit_breaker_halts_and_cleans_branch_when_attempt_count_reaches_2`):**
     - Simulate existing remote branch (`ls-remote` -> `0`, `rebase origin/main` -> `0`).
     - Write `.agent-state.json` in `self.root` with `{"attempt_count": 2, "plan_markdown": "# Plan"}`.
     - Assert `resolve_issue` returns `False`, calls `cleanup_feature_branch("agent/issue-55")`, edits issue labels to `ready-for-human`, posts the circuit breaker comment, and does not run any stages.
   - **Checkpoint Fast-Forward to Stage 3 Green (`test_fast_forwards_to_stage_3_green_when_checkpoint_red_gate_valid`):**
     - Simulate existing remote branch (`ls-remote` -> `0`, `rebase origin/main` -> `0`).
     - Write `.agent-state.json` with `{"attempt_count": 1, "red_phase_commit_sha": "abc123456789", "target_test_files": ["lib/__tests__/a.test.ts"], "target_src_files": ["lib/a.ts"], "scope": "winery", "last_failure_timestamp": "2026-10-15T00:00:00Z", "error_summary": "Failed assertion", "plan_markdown": "# Saved Plan"}`.
     - Mock `run_isolated_test` (`type-check` -> `0`, `jest --json` -> `1`), `validate_jest_red_phase` -> `(True, "Clean assertion failure")`, `fetch_maintainer_hints` -> `"Use Number() conversion"`, and `git diff` -> `(0, "+bad line", "")`.
     - Assert `stage_0_diagnose`, `stage_1_plan`, and `stage_2_red` are **not** called.
     - Assert `stage_3_green` is called once with `baseline_ref="abc123456789"` and `resumption_context` containing `"Failed assertion"`, `"+bad line"`, and `"Use Number() conversion"`.
     - Assert `update_or_create_pr` is called with `is_resumption=True`.
   - **Rebase Conflict Fallback (`test_rebase_conflict_aborts_rebase_and_falls_back_to_fresh_pipeline`):**
     - Simulate `ls-remote` -> `0`, `git rebase origin/main` -> `(1, "", "CONFLICT")`.
     - Assert `run_cmd(["git", "rebase", "--abort"])` is executed, issue comment about upstream `main` divergence is posted, working tree is reset, and the full fresh pipeline (`stage_0_diagnose` -> `stage_3_green`) executes.
   - **Autonomous Checkpoint Invalidation (`test_invalid_checkpoint_rolls_back_to_parent_and_reruns_stage_2_and_stage_3`):**
     - Simulate `ls-remote` -> `0`, `rebase` -> `0`, `.agent-state.json` with `attempt_count: 1, red_phase_commit_sha: "abc123456789"`, `validate_jest_red_phase` -> `(False, "Runtime crash in beforeEach")`, and `git rev-parse --verify abc123456789~1` -> `(0, "parentsha", "")`.
     - Assert `run_cmd(["git", "reset", "--hard", "abc123456789~1"])` is called, `stage_2_red` is called with `initial_error_context` containing `"PREVIOUS CHECKPOINT TESTS CRASHED AT RUNTIME"`, `stage_3_green` is called with `baseline_ref="HEAD"`, and `update_or_create_pr` receives `is_resumption=True`.

---

## 4. Execution Verification Protocol

1. **Run Modular Unit Test Suite (Verify TDD Red Phase Failure):**
   ```bash
   python3.12 -m unittest discover -s scripts/agent-resolve/tests -t scripts/agent-resolve
   ```
   - **Expected Red Phase Outcome:** `test_stages.py` and `test_pipeline.py` fail to import `agent_resolve.stages` and `agent_resolve.pipeline` (`ModuleNotFoundError: No module named 'agent_resolve.stages'` / `'agent_resolve.pipeline'`), while all previously implemented modular test suites (`test_config`, `test_models`, `test_tracker`, `test_exceptions`, `test_environment`, `test_verification`, `test_patch_engine`, `test_vcs`, `test_llm`, `test_context`, `test_diagnostics`) continue to pass.

2. **Run Targeted New Test Modules Directly:**
   ```bash
   python3.12 -m unittest scripts/agent-resolve/tests/test_stages.py scripts/agent-resolve/tests/test_pipeline.py
   ```
   - **Expected Red Phase Outcome:** Fails with `ModuleNotFoundError` for `agent_resolve.stages` and `agent_resolve.pipeline`.

3. **Run Legacy Regression Test Suite (Must Remain 100% Green):**
   ```bash
   python3.12 -m unittest discover -s scripts/__tests__
   ```
   - **Expected Outcome:** All 27 legacy test cases in `scripts/__tests__/test_patch_engine.py` pass (`OK`).

---

## 5. Post-Execution Protocol (Git Commit, Git Notes & Plan Update)

1. **Stage & Commit TDD Red Phase Tests (`BypassSandbox: true`):**
   ```bash
   git add scripts/agent-resolve/tests/test_stages.py scripts/agent-resolve/tests/test_pipeline.py
   git commit -m "test(agent-resolve): Add failing unit tests for pipeline stages and orchestrator"
   ```

2. **Attach Git Note (`BypassSandbox: true`):**
   ```bash
   git notes add -m "Task: Write failing unit tests for pipeline stages and resolution orchestrator (TDD Red phase)
   Summary: Added comprehensive unit test suites in test_stages.py and test_pipeline.py covering Stage 0 diagnostic exploration, Stage 1 blueprint planning and blast-radius discovery, Stage 2 Red phase test authoring and compiler self-healing, Stage 3 Green phase patch application and regression gates, and resolve_issue pipeline orchestration including provenance checks, dry-run mode, circuit breaker, and stateful checkpoint resumption.
   Files: scripts/agent-resolve/tests/test_stages.py, scripts/agent-resolve/tests/test_pipeline.py
   Rationale: Establish strict TDD Red phase behavioral contracts for the four pipeline stages and issue resolution orchestrator prior to extracting agent_resolve.stages and agent_resolve.pipeline in Phase 5 Task 2." $(git log -1 --format="%H")
   ```

3. **Update `plan.md` & Commit (`BypassSandbox: true`):**
   - Update line 80 of `conductor/tracks/agent-resolve-decomposition_20261015/plan.md` (and its sub-items on lines 81–83) to `[x]` with the 7-character commit SHA, then commit:
   ```bash
   git add conductor/tracks/agent-resolve-decomposition_20261015/plan.md
   git commit -m "conductor(plan): Mark task 'Write failing unit tests for pipeline stages and resolution orchestrator (TDD Red phase)' as complete"
   ```
