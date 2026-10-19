#!/usr/bin/env python3
"""Autonomous Issue Resolver backward-compatible executable CLI shim."""

from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import types
from typing import Any

try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(line_buffering=True)
except Exception:
    pass

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

_current_mod = sys.modules.get(__name__)
if __name__ == "agent_resolve" and _current_mod is not None:
    _pkg_dir = _SCRIPT_DIR / "agent_resolve"
    if getattr(_current_mod, "__path__", None) is None:
        _current_mod.__path__ = [str(_pkg_dir)]
    _current_mod.__package__ = "agent_resolve"
    _init_path = _pkg_dir / "__init__.py"
    _spec = importlib.util.spec_from_file_location("agent_resolve", _init_path)
    if _spec and _spec.loader:
        _spec.loader.exec_module(_current_mod)
else:
    import agent_resolve
    from agent_resolve import *
    from agent_resolve import __all__ as _pkg_all

    __all__ = list(_pkg_all)
    for _sym in __all__:
        globals()[_sym] = getattr(agent_resolve, _sym)


class _ShimModuleProxy(types.ModuleType):
    """Proxy intercepting attribute mutations and propagating them to agent_resolve."""

    def __getattr__(self, name: str) -> Any:
        if name == "PROJECT_ROOT":
            return agent_resolve.config.get_project_root()
        submod = f"agent_resolve.{name}"
        if submod in sys.modules:
            return sys.modules[submod]
        if hasattr(agent_resolve, name):
            return getattr(agent_resolve, name)
        raise AttributeError(f"module '{__name__}' has no attribute '{name}'")

    def __setattr__(self, name: str, value: Any) -> None:
        if name == "PROJECT_ROOT":
            agent_resolve.config.set_project_root(value)
            self.__dict__["PROJECT_ROOT"] = value
            return
        super().__setattr__(name, value)
        if hasattr(agent_resolve, name) and agent_resolve is not self:
            setattr(agent_resolve, name, value)
        for mod_name, submod in list(sys.modules.items()):
            if (
                mod_name.startswith("agent_resolve.")
                and isinstance(submod, types.ModuleType)
                and name in submod.__dict__
            ):
                submod.__dict__[name] = value


if _current_mod is not None:
    _current_mod.__class__ = _ShimModuleProxy


if __name__ == "__main__":
    main()
