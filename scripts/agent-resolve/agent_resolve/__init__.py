"""
Autonomous Issue Resolver package (`agent_resolve`).
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import types
from typing import Any

from agent_resolve import (
    cli,
    config,
    context,
    diagnostics,
    environment,
    exceptions,
    llm,
    models,
    patch_engine,
    pipeline,
    stages,
    tracker,
    vcs,
    verification,
)
from agent_resolve.vcs import (
    cleanup_feature_branch,
    fetch_maintainer_hints,
    gh_cli,
    preserve_failed_work,
    reset_working_tree_to_main,
    update_or_create_pr,
)
from agent_resolve.patch_engine import (
    PROTECTED_PATHS,
    apply_patch_manifest,
    reset_target_sources,
    safe_resolve_repo_path,
)
from agent_resolve.config import (
    BATCH_PACING_SECONDS,
    DEFAULT_EXECUTOR_MODELS,
    DEFAULT_PLANNER_MODELS,
    MAX_TOKENS_PER_ISSUE,
    PROJECT_ROOT,
    get_project_root,
    resolve_project_root,
    set_project_root,
)
from agent_resolve.environment import (
    SENSITIVE_ENV_KEYS,
    is_docker_available,
    log,
    run_cmd,
    run_isolated_test,
    sanitize_secrets,
)
from agent_resolve.verification import validate_jest_red_phase
from agent_resolve.exceptions import Stage2CompilationError
from agent_resolve.models import (
    BlueprintPlan,
    DiagnosticAction,
    DiagnosticResult,
    PatchChunk,
    PatchManifest,
    SourceStubEntry,
    T,
    TestFileEntry,
    TestFileManifest,
    TestPatchManifest,
)
from agent_resolve.tracker import TokenTracker
from agent_resolve.llm import (
    call_gemini_with_fallback,
    get_genai_client,
    is_transient_error,
)
from agent_resolve.context import (
    deduplicate_target_test_files,
    extract_agent_brief,
    extract_test_component_stem,
    extract_test_suite_names,
    find_related_test_files,
    get_project_context,
    get_repository_tree,
    is_issue_suitable_for_headless_agent,
)
from agent_resolve.diagnostics import (
    find_files,
    grep_search,
    parse_issue_diagnostics,
    read_file_snippet,
    strip_ansi,
    truncate_error_context,
)
from agent_resolve.stages import (
    stage_0_diagnose,
    stage_1_plan,
    stage_2_red,
    stage_3_green,
)
from agent_resolve.pipeline import resolve_issue, sanitize_resumption_test_targets
from agent_resolve.cli import main, parse_args

__version__: str = "0.1.0"


def _load_legacy_module() -> types.ModuleType:
    """Lazily loads `agent-resolve.py` as `agent_resolve._legacy` for incremental seam bridging."""
    legacy_name = "agent_resolve._legacy"
    existing = sys.modules.get(legacy_name)
    if isinstance(existing, types.ModuleType):
        existing.__dict__["PROJECT_ROOT"] = config.get_project_root()
        return existing

    script_path = Path(__file__).resolve().parent.parent / "agent-resolve.py"
    spec = importlib.util.spec_from_file_location(legacy_name, script_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Unable to load legacy script from {script_path}")
    legacy_mod = importlib.util.module_from_spec(spec)
    sys.modules[legacy_name] = legacy_mod
    spec.loader.exec_module(legacy_mod)
    legacy_mod.__dict__["PROJECT_ROOT"] = config.get_project_root()
    return legacy_mod


class _AgentResolveModule(types.ModuleType):
    """Module proxy propagating `PROJECT_ROOT` and monkeypatched attributes across submodules."""

    def __getattr__(self, name: str) -> Any:
        if name == "PROJECT_ROOT":
            return config.get_project_root()
        if name.startswith("__") and name.endswith("__"):
            raise AttributeError(name)
        legacy_mod = _load_legacy_module()
        if hasattr(legacy_mod, name):
            val = getattr(legacy_mod, name)
            self.__dict__[name] = val
            return val
        raise AttributeError(f"module '{__name__}' has no attribute '{name}'")

    def __setattr__(self, name: str, value: Any) -> None:
        if name == "PROJECT_ROOT":
            config.set_project_root(value)
            return
        super().__setattr__(name, value)
        for mod_name, submod in list(sys.modules.items()):
            if (
                (mod_name.startswith("agent_resolve.") or mod_name == "agent_resolve._legacy")
                and isinstance(submod, types.ModuleType)
                and name in submod.__dict__
            ):
                submod.__dict__[name] = value


sys.modules[__name__].__class__ = _AgentResolveModule

__all__: list[str] = [
    "__version__",
    "config",
    "environment",
    "models",
    "tracker",
    "exceptions",
    "verification",
    "PROJECT_ROOT",
    "DEFAULT_PLANNER_MODELS",
    "DEFAULT_EXECUTOR_MODELS",
    "MAX_TOKENS_PER_ISSUE",
    "BATCH_PACING_SECONDS",
    "resolve_project_root",
    "get_project_root",
    "set_project_root",
    "SENSITIVE_ENV_KEYS",
    "log",
    "sanitize_secrets",
    "run_cmd",
    "is_docker_available",
    "run_isolated_test",
    "T",
    "DiagnosticAction",
    "BlueprintPlan",
    "TestFileEntry",
    "SourceStubEntry",
    "TestFileManifest",
    "TestPatchManifest",
    "PatchChunk",
    "PatchManifest",
    "DiagnosticResult",
    "TokenTracker",
    "Stage2CompilationError",
    "validate_jest_red_phase",
    "patch_engine",
    "PROTECTED_PATHS",
    "apply_patch_manifest",
    "reset_target_sources",
    "safe_resolve_repo_path",
    "vcs",
    "cleanup_feature_branch",
    "fetch_maintainer_hints",
    "gh_cli",
    "preserve_failed_work",
    "reset_working_tree_to_main",
    "update_or_create_pr",
    "llm",
    "call_gemini_with_fallback",
    "get_genai_client",
    "is_transient_error",
    "context",
    "deduplicate_target_test_files",
    "extract_agent_brief",
    "extract_test_component_stem",
    "extract_test_suite_names",
    "find_related_test_files",
    "get_project_context",
    "get_repository_tree",
    "is_issue_suitable_for_headless_agent",
    "diagnostics",
    "find_files",
    "grep_search",
    "parse_issue_diagnostics",
    "read_file_snippet",
    "strip_ansi",
    "truncate_error_context",
    "stages",
    "stage_0_diagnose",
    "stage_1_plan",
    "stage_2_red",
    "stage_3_green",
    "pipeline",
    "resolve_issue",
    "sanitize_resumption_test_targets",
    "cli",
    "main",
    "parse_args",
]

