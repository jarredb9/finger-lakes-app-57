# Implementation Plan — Phase 6, Task 1: Write failing comprehensive entrypoint integration, shim cutover, and parity tests (TDD Red phase)

## 1. Target Files & Insertion Anchors

- **Path:** `scripts/agent-resolve/tests/test_cli_and_entrypoint.py`
  - **Operation:** Create new modular integration and parity test file (TDD Red phase).
  - **Semantic Anchor:** Top-level module docstring, standard library imports (`contextlib`, `importlib`, `importlib.util`, `io`, `os`, `pathlib.Path`, `subprocess`, `sys`, `tomllib`, `types`, `unittest`, `unittest.mock`), followed by test cases:
    - `TestPyprojectConsoleScriptMetadata` (PEP 621 packaging metadata, build backend, console script entrypoint resolution and callable execution without requiring `pip install -e`)
    - `TestLegacyShimCutoverContract` (executable file permissions, shebang, compact line count `<= 120`, absence of monolithic duplicate definitions like `class _AgentResolveModule`)
    - `TestLegacyShimLoaderAndSymbolParity` (explicit `__all__` list definition, strict symbol parity with `agent_resolve.__all__`, individual symbol identity, single-file `spec_from_file_location` loader self-healing, `PROJECT_ROOT` delegation, and monkeypatched attribute propagation)
    - `TestLegacyShimSubprocessExecution` (direct `python3.12 scripts/agent-resolve/agent-resolve.py --help` success and `--invalid-flag` exit code 2 verification)

- **Path:** `conductor/tracks/agent-resolve-decomposition_20261015/plan.md`
  - **Operation:** Update task status markers during execution (`[ ]` -> `[~]` -> `[x] <sha>`).
  - **Semantic Anchor:** Under `## Phase 6: Thin Shim Cutover, Entrypoint Parity Verification & Documentation`, lines 103–108 (`- [ ] Task: Write failing comprehensive entrypoint integration, shim cutover, and parity tests (TDD Red phase)`).

---

## 2. Python Interfaces & Exported Function Signatures Under Test

### Target Configuration: `scripts/agent-resolve/pyproject.toml`

```toml
[build-system]
requires = ["setuptools>=61.0"]
build-backend = "setuptools.build_meta"

[project]
name = "agent-resolve"
version = "0.1.0"
description = "Autonomous Issue Resolver Harness for GitHub Actions and Scheduled Nightly Runs"
requires-python = ">=3.12"
dependencies = [
    "google-genai>=0.1.0",
    "pydantic>=2.0.0",
    "tenacity>=8.2.0",
]

[project.scripts]
agent-resolve = "agent_resolve.cli:main"
```

### Target Shim: `scripts/agent-resolve/agent-resolve.py`

```python
#!/usr/bin/env python3
"""Autonomous Issue Resolver backward-compatible executable CLI shim."""

from __future__ import annotations
from pathlib import Path
import sys
import types
from typing import Any, List, Optional

# Public symbol export contract matching agent_resolve.__all__
__all__: list[str]

def main(argv: Optional[List[str]] = None) -> None: ...
```

### Test Class & Method Signatures (`scripts/agent-resolve/tests/test_cli_and_entrypoint.py`)

```python
import unittest

class TestPyprojectConsoleScriptMetadata(unittest.TestCase):
    def test_pyproject_toml_exists_and_parses_with_tomllib(self) -> None: ...
    def test_pyproject_project_metadata(self) -> None: ...
    def test_console_script_entrypoint_spec(self) -> None: ...
    def test_console_script_target_resolves_and_is_callable(self) -> None: ...
    def test_console_script_target_invokes_help_without_pip_install(self) -> None: ...

class TestLegacyShimCutoverContract(unittest.TestCase):
    def test_shim_file_exists_and_is_executable(self) -> None: ...
    def test_shim_has_correct_python3_shebang(self) -> None: ...
    def test_shim_line_count_is_compact(self) -> None: ...
    def test_shim_does_not_contain_duplicate_agent_resolve_module_class(self) -> None: ...
    def test_shim_does_not_contain_monolithic_inline_functions(self) -> None: ...

class TestLegacyShimLoaderAndSymbolParity(unittest.TestCase):
    def test_shim_defines_explicit_all_list(self) -> None: ...
    def test_shim_all_symbol_parity_with_agent_resolve_package(self) -> None: ...
    def test_all_symbols_in_all_are_accessible_on_shim_module(self) -> None: ...
    def test_single_file_spec_from_file_location_loads_cleanly(self) -> None: ...
    def test_single_file_spec_loader_self_heals_path_and_imports_submodules(self) -> None: ...
    def test_shim_module_proxy_delegates_project_root_mutations(self) -> None: ...
    def test_shim_module_proxy_propagates_monkeypatched_attributes(self) -> None: ...

class TestLegacyShimSubprocessExecution(unittest.TestCase):
    def test_shim_direct_python_invocation_help_succeeds(self) -> None: ...
    def test_shim_direct_python_invocation_invalid_flag_exits_two(self) -> None: ...
```

---

## 3. Precise Behavioral Logic & Test Specifications

### 3.1 TDD Red Phase Failure Mechanisms

The test suite is structured to assert the precise architectural requirements of Phase 6:
1. **Line Count & Monolithic Inline Code Elimination Failure:**
   - `TestLegacyShimCutoverContract.test_shim_line_count_is_compact`: Asserts `len(lines) <= 120`. Currently `agent-resolve.py` has 235 lines with legacy manual delegators. This assertion will fail immediately.
   - `TestLegacyShimCutoverContract.test_shim_does_not_contain_duplicate_agent_resolve_module_class`: Asserts `"class _AgentResolveModule"` is NOT present in `agent-resolve.py` (since `agent_resolve/__init__.py` already defines it). Currently `class _AgentResolveModule` is duplicated on line 138 of `agent-resolve.py`. This assertion will fail immediately.
2. **Namespace Parity & `__all__` Contract Failure:**
   - `TestLegacyShimLoaderAndSymbolParity.test_shim_defines_explicit_all_list`: Asserts `hasattr(shim_mod, "__all__")`. Currently `agent-resolve.py` does not define `__all__`. This assertion will fail immediately.
   - `TestLegacyShimLoaderAndSymbolParity.test_shim_all_symbol_parity_with_agent_resolve_package`: Asserts `set(shim_mod.__all__) == set(agent_resolve.__all__)`. Fails immediately due to missing `__all__`.

---

### 3.2 Test Suite Specifications

#### 1. `TestPyprojectConsoleScriptMetadata`

- **`test_pyproject_toml_exists_and_parses_with_tomllib`:**
  - Locate `pyproject.toml` via `Path(__file__).resolve().parent.parent / "pyproject.toml"`.
  - Assert `pyproject_path.is_file()` is `True`.
  - Open in binary mode (`"rb"`) and parse using Python 3.12 standard library `tomllib.load(f)`.
  - Assert parsed result is a non-empty `dict`.

- **`test_pyproject_project_metadata`:**
  - Verify `data["project"]["name"] == "agent-resolve"`.
  - Verify `data["project"]["version"] == "0.1.0"`.
  - Verify `data["project"]["requires-python"] == ">=3.12"`.
  - Verify `data["build-system"]["build-backend"] == "setuptools.build_meta"`.

- **`test_console_script_entrypoint_spec`:**
  - Verify `data["project"]["scripts"]["agent-resolve"] == "agent_resolve.cli:main"`.

- **`test_console_script_target_resolves_and_is_callable`:**
  - Parse the entrypoint spec `"agent_resolve.cli:main"` into module (`agent_resolve.cli`) and attribute (`main`).
  - Import module dynamically using `importlib.import_module("agent_resolve.cli")`.
  - Retrieve entrypoint function using `getattr(mod, "main")`.
  - Assert `callable(entrypoint)` is `True`.
  - Assert `entrypoint is agent_resolve.cli.main`.

- **`test_console_script_target_invokes_help_without_pip_install`:**
  - Resolve entrypoint callable dynamically.
  - Invoke entrypoint with `["--help"]` without requiring prior `pip install -e`.
  - Catch `SystemExit` and assert `cm.exception.code == 0`.
  - Capture standard output using `contextlib.redirect_stdout(io.StringIO())`.
  - Assert help text includes `"Autonomous Issue Resolver Harness"` and options `"--issue"`, `"--max-issues"`, `"--dry-run"`.

---

#### 2. `TestLegacyShimCutoverContract`

- **`test_shim_file_exists_and_is_executable`:**
  - Locate `agent-resolve.py` via `Path(__file__).resolve().parent.parent / "agent-resolve.py"`.
  - Assert `shim_path.is_file()` is `True`.
  - Assert `os.access(shim_path, os.X_OK)` is `True` (preserves executable bit for CLI / GitHub Actions).

- **`test_shim_has_correct_python3_shebang`:**
  - Read first line of `agent-resolve.py`.
  - Assert `first_line == "#!/usr/bin/env python3"`.

- **`test_shim_line_count_is_compact`:**
  - Read all lines of `agent-resolve.py`.
  - Assert `len(lines) <= 120` with failure message reporting current line count.
  - Contract: Thin backward-compatible shim should only contain shebang, docstring, `sys.path` bootstrap, `sys.modules["agent_resolve"].__path__` self-healing, `from agent_resolve import *` / `__all__` re-exports, and `main()` invocation.

- **`test_shim_does_not_contain_duplicate_agent_resolve_module_class`:**
  - Read source text of `agent-resolve.py`.
  - Assert `"class _AgentResolveModule"` is NOT in source text (avoids class duplication across package root and shim).

- **`test_shim_does_not_contain_monolithic_inline_functions`:**
  - Verify that inline monolithic stage and utility functions (`def parse_args`, `def resolve_issue`, `def apply_patch_manifest`, `def gh_cli`, `def run_cmd`, `def get_genai_client`) are not defined inline with `def <name>` in `agent-resolve.py`.

---

#### 3. `TestLegacyShimLoaderAndSymbolParity`

- **`test_shim_defines_explicit_all_list`:**
  - Dynamically load `scripts/agent-resolve/agent-resolve.py` using `importlib.util.spec_from_file_location("agent_resolve_shim", shim_path)`.
  - Assert `hasattr(shim_mod, "__all__")` is `True`.
  - Assert `isinstance(shim_mod.__all__, (list, tuple))` is `True`.

- **`test_shim_all_symbol_parity_with_agent_resolve_package`:**
  - Import package root `agent_resolve`.
  - Compare `set(shim_mod.__all__)` against `set(agent_resolve.__all__)`.
  - Assert `set(agent_resolve.__all__) - set(shim_mod.__all__) == set()` (no missing symbols).
  - Assert `set(shim_mod.__all__) - set(agent_resolve.__all__) == set()` (no extraneous symbols).

- **`test_all_symbols_in_all_are_accessible_on_shim_module`:**
  - For each symbol `sym` in `agent_resolve.__all__`:
    - Assert `hasattr(shim_mod, sym)` is `True`.
    - Assert `getattr(shim_mod, sym) is getattr(agent_resolve, sym)`.

- **`test_single_file_spec_from_file_location_loads_cleanly`:**
  - Emulate single-file loader workflow:
    ```python
    spec = importlib.util.spec_from_file_location("agent_resolve", shim_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    ```
  - Assert `mod.__name__ == "agent_resolve"`.
  - Assert `hasattr(mod, "__path__")` is `True`.
  - Assert `mod.__path__ == [str(shim_path.parent / "agent_resolve")]`.

- **`test_single_file_spec_loader_self_heals_path_and_imports_submodules`:**
  - After executing `agent-resolve.py` under single-file loader, verify submodules resolve without collision:
    ```python
    import agent_resolve.config
    import agent_resolve.vcs
    ```
  - Assert `agent_resolve.config.get_project_root()` executes without error.

- **`test_shim_module_proxy_delegates_project_root_mutations`:**
  - Mutate `shim_mod.PROJECT_ROOT = Path("/tmp/fake_root_test")`.
  - Assert `agent_resolve.config.get_project_root() == Path("/tmp/fake_root_test")`.
  - Reset to original `PROJECT_ROOT` in test cleanup.

- **`test_shim_module_proxy_propagates_monkeypatched_attributes`:**
  - Record original `agent_resolve.gh_cli`.
  - Assign dummy function `fake_gh_cli` to `shim_mod.gh_cli`.
  - Assert `agent_resolve.vcs.gh_cli is fake_gh_cli`.
  - Assert `agent_resolve.gh_cli is fake_gh_cli`.
  - Restore original `gh_cli` in `try...finally`.

---

#### 4. `TestLegacyShimSubprocessExecution`

- **`test_shim_direct_python_invocation_help_succeeds`:**
  - Execute `subprocess.run([sys.executable, str(shim_path), "--help"], capture_output=True, text=True, timeout=10)`.
  - Assert `result.returncode == 0`.
  - Assert `"Autonomous Issue Resolver Harness"` in `result.stdout`.
  - Assert `"--issue"` in `result.stdout`.
  - Assert `result.stderr == ""` (no uncaught warnings or tracebacks).

- **`test_shim_direct_python_invocation_invalid_flag_exits_two`:**
  - Execute `subprocess.run([sys.executable, str(shim_path), "--nonexistent-flag-xyz"], capture_output=True, text=True, timeout=10)`.
  - Assert `result.returncode == 2`.
  - Assert `result.stderr != ""` (argparse error output).

---

## 4. Execution Verification Protocol

1. **Run Targeted Integration and Parity Test Suite (Verify TDD Red Phase Failure):**
   ```bash
   python3.12 -m unittest scripts/agent-resolve/tests/test_cli_and_entrypoint.py
   ```
   - **Expected Red Phase Outcome:** Fails with `AssertionError` on compact line count (`len(lines) <= 120`), duplicate `_AgentResolveModule` definition, and missing `__all__` attribute.

2. **Run Full Modular Unit Test Suite:**
   ```bash
   python3.12 -m unittest discover -s scripts/agent-resolve/tests -t scripts/agent-resolve
   ```
   - **Expected Outcome:** Discovers all 14 test suites (`test_config`, `test_models`, `test_tracker`, `test_exceptions`, `test_environment`, `test_verification`, `test_patch_engine`, `test_vcs`, `test_llm`, `test_context`, `test_diagnostics`, `test_stages`, `test_pipeline`, `test_cli`, `test_cli_and_entrypoint`). The 13 existing suites pass cleanly; `test_cli_and_entrypoint.py` fails on expected Red phase contract assertions.

3. **Run Legacy Regression Test Suite (Must Remain 100% Green):**
   ```bash
   python3.12 -m unittest discover -s scripts/__tests__
   ```
   - **Expected Outcome:** All 27 legacy test cases in `scripts/__tests__/test_patch_engine.py` pass (`OK`).

---

## 5. Post-Execution Protocol (Git Commit, Git Notes & Plan Update)

1. **Stage & Commit TDD Red Phase Tests (`BypassSandbox: true`):**
   ```bash
   git add scripts/agent-resolve/tests/test_cli_and_entrypoint.py
   git commit -m "test(agent-resolve): Add failing entrypoint, shim cutover, and symbol parity tests"
   ```

2. **Attach Git Note (`BypassSandbox: true`):**
   ```bash
   git notes add -m "Task: Write failing comprehensive entrypoint integration, shim cutover, and parity tests (TDD Red phase)
   Summary: Added comprehensive integration and symbol parity test suite in test_cli_and_entrypoint.py verifying PEP 621 console-script metadata in pyproject.toml, thin shim cutover constraints (line count <= 120, elimination of duplicate module proxy, subprocess --help), and symbol/namespace parity between agent-resolve.py and agent_resolve (__all__ equivalence and spec_from_file_location loader compatibility).
   Files: scripts/agent-resolve/tests/test_cli_and_entrypoint.py
   Rationale: Establish strict TDD Red phase contracts for entrypoint packaging, CLI execution, and backward-compatible shim parity before cutting over agent-resolve.py in Phase 6 Task 2." $(git log -1 --format="%H")
   ```

3. **Update `plan.md` & Commit (`BypassSandbox: true`):**
   - Update line 103 of `conductor/tracks/agent-resolve-decomposition_20261015/plan.md` from `[ ]` to `[x]` with the 7-character commit SHA, then commit:
   ```bash
   git add conductor/tracks/agent-resolve-decomposition_20261015/plan.md
   git commit -m "conductor(plan): Mark task 'Write failing comprehensive entrypoint integration, shim cutover, and parity tests (TDD Red phase)' as complete"
   ```
