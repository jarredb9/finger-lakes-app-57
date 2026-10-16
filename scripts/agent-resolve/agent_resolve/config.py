"""Configuration defaults and repository root resolution for `agent_resolve`."""

from __future__ import annotations

import os
from pathlib import Path
import sys
import types


def resolve_project_root(start_path: Path | str | None = None) -> Path:
    """
    Resolves the repository root directory via an ancestor walk looking for
    `package.json` or `.git`. Falls back to depth-3 parent resolution if no
    repository marker exists in any ancestor (e.g. inside isolated temp dirs).
    """
    target = Path(__file__) if start_path is None else Path(start_path)
    resolved = target.resolve()
    search_dir = resolved if resolved.is_dir() else resolved.parent

    for candidate in (search_dir, *search_dir.parents):
        if (candidate / "package.json").is_file() or (candidate / ".git").exists():
            return candidate

    if resolved.is_dir():
        return resolved.parents[2] if len(resolved.parents) > 2 else resolved
    return resolved.parents[3] if len(resolved.parents) > 3 else resolved.parent


PROJECT_ROOT: Path = resolve_project_root()

# Canonical model configuration with strict hard-stop (no fallback downgrades)
DEFAULT_PLANNER_MODELS: list[str] = [
    os.environ.get("PLANNER_MODEL", "gemini-3.8-flash"),
]
DEFAULT_EXECUTOR_MODELS: list[str] = [
    os.environ.get("EXECUTOR_MODEL", "gemini-3.8-flash"),
]

# Token limits & safeguards
MAX_TOKENS_PER_ISSUE: int = int(os.environ.get("MAX_TOKENS_PER_ISSUE", "500000"))
BATCH_PACING_SECONDS: int = int(os.environ.get("BATCH_PACING_SECONDS", "5"))


def get_project_root() -> Path:
    """Returns the active repository root path."""
    return PROJECT_ROOT


def set_project_root(path: Path | str) -> Path:
    """
    Updates the active repository root path and synchronizes `PROJECT_ROOT`
    across `agent_resolve` and all loaded `agent_resolve.*` submodules.
    """
    global PROJECT_ROOT
    new_root = Path(path).resolve()
    PROJECT_ROOT = new_root

    for mod_name, mod in list(sys.modules.items()):
        if not isinstance(mod, types.ModuleType):
            continue
        if mod_name == "agent_resolve" or mod_name.startswith("agent_resolve."):
            if mod_name == "agent_resolve" or "PROJECT_ROOT" in mod.__dict__:
                mod.__dict__["PROJECT_ROOT"] = new_root

    return new_root


__all__ = [
    "PROJECT_ROOT",
    "DEFAULT_PLANNER_MODELS",
    "DEFAULT_EXECUTOR_MODELS",
    "MAX_TOKENS_PER_ISSUE",
    "BATCH_PACING_SECONDS",
    "resolve_project_root",
    "get_project_root",
    "set_project_root",
]
