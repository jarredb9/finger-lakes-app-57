"""Unit tests for `conductor_tools.profile` defaults, TOML loading, and validation."""

from __future__ import annotations

from dataclasses import FrozenInstanceError, fields, is_dataclass
from pathlib import Path
import re
import tempfile
import unittest

from conductor_tools.profile import (
    DomainRule,
    ExemptRule,
    ModelsProfile,
    PathRules,
    PlanningProfile,
    RepoProfile,
    SafetyProfile,
    SuiteConfig,
    SupervisorProfile,
    TypeCheckProfile,
    load_repo_profile,
)
from conductor_tools.models import ConductorError

FORBIDDEN_REPO_TOKENS = (
    "finger-lakes",
    "run-jest-container",
    "run-e2e-container",
    "supabase",
    "db:check-types",
    "db:reset",
    "test:functions",
    "lib/database.types.ts",
)


def _iter_strings(obj: object) -> list[str]:
    """Recursively extract all string values and dictionary keys from a dataclass tree."""
    collected: list[str] = []
    if isinstance(obj, str):
        collected.append(obj)
    elif is_dataclass(obj):
        for f in fields(obj):
            collected.extend(_iter_strings(getattr(obj, f.name)))
    elif isinstance(obj, dict):
        for k, v in obj.items():
            collected.extend(_iter_strings(k))
            collected.extend(_iter_strings(v))
    elif isinstance(obj, (tuple, list, set, frozenset)):
        for item in obj:
            collected.extend(_iter_strings(item))
    return collected


class TestRepoProfileDefaults(unittest.TestCase):
    """Verify generic built-in defaults and frozen/slotted immutability."""

    def test_all_profile_dataclasses_are_frozen_and_slotted(self) -> None:
        samples = [
            (PlanningProfile, PlanningProfile(), "tracks_dir", "other"),
            (TypeCheckProfile, TypeCheckProfile(), "cmd", "mypy"),
            (SuiteConfig, SuiteConfig(name="unit", full_cmd="pytest"), "name", "other"),
            (DomainRule, DomainRule(), "priority", 5),
            (ExemptRule, ExemptRule(), "commit_prefix", "docs"),
            (PathRules, PathRules(), "test_prefixes", ("spec_",)),
            (SupervisorProfile, SupervisorProfile(), "default_test_cmd", "go test"),
            (SafetyProfile, SafetyProfile(), "command_prefixes", ("pytest ",)),
            (ModelsProfile, ModelsProfile(), "family", "other"),
            (RepoProfile, RepoProfile(), "suites", ()),
        ]
        for cls, instance, attr, new_val in samples:
            with self.subTest(cls=cls.__name__):
                self.assertTrue(is_dataclass(cls))
                self.assertTrue(hasattr(cls, "__slots__"))
                self.assertFalse(hasattr(instance, "__dict__"))
                with self.assertRaises(FrozenInstanceError):
                    setattr(instance, attr, new_val)

    def test_missing_profile_toml_returns_generic_defaults(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            from_dir = load_repo_profile(repo_root=tmp_path)
            from_none = load_repo_profile()
            self.assertEqual(from_dir, RepoProfile())
            self.assertEqual(from_none, RepoProfile())

    def test_zero_finger_lakes_leakage_in_defaults(self) -> None:
        profile = RepoProfile()
        all_strings = _iter_strings(profile)
        self.assertGreater(len(all_strings), 0)
        for value in all_strings:
            lowered = value.lower()
            for token in FORBIDDEN_REPO_TOKENS:
                self.assertNotIn(
                    token.lower(),
                    lowered,
                    f"Repo-specific token {token!r} leaked into default profile string {value!r}",
                )

    def test_builtin_exempt_defaults(self) -> None:
        profile = RepoProfile()
        self.assertIn("docs", profile.exempt)
        self.assertIn("infra", profile.exempt)
        self.assertIn("scripts", profile.exempt)

        docs_rule = profile.exempt["docs"]
        self.assertEqual(docs_rule.diff_extensions, (".md", ".markdown"))
        self.assertTrue(docs_rule.require_non_empty_diff)

        for key in ("infra", "scripts"):
            rule = profile.exempt[key]
            self.assertEqual(rule.commit_prefix, "chore")
            self.assertNotIn("npm run lint", rule.commands)

    def test_builtin_paths_safety_supervisor_and_models_defaults(self) -> None:
        profile = RepoProfile()

        self.assertEqual(profile.paths.test_dirs, ("tests", "test", "__tests__"))
        self.assertEqual(profile.paths.test_prefixes, ("test_",))
        for suffix in (".test.ts", "_test.py", "_test.go"):
            self.assertIn(suffix, profile.paths.test_suffixes)
        for pattern in profile.paths.ephemeral_patterns + profile.paths.log_patterns:
            re.compile(pattern)

        for token in ("pytest", "python3 -m unittest", "npm test", "cargo test", "go test"):
            self.assertIn(token, profile.safety.allowed_verification_tokens)

        self.assertEqual(profile.supervisor.static_analysis_prefixes, ("eslint", "tsc", "ruff", "mypy"))
        self.assertEqual(profile.supervisor.default_test_cmd, "pytest")
        for kw in ("full automated", "full test suite", "full regression"):
            self.assertIn(kw, profile.supervisor.full_suite_keywords)
        re.compile(profile.supervisor.review_severity_pattern)

        self.assertEqual(profile.models.family, "gemini-4-hydrogen")
        self.assertEqual(
            profile.models.efforts,
            {"plan": "high", "exec": "high", "checkpoint": "medium", "review": "high"},
        )
        self.assertEqual(profile.models.default_brain_dir, "~/.gemini/antigravity-cli/brain")


class TestLoadRepoProfile(unittest.TestCase):
    """Verify TOML parsing, replace-on-key merging, and strict validation."""

    def _write_profile(self, root: Path, content: str) -> Path:
        conductor_dir = root / "conductor"
        conductor_dir.mkdir(parents=True, exist_ok=True)
        path = conductor_dir / "profile.toml"
        path.write_text(content, encoding="utf-8")
        return path

    def test_parse_all_nine_sections_and_explicit_profile_path(self) -> None:
        toml_body = """
[planning]
tracks_dir = "custom/tracks"
archive_dir = "custom/archive"
tracks_registry = "custom/tracks.md"
style_guide_guardrail = "Follow PEP 8."
guardrail_extensions = [".py"]

[type_check]
cmd = "mypy src"
extensions = [".py", ".pyi"]
check_tokens = ["mypy"]

[[suites]]
name = "unit"
full_cmd = "pytest tests/unit"
targeted_cmd = "pytest {files}"
path_prefixes = ["src/"]
path_suffixes = [".py"]
exclude_suffixes = ["_e2e.py"]
keywords = ["unit"]
include_in_full_suite = true
is_python = true

[domains.ui]
path_prefixes = ["web/"]
exact_paths = ["index.html"]
path_substrings = ["components"]
keywords = ["ui", "layout"]
fallback_cmds = ["npm test"]
manual_verification_prompt = "Inspect rendered UI."
priority = 10

[exempt.ui]
commands = ["npm run lint"]
commit_prefix = "style"
instruction = "Verify CSS visually."
diff_extensions = [".css"]
require_non_empty_diff = true

[paths]
test_dirs = ["specs"]
test_suffixes = ["_spec.py"]
test_prefixes = ["spec_"]
metadata_prefixes = [".meta/"]
code_prefixes = ["app/"]
code_extensions = [".py"]
manifest_files = ["pyproject.toml"]
ephemeral_patterns = ["^tmp/.*$"]
log_patterns = ["^logs/.*$"]

[supervisor]
static_analysis_prefixes = ["ruff"]
default_test_cmd = "pytest -q"
full_suite_keywords = ["all tests"]
conventional_commit_types = ["feat", "fix", "test"]
required_note_fields = ["Task:", "Summary:"]
review_severity_pattern = "^CRITICAL:"
default_timeout_seconds = 600.0
default_heartbeat_interval = 15.0

[safety]
command_prefixes = ["pytest "]
allowed_verification_tokens = ["pytest"]
mutating_cmd_patterns = ["rm\\\\s+-rf"]
mutating_git_prefixes = ["git commit"]

[models]
family = "gemini-5-pro"
default_brain_dir = "/tmp/brain"

[models.efforts]
plan = "medium"
exec = "high"
checkpoint = "low"
review = "high"
"""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            profile_file = self._write_profile(root, toml_body)

            profile = load_repo_profile(repo_root=root)
            from_explicit = load_repo_profile(profile_path=profile_file)
            self.assertEqual(profile, from_explicit)

            self.assertEqual(profile.planning.tracks_dir, "custom/tracks")
            self.assertEqual(profile.planning.archive_dir, "custom/archive")
            self.assertEqual(profile.planning.tracks_registry, "custom/tracks.md")
            self.assertEqual(profile.planning.style_guide_guardrail, "Follow PEP 8.")
            self.assertEqual(profile.planning.guardrail_extensions, (".py",))

            self.assertEqual(profile.type_check.cmd, "mypy src")
            self.assertEqual(profile.type_check.extensions, (".py", ".pyi"))
            self.assertEqual(profile.type_check.check_tokens, ("mypy",))

            self.assertEqual(len(profile.suites), 1)
            suite = profile.suites[0]
            self.assertEqual(suite.name, "unit")
            self.assertEqual(suite.full_cmd, "pytest tests/unit")
            self.assertEqual(suite.targeted_cmd, "pytest {files}")
            self.assertEqual(suite.path_prefixes, ("src/",))
            self.assertEqual(suite.path_suffixes, (".py",))
            self.assertEqual(suite.exclude_suffixes, ("_e2e.py",))
            self.assertEqual(suite.keywords, ("unit",))
            self.assertTrue(suite.include_in_full_suite)
            self.assertTrue(suite.is_python)

            self.assertEqual(set(profile.domains.keys()), {"ui"})
            domain = profile.domains["ui"]
            self.assertEqual(domain.path_prefixes, ("web/",))
            self.assertEqual(domain.exact_paths, ("index.html",))
            self.assertEqual(domain.path_substrings, ("components",))
            self.assertEqual(domain.keywords, ("ui", "layout"))
            self.assertEqual(domain.fallback_cmds, ("npm test",))
            self.assertEqual(domain.manual_verification_prompt, "Inspect rendered UI.")
            self.assertEqual(domain.priority, 10)

            self.assertEqual(set(profile.exempt.keys()), {"ui"})
            exempt = profile.exempt["ui"]
            self.assertEqual(exempt.commands, ("npm run lint",))
            self.assertEqual(exempt.commit_prefix, "style")
            self.assertEqual(exempt.instruction, "Verify CSS visually.")
            self.assertEqual(exempt.diff_extensions, (".css",))
            self.assertTrue(exempt.require_non_empty_diff)

            self.assertEqual(profile.paths.test_dirs, ("specs",))
            self.assertEqual(profile.paths.test_suffixes, ("_spec.py",))
            self.assertEqual(profile.paths.test_prefixes, ("spec_",))
            self.assertEqual(profile.paths.metadata_prefixes, (".meta/",))
            self.assertEqual(profile.paths.code_prefixes, ("app/",))
            self.assertEqual(profile.paths.code_extensions, (".py",))
            self.assertEqual(profile.paths.manifest_files, ("pyproject.toml",))
            self.assertEqual(profile.paths.ephemeral_patterns, ("^tmp/.*$",))
            self.assertEqual(profile.paths.log_patterns, ("^logs/.*$",))

            self.assertEqual(profile.supervisor.static_analysis_prefixes, ("ruff",))
            self.assertEqual(profile.supervisor.default_test_cmd, "pytest -q")
            self.assertEqual(profile.supervisor.full_suite_keywords, ("all tests",))
            self.assertEqual(profile.supervisor.conventional_commit_types, ("feat", "fix", "test"))
            self.assertEqual(profile.supervisor.required_note_fields, ("Task:", "Summary:"))
            self.assertEqual(profile.supervisor.review_severity_pattern, "^CRITICAL:")
            self.assertEqual(profile.supervisor.default_timeout_seconds, 600.0)
            self.assertEqual(profile.supervisor.default_heartbeat_interval, 15.0)

            self.assertEqual(profile.safety.command_prefixes, ("pytest ",))
            self.assertEqual(profile.safety.allowed_verification_tokens, ("pytest",))
            self.assertEqual(profile.safety.mutating_cmd_patterns, (r"rm\s+-rf",))
            self.assertEqual(profile.safety.mutating_git_prefixes, ("git commit",))

            self.assertEqual(profile.models.family, "gemini-5-pro")
            self.assertEqual(profile.models.default_brain_dir, "/tmp/brain")
            self.assertEqual(
                profile.models.efforts,
                {"plan": "medium", "exec": "high", "checkpoint": "low", "review": "high"},
            )

    def test_explicit_missing_profile_path_raises_conductor_error(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            missing = Path(tmp) / "does-not-exist.toml"
            with self.assertRaises(ConductorError):
                load_repo_profile(profile_path=missing)

    def test_replace_on_key_merge_semantics(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)

            # 1. Scalar/table override preserves omitted fields and efforts map
            self._write_profile(root, '[models]\nfamily = "gemini-5-pro"\n')
            p1 = load_repo_profile(repo_root=root)
            self.assertEqual(p1.models.family, "gemini-5-pro")
            self.assertEqual(
                p1.models.efforts,
                {"plan": "high", "exec": "high", "checkpoint": "medium", "review": "high"},
            )

            # 2. Partial efforts table merges per role key while keeping family default
            self._write_profile(root, '[models.efforts]\nplan = "medium"\n')
            p2 = load_repo_profile(repo_root=root)
            self.assertEqual(p2.models.family, "gemini-4-hydrogen")
            self.assertEqual(
                p2.models.efforts,
                {"plan": "medium", "exec": "high", "checkpoint": "medium", "review": "high"},
            )

            # 3. List replacement (no silent append) while omitted keys keep defaults
            self._write_profile(
                root,
                '[paths]\ntest_suffixes = ["_spec.rb"]\n'
                '[safety]\nallowed_verification_tokens = ["cargo test"]\n',
            )
            p3 = load_repo_profile(repo_root=root)
            self.assertEqual(p3.paths.test_suffixes, ("_spec.rb",))
            self.assertEqual(p3.paths.test_prefixes, ("test_",))
            self.assertEqual(p3.safety.allowed_verification_tokens, ("cargo test",))

            # 4. Map/array-of-table replacement replaces whole section
            self._write_profile(
                root,
                '[exempt.custom]\ncommit_prefix = "chore"\n'
                '[domains.api]\npriority = 1\n'
                '[[suites]]\nname = "go"\nfull_cmd = "go test ./..."\n',
            )
            p4 = load_repo_profile(repo_root=root)
            self.assertEqual(set(p4.exempt.keys()), {"custom"})
            self.assertEqual(set(p4.domains.keys()), {"api"})
            self.assertEqual(len(p4.suites), 1)
            self.assertEqual(p4.suites[0].name, "go")

    def test_strict_schema_validation_raises_conductor_error(self) -> None:
        invalid_configs = [
            ("unknown_top_level_section", '[unknown_section]\nfoo = "bar"\n'),
            ("unknown_planning_key", '[planning]\nbogus_key = "x"\n'),
            ("unknown_type_check_key", '[type_check]\nbogus_key = "x"\n'),
            ("unknown_suite_key", '[[suites]]\nname = "unit"\nfull_cmd = "pytest"\nbogus_key = "x"\n'),
            ("unknown_domain_key", '[domains.ui]\nbogus_key = "x"\n'),
            ("unknown_exempt_key", '[exempt.ui]\nbogus_key = "x"\n'),
            ("unknown_paths_key", '[paths]\nbogus = []\n'),
            ("unknown_supervisor_key", '[supervisor]\nbogus = "x"\n'),
            ("unknown_safety_key", '[safety]\nbogus = []\n'),
            ("unknown_models_key", '[models]\nbogus = "x"\n'),
            ("bool_for_float", "[supervisor]\ndefault_timeout_seconds = true\n"),
            ("bool_for_int", "[domains.ui]\npriority = true\n"),
            ("string_for_list", '[paths]\ntest_dirs = "tests"\n'),
            ("non_string_element_in_list", '[safety]\ncommand_prefixes = ["pytest", 123]\n'),
            ("string_for_bool", '[exempt.docs]\nrequire_non_empty_diff = "yes"\n'),
            ("suite_missing_name", '[[suites]]\nfull_cmd = "pytest"\n'),
            ("suite_missing_full_cmd", '[[suites]]\nname = "unit"\n'),
            ("suite_empty_name", '[[suites]]\nname = ""\nfull_cmd = "pytest"\n'),
            ("suite_empty_full_cmd", '[[suites]]\nname = "unit"\nfull_cmd = "   "\n'),
            ("invalid_regex_safety", '[safety]\nmutating_cmd_patterns = ["[unclosed"]\n'),
            ("invalid_regex_supervisor", '[supervisor]\nreview_severity_pattern = "[unclosed"\n'),
            ("invalid_regex_paths", '[paths]\nephemeral_patterns = ["[unclosed"]\n'),
            ("malformed_toml", '[planning\ntracks_dir = "broken"\n'),
            ("zero_timeout", "[supervisor]\ndefault_timeout_seconds = 0.0\n"),
            ("negative_timeout", "[supervisor]\ndefault_timeout_seconds = -10.0\n"),
            ("nan_timeout", "[supervisor]\ndefault_timeout_seconds = nan\n"),
            ("inf_timeout", "[supervisor]\ndefault_timeout_seconds = inf\n"),
            ("zero_heartbeat", "[supervisor]\ndefault_heartbeat_interval = 0\n"),
            ("negative_heartbeat", "[supervisor]\ndefault_heartbeat_interval = -1.5\n"),
            ("nan_heartbeat", "[supervisor]\ndefault_heartbeat_interval = nan\n"),
            ("inf_heartbeat", "[supervisor]\ndefault_heartbeat_interval = inf\n"),
            ("duplicate_exempt_normalized", '[exempt.UI]\ncommit_prefix = "style"\n[exempt.ui]\ncommit_prefix = "chore"\n'),
            ("empty_tracks_dir", '[planning]\ntracks_dir = "   "\n'),
            ("empty_archive_dir", '[planning]\narchive_dir = ""\n'),
            ("empty_tracks_registry", '[planning]\ntracks_registry = ""\n'),
            ("empty_exempt_commit_prefix", '[exempt.ui]\ncommit_prefix = " "\n'),
            ("empty_default_test_cmd", '[supervisor]\ndefault_test_cmd = ""\n'),
        ]
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for label, content in invalid_configs:
                with self.subTest(case=label):
                    self._write_profile(root, content)
                    with self.assertRaises(ConductorError):
                        load_repo_profile(repo_root=root)


if __name__ == "__main__":
    unittest.main()
