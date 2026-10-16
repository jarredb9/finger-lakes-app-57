"""Unit tests for `agent_resolve.verification` (TDD Red Phase)."""

import json
import unittest

import agent_resolve
from agent_resolve.verification import validate_jest_red_phase


class TestVerification(unittest.TestCase):
    def test_validate_jest_red_phase_rejects_passing_tests(self) -> None:
        is_valid, diag = validate_jest_red_phase(0, "All tests passed", "")
        self.assertFalse(is_valid)
        self.assertEqual(
            diag,
            "Red phase invariant violated: newly authored tests unexpectedly passed before implementation.",
        )

    def test_validate_jest_red_phase_rejects_cli_runtime_crash(self) -> None:
        crashes = [
            "TypeError: Cannot redefine property: fetch",
            "SyntaxError: Jest encountered an unexpected token in foo.ts",
            "Test suite failed to run: ReferenceError: window is not defined",
            "SyntaxError: Unexpected identifier 'bar'",
        ]
        for crash_msg in crashes:
            with self.subTest(crash=crash_msg):
                output = f"Header line\n{crash_msg}\nFooter line"
                is_valid, diag = validate_jest_red_phase(1, output, "")
                self.assertFalse(is_valid)
                self.assertTrue(
                    diag.startswith("Test suite crashed with fatal runtime/harness error:\n"),
                    f"Unexpected diagnostic: {diag}",
                )
                self.assertIn(crash_msg, diag)

    def test_validate_jest_red_phase_accepts_structured_json_assertion_failure(self) -> None:
        data = {
            "numFailedTests": 1,
            "numPassedTests": 0,
            "numRuntimeErrorTestSuites": 0,
            "testResults": [
                {
                    "testFilePath": "/app/test/example.spec.ts",
                    "assertionResults": [
                        {
                            "status": "failed",
                            "title": "should calculate total properly",
                            "failureMessages": [
                                "Error: expect(received).toBe(expected)\n\nExpected: 2\nReceived: 1\n    at Object.<anonymous> (/app/test/example.spec.ts:10:5)"
                            ],
                        }
                    ],
                }
            ],
        }
        raw_out = f"Running tests...\n{json.dumps(data)}\nDone."
        is_valid, diag = validate_jest_red_phase(1, raw_out, "")
        self.assertTrue(is_valid)
        self.assertEqual(diag, "")

    def test_validate_jest_red_phase_rejects_structured_json_runtime_error_suites(self) -> None:
        data = {
            "numFailedTests": 0,
            "numPassedTests": 0,
            "numRuntimeErrorTestSuites": 2,
            "testResults": [],
        }
        is_valid, diag = validate_jest_red_phase(1, json.dumps(data), "")
        self.assertFalse(is_valid)
        self.assertEqual(diag, "Jest reported 2 test suite(s) with fatal runtime errors.")

    def test_validate_jest_red_phase_rejects_structured_json_test_exec_error(self) -> None:
        data = {
            "numFailedTests": 0,
            "numPassedTests": 0,
            "numRuntimeErrorTestSuites": 0,
            "testResults": [
                {
                    "testFilePath": "/app/test/crash.spec.ts",
                    "testExecError": {
                        "message": "TypeError: Cannot read property 'map' of undefined\n    at setup (/app/test/crash.spec.ts:5:10)"
                    },
                    "assertionResults": [],
                }
            ],
        }
        is_valid, diag = validate_jest_red_phase(1, json.dumps(data), "")
        self.assertFalse(is_valid)
        self.assertTrue(diag.startswith("Test suite execution failed with fatal error:\n"))
        self.assertIn("TypeError: Cannot read property 'map' of undefined", diag)

    def test_validate_jest_red_phase_accepts_cli_assertion_failure(self) -> None:
        cli_outputs = [
            "FAIL test/unit.spec.ts\n  ● Unit > calculates total\n    expect(received).toEqual(expected)",
            "● Test suite failed\n    Received: false",
            "FAIL test/app.spec.ts\n  something failed",
        ]
        for output in cli_outputs:
            with self.subTest(output=output):
                is_valid, diag = validate_jest_red_phase(1, output, "")
                self.assertTrue(is_valid)
                self.assertEqual(diag, "")

    def test_validate_jest_red_phase_accepts_unimplemented_function_typeerror(self) -> None:
        # Structured JSON with TypeError: ... is not a function
        data = {
            "numFailedTests": 1,
            "numPassedTests": 0,
            "numRuntimeErrorTestSuites": 0,
            "testResults": [
                {
                    "testFilePath": "/app/test/calc.spec.ts",
                    "assertionResults": [
                        {
                            "status": "failed",
                            "title": "should call calculateInterest",
                            "failureMessages": [
                                "TypeError: calculateInterest is not a function\n    at Object.<anonymous> (/app/test/calc.spec.ts:12:9)"
                            ],
                        }
                    ],
                }
            ],
        }
        is_valid, diag = validate_jest_red_phase(1, json.dumps(data), "")
        self.assertTrue(is_valid)
        self.assertEqual(diag, "")

        # CLI output with "is not a function"
        cli_out = "TypeError: calculateInterest is not a function\n    at Object.<anonymous> (calc.spec.ts:12:9)"
        is_valid_cli, diag_cli = validate_jest_red_phase(1, cli_out, "")
        self.assertTrue(is_valid_cli)
        self.assertEqual(diag_cli, "")

    def test_validate_jest_red_phase_rejects_lifecycle_hook_crash(self) -> None:
        hook_errors = [
            "Error: beforeEach hook failed: Database disconnected",
            "Error: beforeAll hook execution failed",
            "Error: afterEach hook failed",
            "Error: afterAll hook failed",
            "TypeError: Cannot redefine property: localStorage",
        ]
        for err_msg in hook_errors:
            with self.subTest(err=err_msg):
                data = {
                    "numFailedTests": 1,
                    "numPassedTests": 0,
                    "numRuntimeErrorTestSuites": 0,
                    "testResults": [
                        {
                            "testFilePath": "/app/test/hook.spec.ts",
                            "assertionResults": [
                                {
                                    "status": "failed",
                                    "title": "hook test",
                                    "failureMessages": [
                                        f"{err_msg}\n    at hook (/app/test/hook.spec.ts:8:3)"
                                    ],
                                }
                            ],
                        }
                    ],
                }
                is_valid, diag = validate_jest_red_phase(1, json.dumps(data), "")
                self.assertFalse(is_valid)
                self.assertTrue(diag.startswith("Test suite crashed with fatal hook/harness error:\n"))
                self.assertIn(err_msg, diag)

    def test_validate_jest_red_phase_rejects_json_without_failed_tests(self) -> None:
        data = {
            "numFailedTests": 0,
            "numPassedTests": 5,
            "numRuntimeErrorTestSuites": 0,
            "testResults": [
                {
                    "testFilePath": "/app/test/ok.spec.ts",
                    "assertionResults": [
                        {"status": "passed", "title": "test 1"}
                    ],
                }
            ],
        }
        is_valid, diag = validate_jest_red_phase(1, json.dumps(data), "")
        self.assertFalse(is_valid)
        self.assertEqual(diag, "No test failures recorded in test results.")

    def test_validate_jest_red_phase_rejects_unrecognized_failure_pattern(self) -> None:
        out = "Process terminated unexpectedly without Jest failure markers."
        err = "Exit code 137 (SIGKILL)"
        is_valid, diag = validate_jest_red_phase(137, out, err)
        self.assertFalse(is_valid)
        self.assertEqual(
            diag,
            "Tests failed with exit code 137, but failure did not match expected assertion failure pattern.",
        )

    def test_validate_jest_red_phase_falls_back_to_cli_when_json_is_malformed(self) -> None:
        malformed_out = (
            '{"testResults": [{"numFailedTests": invalid_json\n'
            'FAIL test/calc.spec.ts\n'
            '  ● calculate > fails as expected\n'
            '    expect(received).toBe(expected)'
        )
        is_valid, diag = validate_jest_red_phase(1, malformed_out, "")
        self.assertTrue(is_valid)
        self.assertEqual(diag, "")


if __name__ == "__main__":
    unittest.main()
