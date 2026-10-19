"""
Comprehensive entrypoint integration, shim cutover, and symbol parity tests (TDD Red Phase).
"""

from __future__ import annotations

import contextlib
import importlib
import importlib.util
import io
import os
from pathlib import Path
import re
import subprocess
import sys
import tomllib
import types
import unittest
from typing import Any

PACKAGE_ROOT: Path = Path(__file__).resolve().parent.parent
if str(PACKAGE_ROOT) not in sys.path:
    sys.path.insert(0, str(PACKAGE_ROOT))

import agent_resolve
import agent_resolve.cli
import agent_resolve.config
import agent_resolve.vcs


class TestPyprojectConsoleScriptMetadata(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.pyproject_path = Path(__file__).resolve().parent.parent / "pyproject.toml"

    def _load_pyproject(self) -> dict[str, Any]:
        self.assertTrue(self.pyproject_path.is_file(), f"{self.pyproject_path} does not exist")
        with open(self.pyproject_path, "rb") as f:
            data = tomllib.load(f)
        return data

    def test_pyproject_toml_exists_and_parses_with_tomllib(self) -> None:
        data = self._load_pyproject()
        self.assertIsInstance(data, dict)
        self.assertTrue(bool(data))

    def test_pyproject_project_metadata(self) -> None:
        data = self._load_pyproject()
        self.assertEqual(data["project"]["name"], "agent-resolve")
        self.assertEqual(data["project"]["version"], "0.1.0")
        self.assertEqual(data["project"]["requires-python"], ">=3.12")
        self.assertEqual(data["build-system"]["build-backend"], "setuptools.build_meta")

    def test_console_script_entrypoint_spec(self) -> None:
        data = self._load_pyproject()
        self.assertEqual(data["project"]["scripts"]["agent-resolve"], "agent_resolve.cli:main")

    def test_console_script_target_resolves_and_is_callable(self) -> None:
        data = self._load_pyproject()
        spec_str = data["project"]["scripts"]["agent-resolve"]
        mod_name, func_name = spec_str.split(":")
        mod = importlib.import_module(mod_name)
        entrypoint = getattr(mod, func_name)
        self.assertTrue(callable(entrypoint))
        self.assertIs(entrypoint, agent_resolve.cli.main)

    def test_console_script_target_invokes_help_without_pip_install(self) -> None:
        data = self._load_pyproject()
        spec_str = data["project"]["scripts"]["agent-resolve"]
        mod_name, func_name = spec_str.split(":")
        mod = importlib.import_module(mod_name)
        entrypoint = getattr(mod, func_name)
        out_buf = io.StringIO()
        with contextlib.redirect_stdout(out_buf):
            with self.assertRaises(SystemExit) as cm:
                entrypoint(["--help"])
        self.assertEqual(cm.exception.code, 0)
        output = out_buf.getvalue()
        self.assertTrue("Autonomous" in output and "Issue Resolver Harness" in output)
        self.assertIn("--issue", output)
        self.assertIn("--max-issues", output)
        self.assertIn("--dry-run", output)


class TestLegacyShimCutoverContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.shim_path = Path(__file__).resolve().parent.parent / "agent-resolve.py"

    def test_shim_file_exists_and_is_executable(self) -> None:
        self.assertTrue(self.shim_path.is_file(), f"{self.shim_path} does not exist")
        self.assertTrue(os.access(self.shim_path, os.X_OK), f"{self.shim_path} is not executable")

    def test_shim_has_correct_python3_shebang(self) -> None:
        with open(self.shim_path, "r", encoding="utf-8") as f:
            first_line = f.readline().rstrip("\r\n")
        self.assertEqual(first_line, "#!/usr/bin/env python3")

    def test_shim_line_count_is_compact(self) -> None:
        lines = self.shim_path.read_text(encoding="utf-8").splitlines()
        self.assertLessEqual(
            len(lines),
            120,
            f"agent-resolve.py has {len(lines)} lines; expected <= 120 lines for thin shim",
        )

    def test_shim_does_not_contain_duplicate_agent_resolve_module_class(self) -> None:
        text = self.shim_path.read_text(encoding="utf-8")
        self.assertNotIn(
            "class _AgentResolveModule",
            text,
            "agent-resolve.py contains duplicate 'class _AgentResolveModule' definition",
        )

    def test_shim_does_not_contain_monolithic_inline_functions(self) -> None:
        text = self.shim_path.read_text(encoding="utf-8")
        monolithic_functions = [
            "parse_args",
            "resolve_issue",
            "apply_patch_manifest",
            "gh_cli",
            "run_cmd",
            "get_genai_client",
        ]
        for fn_name in monolithic_functions:
            self.assertFalse(
                bool(re.search(rf"\bdef\s+{fn_name}\b", text)),
                f"agent-resolve.py defines inline function 'def {fn_name}', which should be delegated to modular package",
            )


class TestLegacyShimLoaderAndSymbolParity(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.shim_path = Path(__file__).resolve().parent.parent / "agent-resolve.py"

    def _load_shim_module(self, name: str = "agent_resolve_shim") -> types.ModuleType:
        spec = importlib.util.spec_from_file_location(name, self.shim_path)
        if spec is None or spec.loader is None:
            raise ImportError(f"Cannot load spec from {self.shim_path}")
        mod = importlib.util.module_from_spec(spec)
        saved = sys.modules.get(name)
        sys.modules[name] = mod
        try:
            spec.loader.exec_module(mod)
        except Exception:
            if saved is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = saved
            raise
        return mod

    def test_shim_defines_explicit_all_list(self) -> None:
        shim_mod = self._load_shim_module()
        self.assertTrue(hasattr(shim_mod, "__all__"), "agent-resolve.py does not define explicit __all__")
        self.assertIsInstance(shim_mod.__all__, (list, tuple))

    def test_shim_all_symbol_parity_with_agent_resolve_package(self) -> None:
        shim_mod = self._load_shim_module()
        self.assertTrue(hasattr(shim_mod, "__all__"), "agent-resolve.py does not define explicit __all__")
        shim_all = set(shim_mod.__all__)
        pkg_all = set(agent_resolve.__all__)
        self.assertEqual(pkg_all - shim_all, set(), f"Missing symbols in agent-resolve.py: {pkg_all - shim_all}")
        self.assertEqual(shim_all - pkg_all, set(), f"Extra symbols in agent-resolve.py: {shim_all - pkg_all}")

    def test_all_symbols_in_all_are_accessible_on_shim_module(self) -> None:
        shim_mod = self._load_shim_module()
        for sym in agent_resolve.__all__:
            self.assertTrue(hasattr(shim_mod, sym), f"Symbol '{sym}' not found on shim module")
            self.assertIs(
                getattr(shim_mod, sym),
                getattr(agent_resolve, sym),
                f"Symbol '{sym}' identity mismatch between agent_resolve and agent-resolve.py",
            )

    def test_single_file_spec_from_file_location_loads_cleanly(self) -> None:
        spec = importlib.util.spec_from_file_location("agent_resolve", self.shim_path)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        mod = importlib.util.module_from_spec(spec)
        saved_mod = sys.modules.get("agent_resolve")
        try:
            sys.modules["agent_resolve"] = mod
            spec.loader.exec_module(mod)
            self.assertEqual(mod.__name__, "agent_resolve")
            self.assertTrue(hasattr(mod, "__path__"))
            self.assertEqual(mod.__path__, [str(self.shim_path.parent / "agent_resolve")])
        finally:
            if saved_mod is not None:
                sys.modules["agent_resolve"] = saved_mod

    def test_single_file_spec_loader_self_heals_path_and_imports_submodules(self) -> None:
        spec = importlib.util.spec_from_file_location("agent_resolve", self.shim_path)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        mod = importlib.util.module_from_spec(spec)
        saved_mod = sys.modules.get("agent_resolve")
        try:
            sys.modules["agent_resolve"] = mod
            spec.loader.exec_module(mod)
            import agent_resolve.config
            import agent_resolve.vcs
            self.assertIsNotNone(agent_resolve.config.get_project_root())
        finally:
            if saved_mod is not None:
                sys.modules["agent_resolve"] = saved_mod

    def test_single_file_spec_loader_delegates_project_root_mutations(self) -> None:
        spec = importlib.util.spec_from_file_location("agent_resolve", self.shim_path)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        mod = importlib.util.module_from_spec(spec)
        saved_mod = sys.modules.get("agent_resolve")
        orig_root = agent_resolve.config.get_project_root()
        test_root = Path("/tmp/fake_root_single_spec_test")
        try:
            sys.modules["agent_resolve"] = mod
            spec.loader.exec_module(mod)
            mod.PROJECT_ROOT = test_root
            self.assertEqual(agent_resolve.config.get_project_root(), test_root)
        finally:
            agent_resolve.config.set_project_root(orig_root)
            if saved_mod is not None:
                sys.modules["agent_resolve"] = saved_mod

    def test_single_file_spec_loader_propagates_monkeypatched_attributes(self) -> None:
        spec = importlib.util.spec_from_file_location("agent_resolve", self.shim_path)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        mod = importlib.util.module_from_spec(spec)
        saved_mod = sys.modules.get("agent_resolve")
        orig_gh_cli = agent_resolve.gh_cli
        orig_vcs_gh_cli = agent_resolve.vcs.gh_cli

        def fake_gh_cli(*args: Any, **kwargs: Any) -> Any:
            return (0, "fake_single_spec", "")

        try:
            sys.modules["agent_resolve"] = mod
            spec.loader.exec_module(mod)
            mod.gh_cli = fake_gh_cli
            self.assertIs(mod.gh_cli, fake_gh_cli)
            self.assertIs(agent_resolve.vcs.gh_cli, fake_gh_cli)
            self.assertIs(sys.modules["agent_resolve"].gh_cli, fake_gh_cli)
        finally:
            agent_resolve.gh_cli = orig_gh_cli
            agent_resolve.vcs.gh_cli = orig_vcs_gh_cli
            if saved_mod is not None:
                sys.modules["agent_resolve"] = saved_mod

    def test_shim_module_proxy_delegates_project_root_mutations(self) -> None:
        shim_mod = self._load_shim_module()
        orig_root = agent_resolve.config.get_project_root()
        test_root = Path("/tmp/fake_root_test")
        try:
            shim_mod.PROJECT_ROOT = test_root
            self.assertEqual(agent_resolve.config.get_project_root(), test_root)
        finally:
            agent_resolve.config.set_project_root(orig_root)
            sys.modules.pop("agent_resolve_shim", None)

    def test_shim_module_proxy_propagates_monkeypatched_attributes(self) -> None:
        shim_mod = self._load_shim_module()
        orig_gh_cli = agent_resolve.gh_cli
        orig_vcs_gh_cli = agent_resolve.vcs.gh_cli

        def fake_gh_cli(*args: Any, **kwargs: Any) -> Any:
            return (0, "fake", "")

        try:
            shim_mod.gh_cli = fake_gh_cli
            self.assertIs(agent_resolve.vcs.gh_cli, fake_gh_cli)
            self.assertIs(agent_resolve.gh_cli, fake_gh_cli)
        finally:
            agent_resolve.gh_cli = orig_gh_cli
            agent_resolve.vcs.gh_cli = orig_vcs_gh_cli
            sys.modules.pop("agent_resolve_shim", None)


class TestLegacyShimSubprocessExecution(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.shim_path = Path(__file__).resolve().parent.parent / "agent-resolve.py"

    def test_shim_direct_python_invocation_help_succeeds(self) -> None:
        result = subprocess.run(
            [sys.executable, str(self.shim_path), "--help"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        self.assertEqual(result.returncode, 0)
        self.assertTrue("Autonomous" in result.stdout and "Issue Resolver Harness" in result.stdout)
        self.assertIn("--issue", result.stdout)
        self.assertEqual(result.stderr, "")

    def test_shim_direct_python_invocation_invalid_flag_exits_two(self) -> None:
        result = subprocess.run(
            [sys.executable, str(self.shim_path), "--nonexistent-flag-xyz"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        self.assertEqual(result.returncode, 2)
        self.assertNotEqual(result.stderr, "")


if __name__ == "__main__":
    unittest.main()
