# Specification: Decompose Autonomous Issue Resolver Script (`agent-resolve.py`)

## 1. Overview
Refactor the monolithic 2,200-line Python script [`scripts/agent-resolve/agent-resolve.py`](../../scripts/agent-resolve/agent-resolve.py) into a clean, modular Python package located at `scripts/agent-resolve/agent_resolve/`. Introduce formal packaging configuration (`pyproject.toml`) and modular unit tests, while maintaining a thin, backward-compatible entrypoint shim at [`scripts/agent-resolve/agent-resolve.py`](../../scripts/agent-resolve/agent-resolve.py) so existing GitHub Actions workflows and CLI habits remain unbroken. This lays the architectural foundation for future extraction into an independent GitHub repository.

## 2. Architecture & Module Decomposition
The package `agent_resolve` inside `scripts/agent-resolve/` will be structured with clean domain boundaries:

```
scripts/agent-resolve/
├── pyproject.toml                         # Standard packaging metadata, dependencies & tool configs
├── agent-resolve.py                       # Backward-compatible executable CLI shim
└── agent_resolve/
    ├── __init__.py                        # Package root, exports and version metadata
    ├── models.py                          # Pydantic schemas (DiagnosticAction, BlueprintPlan, PatchManifest, etc.)
    ├── tracker.py                         # TokenTracker observability & metrics
    ├── exceptions.py                      # Custom exceptions (Stage2CompilationError, etc.)
    ├── environment.py                     # Process execution (run_cmd, sanitize_secrets, run_isolated_test, log)
    ├── vcs.py                             # Git & GitHub CLI operations (gh_cli, branches, PRs, maintainer hints)
    ├── patch_engine.py                    # Multi-tier fuzzy patch engine (apply_patch_manifest, safe_resolve_repo_path)
    ├── llm.py                             # Gemini API client setup, retries & fallback invocation
    ├── context.py                         # Repository tree parsing, context building & suitability checks
    ├── diagnostics.py                     # Stage 0 exploration tools (grep, find_files, snippet extraction)
    ├── stages/
    │   ├── __init__.py
    │   ├── stage_0_diagnose.py            # Diagnostic exploration loop
    │   ├── stage_1_plan.py                # TDD architectural blueprint generation
    │   ├── stage_2_red.py                 # Red phase executor & compilation self-healing
    │   └── stage_3_green.py               # Green phase executor & regression gate
    ├── pipeline.py                        # Orchestration loop (resolve_issue)
    └── cli.py                             # Command-line argument parsing & main() entrypoint
```

## 3. Functional Requirements
1. **Packaging & Configuration:**
   - Add `scripts/agent-resolve/pyproject.toml` specifying build backend (`setuptools` / `flit_core`), runtime dependencies (`google-genai>=0.1.0`, `pydantic>=2.0.0`, `tenacity>=8.2.0`), and console entrypoint `agent-resolve = agent_resolve.cli:main`.
   - Keep root [`requirements-agent.txt`](../../requirements-agent.txt) synced for existing CI steps in [`.github/workflows/agent-resolve.yml`](../../.github/workflows/agent-resolve.yml).
2. **Backward-Compatible Executable Shim:**
   - [`scripts/agent-resolve/agent-resolve.py`](../../scripts/agent-resolve/agent-resolve.py) remains an executable script (`chmod +x`) that re-exports public symbols and invokes `agent_resolve.cli.main()`, ensuring existing invocations (`python3 -u scripts/agent-resolve/agent-resolve.py --issue ...`) execute identically.
3. **Domain Separation & Invariant Preservation:**
   - Preserve all existing guardrails and invariants:
     - SEC-02 secret sanitization (`sanitize_secrets`)
     - SEC-04 protected path blocking (`safe_resolve_repo_path` preventing modifications to `supabase/migrations`)
     - Strict model standardization on `gemini-3.8-flash`
     - Docker isolation execution (`--network none`)
     - Circuit breaker attempt counting and state persistence (`.agent-state.json`)
4. **Test Suite Modernization:**
   - Decompose [`scripts/__tests__/test_patch_engine.py`](../../scripts/__tests__/test_patch_engine.py) into modular test files or dedicated unit test suites under `scripts/agent-resolve/tests/` (or `scripts/__tests__/`), while maintaining full regression coverage for all 27 existing test cases.

## 4. Acceptance Criteria
- [ ] All existing 27 test cases pass with `python3.12 -m unittest discover scripts/__tests__` and any new modular test suites.
- [ ] Direct invocation of `python3.12 scripts/agent-resolve/agent-resolve.py --help` succeeds and prints usage.
- [ ] Module imports (`from agent_resolve.models import BlueprintPlan`, `from agent_resolve.patch_engine import apply_patch_manifest`) work seamlessly from root and package levels.
- [ ] Existing GitHub Actions workflow configuration in [`.github/workflows/agent-resolve.yml`](../../.github/workflows/agent-resolve.yml) remains valid without breaking changes.

## 5. Out of Scope
- Creating the external standalone GitHub repository or migrating git history (deferred to a subsequent track).
- Modifying prompt engineering or underlying model parameters.
- Changing Supabase migrations or Next.js application codebase.
