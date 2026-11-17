"""Test package bootstrap for `conductor_tools`."""

from __future__ import annotations

from pathlib import Path
import sys

PACKAGE_ROOT: Path = Path(__file__).resolve().parent.parent
if str(PACKAGE_ROOT) not in sys.path:
    sys.path.insert(0, str(PACKAGE_ROOT))
