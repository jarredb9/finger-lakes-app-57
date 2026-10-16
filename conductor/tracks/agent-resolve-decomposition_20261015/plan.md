# Implementation Plan: Decompose Autonomous Issue Resolver Script (`agent-resolve.py`)

## Phase 1: Package Foundation, Scaffolding, Models, Tracker & Config
- [ ] Task: Scaffold Python package structure, pyproject.toml, and npm test scripts
    - [ ] Create `scripts/agent-resolve/pyproject.toml` with `setuptools.build_meta`, PEP 621 metadata, dependencies (`google-genai`, `pydantic`, `tenacity`), Python `>=3.12`, and console script `agent-resolve = agent_resolve.cli:main`
    - [ ] Create minimal `scripts/agent-resolve/agent_resolve/__init__.py` (version metadata only; defer public re-exports and `_AgentResolveModule` delegation to the TDD Green phase)
    - [ ] Create `scripts/agent-resolve/tests/__init__.py` with `sys.path` fallback bootstrap for `scripts/agent-resolve`
    - [ ] Add `"test:agent": "python3.12 -m unittest discover -s scripts/agent-resolve/tests -t scripts/agent-resolve"` and `"test:agent:all": "python3.12 -m unittest discover -s scripts/__tests__ && python3.12 -m unittest discover -s scripts/agent-resolve/tests -t scripts/agent-resolve"` to `package.json`
- [ ] Task: Write failing unit tests for config, models, TokenTracker, and exceptions (TDD Red phase)
    - [ ] Create `scripts/agent-resolve/tests/test_config.py` (depth-3 ancestor-walk `PROJECT_ROOT` resolution, `get_project_root`/`set_project_root`, `_AgentResolveModule` `types.ModuleType` `__setattr__` delegation for `PROJECT_ROOT` and monkeypatched functions, model defaults)
    - [ ] Create `scripts/agent-resolve/tests/test_models.py` (Pydantic schemas: `DiagnosticAction`, `BlueprintPlan`, `TestFileEntry`, `SourceStubEntry`, `TestFileManifest`, `PatchChunk`, `PatchManifest`, and `@dataclass` `DiagnosticResult`)
    - [ ] Create `scripts/agent-resolve/tests/test_tracker.py` (`TokenTracker` token recording, budget enforcement exception, summary formatting)
    - [ ] Create `scripts/agent-resolve/tests/test_exceptions.py` (`Stage2CompilationError` exception hierarchy)
    - [ ] Assert tests fail against not-yet-implemented modules with `python3.12 -m unittest discover -s scripts/agent-resolve/tests -t scripts/agent-resolve`
- [ ] Task: Implement config, models, TokenTracker, and exceptions in agent_resolve (TDD Green phase)
    - [ ] Implement `scripts/agent-resolve/agent_resolve/config.py` with ancestor-walk `PROJECT_ROOT` resolver (`package.json`/`.git` detection with `parents[3]` fallback) and configuration defaults
    - [ ] Implement `scripts/agent-resolve/agent_resolve/models.py` with all Pydantic schema definitions and the `DiagnosticResult` `@dataclass`
    - [ ] Implement `scripts/agent-resolve/agent_resolve/tracker.py` with `TokenTracker`
    - [ ] Implement `scripts/agent-resolve/agent_resolve/exceptions.py` with `Stage2CompilationError`
    - [ ] Implement `_AgentResolveModule` (`types.ModuleType` subclass) in `scripts/agent-resolve/agent_resolve/__init__.py` to intercept `__getattr__`/`__setattr__` and propagate `PROJECT_ROOT` and monkeypatched attributes across loaded `agent_resolve.*` submodules
    - [ ] Update `scripts/agent-resolve/agent-resolve.py` to self-heal `sys.modules["agent_resolve"].__path__` when loaded via `importlib`, and import/re-export `config`, `models`, `tracker`, and `exceptions` (incremental seam extraction)
    - [ ] Update `scripts/__tests__/test_patch_engine.py` to import `agent_resolve` cleanly with `scripts/agent-resolve` on `sys.path` (eliminating single-file `sys.modules` shadowing collision)
    - [ ] Verify unit tests pass with `python3.12 -m unittest discover -s scripts/agent-resolve/tests -t scripts/agent-resolve` and `python3.12 -m unittest discover -s scripts/__tests__`
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Package Foundation, Scaffolding, Models, Tracker & Config' (Protocol in workflow.md)

## Phase 2: Environment, Verification Engine, Patch Engine & VCS
- [ ] Task: Write failing unit tests for environment and secret sanitization utilities (TDD Red phase)
    - [ ] Create `scripts/agent-resolve/tests/test_environment.py` with unit tests for `log`, `sanitize_secrets` (redacting GitHub tokens, PATs, AIza keys, Bearer tokens), `run_cmd` (timeout handling), `is_docker_available`, and mocked `run_isolated_test`
    - [ ] Assert tests fail against `agent_resolve.environment`
- [ ] Task: Implement environment and secret sanitization in agent_resolve.environment (TDD Green phase)
    - [ ] Implement `scripts/agent-resolve/agent_resolve/environment.py` with process execution, secret scrubbing, and Docker isolation helpers (reading `config.PROJECT_ROOT` dynamically)
    - [ ] Update `scripts/agent-resolve/agent_resolve/__init__.py` and `scripts/agent-resolve/agent-resolve.py` to import and re-export environment utilities
    - [ ] Verify environment and legacy unit tests pass
- [ ] Task: Write failing unit tests for verification engine (validate_jest_red_phase) (TDD Red phase)
    - [ ] Create `scripts/agent-resolve/tests/test_verification.py` (passing test rejection, runtime crash detection, structured JSON assertion failure, CLI assertion failure, unimplemented function TypeError acceptance, hook crash rejection)
    - [ ] Assert tests fail against `agent_resolve.verification`
- [ ] Task: Implement verification engine in agent_resolve.verification (TDD Green phase)
    - [ ] Implement `scripts/agent-resolve/agent_resolve/verification.py` with `validate_jest_red_phase`
    - [ ] Update `scripts/agent-resolve/agent_resolve/__init__.py` and `scripts/agent-resolve/agent-resolve.py` to import and re-export `validate_jest_red_phase`
    - [ ] Verify verification and legacy unit tests pass
- [ ] Task: Write failing unit tests for multi-tier patch engine and path resolution (TDD Red phase)
    - [ ] Create `scripts/agent-resolve/tests/test_patch_engine.py` (`safe_resolve_repo_path` with SEC-04 migration protection blocks, `reset_target_sources`, `apply_patch_manifest` Tier 1 exact, Tier 2 whitespace trimmed, CRLF normalization, clean error formatting, ambiguous rejection, new file creation)
    - [ ] Assert tests fail against `agent_resolve.patch_engine`
- [ ] Task: Implement patch engine in agent_resolve.patch_engine (TDD Green phase)
    - [ ] Implement `scripts/agent-resolve/agent_resolve/patch_engine.py` (reading `config.PROJECT_ROOT` dynamically)
    - [ ] Update `scripts/agent-resolve/agent_resolve/__init__.py` and `scripts/agent-resolve/agent-resolve.py` to import and re-export patch engine utilities
    - [ ] Verify patch engine and legacy unit tests pass
- [ ] Task: Write failing unit tests for VCS and GitHub CLI helpers (TDD Red phase)
    - [ ] Create `scripts/agent-resolve/tests/test_vcs.py` (`gh_cli`, `reset_working_tree_to_main`, `cleanup_feature_branch`, `update_or_create_pr`, `preserve_failed_work` circuit breaker state file and attempt incrementing, `fetch_maintainer_hints` provenance and timestamp filtering)
    - [ ] Assert tests fail against `agent_resolve.vcs`
- [ ] Task: Implement VCS and GitHub helpers in agent_resolve.vcs (TDD Green phase)
    - [ ] Implement `scripts/agent-resolve/agent_resolve/vcs.py` (reading `config.PROJECT_ROOT` dynamically and supporting `patch.object(agent_resolve, "gh_cli", ...)` propagation)
    - [ ] Update `scripts/agent-resolve/agent_resolve/__init__.py` and `scripts/agent-resolve/agent-resolve.py` to import and re-export VCS helpers
    - [ ] Verify VCS and legacy unit tests pass
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Environment, Verification Engine, Patch Engine & VCS' (Protocol in workflow.md)

## Phase 3: LLM Client, Context Discovery & Exploration Tools
- [ ] Task: Write failing unit tests for LLM client and transient retry handling (TDD Red phase)
    - [ ] Create `scripts/agent-resolve/tests/test_llm.py` (`get_genai_client`, `is_transient_error` detecting connection resets, socket drops, 429, 503, 500, and `call_gemini_with_fallback` with mocked client and strict `gemini-3.8-flash` hard-stop policy)
    - [ ] Assert tests fail against `agent_resolve.llm`
- [ ] Task: Implement LLM client and retry logic in agent_resolve.llm (TDD Green phase)
    - [ ] Implement `scripts/agent-resolve/agent_resolve/llm.py`
    - [ ] Update `scripts/agent-resolve/agent_resolve/__init__.py` and `scripts/agent-resolve/agent-resolve.py` to import and re-export LLM client utilities
    - [ ] Verify LLM client and legacy unit tests pass
- [ ] Task: Write failing unit tests for repository context and diagnostic exploration (TDD Red phase)
    - [ ] Create `scripts/agent-resolve/tests/test_context.py` (`get_repository_tree`, `get_project_context`, `find_related_test_files`, `extract_test_suite_names`, `is_issue_suitable_for_headless_agent`)
    - [ ] Create `scripts/agent-resolve/tests/test_diagnostics.py` (`grep_search`, `find_files`, `read_file_snippet`, `parse_issue_diagnostics`)
    - [ ] Assert tests fail against `agent_resolve.context` and `agent_resolve.diagnostics`
- [ ] Task: Implement context and diagnostic tools in agent_resolve.context and agent_resolve.diagnostics (TDD Green phase)
    - [ ] Implement `scripts/agent-resolve/agent_resolve/context.py` (reading `config.PROJECT_ROOT` dynamically)
    - [ ] Implement `scripts/agent-resolve/agent_resolve/diagnostics.py` (reading `config.PROJECT_ROOT` dynamically)
    - [ ] Update `scripts/agent-resolve/agent_resolve/__init__.py` and `scripts/agent-resolve/agent-resolve.py` to import and re-export context and diagnostic tools
    - [ ] Verify context, diagnostic, and legacy unit tests pass
- [ ] Task: Conductor - User Manual Verification 'Phase 3: LLM Client, Context Discovery & Exploration Tools' (Protocol in workflow.md)

## Phase 4: Pipeline Stages & CLI Orchestrator
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
    - [ ] Update `scripts/agent-resolve/agent_resolve/__init__.py` and `scripts/agent-resolve/agent-resolve.py` to re-export stage functions and `resolve_issue`
    - [ ] Verify pipeline, stages, and legacy unit tests pass
- [ ] Task: Write failing unit tests for CLI argument parsing and batch execution flow (TDD Red phase)
    - [ ] Create `scripts/agent-resolve/tests/test_cli.py` asserting CLI flags (`--issue`, `--max-issues`, `--dry-run`), batch pacing, error handling, and `main()` exit codes against `agent_resolve.cli`
    - [ ] Assert tests fail before `agent_resolve.cli` implementation
- [ ] Task: Implement CLI entrypoint in agent_resolve.cli (TDD Green phase)
    - [ ] Implement `scripts/agent-resolve/agent_resolve/cli.py` with argument parsing and batch execution flow
    - [ ] Re-export `main` in `scripts/agent-resolve/agent_resolve/__init__.py` and `scripts/agent-resolve/agent-resolve.py`
    - [ ] Verify `test_cli.py` and full test suites pass
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Pipeline Stages & CLI Orchestrator' (Protocol in workflow.md)

## Phase 5: Thin Shim Cutover, Entrypoint Parity Verification & Documentation
- [ ] Task: Write failing comprehensive entrypoint integration, shim cutover, and parity tests (TDD Red phase)
    - [ ] Create `scripts/agent-resolve/tests/test_cli_and_entrypoint.py` asserting:
        1. PEP 621 `pyproject.toml` console script metadata (`[project.scripts]."agent-resolve" == "agent_resolve.cli:main"`) parsed via `tomllib` and callable invocation (`--help`) without requiring prior `pip install -e`
        2. Thin shim cutover contract on `scripts/agent-resolve/agent-resolve.py` (verifying inline monolithic definitions are removed, line count is compact, and `python3.12 scripts/agent-resolve/agent-resolve.py --help` succeeds)
        3. `importlib.util.spec_from_file_location("agent_resolve", ...)` single-file loader compatibility and full `__all__` public symbol parity between `agent_resolve` and `agent-resolve.py`
    - [ ] Assert tests fail prior to thin shim cutover and `__all__` parity completion
- [ ] Task: Finalize thin legacy shim cutover, execute full dual-suite verification, and document modular architecture (TDD Green phase)
    - [ ] Transform `scripts/agent-resolve/agent-resolve.py` into a compact backward-compatible shim that bootstraps `sys.path`, self-heals `sys.modules["agent_resolve"].__path__`, delegates attribute mutations to `agent_resolve`, re-exports `__all__`, and invokes `agent_resolve.cli.main()`
    - [ ] Verify all 27 legacy test cases and all 14 modular test suites pass cleanly with `npm run test:agent` and `npm run test:agent:all`
    - [ ] Update `scripts/README.md`, `docs/adr/0005-autonomous-nightly-agent-workflow.md`, and `docs/agents/issue-tracker.md` to document both the modular `agent_resolve` package architecture and the complete 4-stage (`Stage 0`–`Stage 3`) pipeline with Tier 3 Blueprint Invalidation (keeping `CONTEXT.md` strictly bounded to the winery domain)
- [ ] Task: Conductor - User Manual Verification 'Phase 5: Thin Shim Cutover, Entrypoint Parity Verification & Documentation' (Protocol in workflow.md)
