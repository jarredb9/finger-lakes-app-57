# Implementation Plan — Phase 5, Task 2: Implement pipeline stages and resolution orchestrator in agent_resolve.stages and agent_resolve.pipeline (TDD Green phase)

## 1. Target Files & Insertion Anchors

- **Path:** `scripts/agent-resolve/agent_resolve/stages/stage_0_diagnose.py`
  - **Operation:** Create new module (`agent_resolve.stages.stage_0_diagnose`).
  - **Semantic Anchor:** Module docstring, imports of `config`, `diagnostics` tools (`parse_issue_diagnostics`, `find_files`, `grep_search`, `read_file_snippet`), `safe_resolve_repo_path`, `call_gemini_with_fallback`, and `log`, followed by exported function `stage_0_diagnose`.

- **Path:** `scripts/agent-resolve/agent_resolve/stages/stage_1_plan.py`
  - **Operation:** Create new module (`agent_resolve.stages.stage_1_plan`).
  - **Semantic Anchor:** Module docstring, imports of `config`, `context` helpers (`get_project_context`, `find_related_test_files`), `safe_resolve_repo_path`, `call_gemini_with_fallback`, and `log`, followed by exported function `stage_1_plan`.

- **Path:** `scripts/agent-resolve/agent_resolve/stages/stage_2_red.py`
  - **Operation:** Create new module (`agent_resolve.stages.stage_2_red`).
  - **Semantic Anchor:** Module docstring, imports of `config`, `context` (`extract_test_suite_names`, `get_project_context`), `environment` (`log`, `run_cmd`, `run_isolated_test`), `exceptions.Stage2CompilationError`, `verification.validate_jest_red_phase`, `safe_resolve_repo_path`, and `call_gemini_with_fallback`, followed by exported function `stage_2_red`.

- **Path:** `scripts/agent-resolve/agent_resolve/stages/stage_3_green.py`
  - **Operation:** Create new module (`agent_resolve.stages.stage_3_green`).
  - **Semantic Anchor:** Module docstring, imports of `config`, `context.get_project_context`, `environment` (`log`, `run_cmd`, `run_isolated_test`), `patch_engine` (`apply_patch_manifest`, `reset_target_sources`, `safe_resolve_repo_path`), and `call_gemini_with_fallback`, followed by exported function `stage_3_green`.

- **Path:** `scripts/agent-resolve/agent_resolve/stages/__init__.py`
  - **Operation:** Create package initialization module (`agent_resolve.stages`).
  - **Semantic Anchor:** Package docstring and re-exports of `stage_0_diagnose`, `stage_1_plan`, `stage_2_red`, and `stage_3_green`, with `__all__` list.

- **Path:** `scripts/agent-resolve/agent_resolve/pipeline.py`
  - **Operation:** Create orchestrator module (`agent_resolve.pipeline`).
  - **Semantic Anchor:** Module docstring, imports of `config`, `environment` (`log`, `run_cmd`, `run_isolated_test`), `vcs` helpers (`cleanup_feature_branch`, `fetch_maintainer_hints`, `gh_cli`, `preserve_failed_work`, `reset_working_tree_to_main`, `update_or_create_pr`), `verification.validate_jest_red_phase`, `patch_engine` (`reset_target_sources`, `safe_resolve_repo_path`), `stages` (`stage_0_diagnose`, `stage_1_plan`, `stage_2_red`, `stage_3_green`), `context.is_issue_suitable_for_headless_agent`, and `exceptions.Stage2CompilationError`, followed by exported function `resolve_issue`.

- **Path:** `scripts/agent-resolve/agent_resolve/__init__.py`
  - **Operation:** Re-export new modules and functions in top-level package.
  - **Semantic Anchor:** Under existing module imports (line 25), import `stages` and `pipeline`; under existing symbol imports, import `stage_0_diagnose`, `stage_1_plan`, `stage_2_red`, `stage_3_green`, and `resolve_issue`; append to `__all__`.

- **Path:** `scripts/agent-resolve/agent-resolve.py`
  - **Operation:** Delegate extracted stage and pipeline functions to modular submodules.
  - **Semantic Anchor:** At line 71, import `stages as _ar_stages` and `pipeline as _ar_pipeline`; replace monolithic function bodies (lines 205–1128) with delegating aliases (`stage_0_diagnose = _ar_stages.stage_0_diagnose`, etc.).

- **Path:** `conductor/tracks/agent-resolve-decomposition_20261015/plan.md`
  - **Operation:** Update task status markers during execution (`[ ]` -> `[~]` -> `[x] <sha>`).
  - **Semantic Anchor:** Under `## Phase 5: Pipeline Stages & CLI Orchestrator`, lines 84–92 (`- [ ] Task: Implement pipeline stages and resolution orchestrator in agent_resolve.stages and agent_resolve.pipeline (TDD Green phase)`).

---

## 2. Python Interfaces & Exported Function Signatures

### 2.1 Module: `agent_resolve.stages` (`scripts/agent-resolve/agent_resolve/stages/`)

```python
from typing import Any, List, Optional
from agent_resolve.models import BlueprintPlan, DiagnosticResult
from agent_resolve.tracker import TokenTracker

# scripts/agent-resolve/agent_resolve/stages/stage_0_diagnose.py
def stage_0_diagnose(
    client: Any,
    issue_title: str,
    issue_body: str,
    token_tracker: TokenTracker,
) -> DiagnosticResult: ...

# scripts/agent-resolve/agent_resolve/stages/stage_1_plan.py
def stage_1_plan(
    client: Any,
    issue_number: int,
    issue_title: str,
    issue_body: str,
    token_tracker: TokenTracker,
    negative_feedback: str = "",
    diagnostic_result: Optional[DiagnosticResult] = None,
) -> BlueprintPlan: ...

# scripts/agent-resolve/agent_resolve/stages/stage_2_red.py
def stage_2_red(
    client: Any,
    issue_number: int,
    issue_title: str,
    blueprint: BlueprintPlan,
    token_tracker: TokenTracker,
    new_src_files: Optional[List[str]] = None,
    initial_error_context: str = "",
) -> None: ...

# scripts/agent-resolve/agent_resolve/stages/stage_3_green.py
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

### 2.2 Module: `agent_resolve.pipeline` (`scripts/agent-resolve/agent_resolve/pipeline.py`)

```python
from typing import Any, Dict

def resolve_issue(
    client: Any,
    issue_data: Dict[str, Any],
    dry_run: bool = False,
) -> bool: ...
```

---

## 3. Precise Behavioral Logic & Architecture Blueprint

### 3.1 `scripts/agent-resolve/agent_resolve/stages/stage_0_diagnose.py`

1. **Explicit Target File Verification:**
   - Parse candidate target files and root cause via `parse_issue_diagnostics(issue_body)`.
   - For each candidate `sf`:
     - Attempt `safe_resolve_repo_path(sf)`. If file exists on disk, append to `verified_files`, read lines 1–100 via `read_file_snippet(sf, 1, 100)`, and record in `code_snippets` and `investigation_log`.
     - If file does not exist on disk, call `find_files(Path(sf).name)`. For each line in output, if path exists on disk under `config.get_project_root() / line_f` and is not already verified, add to `verified_files` and populate `code_snippets`.
     - Catch exceptions (e.g., protected path `ValueError`) and record in `investigation_log`: `Could not resolve explicit file '{sf}': {e}` without crashing.
2. **Iterative Tool-Equipped Exploration Loop:**
   - If `verified_files` is empty, run iterative loop up to `max_tool_calls = 5`.
   - Build exploration prompt including issue title, body, history of previous tool calls, and verified files so far.
   - Invoke `call_gemini_with_fallback(client, prompt, DEFAULT_PLANNER_MODELS, schema_cls=DiagnosticAction, temperature=0.1, token_tracker=token_tracker)`.
   - For any path in `action.discovered_target_files`, validate via `safe_resolve_repo_path` and add to `verified_files` and `code_snippets`.
   - If `action.action == "conclude"`, log `Concluded diagnosis at step {step}: {action.reasoning}` and break.
   - Dispatch tool calls:
     - `"grep_search"` -> `grep_search(action.query, action.path_prefix)`
     - `"find_files"` -> `find_files(action.pattern)`
     - `"read_file_snippet"` -> `read_file_snippet(action.file_path, action.start_line, action.end_line)`
   - Append step details to `history` (truncated at 1500 chars) and `investigation_log`.
3. **Return Value:**
   - Return `DiagnosticResult` with `target_files=verified_files`, `root_cause=parsed_root_cause or "Diagnosed via repository exploration."`, `code_snippets=code_snippets`, and `investigation_summary="\n".join(investigation_log)`.

### 3.2 `scripts/agent-resolve/agent_resolve/stages/stage_1_plan.py`

1. **Context & Prompt Assembly:**
   - Call `get_project_context()` to load domain context and invariants.
   - If `negative_feedback` is non-empty, format section:
     `### PREVIOUS ARCHITECTURAL ATTEMPT FAILED WITH COMPILER/RED-PHASE ERRORS:\n{negative_feedback}\nRevise your architectural blueprint to resolve these failures. Do not re-attempt an incompatible design.\n`
   - If `diagnostic_result` is present, format section:
     `### STAGE 0 DIAGNOSTIC INVESTIGATION FINDINGS:\nVerified Target Files:\n{json.dumps(diagnostic_result.target_files, indent=2)}\n\nRoot Cause / Suspected Behavior:\n{diagnostic_result.root_cause}\n\nDiscovered Code Snippets:\n{snippets_formatted}\n\nInvestigation Summary:\n{diagnostic_result.investigation_summary}\n`
   - Formulate structured prompt emphasizing domain model invariants, clean component boundaries, React 19 JSX transform rules, and JSDOM `window.location` non-configurable invariants.
2. **Model Call & Validation:**
   - Invoke `call_gemini_with_fallback(client, prompt, DEFAULT_PLANNER_MODELS, schema_cls=BlueprintPlan, temperature=0.2, token_tracker=token_tracker)`.
   - Validate all `target_test_files` and `target_src_files` via `safe_resolve_repo_path(p)` (raising `ValueError` if any path is in `PROTECTED_PATHS` or escapes the repo root).
3. **Blast Radius Discovery & Disk Persistence:**
   - Call `find_related_test_files(blueprint.target_src_files)`.
   - Append any discovered test path not already present in `blueprint.target_test_files`.
   - Write authoritative plan markdown to `config.get_project_root() / "task-plan.md"` (`utf-8`).
   - Return `blueprint`.

### 3.3 `scripts/agent-resolve/agent_resolve/stages/stage_2_red.py`

1. **Preconditions & New Source Detection:**
   - If `not blueprint.target_test_files`, raise `RuntimeError("No target test files specified in architectural blueprint.")`.
   - If `new_src_files is None`, detect brand new target sources: `[sf for sf in blueprint.target_src_files if not safe_resolve_repo_path(sf).exists()]`.
   - Read `task-plan.md` from `config.get_project_root() / "task-plan.md"`.
   - Initialize `last_compiler_error = initial_error_context`, `max_red_retries = 2`.
2. **Retry Loop (Test Authoring, Stubs, Compiler Gate, Jest Gate):**
   - Assemble existing test files context, new source files prompt section, and previous compiler/runtime error.
   - Invoke `call_gemini_with_fallback(client, prompt, DEFAULT_EXECUTOR_MODELS, schema_cls=TestFileManifest, temperature=0.2, token_tracker=token_tracker)`.
   - **Dropped Suite Pre-Flight Check:** For each file in `manifest.files`, extract suite names via `extract_test_suite_names` and compare with existing file on disk. If any describe suites were dropped and `attempt < max_red_retries`, format `last_compiler_error` (`PREVIOUS ATTEMPT DROPPED PRE-EXISTING TEST SUITES:...`) and retry immediately.
   - **Stub Writing & Scaffolding:**
     - Write provided `manifest.source_stubs` to disk for any new or non-existent target source files.
     - Fallback scaffolding: For any entry in `new_src_files` still missing on disk, write `export {};\n` to ensure TypeScript import resolution.
   - Write test files from `manifest.files` to disk.
   - **Compiler Gate:** Run `run_isolated_test(["npm", "run", "type-check"])`. If exit code != 0:
     - If `attempt < max_red_retries`, update `last_compiler_error` (`PREVIOUS COMPILATION FAILED:...`) and continue.
     - If attempts exhausted, raise `Stage2CompilationError(...)`.
   - **Red Verification Gate:** Run `run_isolated_test(["npx", "jest", "--json"] + target_tests)`.
     - Evaluate output via `validate_jest_red_phase(t_code, t_out, t_err)`.
     - If not valid red phase (e.g., tests exited 0 or fatal harness crashes):
       - If `attempt < max_red_retries`, update `last_compiler_error` (`PREVIOUS TESTS FAILED RED PHASE VERIFICATION:...`) and continue.
       - If attempts exhausted, raise `RuntimeError(f"Red phase failed verification after {max_red_retries} attempts: {red_diagnostics}")`.
3. **Commit Red Phase:**
   - Run `run_cmd(["git", "add"] + target_tests + staged_stubs, check=True)`.
   - Commit: `run_cmd(["git", "commit", "-m", f"test({blueprint.scope}): Add failing tests for Issue #{issue_number}"], check=True)`.

### 3.4 `scripts/agent-resolve/agent_resolve/stages/stage_3_green.py`

1. **Preconditions & Setup:**
   - If `not blueprint.target_src_files`, raise `RuntimeError("No target source files specified in architectural blueprint.")`.
   - Read `task-plan.md` from `config.get_project_root() / "task-plan.md"`.
   - Read existing target test files content.
   - Format `resumption_section` if `resumption_context` is provided (`### RESUMPTION CONTEXT & MAINTAINER GUIDANCE:\n{resumption_context}\n`).
   - Set `max_retries = 3`, `last_error_context = ""`.
2. **Retry Loop (Search/Replace Patching, Targeted Verification, Mandatory Full Regression Gate):**
   - **Clean Baseline Reversion:** Call `reset_target_sources(target_src, baseline_ref=baseline_ref)` at start of each attempt.
   - Format `CURRENT SOURCE FILES` section (identifying new files vs. existing files).
   - Invoke `call_gemini_with_fallback(client, prompt, DEFAULT_EXECUTOR_MODELS, schema_cls=PatchManifest, temperature=0.2, token_tracker=token_tracker)`.
   - Apply patches via `apply_patch_manifest(manifest, new_src_files=new_src_files)`. If failed, set `last_error_context` (`PREVIOUS ATTEMPT FAILED TO APPLY PATCHES:...`) and continue.
   - **Targeted Verification Checks:** Run `run_isolated_test(["npm", "run", "type-check"])` and `run_isolated_test(["npx", "jest"] + target_tests)`.
   - If both targeted checks pass (`tc_code == 0 and t_code == 0`):
     - **Mandatory Full Regression Gate:** Run `run_isolated_test(["npm", "test"])` and `run_isolated_test(["npm", "run", "type-check"])`.
     - If both exit 0:
       - If `baseline_ref != "HEAD"` (resumption mode): soft-reset branch via `run_cmd(["git", "reset", "--soft", baseline_ref], check=True)` and remove `.agent-state.json` and `AGENT_HANDOFF.md` from `config.get_project_root()` if present.
       - Stage: `run_cmd(["git", "add"] + target_src, check=True)`.
       - Commit: `run_cmd(["git", "commit", "-m", f"feat({blueprint.scope}): Implement changes to satisfy Issue #{issue_number}"], check=True)`.
       - Return.
     - If regression fails, set `last_error_context` (`TARGETED TESTS PASSED BUT MANDATORY FULL REGRESSION GATE FAILED:...`) and continue.
   - If targeted checks fail, set `last_error_context` (`PREVIOUS ATTEMPT FAILED TARGETED VERIFICATION:...`) and continue.
3. **Exhaustion:**
   - Raise `RuntimeError(f"Green phase implementation failed to pass tests after {max_retries} attempts.\n{last_error_context}")`.

### 3.5 `scripts/agent-resolve/agent_resolve/pipeline.py`

1. **Security & Provenance Gate:**
   - If `issue_data.get("author", {}).get("login") != "jarredb9"`:
     - If `not dry_run`: call `gh_cli` to remove `agent:resolve` and add `ready-for-human`, and post provenance rejection comment.
     - Return `False`.
2. **Scope Triage & Idempotency Guard:**
   - Run advisory check `is_issue_suitable_for_headless_agent(issue_title, issue_body)`.
   - Check open PRs on `agent/issue-{number}` via `gh_cli pr list`. If an open PR has `agent:in-review` and issue does not have `agent:resolve`, log and return `True`.
   - Call `reset_working_tree_to_main()`.
   - If `not dry_run`, update issue labels (`--remove-label agent:resolve --add-label agent:in-progress`).
3. **Branch Setup & Stateful Resumption:**
   - Check if remote branch exists via `git ls-remote --exit-code --heads origin {branch_name}`.
   - If exists:
     - Fetch and checkout branch, reset hard to `origin/{branch_name}`, rebase onto `origin/main`.
     - If rebase fails: abort rebase (`git rebase --abort`), post comment to issue if not dry run, reset working tree to main, and checkout `-B {branch_name} origin/main`.
     - If rebase succeeds: inspect `config.get_project_root() / ".agent-state.json"`.
       - If `attempt_count >= 2`: trigger Circuit Breaker. Call `cleanup_feature_branch(branch_name)`, edit issue labels to `ready-for-human`, comment on issue, and return `False`.
       - Validate checkpoint Red Gate: run `type-check` and `jest --json` against checkpoint target tests.
       - If valid red phase: fast-forward directly to `stage_3_green` with `baseline_ref=red_sha` and maintainer hints / WIP diff in `resumption_context`. Set `is_resumption = True`.
       - If checkpoint invalid (Autonomous Checkpoint Invalidation): check `git rev-parse --verify {red_sha}~1`. If parent verified, `git reset --hard {red_sha}~1`, rerun `stage_2_red` (with Tier 3 fallback to `stage_1_plan` on `Stage2CompilationError`), and execute `stage_3_green(baseline_ref="HEAD")`. Set `is_resumption = True`.
   - If remote branch does not exist: checkout `-B {branch_name} origin/main`.
4. **Fresh 4-Stage Pipeline Execution (if not `is_resumption`):**
   - Stage 0: `diagnostic_result = stage_0_diagnose(client, issue_title, issue_body, token_tracker)`
   - Stage 1: `blueprint = stage_1_plan(client, issue_number, issue_title, issue_body, token_tracker, diagnostic_result=diagnostic_result)`
   - Stage 2: `stage_2_red` with **Tier 3 Blueprint Invalidation**:
     - Catch `Stage2CompilationError`: reset to `origin/main`, rerun `stage_1_plan` passing `negative_feedback` with previous plan and compiler errors, then rerun `stage_2_red`.
   - Stage 3: `stage_3_green(client, issue_number, issue_title, blueprint, token_tracker, new_src_files=new_src_files)`
5. **PR Submission & Cleanup:**
   - If `dry_run`: log summary, reset working tree to main, delete local branch `git branch -D {branch_name}`, return `True`.
   - Git hygiene: if `task-plan.md` is tracked in git (`git ls-files --error-unmatch`), `git rm -f task-plan.md` and commit. Unlink from `config.get_project_root()` if present on disk.
   - Push branch: `git push --force origin {branch_name}` (with `GH_TOKEN`/`GITHUB_TOKEN` in env).
   - Submit PR: `update_or_create_pr(..., is_resumption=is_resumption)`.
   - Reset working tree to main and return `True`.
6. **Exception Preservation:**
   - On unhandled exception: call `preserve_failed_work(...)` with `error_summary=str(e)` and return `False`.

---

## 4. Execution Verification Protocol

1. **Verify Target Modular Unit Test Suites:**
   ```bash
   python3.12 -m unittest scripts/agent-resolve/tests/test_stages.py scripts/agent-resolve/tests/test_pipeline.py
   ```
   - **Expected Outcome:** All test cases in `test_stages.py` (Stage 0, 1, 2, 3) and `test_pipeline.py` (Security, Fresh/Dry-Run, Resumption/Circuit Breaker) pass (`OK`).

2. **Verify Full Modular Unit Test Suite:**
   ```bash
   python3.12 -m unittest discover -s scripts/agent-resolve/tests -t scripts/agent-resolve
   ```
   - **Expected Outcome:** All modular test suites (`test_config`, `test_models`, `test_tracker`, `test_exceptions`, `test_environment`, `test_verification`, `test_patch_engine`, `test_vcs`, `test_llm`, `test_context`, `test_diagnostics`, `test_stages`, `test_pipeline`) pass (`OK`).

3. **Verify Legacy Regression Test Suite:**
   ```bash
   python3.12 -m unittest discover -s scripts/__tests__
   ```
   - **Expected Outcome:** All 27 test cases in `scripts/__tests__/test_patch_engine.py` pass (`OK`).

---

## 5. Post-Execution Protocol (Git Commit, Git Notes & Plan Update)

1. **Stage & Commit Modular Implementations (`BypassSandbox: true`):**
   ```bash
   git add scripts/agent-resolve/agent_resolve/stages/ scripts/agent-resolve/agent_resolve/pipeline.py scripts/agent-resolve/agent_resolve/__init__.py scripts/agent-resolve/agent-resolve.py
   git commit -m "feat(agent-resolve): Implement pipeline stages and resolution orchestrator"
   ```

2. **Attach Git Note (`BypassSandbox: true`):**
   ```bash
   git notes add -m "Task: Implement pipeline stages and resolution orchestrator in agent_resolve.stages and agent_resolve.pipeline (TDD Green phase)
   Summary: Implemented modular pipeline stages in agent_resolve.stages (stage_0_diagnose, stage_1_plan, stage_2_red, stage_3_green) and issue resolution orchestrator in agent_resolve.pipeline (resolve_issue), delegating legacy references in agent-resolve.py and re-exporting in agent_resolve.__init__.py.
   Files: scripts/agent-resolve/agent_resolve/stages/stage_0_diagnose.py, scripts/agent-resolve/agent_resolve/stages/stage_1_plan.py, scripts/agent-resolve/agent_resolve/stages/stage_2_red.py, scripts/agent-resolve/agent_resolve/stages/stage_3_green.py, scripts/agent-resolve/agent_resolve/stages/__init__.py, scripts/agent-resolve/agent_resolve/pipeline.py, scripts/agent-resolve/agent_resolve/__init__.py, scripts/agent-resolve/agent-resolve.py
   Rationale: Complete TDD Green phase for Phase 5 Task 2 by decomposing monolithic stages and pipeline orchestrator into isolated modules with zero regression." $(git log -1 --format="%H")
   ```

3. **Update `plan.md` & Commit (`BypassSandbox: true`):**
   - Update line 84 of `conductor/tracks/agent-resolve-decomposition_20261015/plan.md` (and its sub-items on lines 85–92) to `[x]` with the 7-character commit SHA, then commit:
   ```bash
   git add conductor/tracks/agent-resolve-decomposition_20261015/plan.md
   git commit -m "conductor(plan): Mark task 'Implement pipeline stages and resolution orchestrator in agent_resolve.stages and agent_resolve.pipeline (TDD Green phase)' as complete"
   ```
