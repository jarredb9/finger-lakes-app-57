# Specification: Decompose Autonomous Issue Resolver Script (`agent-resolve.py`)

## 1. Overview
Refactor the monolithic 2,200-line Python script [`scripts/agent-resolve/agent-resolve.py`](../../scripts/agent-resolve/agent-resolve.py) into a clean, modular Python package located at `scripts/agent-resolve/agent_resolve/`. Introduce formal packaging configuration (`pyproject.toml`) using standard PEP 621 metadata and `setuptools.build_meta`, comprehensive modular unit tests under `scripts/agent-resolve/tests/`, and developer npm scripts in `package.json`. Maintain a thin, backward-compatible entrypoint shim at [`scripts/agent-resolve/agent-resolve.py`](../../scripts/agent-resolve/agent-resolve.py) with automated `sys.path` bootstrapping so existing GitHub Actions workflows and CLI habits remain unbroken. This lays the architectural foundation for future extraction into an independent GitHub repository.

## 2. Architecture & Module Decomposition
The package `agent_resolve` inside `scripts/agent-resolve/` is structured with clean domain boundaries and a dedicated configuration single-source-of-truth:

```
scripts/agent-resolve/
├── pyproject.toml                         # Standard PEP 621 packaging metadata, dependencies & tool configs
├── agent-resolve.py                       # Backward-compatible executable CLI shim with sys.path bootstrapping
├── agent_resolve/
│   ├── __init__.py                        # Package root, exports, version metadata & dynamic attribute proxy
│   ├── config.py                          # Centralized Config, model defaults, limits & dynamic PROJECT_ROOT resolver
│   ├── models.py                          # Pydantic schemas (DiagnosticAction, BlueprintPlan, PatchManifest, etc.)
│   ├── tracker.py                         # TokenTracker observability & metrics
│   ├── exceptions.py                      # Custom exceptions (Stage2CompilationError, etc.)
│   ├── environment.py                     # Process execution (run_cmd, sanitize_secrets, run_isolated_test, log)
│   ├── vcs.py                             # Git & GitHub CLI operations (gh_cli, branches, PRs, maintainer hints)
│   ├── patch_engine.py                    # Multi-tier fuzzy patch engine (apply_patch_manifest, safe_resolve_repo_path)
│   ├── verification.py                    # Test failure validation (validate_jest_red_phase) & test log parsing
│   ├── llm.py                             # Gemini API client setup, retries & fallback invocation
│   ├── context.py                         # Repository tree parsing, context building & suitability checks
│   ├── diagnostics.py                     # Stage 0 exploration tools (grep, find_files, snippet extraction)
│   ├── stages/
│   │   ├── __init__.py
│   │   ├── stage_0_diagnose.py            # Diagnostic exploration loop
│   │   ├── stage_1_plan.py                # TDD architectural blueprint generation
│   │   ├── stage_2_red.py                 # Red phase executor & compilation self-healing
│   │   └── stage_3_green.py               # Green phase executor & regression gate
│   ├── pipeline.py                        # Orchestration loop (resolve_issue)
│   └── cli.py                             # Command-line argument parsing & main() entrypoint
└── tests/                                 # Modular unit & integration test suites
    ├── __init__.py
    ├── test_config.py
    ├── test_models.py
    ├── test_tracker.py
    ├── test_environment.py
    ├── test_verification.py
    ├── test_patch_engine.py
    ├── test_vcs.py
    ├── test_llm.py
    ├── test_context.py
    ├── test_diagnostics.py
    ├── test_stages.py
    ├── test_pipeline.py
    └── test_cli_and_entrypoint.py
```

## 3. Functional Requirements
1. **Packaging & Configuration:**
   - Add `scripts/agent-resolve/pyproject.toml` specifying build backend `setuptools.build_meta` (`setuptools>=61.0`), runtime dependencies (`google-genai>=0.1.0`, `pydantic>=2.0.0`, `tenacity>=8.2.0`), Python `>=3.12`, and console entrypoint `agent-resolve = agent_resolve.cli:main`.
   - Keep root [`requirements-agent.txt`](../../requirements-agent.txt) synced for existing CI steps in [`.github/workflows/agent-resolve.yml`](../../.github/workflows/agent-resolve.yml). Editable installation (`pip install -e scripts/agent-resolve`) is supported for local development but remains optional for CI.
   - Add `"test:agent": "python3.12 -m unittest discover -s scripts/agent-resolve/tests"` and `"test:agent:all": "python3.12 -m unittest discover scripts/__tests__ && python3.12 -m unittest discover -s scripts/agent-resolve/tests"` to `package.json`.
2. **Backward-Compatible Executable Shim & Incremental Seam Extraction:**
   - [`scripts/agent-resolve/agent-resolve.py`](../../scripts/agent-resolve/agent-resolve.py) remains an executable script (`chmod +x`). It bootstraps `scripts/agent-resolve` onto `sys.path`, re-exports all public symbols, and invokes `agent_resolve.cli.main()`, ensuring existing invocations (`python3 -u scripts/agent-resolve/agent-resolve.py --issue ...`) execute identically.
   - Refactoring proceeds via incremental seam extraction: as each phase extracts symbols into `agent_resolve.*`, `agent-resolve.py` immediately imports and re-exports them, keeping the script fully functional and regression tests green on every intermediate commit.
3. **Centralized Configuration & Dynamic Monkeypatching Compatibility:**
   - Introduce `agent_resolve.config` containing `PROJECT_ROOT`, `DEFAULT_PLANNER_MODELS`, `DEFAULT_EXECUTOR_MODELS`, `MAX_TOKENS_PER_ISSUE`, and `BATCH_PACING_SECONDS`.
   - Provide `get_project_root()` and `set_project_root()`. Expose `PROJECT_ROOT` on `agent_resolve` via module `__getattr__` and `__setattr__` delegation so that existing test fixtures monkeypatching `agent_resolve.PROJECT_ROOT = self.root` continue to dynamically mutate the root across all submodules.
4. **Dedicated Verification Engine:**
   - Extract `validate_jest_red_phase` and Jest failure parser logic into `agent_resolve.verification` so both `stage_2_red.py` and `pipeline.py` (resumption gate) share a clean dependency without cross-stage circular imports.
5. **Domain Separation & Invariant Preservation:**
   - Preserve all existing security and operational invariants:
     - SEC-02 secret sanitization (`sanitize_secrets` redacting GitHub tokens, PATs, AIza keys, Bearer tokens).
     - SEC-04 protected path blocking (`safe_resolve_repo_path` preventing modifications to `supabase/migrations`, `.git/`, `.github/workflows/`, and agent scripts).
     - Strict model standardization on `gemini-3.8-flash` with zero fallback downgrades.
     - Docker isolation execution (`--network none`, non-root user/group, tmpfs `/tmp`).
     - Circuit breaker attempt counting, `.agent-state.json` checkpointing, and `AGENT_HANDOFF.md` diagnostic preservation.
   - `CONTEXT.md` remains strictly bounded to the winery visit planner domain; ADR-0005 remains the canonical reference for agent automation concepts.
6. **Test Suite Modernization & Legacy Regression Gate:**
   - Modernize unit tests into dedicated suites under `scripts/agent-resolve/tests/` organized by module.
   - Update `scripts/__tests__/test_patch_engine.py` to import `agent_resolve` directly as a package, eliminating single-file `sys.modules` shadowing collisions while maintaining 100% pass coverage for all 27 legacy test cases.
   - Author `test_cli_and_entrypoint.py` to assert console entrypoint execution (`agent-resolve --help`), shim execution (`scripts/agent-resolve/agent-resolve.py --help`), and namespace symbol parity.

## 4. Acceptance Criteria
- [ ] All existing 27 legacy test cases pass with `python3.12 -m unittest discover scripts/__tests__`.
- [ ] All new modular unit tests pass with `python3.12 -m unittest discover -s scripts/agent-resolve/tests`.
- [ ] Both test suites pass via `npm run test:agent:all` and `npm run test:agent`.
- [ ] Direct invocation of `python3.12 scripts/agent-resolve/agent-resolve.py --help` succeeds and prints usage.
- [ ] Direct invocation of console script entrypoint `agent-resolve --help` succeeds when package is installed.
- [ ] Module imports (`from agent_resolve.config import PROJECT_ROOT`, `from agent_resolve.models import BlueprintPlan`, `from agent_resolve.patch_engine import apply_patch_manifest`) work seamlessly from root and package levels.
- [ ] Monkeypatching `agent_resolve.PROJECT_ROOT = tmp_dir` dynamically updates path resolution across all submodules.
- [ ] Existing GitHub Actions workflow in [`.github/workflows/agent-resolve.yml`](../../.github/workflows/agent-resolve.yml) remains valid and unchanged.

## 5. Out of Scope
- Creating the external standalone GitHub repository or migrating git history (deferred to a subsequent track).
- Modifying prompt engineering, system instructions, or underlying model parameters.
- Changing Supabase migrations or Next.js application codebase.
