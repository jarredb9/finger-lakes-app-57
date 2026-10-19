#!/usr/bin/env python3
"""
Autonomous Issue Resolver Harness for GitHub Actions and Scheduled Nightly Runs.

Orchestrates multi-stage TDD resolution for triaged GitHub issues:
  Stage 1: Architectural Blueprint (gemini-3.8-flash) -> task-plan.md
  Stage 2: Red Phase Executor (gemini-3.8-flash) -> failing test suites with compiler self-healing
  Stage 3: Green Phase Executor (gemini-3.8-flash) -> search/replace patching + full regression gate

Enforces state-of-the-art autonomous agent best practices:
  - Provenance check: Issue must be authored by verified repository maintainer (jarredb9)
  - Hard-stop model policy: Standardized strictly on gemini-3.8-flash (no downgrades)
  - Ephemeral test isolation: Docker container with --network none and UID matching
  - Secret protection: actions/checkout persist-credentials: false & env scrubbing
  - Precision modifications: Pydantic PatchManifest search/replace engine (no whole-file rewrites)
  - TDD compiler gates: Red tests must compile (type-check clean) and fail; Green must pass full suite
  - Downstream CI triggering: GitHub App token minting with automatic ci.yml triggering
  - Git workspace isolation: Clean main resets between issues and on failure
"""

import argparse
from dataclasses import dataclass
from datetime import datetime, timezone
import json
import os
import random
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Type, TypeVar

try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(line_buffering=True)
except Exception:
    pass


import types
from pydantic import BaseModel, Field

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

_current_mod = sys.modules.get("agent_resolve")
if __name__ == "agent_resolve" and _current_mod is not None and getattr(_current_mod, "__path__", None) is None:
    _current_mod.__path__ = [str(_SCRIPT_DIR / "agent_resolve")]  # type: ignore[attr-defined]
    _current_mod.__package__ = "agent_resolve"

from agent_resolve import config as _ar_config
from agent_resolve import environment as _ar_environment
from agent_resolve import exceptions as _ar_exceptions
from agent_resolve import models as _ar_models
from agent_resolve import patch_engine as _ar_patch_engine
from agent_resolve import tracker as _ar_tracker
from agent_resolve import vcs as _ar_vcs
from agent_resolve import verification as _ar_verification
from agent_resolve import llm as _ar_llm
from agent_resolve.llm import (
    call_gemini_with_fallback,
    get_genai_client,
    is_transient_error,
)
from agent_resolve import context as _ar_context
from agent_resolve import diagnostics as _ar_diagnostics
from agent_resolve import stages as _ar_stages
from agent_resolve import pipeline as _ar_pipeline
from agent_resolve import cli as _ar_cli
from agent_resolve.cli import main, parse_args
from agent_resolve.context import (
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
)
from agent_resolve.tracker import TokenTracker


if __name__ == "agent_resolve" and _current_mod is not None and type(_current_mod).__name__ != "_AgentResolveModule":
    class _AgentResolveModule(types.ModuleType):
        def __getattr__(self, name: str) -> Any:
            if name == "PROJECT_ROOT":
                return _ar_config.get_project_root()
            raise AttributeError(f"module '{__name__}' has no attribute '{name}'")

        def __setattr__(self, name: str, value: Any) -> None:
            if name == "PROJECT_ROOT":
                _ar_config.set_project_root(value)
                return
            super().__setattr__(name, value)
            for mod_name, submod in list(sys.modules.items()):
                if (
                    mod_name.startswith("agent_resolve.")
                    and isinstance(submod, types.ModuleType)
                    and name in submod.__dict__
                ):
                    submod.__dict__[name] = value

    _current_mod.__class__ = _AgentResolveModule


# =========================================================================
# SUBPROCESS & GIT UTILITIES (delegated to agent_resolve.vcs)
# =========================================================================
gh_cli = _ar_vcs.gh_cli
reset_working_tree_to_main = _ar_vcs.reset_working_tree_to_main
cleanup_feature_branch = _ar_vcs.cleanup_feature_branch


# =========================================================================
# PATCH ENGINE & REPOSITORY PATH SAFETY (delegated to agent_resolve.patch_engine)
# =========================================================================
safe_resolve_repo_path = _ar_patch_engine.safe_resolve_repo_path
reset_target_sources = _ar_patch_engine.reset_target_sources
apply_patch_manifest = _ar_patch_engine.apply_patch_manifest



# =========================================================================
# GENAI CLIENT & RESILIENT INVOCATION (delegated to agent_resolve.llm)
# =========================================================================
get_genai_client = _ar_llm.get_genai_client
is_transient_error = _ar_llm.is_transient_error
call_gemini_with_fallback = _ar_llm.call_gemini_with_fallback


# =========================================================================
# REPOSITORY CONTEXT & SUITABILITY (delegated to agent_resolve.context)
# =========================================================================
get_repository_tree = _ar_context.get_repository_tree
get_project_context = _ar_context.get_project_context
find_related_test_files = _ar_context.find_related_test_files
extract_test_suite_names = _ar_context.extract_test_suite_names
is_issue_suitable_for_headless_agent = _ar_context.is_issue_suitable_for_headless_agent


# =========================================================================
# READ-ONLY REPOSITORY EXPLORATION TOOLS (delegated to agent_resolve.diagnostics)
# =========================================================================
grep_search = _ar_diagnostics.grep_search
find_files = _ar_diagnostics.find_files
read_file_snippet = _ar_diagnostics.read_file_snippet


# =========================================================================
# STAGE 0: DIAGNOSTIC EXPLORATION (delegated to agent_resolve.diagnostics)
# =========================================================================
parse_issue_diagnostics = _ar_diagnostics.parse_issue_diagnostics


stage_0_diagnose = _ar_stages.stage_0_diagnose
stage_1_plan = _ar_stages.stage_1_plan
stage_2_red = _ar_stages.stage_2_red
stage_3_green = _ar_stages.stage_3_green


# =========================================================================
# PR & ARTIFACT LIFECYCLE (delegated to agent_resolve.vcs)
# =========================================================================
fetch_maintainer_hints = _ar_vcs.fetch_maintainer_hints
update_or_create_pr = _ar_vcs.update_or_create_pr
preserve_failed_work = _ar_vcs.preserve_failed_work


resolve_issue = _ar_pipeline.resolve_issue


# =========================================================================
# CLI ENTRYPOINTS (delegated to agent_resolve.cli)
# =========================================================================
parse_args = _ar_cli.parse_args
main = _ar_cli.main


if __name__ == "__main__":
    main()
