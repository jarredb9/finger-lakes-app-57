"""Declarative repository profile schema, generic built-in defaults, and strict TOML loader."""

from __future__ import annotations

from dataclasses import dataclass, field
import math
from pathlib import Path
import re
import tomllib
from typing import Any, Optional

from conductor_tools.models import ConductorError


def _default_efforts() -> dict[str, str]:
    """Return default reasoning effort levels per supervisor role."""
    return {
        "plan": "high",
        "exec": "high",
        "checkpoint": "medium",
        "review": "high",
    }


def _default_exempt_rules() -> dict[str, ExemptRule]:
    """Return generic, repo-agnostic exempt category defaults."""
    return {
        "docs": ExemptRule(
            commands=("git diff --name-only",),
            commit_prefix="docs",
            instruction="- Verify documentation changes with git diff --name-only (Docs exempt task).",
            diff_extensions=(".md", ".markdown"),
            require_non_empty_diff=True,
        ),
        "infra": ExemptRule(
            commands=(),
            commit_prefix="chore",
            instruction="- Verify infrastructure changes cleanly (Infra exempt task).",
        ),
        "scripts": ExemptRule(
            commands=(),
            commit_prefix="chore",
            instruction="- Verify script changes cleanly (Scripts exempt task).",
        ),
    }


@dataclass(frozen=True, slots=True)
class PlanningProfile:
    """Paths and optional style-guide guardrails for track planning."""

    tracks_dir: str = "conductor/tracks"
    archive_dir: str = "conductor/archive"
    tracks_registry: str = "conductor/tracks.md"
    style_guide_guardrail: Optional[str] = None
    guardrail_extensions: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class TypeCheckProfile:
    """Type-checking command and target file extensions."""

    cmd: Optional[str] = None
    extensions: tuple[str, ...] = ()
    check_tokens: tuple[str, ...] = ("type-check", "check-types")


@dataclass(frozen=True, slots=True)
class SuiteConfig:
    """Configuration for a repository test suite runner."""

    name: str
    full_cmd: str
    targeted_cmd: Optional[str] = None
    path_prefixes: tuple[str, ...] = ()
    path_suffixes: tuple[str, ...] = ()
    exclude_suffixes: tuple[str, ...] = ()
    keywords: tuple[str, ...] = ()
    include_in_full_suite: bool = False
    is_python: bool = False


@dataclass(frozen=True, slots=True)
class DomainRule:
    """Rule for classifying a phase into a domain and selecting fallback checks."""

    path_prefixes: tuple[str, ...] = ()
    exact_paths: tuple[str, ...] = ()
    path_substrings: tuple[str, ...] = ()
    keywords: tuple[str, ...] = ()
    fallback_cmds: tuple[str, ...] = ()
    manual_verification_prompt: Optional[str] = None
    priority: int = 0


@dataclass(frozen=True, slots=True)
class ExemptRule:
    """Verification and commit rules for `[exempt: <category>]` tasks."""

    commands: tuple[str, ...] = ()
    commit_prefix: str = "chore"
    instruction: str = ""
    diff_extensions: tuple[str, ...] = ()
    require_non_empty_diff: bool = False


@dataclass(frozen=True, slots=True)
class PathRules:
    """Generic file classification patterns for tests, metadata, code, and logs."""

    test_dirs: tuple[str, ...] = ("tests", "test", "__tests__")
    test_suffixes: tuple[str, ...] = (
        ".test.ts",
        ".test.tsx",
        ".test.js",
        ".test.jsx",
        ".spec.ts",
        ".spec.tsx",
        ".spec.js",
        ".spec.jsx",
        "_test.py",
        "_test.go",
    )
    test_prefixes: tuple[str, ...] = ("test_",)
    metadata_prefixes: tuple[str, ...] = (
        "conductor/",
        ".conductor/",
        ".gemini/",
        ".claude/",
        ".agents/",
    )
    code_prefixes: tuple[str, ...] = ("src/", "lib/", "scripts/", "tests/", "test/")
    code_extensions: tuple[str, ...] = (
        ".py",
        ".ts",
        ".tsx",
        ".js",
        ".jsx",
        ".go",
        ".rs",
        ".sql",
        ".css",
        ".html",
    )
    manifest_files: tuple[str, ...] = (
        "pyproject.toml",
        "package.json",
        "tsconfig.json",
        "Cargo.toml",
        "go.mod",
    )
    ephemeral_patterns: tuple[str, ...] = (
        r"^conductor/(?:tracks|archive)/[^/]+/(?:phase-\d+-task-\d+-plan\.md|phase-\d+-review\.md|logs(?:/.*)?)$",
    )
    log_patterns: tuple[str, ...] = (
        r"^conductor/(?:tracks|archive)/[^/]+/logs(?:/.*)?$",
    )


@dataclass(frozen=True, slots=True)
class SupervisorProfile:
    """Verification, commit auditing, and execution timeout settings for the supervisor."""

    static_analysis_prefixes: tuple[str, ...] = ("eslint", "tsc", "ruff", "mypy")
    default_test_cmd: str = "pytest"
    full_suite_keywords: tuple[str, ...] = (
        "full automated",
        "full test suite",
        "full regression",
        "regression test execution",
        "regression verification",
        "type verification",
        "quality gates",
        "repository-wide verification",
    )
    conventional_commit_types: tuple[str, ...] = (
        "feat",
        "fix",
        "test",
        "refactor",
        "perf",
        "style",
        "chore",
        "docs",
        "types",
        "conductor",
    )
    required_note_fields: tuple[str, ...] = ("Task:", "Summary:", "Files:", "Rationale:")
    review_severity_pattern: str = r"^###\s+\[?(Critical|High)(?:\]|(?=$|[\s:]))"
    default_timeout_seconds: float = 1800.0
    default_heartbeat_interval: float = 30.0


@dataclass(frozen=True, slots=True)
class SafetyProfile:
    """Command allowlisting and mutation-filtering rules."""

    command_prefixes: tuple[str, ...] = (
        "npm ",
        "npx ",
        "node ",
        "pytest ",
        "python3",
        "python ",
        "cargo ",
        "go ",
    )
    allowed_verification_tokens: tuple[str, ...] = (
        "pytest",
        "python3 -m unittest",
        "python -m unittest",
        "npm test",
        "npm run test",
        "npm run lint",
        "npm run build",
        "cargo test",
        "go test",
    )
    mutating_cmd_patterns: tuple[str, ...] = ()
    mutating_git_prefixes: tuple[str, ...] = (
        "git add",
        "git commit",
        "git notes",
        "git push",
        "git checkout",
        "git reset",
        "rm ",
    )


@dataclass(frozen=True, slots=True)
class ModelsProfile:
    """Default model family, per-role efforts, and brain directory configuration."""

    family: str = "gemini-4-hydrogen"
    efforts: dict[str, str] = field(default_factory=_default_efforts)
    default_brain_dir: str = "~/.gemini/antigravity-cli/brain"


@dataclass(frozen=True, slots=True)
class RepoProfile:
    """Aggregated repository profile driving strategy, templates, paths, and supervisor gates."""

    planning: PlanningProfile = field(default_factory=PlanningProfile)
    type_check: TypeCheckProfile = field(default_factory=TypeCheckProfile)
    suites: tuple[SuiteConfig, ...] = ()
    domains: dict[str, DomainRule] = field(default_factory=dict)
    exempt: dict[str, ExemptRule] = field(default_factory=_default_exempt_rules)
    paths: PathRules = field(default_factory=PathRules)
    supervisor: SupervisorProfile = field(default_factory=SupervisorProfile)
    safety: SafetyProfile = field(default_factory=SafetyProfile)
    models: ModelsProfile = field(default_factory=ModelsProfile)


_ALLOWED_TOP_LEVEL_SECTIONS = frozenset({
    "planning",
    "type_check",
    "suites",
    "domains",
    "exempt",
    "paths",
    "supervisor",
    "safety",
    "models",
})

_ALLOWED_PLANNING_KEYS = frozenset({
    "tracks_dir",
    "archive_dir",
    "tracks_registry",
    "style_guide_guardrail",
    "guardrail_extensions",
})

_ALLOWED_TYPE_CHECK_KEYS = frozenset({
    "cmd",
    "extensions",
    "check_tokens",
})

_ALLOWED_SUITE_KEYS = frozenset({
    "name",
    "full_cmd",
    "targeted_cmd",
    "path_prefixes",
    "path_suffixes",
    "exclude_suffixes",
    "keywords",
    "include_in_full_suite",
    "is_python",
})

_ALLOWED_DOMAIN_KEYS = frozenset({
    "path_prefixes",
    "exact_paths",
    "path_substrings",
    "keywords",
    "fallback_cmds",
    "manual_verification_prompt",
    "priority",
})

_ALLOWED_EXEMPT_KEYS = frozenset({
    "commands",
    "commit_prefix",
    "instruction",
    "diff_extensions",
    "require_non_empty_diff",
})

_ALLOWED_PATHS_KEYS = frozenset({
    "test_dirs",
    "test_suffixes",
    "test_prefixes",
    "metadata_prefixes",
    "code_prefixes",
    "code_extensions",
    "manifest_files",
    "ephemeral_patterns",
    "log_patterns",
})

_ALLOWED_SUPERVISOR_KEYS = frozenset({
    "static_analysis_prefixes",
    "default_test_cmd",
    "full_suite_keywords",
    "conventional_commit_types",
    "required_note_fields",
    "review_severity_pattern",
    "default_timeout_seconds",
    "default_heartbeat_interval",
})

_ALLOWED_SAFETY_KEYS = frozenset({
    "command_prefixes",
    "allowed_verification_tokens",
    "mutating_cmd_patterns",
    "mutating_git_prefixes",
})

_ALLOWED_MODELS_KEYS = frozenset({
    "family",
    "efforts",
    "default_brain_dir",
})


def _as_table(val: Any, ctx: str) -> dict[str, Any]:
    """Validate that `val` is a TOML table (dict)."""
    if not isinstance(val, dict):
        raise ConductorError(f"Invalid {ctx}: expected table, got {type(val).__name__}")
    return val


def _validate_allowed_keys(raw: dict[str, Any], allowed: frozenset[str], ctx: str) -> None:
    """Reject unknown configuration keys with `ConductorError`."""
    unknown = sorted(set(raw.keys()) - allowed)
    if unknown:
        raise ConductorError(f"Unknown key(s) in {ctx}: {', '.join(unknown)}")


def _as_str(val: Any, ctx: str) -> str:
    """Validate that `val` is a string."""
    if not isinstance(val, str):
        raise ConductorError(f"Invalid {ctx}: expected string, got {type(val).__name__}")
    return val


def _as_nonempty_str(val: Any, ctx: str) -> str:
    """Validate that `val` is a non-empty, non-whitespace string."""
    if not isinstance(val, str) or not val.strip():
        raise ConductorError(f"Invalid {ctx}: expected non-empty string")
    return val


def _as_bool(val: Any, ctx: str) -> bool:
    """Validate that `val` is a boolean."""
    if not isinstance(val, bool):
        raise ConductorError(f"Invalid {ctx}: expected boolean, got {type(val).__name__}")
    return val


def _as_int(val: Any, ctx: str) -> int:
    """Validate that `val` is an integer (excluding booleans)."""
    if not isinstance(val, int) or isinstance(val, bool):
        raise ConductorError(f"Invalid {ctx}: expected integer, got {type(val).__name__}")
    return val


def _as_float(val: Any, ctx: str) -> float:
    """Validate that `val` is an int or float (excluding booleans)."""
    if not isinstance(val, (int, float)) or isinstance(val, bool):
        raise ConductorError(f"Invalid {ctx}: expected number, got {type(val).__name__}")
    return float(val)


def _as_positive_float(val: Any, ctx: str) -> float:
    """Validate that `val` is a finite positive number (excluding booleans)."""
    parsed = _as_float(val, ctx)
    if not math.isfinite(parsed) or parsed <= 0.0:
        raise ConductorError(f"Invalid {ctx}: expected finite number > 0, got {val!r}")
    return parsed


def _as_str_tuple(val: Any, ctx: str) -> tuple[str, ...]:
    """Validate that `val` is a list of strings and convert to a tuple."""
    if not isinstance(val, list) or not all(isinstance(item, str) for item in val):
        raise ConductorError(f"Invalid {ctx}: expected list of strings")
    return tuple(val)


def _compile_regex(pattern: str, ctx: str) -> None:
    """Compile a regex string, raising `ConductorError` if invalid."""
    try:
        re.compile(pattern)
    except re.error as exc:
        raise ConductorError(f"Invalid regex in {ctx}: {pattern!r} ({exc})") from exc


def _parse_planning(raw: dict[str, Any]) -> PlanningProfile:
    """Parse `[planning]` overrides onto `PlanningProfile` defaults."""
    _validate_allowed_keys(raw, _ALLOWED_PLANNING_KEYS, "[planning]")
    defaults = PlanningProfile()
    return PlanningProfile(
        tracks_dir=(
            _as_nonempty_str(raw["tracks_dir"], "planning.tracks_dir")
            if "tracks_dir" in raw
            else defaults.tracks_dir
        ),
        archive_dir=(
            _as_nonempty_str(raw["archive_dir"], "planning.archive_dir")
            if "archive_dir" in raw
            else defaults.archive_dir
        ),
        tracks_registry=(
            _as_nonempty_str(raw["tracks_registry"], "planning.tracks_registry")
            if "tracks_registry" in raw
            else defaults.tracks_registry
        ),
        style_guide_guardrail=(
            _as_str(raw["style_guide_guardrail"], "planning.style_guide_guardrail")
            if "style_guide_guardrail" in raw
            else defaults.style_guide_guardrail
        ),
        guardrail_extensions=(
            _as_str_tuple(raw["guardrail_extensions"], "planning.guardrail_extensions")
            if "guardrail_extensions" in raw
            else defaults.guardrail_extensions
        ),
    )


def _parse_type_check(raw: dict[str, Any]) -> TypeCheckProfile:
    """Parse `[type_check]` overrides onto `TypeCheckProfile` defaults."""
    _validate_allowed_keys(raw, _ALLOWED_TYPE_CHECK_KEYS, "[type_check]")
    defaults = TypeCheckProfile()
    return TypeCheckProfile(
        cmd=_as_str(raw["cmd"], "type_check.cmd") if "cmd" in raw else defaults.cmd,
        extensions=(
            _as_str_tuple(raw["extensions"], "type_check.extensions")
            if "extensions" in raw
            else defaults.extensions
        ),
        check_tokens=(
            _as_str_tuple(raw["check_tokens"], "type_check.check_tokens")
            if "check_tokens" in raw
            else defaults.check_tokens
        ),
    )


def _parse_suites(raw_list: Any) -> tuple[SuiteConfig, ...]:
    """Parse `[[suites]]` array of tables."""
    if not isinstance(raw_list, list):
        raise ConductorError(f"Invalid [[suites]]: expected array of tables, got {type(raw_list).__name__}")
    suites: list[SuiteConfig] = []
    for idx, item in enumerate(raw_list):
        ctx = f"suites[{idx}]"
        entry = _as_table(item, ctx)
        _validate_allowed_keys(entry, _ALLOWED_SUITE_KEYS, ctx)
        if "name" not in entry:
            raise ConductorError(f"Missing required field {ctx}.name")
        if "full_cmd" not in entry:
            raise ConductorError(f"Missing required field {ctx}.full_cmd")
        suites.append(
            SuiteConfig(
                name=_as_nonempty_str(entry["name"], f"{ctx}.name"),
                full_cmd=_as_nonempty_str(entry["full_cmd"], f"{ctx}.full_cmd"),
                targeted_cmd=(
                    _as_str(entry["targeted_cmd"], f"{ctx}.targeted_cmd")
                    if "targeted_cmd" in entry
                    else None
                ),
                path_prefixes=(
                    _as_str_tuple(entry["path_prefixes"], f"{ctx}.path_prefixes")
                    if "path_prefixes" in entry
                    else ()
                ),
                path_suffixes=(
                    _as_str_tuple(entry["path_suffixes"], f"{ctx}.path_suffixes")
                    if "path_suffixes" in entry
                    else ()
                ),
                exclude_suffixes=(
                    _as_str_tuple(entry["exclude_suffixes"], f"{ctx}.exclude_suffixes")
                    if "exclude_suffixes" in entry
                    else ()
                ),
                keywords=(
                    _as_str_tuple(entry["keywords"], f"{ctx}.keywords")
                    if "keywords" in entry
                    else ()
                ),
                include_in_full_suite=(
                    _as_bool(entry["include_in_full_suite"], f"{ctx}.include_in_full_suite")
                    if "include_in_full_suite" in entry
                    else False
                ),
                is_python=(
                    _as_bool(entry["is_python"], f"{ctx}.is_python")
                    if "is_python" in entry
                    else False
                ),
            )
        )
    return tuple(suites)


def _parse_domains(raw: dict[str, Any]) -> dict[str, DomainRule]:
    """Parse `[domains.<name>]` rule tables."""
    domains: dict[str, DomainRule] = {}
    for name, val in raw.items():
        if not isinstance(name, str) or not name.strip():
            raise ConductorError("Invalid [domains] key: expected non-empty string")
        ctx = f"[domains.{name}]"
        entry = _as_table(val, ctx)
        _validate_allowed_keys(entry, _ALLOWED_DOMAIN_KEYS, ctx)
        domains[name] = DomainRule(
            path_prefixes=(
                _as_str_tuple(entry["path_prefixes"], f"{ctx}.path_prefixes")
                if "path_prefixes" in entry
                else ()
            ),
            exact_paths=(
                _as_str_tuple(entry["exact_paths"], f"{ctx}.exact_paths")
                if "exact_paths" in entry
                else ()
            ),
            path_substrings=(
                _as_str_tuple(entry["path_substrings"], f"{ctx}.path_substrings")
                if "path_substrings" in entry
                else ()
            ),
            keywords=(
                _as_str_tuple(entry["keywords"], f"{ctx}.keywords")
                if "keywords" in entry
                else ()
            ),
            fallback_cmds=(
                _as_str_tuple(entry["fallback_cmds"], f"{ctx}.fallback_cmds")
                if "fallback_cmds" in entry
                else ()
            ),
            manual_verification_prompt=(
                _as_str(entry["manual_verification_prompt"], f"{ctx}.manual_verification_prompt")
                if "manual_verification_prompt" in entry
                else None
            ),
            priority=(
                _as_int(entry["priority"], f"{ctx}.priority")
                if "priority" in entry
                else 0
            ),
        )
    return domains


def _parse_exempt(raw: dict[str, Any]) -> dict[str, ExemptRule]:
    """Parse `[exempt.<category>]` rule tables with normalized lowercase keys."""
    exempt: dict[str, ExemptRule] = {}
    for raw_key, val in raw.items():
        if not isinstance(raw_key, str) or not raw_key.strip():
            raise ConductorError("Invalid [exempt] key: expected non-empty string")
        key = raw_key.strip().lower()
        if key in exempt:
            raise ConductorError(f"Duplicate normalized [exempt] category: {key!r}")
        ctx = f"[exempt.{raw_key}]"
        entry = _as_table(val, ctx)
        _validate_allowed_keys(entry, _ALLOWED_EXEMPT_KEYS, ctx)
        exempt[key] = ExemptRule(
            commands=(
                _as_str_tuple(entry["commands"], f"{ctx}.commands")
                if "commands" in entry
                else ()
            ),
            commit_prefix=(
                _as_nonempty_str(entry["commit_prefix"], f"{ctx}.commit_prefix")
                if "commit_prefix" in entry
                else "chore"
            ),
            instruction=(
                _as_str(entry["instruction"], f"{ctx}.instruction")
                if "instruction" in entry
                else ""
            ),
            diff_extensions=(
                _as_str_tuple(entry["diff_extensions"], f"{ctx}.diff_extensions")
                if "diff_extensions" in entry
                else ()
            ),
            require_non_empty_diff=(
                _as_bool(entry["require_non_empty_diff"], f"{ctx}.require_non_empty_diff")
                if "require_non_empty_diff" in entry
                else False
            ),
        )
    return exempt


def _parse_paths(raw: dict[str, Any]) -> PathRules:
    """Parse `[paths]` overrides and validate regex syntax."""
    _validate_allowed_keys(raw, _ALLOWED_PATHS_KEYS, "[paths]")
    defaults = PathRules()
    ephemeral_patterns = (
        _as_str_tuple(raw["ephemeral_patterns"], "paths.ephemeral_patterns")
        if "ephemeral_patterns" in raw
        else defaults.ephemeral_patterns
    )
    log_patterns = (
        _as_str_tuple(raw["log_patterns"], "paths.log_patterns")
        if "log_patterns" in raw
        else defaults.log_patterns
    )
    for idx, pat in enumerate(ephemeral_patterns):
        _compile_regex(pat, f"paths.ephemeral_patterns[{idx}]")
    for idx, pat in enumerate(log_patterns):
        _compile_regex(pat, f"paths.log_patterns[{idx}]")

    return PathRules(
        test_dirs=(
            _as_str_tuple(raw["test_dirs"], "paths.test_dirs")
            if "test_dirs" in raw
            else defaults.test_dirs
        ),
        test_suffixes=(
            _as_str_tuple(raw["test_suffixes"], "paths.test_suffixes")
            if "test_suffixes" in raw
            else defaults.test_suffixes
        ),
        test_prefixes=(
            _as_str_tuple(raw["test_prefixes"], "paths.test_prefixes")
            if "test_prefixes" in raw
            else defaults.test_prefixes
        ),
        metadata_prefixes=(
            _as_str_tuple(raw["metadata_prefixes"], "paths.metadata_prefixes")
            if "metadata_prefixes" in raw
            else defaults.metadata_prefixes
        ),
        code_prefixes=(
            _as_str_tuple(raw["code_prefixes"], "paths.code_prefixes")
            if "code_prefixes" in raw
            else defaults.code_prefixes
        ),
        code_extensions=(
            _as_str_tuple(raw["code_extensions"], "paths.code_extensions")
            if "code_extensions" in raw
            else defaults.code_extensions
        ),
        manifest_files=(
            _as_str_tuple(raw["manifest_files"], "paths.manifest_files")
            if "manifest_files" in raw
            else defaults.manifest_files
        ),
        ephemeral_patterns=ephemeral_patterns,
        log_patterns=log_patterns,
    )


def _parse_supervisor(raw: dict[str, Any]) -> SupervisorProfile:
    """Parse `[supervisor]` overrides and validate `review_severity_pattern`."""
    _validate_allowed_keys(raw, _ALLOWED_SUPERVISOR_KEYS, "[supervisor]")
    defaults = SupervisorProfile()
    severity_pattern = (
        _as_str(raw["review_severity_pattern"], "supervisor.review_severity_pattern")
        if "review_severity_pattern" in raw
        else defaults.review_severity_pattern
    )
    _compile_regex(severity_pattern, "supervisor.review_severity_pattern")

    return SupervisorProfile(
        static_analysis_prefixes=(
            _as_str_tuple(raw["static_analysis_prefixes"], "supervisor.static_analysis_prefixes")
            if "static_analysis_prefixes" in raw
            else defaults.static_analysis_prefixes
        ),
        default_test_cmd=(
            _as_nonempty_str(raw["default_test_cmd"], "supervisor.default_test_cmd")
            if "default_test_cmd" in raw
            else defaults.default_test_cmd
        ),
        full_suite_keywords=(
            _as_str_tuple(raw["full_suite_keywords"], "supervisor.full_suite_keywords")
            if "full_suite_keywords" in raw
            else defaults.full_suite_keywords
        ),
        conventional_commit_types=(
            _as_str_tuple(raw["conventional_commit_types"], "supervisor.conventional_commit_types")
            if "conventional_commit_types" in raw
            else defaults.conventional_commit_types
        ),
        required_note_fields=(
            _as_str_tuple(raw["required_note_fields"], "supervisor.required_note_fields")
            if "required_note_fields" in raw
            else defaults.required_note_fields
        ),
        review_severity_pattern=severity_pattern,
        default_timeout_seconds=(
            _as_positive_float(raw["default_timeout_seconds"], "supervisor.default_timeout_seconds")
            if "default_timeout_seconds" in raw
            else defaults.default_timeout_seconds
        ),
        default_heartbeat_interval=(
            _as_positive_float(raw["default_heartbeat_interval"], "supervisor.default_heartbeat_interval")
            if "default_heartbeat_interval" in raw
            else defaults.default_heartbeat_interval
        ),
    )


def _parse_safety(raw: dict[str, Any]) -> SafetyProfile:
    """Parse `[safety]` overrides and validate `mutating_cmd_patterns` regexes."""
    _validate_allowed_keys(raw, _ALLOWED_SAFETY_KEYS, "[safety]")
    defaults = SafetyProfile()
    mutating_cmd_patterns = (
        _as_str_tuple(raw["mutating_cmd_patterns"], "safety.mutating_cmd_patterns")
        if "mutating_cmd_patterns" in raw
        else defaults.mutating_cmd_patterns
    )
    for idx, pat in enumerate(mutating_cmd_patterns):
        _compile_regex(pat, f"safety.mutating_cmd_patterns[{idx}]")

    return SafetyProfile(
        command_prefixes=(
            _as_str_tuple(raw["command_prefixes"], "safety.command_prefixes")
            if "command_prefixes" in raw
            else defaults.command_prefixes
        ),
        allowed_verification_tokens=(
            _as_str_tuple(raw["allowed_verification_tokens"], "safety.allowed_verification_tokens")
            if "allowed_verification_tokens" in raw
            else defaults.allowed_verification_tokens
        ),
        mutating_cmd_patterns=mutating_cmd_patterns,
        mutating_git_prefixes=(
            _as_str_tuple(raw["mutating_git_prefixes"], "safety.mutating_git_prefixes")
            if "mutating_git_prefixes" in raw
            else defaults.mutating_git_prefixes
        ),
    )


def _parse_models(raw: dict[str, Any]) -> ModelsProfile:
    """Parse `[models]` overrides, merging `[models.efforts]` per role key."""
    _validate_allowed_keys(raw, _ALLOWED_MODELS_KEYS, "[models]")
    defaults = ModelsProfile()
    efforts = _default_efforts()
    if "efforts" in raw:
        raw_efforts = _as_table(raw["efforts"], "[models.efforts]")
        for role, effort in raw_efforts.items():
            role_key = _as_nonempty_str(role, "models.efforts key")
            efforts[role_key] = _as_nonempty_str(effort, f"models.efforts.{role_key}")

    return ModelsProfile(
        family=(
            _as_nonempty_str(raw["family"], "models.family")
            if "family" in raw
            else defaults.family
        ),
        efforts=efforts,
        default_brain_dir=(
            _as_nonempty_str(raw["default_brain_dir"], "models.default_brain_dir")
            if "default_brain_dir" in raw
            else defaults.default_brain_dir
        ),
    )


def load_repo_profile(
    repo_root: Optional[Path] = None,
    profile_path: Optional[Path] = None,
) -> RepoProfile:
    """Load `RepoProfile` from TOML, falling back to generic defaults when unconfigured."""
    if profile_path is not None:
        resolved_path = Path(profile_path)
        if not resolved_path.is_file():
            raise ConductorError(f"Profile file not found: {resolved_path}")
    elif repo_root is not None:
        resolved_path = Path(repo_root) / "conductor" / "profile.toml"
        if not resolved_path.is_file():
            return RepoProfile()
    else:
        return RepoProfile()

    try:
        with resolved_path.open("rb") as fh:
            raw = tomllib.load(fh)
    except (tomllib.TOMLDecodeError, OSError) as exc:
        raise ConductorError(f"Failed to load profile {resolved_path}: {exc}") from exc

    _validate_allowed_keys(raw, _ALLOWED_TOP_LEVEL_SECTIONS, "profile.toml")
    defaults = RepoProfile()

    return RepoProfile(
        planning=(
            _parse_planning(_as_table(raw["planning"], "[planning]"))
            if "planning" in raw
            else defaults.planning
        ),
        type_check=(
            _parse_type_check(_as_table(raw["type_check"], "[type_check]"))
            if "type_check" in raw
            else defaults.type_check
        ),
        suites=(
            _parse_suites(raw["suites"])
            if "suites" in raw
            else defaults.suites
        ),
        domains=(
            _parse_domains(_as_table(raw["domains"], "[domains]"))
            if "domains" in raw
            else defaults.domains
        ),
        exempt=(
            _parse_exempt(_as_table(raw["exempt"], "[exempt]"))
            if "exempt" in raw
            else defaults.exempt
        ),
        paths=(
            _parse_paths(_as_table(raw["paths"], "[paths]"))
            if "paths" in raw
            else defaults.paths
        ),
        supervisor=(
            _parse_supervisor(_as_table(raw["supervisor"], "[supervisor]"))
            if "supervisor" in raw
            else defaults.supervisor
        ),
        safety=(
            _parse_safety(_as_table(raw["safety"], "[safety]"))
            if "safety" in raw
            else defaults.safety
        ),
        models=(
            _parse_models(_as_table(raw["models"], "[models]"))
            if "models" in raw
            else defaults.models
        ),
    )


__all__ = [
    "DomainRule",
    "ExemptRule",
    "ModelsProfile",
    "PathRules",
    "PlanningProfile",
    "RepoProfile",
    "SafetyProfile",
    "SuiteConfig",
    "SupervisorProfile",
    "TypeCheckProfile",
    "load_repo_profile",
]
