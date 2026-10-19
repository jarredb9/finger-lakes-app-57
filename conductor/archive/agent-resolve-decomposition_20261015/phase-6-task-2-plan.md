# Implementation Plan — Phase 6, Task 2: Finalize thin legacy shim cutover, execute full dual-suite verification, and document modular architecture (TDD Green phase)

## 1. Target Files & Insertion Anchors

- **Path:** `scripts/agent-resolve/agent-resolve.py`
  - **Operation:** Transform monolithic script into a compact, backward-compatible executable CLI shim (TDD Green phase).
  - **Line Count Contract:** Strictly $\le 120$ lines (targeting ~65–75 lines).
  - **Semantic Insertion Anchors:**
    - Shebang (`#!/usr/bin/env python3`) and module docstring.
    - Future annotations and standard library imports (`pathlib.Path`, `sys`, `types`, `typing.Any`).
    - Standard I/O line buffering reconfiguration (`sys.stdout.reconfigure`, `sys.stderr.reconfigure`).
    - Directory bootstrapping: prepend `scripts/agent-resolve` to `sys.path`.
    - Single-file loader self-healing: intercept `__name__ == "agent_resolve"` when loaded via `importlib.util.spec_from_file_location("agent_resolve", ...)` to assign `__path__` and `__package__`.
    - Package import and contract export: `import agent_resolve`, `from agent_resolve import *`, re-export `__all__ = list(agent_resolve.__all__)`, and bind all symbols in `globals()`.
    - Dynamic module proxy class (`_ShimModuleProxy(types.ModuleType)`): intercept attribute mutations to delegate `PROJECT_ROOT` to `agent_resolve.config.set_project_root` and propagate monkeypatched functions to `agent_resolve` and its submodules.
    - Forwarding CLI entrypoint: `def main(argv: list[str] | None = None) -> None` delegating to `agent_resolve.cli.main(argv)`.
    - Execution guard: `if __name__ == "__main__": main()`.

- **Path:** `scripts/README.md`
  - **Operation:** Update script documentation to reflect modular package decomposition, packaging metadata, entrypoints, 4-stage pipeline, and test commands.
  - **Semantic Anchor:** Under `## Subdirectory Details`, replace section `### 4. agent-resolve/ (Autonomous Issue Resolver)`.

- **Path:** `docs/adr/0005-autonomous-nightly-agent-workflow.md`
  - **Operation:** Document modular package architecture (`agent_resolve/`), complete 4-stage pipeline (Stage 0: Diagnostics, Stage 1: Blueprint, Stage 2: Red Phase, Stage 3: Green Phase), and Tier 3 Blueprint Invalidation.
  - **Semantic Anchors:**
    - Paragraph 1 (Workflow overview & harness references).
    - Section 3 & Section 7 (Multi-Stage Pipeline & TDD Compiler Gates).
    - Section 6 (Stateful Resumption & Checkpoints).
    - Section 9 (New dedicated section: Modular Package Architecture & Test Infrastructure).

- **Path:** `docs/agents/issue-tracker.md`
  - **Operation:** Update autonomous resolution briefing section to reference the modular `agent_resolve` package and the 4-stage pipeline with Tier 3 Blueprint Invalidation.
  - **Semantic Anchor:** Under `## Briefing Issues for Autonomous Resolution (agent:resolve)`, lines 36–54.

- **Path:** `conductor/tracks/agent-resolve-decomposition_20261015/plan.md`
  - **Operation:** Update task status markers during execution (`[ ]` -> `[~]` -> `[x] <sha>`).
  - **Semantic Anchor:** Under `## Phase 6: Thin Shim Cutover, Entrypoint Parity Verification & Documentation`, lines 109–112.

---

## 2. Python Interfaces & Exported Function Signatures

### 2.1 Backward-Compatible Thin Shim Interface (`scripts/agent-resolve/agent-resolve.py`)

```python
#!/usr/bin/env python3
"""Autonomous Issue Resolver backward-compatible executable CLI shim."""

from __future__ import annotations

from pathlib import Path
import sys
import types
from typing import Any

__all__: list[str]

class _ShimModuleProxy(types.ModuleType):
    """Proxy intercepting attribute mutations and propagating them to agent_resolve."""

    def __getattr__(self, name: str) -> Any: ...
    def __setattr__(self, name: str, value: Any) -> None: ...

def main(argv: list[str] | None = None) -> None:
    """Forward CLI invocation to modular agent_resolve.cli.main."""
    ...
```

### 2.2 Public Symbol Parity Contract (`agent-resolve.py` vs `agent_resolve`)

The shim must re-export 100% of the public symbols defined in `agent_resolve.__all__`:
- **Configuration & Limits:** `PROJECT_ROOT`, `DEFAULT_PLANNER_MODELS`, `DEFAULT_EXECUTOR_MODELS`, `MAX_TOKENS_PER_ISSUE`, `BATCH_PACING_SECONDS`, `resolve_project_root`, `get_project_root`, `set_project_root`.
- **Environment & Process Safety:** `SENSITIVE_ENV_KEYS`, `log`, `sanitize_secrets`, `run_cmd`, `is_docker_available`, `run_isolated_test`.
- **Data Models & Schemas:** `T`, `DiagnosticAction`, `BlueprintPlan`, `TestFileEntry`, `SourceStubEntry`, `TestFileManifest`, `PatchChunk`, `PatchManifest`, `DiagnosticResult`, `TokenTracker`.
- **Exceptions & Verification:** `Stage2CompilationError`, `validate_jest_red_phase`.
- **Patch Engine:** `PROTECTED_PATHS`, `apply_patch_manifest`, `reset_target_sources`, `safe_resolve_repo_path`.
- **VCS & Git Lifecycle:** `cleanup_feature_branch`, `fetch_maintainer_hints`, `gh_cli`, `preserve_failed_work`, `reset_working_tree_to_main`, `update_or_create_pr`.
- **LLM & Gemini Client:** `call_gemini_with_fallback`, `get_genai_client`, `is_transient_error`.
- **Context & Diagnostics:** `extract_test_suite_names`, `find_related_test_files`, `get_project_context`, `get_repository_tree`, `is_issue_suitable_for_headless_agent`, `find_files`, `grep_search`, `parse_issue_diagnostics`, `read_file_snippet`.
- **Stages & Pipeline:** `stage_0_diagnose`, `stage_1_plan`, `stage_2_red`, `stage_3_green`, `resolve_issue`.
- **CLI & Packaging Metadata:** `main`, `parse_args`, `__version__`.
- **Submodules:** `config`, `environment`, `models`, `tracker`, `exceptions`, `verification`, `patch_engine`, `vcs`, `llm`, `context`, `diagnostics`, `stages`, `pipeline`, `cli`.

---

## 3. Precise Behavioral Logic & Specifications

### 3.1 Thin Shim Architecture (`scripts/agent-resolve/agent-resolve.py`)

1. **Compactness & Elimination of Inline Duplication:**
   - Remove all monolithic inline function implementations (`def parse_args`, `def resolve_issue`, `def apply_patch_manifest`, `def gh_cli`, `def run_cmd`, `def get_genai_client`).
   - Remove duplicate `class _AgentResolveModule` definition (to pass `test_shim_does_not_contain_duplicate_agent_resolve_module_class`).
   - Enforce total line count $\le 120$ lines (contract verified by `test_shim_line_count_is_compact`).
   - Preserve executable permissions (`chmod +x`) and shebang (`#!/usr/bin/env python3`).

2. **Self-Healing Single-File Loader Bootstrapping:**
   - When loaded as a single file under name `"agent_resolve"` via `importlib.util.spec_from_file_location("agent_resolve", shim_path)`:
     ```python
     _SCRIPT_DIR = Path(__file__).resolve().parent
     if str(_SCRIPT_DIR) not in sys.path:
         sys.path.insert(0, str(_SCRIPT_DIR))

     _current_mod = sys.modules.get(__name__)
     if __name__ == "agent_resolve" and _current_mod is not None:
         _pkg_dir = _SCRIPT_DIR / "agent_resolve"
         if getattr(_current_mod, "__path__", None) is None:
             _current_mod.__path__ = [str(_pkg_dir)]
         _current_mod.__package__ = "agent_resolve"
     ```
   - This ensures that subsequent imports (e.g., `import agent_resolve.config`, `import agent_resolve.vcs`) locate submodules in `scripts/agent-resolve/agent_resolve/` without raising `ModuleNotFoundError`.

3. **Symbol Parity & Global Namespace Binding:**
   - Import package root:
     ```python
     import agent_resolve
     from agent_resolve import *
     from agent_resolve import __all__ as _pkg_all

     __all__ = list(_pkg_all)
     for _sym in __all__:
         globals()[_sym] = getattr(agent_resolve, _sym)
     ```
   - Guarantees `set(shim.__all__) == set(agent_resolve.__all__)` and `getattr(shim, sym) is getattr(agent_resolve, sym)`.

4. **Dynamic Module Proxying (`_ShimModuleProxy`):**
   - Assign proxy class to `_current_mod.__class__ = _ShimModuleProxy`.
   - `__getattr__(self, name: str) -> Any`:
     - If `name == "PROJECT_ROOT"`, return `agent_resolve.config.get_project_root()`.
     - Else, raise standard `AttributeError`.
   - `__setattr__(self, name: str, value: Any) -> None`:
     - If `name == "PROJECT_ROOT"`:
       - Invoke `agent_resolve.config.set_project_root(value)`.
       - Update `self.__dict__["PROJECT_ROOT"] = value`.
     - Else:
       - Call `super().__setattr__(name, value)`.
       - If `hasattr(agent_resolve, name)`, call `setattr(agent_resolve, name, value)`.
       - This propagates monkeypatched attributes (e.g., `shim_mod.gh_cli = fake_gh_cli`) across `agent_resolve` and all imported submodules (`agent_resolve.vcs.gh_cli`) via `_AgentResolveModule.__setattr__`.

5. **Forwarding CLI Entrypoint:**
   - Define `main(argv: list[str] | None = None) -> None`:
     ```python
     def main(argv: list[str] | None = None) -> None:
         agent_resolve.cli.main(argv)

     if __name__ == "__main__":
         main()
     ```
   - Guarantees backward-compatible CLI invocations (`python3.12 scripts/agent-resolve/agent-resolve.py --issue ...`, `--help`, `--dry-run`) behave identically to the modular entrypoint.

---

### 3.2 Modular Documentation Updates

#### 1. `scripts/README.md`
- **Section 4: `agent-resolve/` Documentation Overhaul:**
  - Structure: Document directory tree:
    ```text
    scripts/agent-resolve/
    ├── pyproject.toml              # PEP 621 packaging metadata & console entrypoint
    ├── agent-resolve.py            # Backward-compatible thin executable CLI shim
    ├── agent_resolve/              # Decomposed core modular package
    │   ├── config.py, models.py, tracker.py, exceptions.py, environment.py
    │   ├── verification.py, patch_engine.py, vcs.py, llm.py, context.py
    │   ├── diagnostics.py, stages/, pipeline.py, cli.py
    └── tests/                      # Modular unit and integration test suites
    ```
  - Document the Complete 4-Stage Pipeline:
    - Stage 0: Diagnostic Exploration (`stage_0_diagnose`).
    - Stage 1: Architectural Blueprint (`stage_1_plan`).
    - Stage 2: Red Phase Tests with Tier 3 Blueprint Invalidation (`stage_2_red`).
    - Stage 3: Green Phase Implementation & Regression Gate (`stage_3_green`).
  - Document Developer Testing Workflows:
    - `npm run test:agent`: Modular unit tests in `scripts/agent-resolve/tests/`.
    - `npm run test:agent:all`: Dual execution of legacy (`scripts/__tests__/`) and modular test suites.

#### 2. `docs/adr/0005-autonomous-nightly-agent-workflow.md`
- Update workflow references to include `scripts/agent-resolve/agent_resolve/` modular package and `pyproject.toml`.
- Document the complete 4-stage pipeline:
  - **Stage 0 (Diagnostic Exploration):** Autonomous read-only exploration loop (`grep_search`, `find_files`, `read_file_snippet`) producing structured `DiagnosticResult`.
  - **Stage 1 (Architectural Blueprint):** Grounded planning generating `task-plan.md` informed by Stage 0 diagnostics.
  - **Stage 2 (Red Phase Tests):** Generating compiling (`TS6133`-compliant stubs) and failing tests (`validate_jest_red_phase`).
  - **Tier 3 Blueprint Invalidation:** Fallback mechanism when Stage 2 test authoring hits an unrecoverable architectural dead end or compilation crash (`Stage2CompilationError`). Re-plans Stage 1 with compiler feedback from a clean reset of `origin/main`.
  - **Stage 3 (Green Phase Implementation):** Multi-tier fuzzy search/replace patching, iterative test feedback, and mandatory full regression gate.
- Document the modular package architecture, PEP 562 / `types.ModuleType` dynamic proxying, and dual-suite verification.
- Invariant preservation: Keep `CONTEXT.md` strictly bounded to the winery visit planner domain; do not pollute it with agent infrastructure details.

#### 3. `docs/agents/issue-tracker.md`
- Update lines 36–54 to document:
  - The harness is driven by the modular `agent_resolve` package (`scripts/agent-resolve/agent_resolve/`) with `agent-resolve.py` CLI shim.
  - The 4-stage TDD pipeline (Stage 0 Diagnostics $\rightarrow$ Stage 1 Blueprint $\rightarrow$ Stage 2 Red Phase with Tier 3 Invalidation $\rightarrow$ Stage 3 Green Phase).
  - How maintainer pre-triage fields directly feed Stage 0 diagnostic bounding and Stage 1 planning.

---

## 4. Execution Verification Protocol

1. **Verify Integration & Parity Test Suite Passes (TDD Green Phase):**
   ```bash
   python3.12 -m unittest scripts/agent-resolve/tests/test_cli_and_entrypoint.py
   ```
   - **Expected Outcome:** All test cases in `TestPyprojectConsoleScriptMetadata`, `TestLegacyShimCutoverContract`, `TestLegacyShimLoaderAndSymbolParity`, and `TestLegacyShimSubprocessExecution` pass (`OK`).

2. **Verify All Modular Unit Test Suites Pass:**
   ```bash
   npm run test:agent
   ```
   - **Expected Outcome:** Discovers and runs all 15 test suites in `scripts/agent-resolve/tests/` (`test_config`, `test_models`, `test_tracker`, `test_exceptions`, `test_environment`, `test_verification`, `test_patch_engine`, `test_vcs`, `test_llm`, `test_context`, `test_diagnostics`, `test_stages`, `test_pipeline`, `test_cli`, `test_cli_and_entrypoint`, `__init__`). All tests pass cleanly (`OK`).

3. **Verify Full Dual-Suite Regression Gate:**
   ```bash
   npm run test:agent:all
   ```
   - **Expected Outcome:** Executes legacy regression suite (`scripts/__tests__/test_patch_engine.py`: 27 tests) followed by modular test suites. All tests pass with zero errors (`OK`).

4. **Verify Direct CLI Shim Subprocess Invocations:**
   ```bash
   python3.12 scripts/agent-resolve/agent-resolve.py --help
   ```
   - **Expected Outcome:** Exits 0, outputs usage and arguments (`--issue`, `--max-issues`, `--dry-run`), with empty stderr.

---

## 5. Post-Execution Protocol (Git Commit, Git Notes & Plan Update)

1. **Stage & Commit Shim Cutover and Documentation (`BypassSandbox: true`):**
   ```bash
   git add scripts/agent-resolve/agent-resolve.py scripts/README.md docs/adr/0005-autonomous-nightly-agent-workflow.md docs/agents/issue-tracker.md
   git commit -m "feat(agent-resolve): Finalize thin legacy shim cutover and modular architecture documentation"
   ```

2. **Attach Git Note (`BypassSandbox: true`):**
   ```bash
   git notes add -m "Task: Finalize thin legacy shim cutover, execute full dual-suite verification, and document modular architecture (TDD Green phase)
   Summary: Cut over scripts/agent-resolve/agent-resolve.py to a compact <= 70 line backward-compatible executable shim with sys.path bootstrapping, spec_from_file_location self-healing, full __all__ symbol parity, and _ShimModuleProxy attribute delegation. Updated scripts/README.md, docs/adr/0005-autonomous-nightly-agent-workflow.md, and docs/agents/issue-tracker.md to document the modular agent_resolve package and complete 4-stage pipeline with Tier 3 Blueprint Invalidation. Verified 100% pass across all 27 legacy and 15 modular test suites via npm run test:agent:all.
   Files: scripts/agent-resolve/agent-resolve.py, scripts/README.md, docs/adr/0005-autonomous-nightly-agent-workflow.md, docs/agents/issue-tracker.md
   Rationale: Complete Phase 6 Task 2 Green phase, fulfilling architectural decomposition of the 2,200-line monolithic resolver into a maintainable Python package while ensuring zero disruption to existing CLI invocations and CI workflows." $(git log -1 --format="%H")
   ```

3. **Update `plan.md` & Commit (`BypassSandbox: true`):**
   - Update line 109 of `conductor/tracks/agent-resolve-decomposition_20261015/plan.md` from `[ ]` to `[x]` with commit SHA, then commit:
   ```bash
   git add conductor/tracks/agent-resolve-decomposition_20261015/plan.md
   git commit -m "conductor(plan): Mark task 'Finalize thin legacy shim cutover, execute full dual-suite verification, and document modular architecture (TDD Green phase)' as complete"
   ```
