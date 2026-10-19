"""
Jest Red phase test verification and diagnostic engine (`agent_resolve.verification`).
"""

from __future__ import annotations

import json
import re
from typing import Any


def validate_jest_red_phase(t_code: int, t_out: str, t_err: str) -> tuple[bool, str]:
    """
    Validates that a Jest test run failed as expected for a strict TDD Red Phase.
    A valid Red Phase failure MUST:
      1. Exit with non-zero exit code (t_code != 0).
      2. NOT pass (t_code == 0 is an immediate invariant violation).
      3. NOT crash with fatal harness errors (numRuntimeErrorTestSuites > 0, testExecError,
         fatal errors in lifecycle hooks like beforeEach/beforeAll, or Cannot redefine property).
      4. Contain verified test-level assertion or unimplemented function failures (expect(...) or fn() is not a function).
    Returns (is_valid, error_diagnostics).
    """
    if t_code == 0:
        return False, "Red phase invariant violated: newly authored tests unexpectedly passed before implementation."

    full_output = f"{t_out}\n{t_err}".strip()

    # 1. Inspect structured JSON output if present
    json_match = re.search(r"(\{[\s\S]*\"testResults\"[\s\S]*\})", t_out)
    if json_match:
        try:
            data = json.loads(json_match.group(1))
            num_runtime_errs = data.get("numRuntimeErrorTestSuites", 0)
            if num_runtime_errs > 0:
                return False, f"Jest reported {num_runtime_errs} test suite(s) with fatal runtime errors."

            test_results = data.get("testResults", [])
            has_valid_failure = False

            for suite in test_results:
                if suite.get("testExecError"):
                    msg = suite["testExecError"].get("message", "Unknown test execution error")
                    first_lines = "\n".join(msg.strip().splitlines()[:10])
                    return False, f"Test suite execution failed with fatal error:\n{first_lines}"

                for assertion in suite.get("assertionResults", []):
                    if assertion.get("status") == "failed":
                        failure_msgs = assertion.get("failureMessages", [])
                        joined_failures = "\n".join(failure_msgs)

                        # Detect fatal lifecycle hook or unconfigurable environment crashes
                        is_hook_crash = False
                        if "Cannot redefine property:" in joined_failures:
                            is_hook_crash = True
                        elif re.search(r"(beforeAll|beforeEach|afterEach|afterAll)\s+hook", joined_failures, re.IGNORECASE):
                            is_hook_crash = True

                        if is_hook_crash:
                            first_lines = "\n".join(joined_failures.strip().splitlines()[:10])
                            return False, f"Test suite crashed with fatal hook/harness error:\n{first_lines}"

                        has_valid_failure = True

            if not has_valid_failure and data.get("numFailedTests", 0) == 0:
                return False, "No test failures recorded in test results."

            return True, ""
        except json.JSONDecodeError:
            pass

    # 2. CLI fallback (when --json wasn't parsed or CLI text output received)
    fatal_patterns = [
        r"Cannot redefine property:",
        r"Jest encountered an unexpected token",
        r"Test suite failed to run",
        r"SyntaxError:",
    ]
    for pattern in fatal_patterns:
        match = re.search(pattern, full_output, re.IGNORECASE)
        if match:
            lines = full_output.splitlines()
            error_context = []
            for idx, line in enumerate(lines):
                if re.search(pattern, line, re.IGNORECASE):
                    start = max(0, idx - 2)
                    end = min(len(lines), idx + 8)
                    error_context = lines[start:end]
                    break
            diag = "\n".join(error_context) if error_context else match.group(0)
            return False, f"Test suite crashed with fatal runtime/harness error:\n{diag}"

    # Verify presence of test failure markers
    if any(marker in full_output for marker in ["FAIL ", "● ", "expect(", "is not a function", "Received:"]):
        return True, ""

    return False, f"Tests failed with exit code {t_code}, but failure did not match expected assertion failure pattern."


__all__: list[str] = [
    "validate_jest_red_phase",
]
