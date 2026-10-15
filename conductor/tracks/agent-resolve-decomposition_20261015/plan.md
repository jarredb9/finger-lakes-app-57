# Implementation Plan: Decompose Autonomous Issue Resolver Script (`agent-resolve.py`)

## Phase 1: Package Foundation, Scaffolding, Models, Tracker & Config
- [ ] Task: Scaffold Python package structure, pyproject.toml, and npm test scripts
    - [ ] Create `scripts/agent-resolve/pyproject.toml` with `setuptools.build_meta`, PEP 621 metadata, dependencies (`google-genai`, `pydantic`, `tenacity`), Python `>=3.12`, and console script `agent-resolve = agent_resolve.cli:main`
    - [ ] Create `scripts/agent-resolve/agent_resolve/__init__.py` with package version, public exports, and dynamic `__getattr__`/`__setattr__` delegation
    - [ ] Add `"test:agent": "python3.12 -m unittest discover -s scripts/agent-resolve/tests"` and `"test:agent:all": "python3.12 -m unittest discover scripts/__tests__ && python3.12 -m unittest discover -s scripts/agent-resolve/tests"` to `package.json`
- [ ] Task: Write failing unit tests for config, models, TokenTracker, and exceptions (TDD Red phase)
    - [ ] Create `scripts/agent-resolve/tests/__init__.py`
    - [ ] Create `scripts/agent-resolve/tests/test_config.py` (PROJECT_ROOT resolution, get_project_root/set_project_root, dynamic monkeypatching, model defaults)
    - [ ] Create `scripts/agent-resolve/tests/test_models.py` (Pydantic schemas: `DiagnosticAction`, `BlueprintPlan`, `TestFileEntry`, `SourceStubEntry`, `TestFileManifest`, `PatchChunk`, `PatchManifest`, `DiagnosticResult`)
    - [ ] Create `scripts/agent-resolve/tests/test_tracker.py` (TokenTracker token recording, budget enforcement exception, summary formatting)
    - [ ] Create `scripts/agent-resolve/tests/test_exceptions.py` (Stage2CompilationError exception hierarchy)
    - [ ] Assert tests fail against not-yet-implemented modules
- [ ] Task: Implement config, models, TokenTracker, and exceptions in agent_resolve (TDD Green phase)
    - [ ] Implement `scripts/agent-resolve/agent_resolve/config.py` with dynamic PROJECT_ROOT resolver and configuration defaults
    - [ ] Implement `scripts/agent-resolve/agent_resolve/models.py` with all Pydantic schema definitions
    - [ ] Implement `scripts/agent-resolve/agent_resolve/tracker.py` with TokenTracker
    - [ ] Implement `scripts/agent-resolve/agent_resolve/exceptions.py` with Stage2CompilationError
    - [ ] Update `scripts/agent-resolve/agent-resolve.py` to import and re-export config, models, tracker, and exceptions (incremental seam extraction)
    - [ ] Verify unit tests pass with `python3.12 -m unittest discover -s scripts/agent-resolve/tests` and `python3.12 -m unittest discover scripts/__tests__`
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Package Foundation, Scaffolding, Models, Tracker & Config' (Protocol in workflow.md)

## Phase 2: Environment, Verification Engine, Patch Engine & VCS
- [ ] Task: Write failing unit tests for environment and secret sanitization utilities (TDD Red phase)
    - [ ] Create `scripts/agent-resolve/tests/test_environment.py` with unit tests for `log`, `sanitize_secrets` (redacting GitHub tokens, PATs, AIza keys, Bearer tokens), `run_cmd` (timeout handling), `is_docker_available`, and mocked `run_isolated_test`
    - [ ] Assert tests fail against `agent_resolve.environment`
- [ ] Task: Implement environment and secret sanitization in agent_resolve.environment (TDD Green phase)
    - [ ] Implement `scripts/agent-resolve/agent_resolve/environment.py` with process execution, secret scrubbing, and Docker isolation helpers
    - [ ] Update `scripts/agent-resolve/agent-resolve.py` to import and re-export environment utilities
    - [ ] Verify environment unit tests pass
- [ ] Task: Write failing unit tests for verification engine (validate_jest_red_phase) (TDD Red phase)
    - [ ] Create `scripts/agent-resolve/tests/test_verification.py` (passing test rejection, runtime crash detection, structured JSON assertion failure, CLI assertion failure, unimplemented function TypeError acceptance, hook crash rejection)
    - [ ] Assert tests fail against `agent_resolve.verification`
- [ ] Task: Implement verification engine in agent_resolve.verification (TDD Green phase)
    - [ ] Implement `scripts/agent-resolve/agent_resolve/verification.py` with `validate_jest_red_phase`
    - [ ] Update `scripts/agent-resolve/agent-resolve.py` to import and re-export `validate_jest_red_phase`
    - [ ] Verify verification unit tests pass
- [ ] Task: Write failing unit tests for multi-tier patch engine and path resolution (TDD Red phase)
    - [ ] Create `scripts/agent-resolve/tests/test_patch_engine.py` (`safe_resolve_repo_path` with SEC-04 migration protection blocks, `reset_target_sources`, `apply_patch_manifest` Tier 1 exact, Tier 2 whitespace trimmed, CRLF normalization, clean error formatting, ambiguous rejection, new file creation)
    - [ ] Assert tests fail against `agent_resolve.patch_engine`
- [ ] Task: Implement patch engine in agent_resolve.patch_engine (TDD Green phase)
    - [ ] Implement `scripts/agent-resolve/agent_resolve/patch_engine.py`
    - [ ] Update `scripts/agent-resolve/agent-resolve.py` to import and re-export patch engine utilities
    - [ ] Verify patch engine unit tests pass
- [ ] Task: Write failing unit tests for VCS and GitHub CLI helpers (TDD Red phase)
    - [ ] Create `scripts/agent-resolve/tests/test_vcs.py` (`gh_cli`, `reset_working_tree_to_main`, `cleanup_feature_branch`, `update_or_create_pr`, `preserve_failed_work` circuit breaker state file and attempt incrementing, `fetch_maintainer_hints` provenance and timestamp filtering)
    - [ ] Assert tests fail against `agent_resolve.vcs`
- [ ] Task: Implement VCS and GitHub helpers in agent_resolve.vcs (TDD Green phase)
    - [ ] Implement `scripts/agent-resolve/agent_resolve/vcs.py`
    - [ ] Update `scripts/agent-resolve/agent-resolve.py` to import and re-export VCS helpers
    - [ ] Verify VCS unit tests pass
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Environment, Verification Engine, Patch Engine & VCS' (Protocol in workflow.md)

## Phase 3: LLM Client, Context Discovery & Exploration Tools
- [ ] Task: Write failing unit tests for LLM client and transient retry handling (TDD Red phase)
    - [ ] Create `scripts/agent-resolve/tests/test_llm.py` (`get_genai_client`, `is_transient_error` detecting connection resets, socket drops, 429, 503, 500, and `call_gemini_with_fallback` with mocked client and strict `gemini-3.8-flash` hard-stop policy)
    - [ ] Assert tests fail against `agent_resolve.llm`
- [ ] Task: Implement LLM client and retry logic in agent_resolve.llm (TDD Green phase)
    - [ ] Implement `scripts/agent-resolve/agent_resolve/llm.py`
    - [ ] Update `scripts/agent-resolve/agent-resolve.py` to import and re-export LLM client utilities
    - [ ] Verify LLM client unit tests pass
- [ ] Task: Write failing unit tests for repository context and diagnostic exploration (TDD Red phase)
    - [ ] Create `scripts/agent-resolve/tests/test_context.py` (`get_repository_tree`, `get_project_context`, `find_related_test_files`, `extract_test_suite_names`, `is_issue_suitable_for_headless_agent`)
    - [ ] Create `scripts/agent-resolve/tests/test_diagnostics.py` (`grep_search`, `find_files`, `read_file_snippet`, `parse_issue_diagnostics`)
    - [ ] Assert tests fail against `agent_resolve.context` and `agent_resolve.diagnostics`
- [ ] Task: Implement context and diagnostic tools in agent_resolve.context and agent_resolve.diagnostics (TDD Green phase)
    - [ ] Implement `scripts/agent-resolve/agent_resolve/context.py`
    - [ ] Implement `scripts/agent-resolve/agent_resolve/diagnostics.py`
    - [ ] Update `scripts/agent-resolve/agent-resolve.py` to import and re-export context and diagnostic tools
    - [ ] Verify context and diagnostic unit tests pass
- [ ] Task: Conductor - User Manual Verification 'Phase 3: LLM Client, Context Discovery & Exploration Tools' (Protocol in workflow.md)

## Phase 4: Pipeline Stages, CLI Orchestrator & Legacy Shim Cutover
- [ ] Task: Write failing unit tests for pipeline stages and resolution orchestrator (TDD Red phase)
    - [ ] Create `scripts/agent-resolve/tests/test_stages.py` (`stage_0_diagnose` explicit files & iterative loop, `stage_1_plan` blueprint authoring, `stage_2_red` compiler self-correction loop, `stage_3_green` patch application)
    - [ ] Create `scripts/agent-resolve/tests/test_pipeline.py` (`resolve_issue` orchestration loop, branch management, dry-run mode, and resumption checkpoint fast-forward)
    - [ ] Assert tests fail against `agent_resolve.stages` and `agent_resolve.pipeline`
- [ ] Task: Implement pipeline stages and resolution orchestrator in agent_resolve.stages and agent_resolve.pipeline (TDD Green phase)
    - [ ] Implement `scripts/agent-resolve/agent_resolve/stages/stage_0_diagnose.py`
    - [ ] Implement `scripts/agent-resolve/agent_resolve/stages/stage_1_plan.py`
    - [ ] Implement `scripts/agent-resolve/agent_resolve/stages/stage_2_red.py`
    - [ ] Implement `scripts/agent-resolve/agent_resolve/stages/stage_3_green.py`
    - [ ] Implement `scripts/agent-resolve/agent_resolve/stages/__init__.py`
    - [ ] Implement `scripts/agent-resolve/agent_resolve/pipeline.py`
    - [ ] Update `scripts/agent-resolve/agent-resolve.py` to re-export stage functions and `resolve_issue`
    - [ ] Verify pipeline and stages unit tests pass
- [ ] Task: Write failing unit tests for CLI argument parsing and legacy entrypoint shim compatibility (TDD Red phase)
    - [ ] Create CLI argument parsing test in `scripts/agent-resolve/tests/test_cli.py` asserting flags (`--issue`, `--max-issues`, `--dry-run`), error handling, and invocation behavior
    - [ ] Assert tests fail before CLI module integration
- [ ] Task: Implement CLI entrypoint in agent_resolve.cli and finalize thin legacy shim in scripts/agent-resolve/agent-resolve.py (TDD Green phase)
    - [ ] Implement `scripts/agent-resolve/agent_resolve/cli.py` with argument parsing and execution flow
    - [ ] Transform `scripts/agent-resolve/agent-resolve.py` into a thin backward-compatible wrapper that bootstraps `sys.path`, re-exports all public symbols, and invokes `agent_resolve.cli.main()`
    - [ ] Verify `python3 scripts/agent-resolve/agent-resolve.py --help` outputs usage cleanly
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Pipeline Stages, CLI Orchestrator & Legacy Shim Cutover' (Protocol in workflow.md)

## Phase 5: Legacy Test Harness Parity, Entrypoint Integration & Documentation
- [ ] Task: Write failing comprehensive entrypoint integration and legacy parity tests (TDD Red phase)
    - [ ] Create `scripts/agent-resolve/tests/test_cli_and_entrypoint.py` asserting:
        1. CLI entrypoint execution (`agent-resolve --help`)
        2. Shim script execution (`python3 scripts/agent-resolve/agent-resolve.py --help`)
        3. Public symbol re-export parity across package and shim namespaces
    - [ ] Assert tests fail prior to package install / test harness parity verification
- [ ] Task: Update legacy test harness, execute full dual-suite verification, and document modular architecture (TDD Green phase)
    - [ ] Update `scripts/__tests__/test_patch_engine.py` to import `agent_resolve` directly as a package (resolving importlib collision while validating backward compatibility)
    - [ ] Verify all 27 legacy test cases and all modular test suites pass cleanly with both `python3.12 -m unittest discover scripts/__tests__` and `npm run test:agent`
    - [ ] Update `scripts/README.md` and repository docs (`docs/adr/0005-autonomous-nightly-agent-workflow.md`, `docs/agents/issue-tracker.md`) to document the modular architecture
- [ ] Task: Conductor - User Manual Verification 'Phase 5: Legacy Test Harness Parity, Entrypoint Integration & Documentation' (Protocol in workflow.md)
