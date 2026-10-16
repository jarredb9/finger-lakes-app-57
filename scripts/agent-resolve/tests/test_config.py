"""Unit tests for `agent_resolve.config` and `_AgentResolveModule` delegation."""

from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

import agent_resolve
from agent_resolve import config


class TestConfig(unittest.TestCase):
    def setUp(self) -> None:
        self._original_root = config.get_project_root()

    def tearDown(self) -> None:
        config.set_project_root(self._original_root)

    def test_project_root_resolves_to_repo_root_with_package_json(self) -> None:
        self.assertIsInstance(config.PROJECT_ROOT, Path)
        self.assertTrue((config.PROJECT_ROOT / "package.json").is_file())

    def test_resolve_project_root_ancestor_walk_and_depth3_fallback(self) -> None:
        # Case A: Marker (package.json) present at an ancestor directory
        with tempfile.TemporaryDirectory() as tmp_dir:
            repo_root = Path(tmp_dir).resolve() / "workspace"
            nested_module = repo_root / "a" / "b" / "c" / "d" / "module.py"
            nested_module.parent.mkdir(parents=True, exist_ok=True)
            (repo_root / "package.json").write_text("{}", encoding="utf-8")
            nested_module.write_text("# module\n", encoding="utf-8")

            resolved = config.resolve_project_root(nested_module)
            self.assertEqual(resolved, repo_root)

        # Case B: No package.json or .git marker anywhere -> falls back to parents[3]
        with tempfile.TemporaryDirectory() as tmp_dir:
            base = Path(tmp_dir).resolve()
            simulated_config = base / "scripts" / "agent-resolve" / "agent_resolve" / "config.py"
            simulated_config.parent.mkdir(parents=True, exist_ok=True)
            simulated_config.write_text("# simulated config\n", encoding="utf-8")

            fallback_root = config.resolve_project_root(simulated_config)
            self.assertEqual(fallback_root, base)

    def test_get_and_set_project_root_updates_config_state(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            new_root = Path(tmp_dir).resolve()
            config.set_project_root(new_root)
            self.assertEqual(config.PROJECT_ROOT, new_root)
            self.assertEqual(config.get_project_root(), new_root)

    def test_module_setattr_project_root_delegates_to_config(self) -> None:
        mod = sys.modules["agent_resolve"]
        self.assertIsInstance(mod, types.ModuleType)
        self.assertEqual(type(mod).__name__, "_AgentResolveModule")

        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir).resolve()
            agent_resolve.PROJECT_ROOT = tmp_path
            self.assertEqual(config.PROJECT_ROOT, tmp_path)
            self.assertEqual(config.get_project_root(), tmp_path)
            self.assertEqual(agent_resolve.PROJECT_ROOT, tmp_path)

    def test_module_setattr_propagates_monkeypatched_attributes_to_submodules(self) -> None:
        submod_name = "agent_resolve._test_sub"
        sentinel_orig = lambda: "original"  # noqa: E731
        sentinel_mock = lambda: "patched"  # noqa: E731

        submod = types.ModuleType(submod_name)
        setattr(submod, "_test_collaborator", sentinel_orig)
        setattr(agent_resolve, "_test_collaborator", sentinel_orig)
        sys.modules[submod_name] = submod
        try:
            with patch.object(agent_resolve, "_test_collaborator", sentinel_mock):
                self.assertIs(submod.__dict__["_test_collaborator"], sentinel_mock)
            self.assertIs(submod.__dict__["_test_collaborator"], sentinel_orig)
        finally:
            sys.modules.pop(submod_name, None)
            agent_resolve.__dict__.pop("_test_collaborator", None)

    def test_model_and_token_defaults(self) -> None:
        self.assertEqual(config.DEFAULT_PLANNER_MODELS, ["gemini-3.8-flash"])
        self.assertEqual(config.DEFAULT_EXECUTOR_MODELS, ["gemini-3.8-flash"])
        self.assertIsInstance(config.MAX_TOKENS_PER_ISSUE, int)
        self.assertEqual(config.MAX_TOKENS_PER_ISSUE, 500_000)
        self.assertIsInstance(config.BATCH_PACING_SECONDS, int)
        self.assertEqual(config.BATCH_PACING_SECONDS, 5)


if __name__ == "__main__":
    unittest.main()
