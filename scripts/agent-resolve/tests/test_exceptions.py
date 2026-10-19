"""Unit tests for `agent_resolve.exceptions`."""

import unittest

from agent_resolve.exceptions import Stage2CompilationError


class TestExceptions(unittest.TestCase):
    def test_stage2_compilation_error_inherits_from_runtime_error(self) -> None:
        self.assertTrue(issubclass(Stage2CompilationError, RuntimeError))

    def test_stage2_compilation_error_preserves_message(self) -> None:
        msg = "TS2304: Cannot find name 'foo'"
        with self.assertRaises(Stage2CompilationError) as exc_ctx:
            raise Stage2CompilationError(msg)
        self.assertEqual(str(exc_ctx.exception), msg)

        with self.assertRaises(RuntimeError) as runtime_ctx:
            raise Stage2CompilationError(msg)
        self.assertEqual(str(runtime_ctx.exception), msg)


if __name__ == "__main__":
    unittest.main()
