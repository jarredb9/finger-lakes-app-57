"""
Unit tests for Conductor Prompt Generator (scripts/agent/generate-prompt.py).
"""

import importlib.util
import subprocess
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPO_ROOT / "scripts" / "agent" / "generate-prompt.py"

# Dynamically import generate-prompt.py module
spec = importlib.util.spec_from_file_location("generate_prompt", SCRIPT_PATH)
generate_prompt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generate_prompt)


class TestGeneratePromptModule(unittest.TestCase):
    def test_parse_plan_tasks_structure(self):
        """Verifies that parse_plan_tasks accurately extracts phases and tasks."""
        phases = generate_prompt.parse_plan_tasks("agent-resolve-token-limits_20261019")
        self.assertIn(1, phases)
        self.assertIn(2, phases)
        self.assertIn(3, phases)
        self.assertGreaterEqual(len(phases[3]["tasks"]), 3)
        self.assertIn("tasks", phases[3])
        self.assertIn("name", phases[3])

    def test_infer_verification_strategy_prevents_unbound_instruction(self):
        """
        Regression test: When a task mentions unit tests (has_unit = True)
        and has plan_verification_cmds in the plan file, instruction must be bound.
        """
        strategy = generate_prompt.infer_verification_strategy(
            track_name="agent-resolve-token-limits_20261019",
            phase_num=3,
            task_num=2,
            task_desc="Implement 25% cached token accounting, pre-call budget checks, dual summary metrics, and boundary regex matching (TDD Green phase)",
            subtasks=[
                "Implement effective_tokens, check_budget(), and dual summary formatting in agent_resolve/tracker.py",
                "Update existing unit tests in scripts/agent-resolve/tests/test_tracker.py and test_llm.py",
                "Verify all tests pass via npm run test:agent",
            ],
            mode="green",
        )
        self.assertIn("instruction", strategy)
        self.assertTrue(strategy["instruction"].startswith("- "))
        self.assertIn("python3.12 -m unittest scripts/agent-resolve/tests/test_tracker.py", strategy["commands"])
        self.assertIn("python3.12 -m unittest scripts/agent-resolve/tests/test_llm.py", strategy["commands"])

    def test_infer_verification_strategy_default_fallback(self):
        """Verifies default instruction assignment when no specific subtask or plan command overrides."""
        strategy = generate_prompt.infer_verification_strategy(
            track_name="agent-resolve-token-limits_20261019",
            phase_num=999,
            task_num=999,
            task_desc="Generic task without targets",
            subtasks=[],
            mode="green",
        )
        self.assertIn("instruction", strategy)
        self.assertTrue(len(strategy["instruction"]) > 0)


class TestGeneratePromptCLI(unittest.TestCase):
    def run_cli(self, args):
        cmd = [sys.executable, str(SCRIPT_PATH)] + args
        return subprocess.run(
            cmd,
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
        )

    def test_rejects_out_of_bounds_task(self):
        result = self.run_cli(["3", "32", "--plan"])
        self.assertEqual(result.returncode, 1)
        self.assertIn("Error: Task 32 not found in Phase 3", result.stderr)
        self.assertIn("Valid tasks for Phase 3: 1..3", result.stderr)

    def test_rejects_non_existent_phase(self):
        result = self.run_cli(["99", "1", "--plan"])
        self.assertEqual(result.returncode, 1)
        self.assertIn("Error: Phase 99 not found in track", result.stderr)
        self.assertIn("Available phases: 1, 2, 3, 4, 5, 6, 7", result.stderr)

    def test_rejects_non_positive_numbers(self):
        result = self.run_cli(["0", "1", "--plan"])
        self.assertEqual(result.returncode, 1)
        self.assertIn("Error: Phase and task numbers must be positive integers >= 1", result.stderr)

    def test_phase_only_resolves_pending_task_in_phase(self):
        # Resolves first pending task in an active phase (Phase 4)
        phases = generate_prompt.parse_plan_tasks("agent-resolve-token-limits_20261019")
        target_phase = 4
        pending_task_idx = next(
            (idx for idx, t in enumerate(phases[target_phase]["tasks"], start=1) if t["status"] in ("pending", "in_progress")),
            1,
        )
        result = self.run_cli([str(target_phase), "--plan"])
        self.assertEqual(result.returncode, 0)
        self.assertIn(f"Plan Phase {target_phase} Task {pending_task_idx} only", result.stdout)

    def test_valid_exec_prompt_succeeds(self):
        result = self.run_cli(["3", "2", "--exec"])
        self.assertEqual(result.returncode, 0)
        self.assertIn("Execute Phase 3 Task 2 following", result.stdout)
        self.assertIn("python3.12 -m unittest scripts/agent-resolve/tests/test_tracker.py", result.stdout)
        self.assertIn("python3.12 -m unittest scripts/agent-resolve/tests/test_llm.py", result.stdout)


if __name__ == "__main__":
    unittest.main()
