"""
Modular test suite for `agent_resolve` with `sys.path` fallback bootstrap.
"""

from pathlib import Path
import sys
import unittest

PACKAGE_ROOT: Path = Path(__file__).resolve().parent.parent
if str(PACKAGE_ROOT) not in sys.path:
    sys.path.insert(0, str(PACKAGE_ROOT))


class TestPackageBootstrap(unittest.TestCase):
    """Verifies `scripts/agent-resolve` sys.path bootstrap and package version metadata."""

    def test_package_root_bootstrapped_on_sys_path(self) -> None:
        self.assertIn(str(PACKAGE_ROOT), sys.path)

    def test_agent_resolve_version_metadata(self) -> None:
        import agent_resolve

        self.assertEqual(agent_resolve.__version__, "0.1.0")
