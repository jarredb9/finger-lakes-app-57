# Implementation Plan: Decompose Autonomous Issue Resolver Script (`agent-resolve.py`)

## Phase 1: Scaffolding, Package Foundation & Core Models
- [ ] Task: Scaffold Python package structure and pyproject.toml
    - [ ] Create `scripts/agent-resolve/pyproject.toml` with build-system, package metadata, dependencies (`google-genai`, `pydantic`, `tenacity`), and optional test dependencies
    - [ ] Create `scripts/agent-resolve/agent_resolve/__init__.py` with package version and public exports
- [ ] Task: Write failing unit tests for models, TokenTracker, and exceptions (TDD Red phase)
    - [ ] Create test cases for `DiagnosticAction`, `BlueprintPlan`, `TestFileEntry`, `SourceStubEntry`, `TestFileManifest`, `PatchChunk`, `PatchManifest`, and `DiagnosticResult`
    - [ ] Create test cases for `TokenTracker` (token recording, budget enforcement exception, summary formatting)
    - [ ] Create test cases for `Stage2CompilationError` exception hierarchy
    - [ ] Assert tests fail when imported from not-yet-created modules
- [ ] Task: Implement models, TokenTracker, and exceptions in agent_resolve (TDD Green phase)
    - [ ] Extract Pydantic schema definitions into `scripts/agent-resolve/agent_resolve/models.py`
    - [ ] Extract `TokenTracker` into `scripts/agent-resolve/agent_resolve/tracker.py`
    - [ ] Extract `Stage2CompilationError` into `scripts/agent-resolve/agent_resolve/exceptions.py`
    - [ ] Verify unit tests pass with `python3.12 -m unittest`
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Scaffolding, Package Foundation & Core Models' (Protocol in workflow.md)

## Phase 2: Environment, VCS & Patch Engine Isolation
- [ ] Task: Write failing unit tests for environment and secret sanitization utilities (TDD Red phase)
    - [ ] Create unit tests for `log`, `sanitize_secrets` (redacting GitHub tokens, PATs, AIza keys, Bearer tokens), `run_cmd` (timeout handling), `is_docker_available`, and `run_isolated_test`
    - [ ] Assert tests fail against `agent_resolve.environment`
- [ ] Task: Implement environment and secret sanitization in agent_resolve.environment (TDD Green phase)
    - [ ] Implement `scripts/agent-resolve/agent_resolve/environment.py` with process execution, secret scrubbing, and Docker isolation helpers
    - [ ] Verify all environment unit tests pass
- [ ] Task: Write failing unit tests for multi-tier patch engine and path resolution (TDD Red phase)
    - [ ] Create unit tests for `safe_resolve_repo_path` (including SEC-04 migration protection blocks), `reset_target_sources`, and `apply_patch_manifest` (Tier 1 exact, Tier 2 whitespace trimmed, CRLF normalization, clean error formatting, ambiguous rejection, new file creation)
    - [ ] Assert tests fail against `agent_resolve.patch_engine`
- [ ] Task: Implement patch engine in agent_resolve.patch_engine (TDD Green phase)
    - [ ] Implement `scripts/agent-resolve/agent_resolve/patch_engine.py`
    - [ ] Verify all patch engine unit tests pass
- [ ] Task: Write failing unit tests for VCS and GitHub CLI helpers (TDD Red phase)
    - [ ] Create unit tests for `gh_cli`, `reset_working_tree_to_main`, `cleanup_feature_branch`, `update_or_create_pr`, `preserve_failed_work` (circuit breaker state file creation and attempt incrementing), and `fetch_maintainer_hints` (provenance & timestamp filtering)
    - [ ] Assert tests fail against `agent_resolve.vcs`
- [ ] Task: Implement VCS and GitHub helpers in agent_resolve.vcs (TDD Green phase)
    - [ ] Implement `scripts/agent-resolve/agent_resolve/vcs.py`
    - [ ] Verify all VCS unit tests pass
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Environment, VCS & Patch Engine Isolation' (Protocol in workflow.md)

## Phase 3: LLM Client, Context Discovery & Exploration Tools
- [ ] Task: Write failing unit tests for LLM client and transient retry handling (TDD Red phase)
    - [ ] Create unit tests for `get_genai_client`, `is_transient_error` (detecting connection resets, socket drops, 429, 503, 500 while ignoring non-transient errors), and `call_gemini_with_fallback`
    - [ ] Assert tests fail against `agent_resolve.llm`
- [ ] Task: Implement LLM client and retry logic in agent_resolve.llm (TDD Green phase)
    - [ ] Implement `scripts/agent-resolve/agent_resolve/llm.py`
    - [ ] Verify all LLM client unit tests pass
- [ ] Task: Write failing unit tests for repository context and diagnostic exploration (TDD Red phase)
    - [ ] Create unit tests for `get_repository_tree`, `get_project_context`, `find_related_test_files`, `extract_test_suite_names`, `is_issue_suitable_for_headless_agent`, `grep_search`, `find_files`, `read_file_snippet`, and `parse_issue_diagnostics`
    - [ ] Assert tests fail against `agent_resolve.context` and `agent_resolve.diagnostics`
- [ ] Task: Implement context and diagnostic tools in agent_resolve.context and agent_resolve.diagnostics (TDD Green phase)
    - [ ] Implement `scripts/agent-resolve/agent_resolve/context.py`
    - [ ] Implement `scripts/agent-resolve/agent_resolve/diagnostics.py`
    - [ ] Verify all context and diagnostic unit tests pass
- [ ] Task: Conductor - User Manual Verification 'Phase 3: LLM Client, Context Discovery & Exploration Tools' (Protocol in workflow.md)

## Phase 4: Pipeline Stages, CLI Orchestrator & Backward Compatibility Shim
- [ ] Task: Write failing unit tests for pipeline stages and resolution orchestrator (TDD Red phase)
    - [ ] Create unit tests for `stage_0_diagnose`, `stage_1_plan`, `validate_jest_red_phase`, `stage_2_red`, `stage_3_green`, and `resolve_issue`
    - [ ] Assert tests fail against `agent_resolve.stages` and `agent_resolve.pipeline`
- [ ] Task: Implement pipeline stages and resolution orchestrator in agent_resolve.stages and agent_resolve.pipeline (TDD Green phase)
    - [ ] Implement `scripts/agent-resolve/agent_resolve/stages/stage_0_diagnose.py`
    - [ ] Implement `scripts/agent-resolve/agent_resolve/stages/stage_1_plan.py`
    - [ ] Implement `scripts/agent-resolve/agent_resolve/stages/stage_2_red.py`
    - [ ] Implement `scripts/agent-resolve/agent_resolve/stages/stage_3_green.py`
    - [ ] Implement `scripts/agent-resolve/agent_resolve/stages/__init__.py`
    - [ ] Implement `scripts/agent-resolve/agent_resolve/pipeline.py`
    - [ ] Verify pipeline unit tests pass
- [ ] Task: Write failing unit tests for CLI argument parsing and legacy entrypoint shim compatibility (TDD Red phase)
    - [ ] Create unit tests for CLI argument parsing in `agent_resolve.cli`
    - [ ] Create integration test verifying that executing `scripts/agent-resolve/agent-resolve.py --help` loads symbols and runs CLI cleanly
    - [ ] Assert tests fail before CLI shim integration
- [ ] Task: Implement CLI entrypoint in agent_resolve.cli and legacy shim in scripts/agent-resolve/agent-resolve.py (TDD Green phase)
    - [ ] Implement `scripts/agent-resolve/agent_resolve/cli.py` with argument parsing and execution flow
    - [ ] Transform `scripts/agent-resolve/agent-resolve.py` into a thin backward-compatible wrapper that re-exports key legacy symbols and invokes `agent_resolve.cli.main()`
    - [ ] Verify CLI and shim tests pass
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Pipeline Stages, CLI Orchestrator & Backward Compatibility Shim' (Protocol in workflow.md)

## Phase 5: Test Suite Modernization, Legacy Regression Gate & Documentation
- [ ] Task: Write failing comprehensive regression gate tests against legacy test_patch_engine.py (TDD Red phase)
    - [ ] Assert that legacy test harness `scripts/__tests__/test_patch_engine.py` passes 100% against both the shim and the new module structure
- [ ] Task: Modernize test organization and verify full test suite (TDD Green phase)
    - [ ] Organize modular unit tests under `scripts/agent-resolve/tests/` matching package structure
    - [ ] Maintain `scripts/__tests__/test_patch_engine.py` as an enduring regression gate
    - [ ] Update `scripts/README.md` and repository docs (`docs/adr/0005-autonomous-nightly-agent-workflow.md`, `docs/agents/issue-tracker.md`) to document the modular architecture
    - [ ] Execute complete test suite with `python3.12 -m unittest` and verify 100% pass
- [ ] Task: Conductor - User Manual Verification 'Phase 5: Test Suite Modernization, Legacy Regression Gate & Documentation' (Protocol in workflow.md)
