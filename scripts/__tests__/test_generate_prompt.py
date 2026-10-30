"""
Unit tests for Conductor Prompt Generator (scripts/agent/generate-prompt.py).
"""

import importlib.util
import subprocess
import sys
import tempfile
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

    def test_parse_plan_tasks_extracts_clean_phase_name_checkpoint_and_commit_shas(self):
        """Verifies phase header checkpoint SHA stripping and multi-format task commit SHA extraction."""
        phases_real = generate_prompt.parse_plan_tasks("agent-resolve-quality-hardening_20261021")
        self.assertEqual(
            phases_real[1]["name"],
            "Stage 2 Patch-Based Test Authoring & Unified Patch Engine",
        )
        self.assertNotIn("[checkpoint:", phases_real[1]["name"])
        self.assertEqual(phases_real[1]["checkpoint_sha"], "0e79c6e")
        self.assertEqual(
            phases_real[1]["raw_heading"],
            "## Phase 1: Stage 2 Patch-Based Test Authoring & Unified Patch Engine",
        )
        self.assertIsNone(phases_real[2]["checkpoint_sha"])

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            (tmp_path / "plan.md").write_text(
                "## Phase 1: Alpha Setup [checkpoint: 0e79c6e]\n"
                "- [x] Task: Write failing tests [commit: abc1234]\n"
                "- [x] Task: Implement feature (def5678)\n"
                "- [x] Task: Refactor module [9876543]\n"
                "- [x] Task: Cleanup helpers 1122334\n"
                "- [ ] Task: Conductor - User Manual Verification 'Phase 1: Alpha Setup' (Protocol in workflow.md)\n",
                encoding="utf-8",
            )
            phases = generate_prompt.parse_plan_tasks(str(tmp_path))
            self.assertEqual(phases[1]["name"], "Alpha Setup")
            self.assertEqual(phases[1]["checkpoint_sha"], "0e79c6e")
            tasks = phases[1]["tasks"]
            self.assertEqual(len(tasks), 5)
            self.assertEqual(tasks[0]["commit_sha"], "abc1234")
            self.assertEqual(tasks[0]["description"], "Write failing tests")
            self.assertFalse(tasks[0]["is_checkpoint"])
            self.assertEqual(tasks[1]["commit_sha"], "def5678")
            self.assertEqual(tasks[1]["description"], "Implement feature")
            self.assertFalse(tasks[1]["is_checkpoint"])
            self.assertEqual(tasks[2]["commit_sha"], "9876543")
            self.assertEqual(tasks[2]["description"], "Refactor module")
            self.assertFalse(tasks[2]["is_checkpoint"])
            self.assertEqual(tasks[3]["commit_sha"], "1122334")
            self.assertEqual(tasks[3]["description"], "Cleanup helpers")
            self.assertFalse(tasks[3]["is_checkpoint"])
            self.assertIsNone(tasks[4]["commit_sha"])
            self.assertTrue(tasks[4]["is_checkpoint"])

    def test_checkpoint_variable_task_counts_2_3_4_and_6_tasks(self):
        """Verifies --checkpoint resolves the checkpoint task across 2, 3, 4, and 6-task phases and aggregates sibling plans."""
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            (tmp_path / "plan.md").write_text(
                "## Phase 1: Two Task Phase [checkpoint: 1111111]\n"
                "- [x] Task: Implement schema `npm run db:check-types:local` [commit: 1111110]\n"
                "- [x] Task: Conductor - User Manual Verification 'Phase 1: Two Task Phase' (Protocol in workflow.md) [commit: 1111111]\n\n"
                "## Phase 2: Three Task Phase [checkpoint: 2222222]\n"
                "- [x] Task: Write failing test (TDD Red phase) [commit: 2222220]\n"
                "- [x] Task: Implement service (TDD Green phase) [commit: 2222221]\n"
                "- [x] Task: Conductor - User Manual Verification 'Phase 2: Three Task Phase' (Protocol in workflow.md) [commit: 2222222]\n\n"
                "## Phase 3: Four Task Phase [checkpoint: 3333333]\n"
                "- [x] Task: Red task [commit: 3333330]\n"
                "- [x] Task: Green task [commit: 3333331]\n"
                "- [x] Task: Refactor & Scaffolding Cleanup [commit: 3333332]\n"
                "- [x] Task: Conductor - User Manual Verification 'Phase 3: Four Task Phase' (Protocol in workflow.md) [commit: 3333333]\n\n"
                "## Phase 4: Six Task Phase\n"
                "- [x] Task: Sub-feature A Red [commit: 4444441]\n"
                "- [x] Task: Sub-feature A Green [commit: 4444442]\n"
                "- [x] Task: Sub-feature B Red [commit: 4444443]\n"
                "    - [x] Run `python3.12 -m unittest scripts/__tests__/test_generate_prompt.py`\n"
                "- [x] Task: Sub-feature B Green [commit: 4444444]\n"
                "- [x] Task: Refactor & Scaffolding Cleanup [commit: 4444445]\n"
                "- [ ] Task: Conductor - User Manual Verification 'Phase 4: Six Task Phase' (Protocol in workflow.md)\n",
                encoding="utf-8",
            )
            # Non-contiguous sibling plans in Phase 4 (Task 1 and Task 4 only)
            (tmp_path / "phase-4-task-1-plan.md").write_text(
                "# Plan 4.1\n## 2. Target Files\n- **Path:** `lib/services/tripService.ts`\n"
                "## 3. Execution Verification Protocol\n```bash\n"
                "./scripts/containers/run-jest-container.sh lib/services/__tests__/tripService.mutations.test.ts\n```\n",
                encoding="utf-8",
            )
            (tmp_path / "phase-4-task-4-plan.md").write_text(
                "# Plan 4.4\n## 2. Target Files\n- **Path:** `scripts/agent/generate-prompt.py`\n"
                "## 3. Execution Verification Protocol\n```bash\n"
                "npm run test:agent:all\n```\n",
                encoding="utf-8",
            )

            ctx = generate_prompt.collect_phase_checkpoint_context(str(tmp_path), 4, 6, cwd=tmp_path)
            self.assertIn(
                "./scripts/containers/run-jest-container.sh lib/services/__tests__/tripService.mutations.test.ts",
                ctx["commands"],
            )
            self.assertIn("npm run test:agent:all", ctx["commands"])
            self.assertIn(
                "python3.12 -m unittest scripts/__tests__/test_generate_prompt.py",
                ctx["commands"],
            )
            self.assertIn("npm run type-check", ctx["commands"])

            # Verify CLI --checkpoint resolves Task 2, 3, 4, and 6 across Phases 1..4
            for phase_num, expected_task_num in [(1, 2), (2, 3), (3, 4), (4, 6)]:
                res = subprocess.run(
                    [sys.executable, str(SCRIPT_PATH), "--track", str(tmp_path), "--phase", str(phase_num), "--checkpoint"],
                    cwd=str(REPO_ROOT),
                    capture_output=True,
                    text=True,
                )
                self.assertEqual(res.returncode, 0, msg=res.stderr)
                self.assertIn(f"Phase {phase_num}, Task {expected_task_num}", res.stdout)

    def test_checkpoint_filters_mutating_db_and_git_commands(self):
        """Verifies mutating db:* and git commands are stripped while read-only verification commands remain."""
        ctx_p2 = generate_prompt.collect_phase_checkpoint_context("db-security-hardening_20261026", 2, 4)
        for forbidden in ("db:reset", "db:gen-types", "db:populate", "git commit", "git add"):
            for cmd in ctx_p2["commands"]:
                self.assertNotIn(forbidden, cmd)
        self.assertTrue(
            any("supabase-rpc.integration.test.ts" in c for c in ctx_p2["commands"]),
            msg=f"Expected integration test command in {ctx_p2['commands']}",
        )

        ctx_p3 = generate_prompt.collect_phase_checkpoint_context("db-security-hardening_20261026", 3, 4)
        for cmd in ctx_p3["commands"]:
            self.assertNotIn("db:gen-types", cmd)
        self.assertIn("npm run db:check-types:local", ctx_p3["commands"])
        self.assertFalse(
            any("run-jest-container.sh" in c for c in ctx_p3["commands"]),
            msg=f"Did not expect full Jest fallback in Phase 3: {ctx_p3['commands']}",
        )

    def test_checkpoint_omits_nonexistent_plan_ref_and_includes_diff_gate(self):
        """Verifies checkpoint prompt omits missing plan ref, includes Warm-Session Fast Path, and uses full phase title."""
        prompt = generate_prompt.build_exec_prompt(
            track_name="db-security-hardening_20261026",
            phase_num=1,
            task_num=4,
            task_desc="Conductor - User Manual Verification 'Phase 1: Client & Integration Test Modernization' (Protocol in workflow.md)",
        )
        self.assertNotIn("phase-1-task-4-plan.md", prompt)
        self.assertIn("Warm-Session Fast Path", prompt)
        self.assertIn("Do NOT read `conductor/workflow.md`, `product.md`, or `product-guidelines.md`", prompt)
        self.assertIn(
            'git commit -m "conductor(plan): Mark phase \'Phase 1: Client & Integration Test Modernization (Preparation)\' as complete"',
            prompt,
        )
        self.assertIn("## Phase 1: Client & Integration Test Modernization (Preparation)", prompt)

    def test_classify_phase_domain_ui_vs_database_vs_tooling(self):
        """Verifies domain classification distinguishes ui, database, and backend_tooling."""
        self.assertEqual(
            generate_prompt.classify_phase_domain(["components/WineryModal.tsx"], []),
            "ui",
        )
        self.assertEqual(
            generate_prompt.classify_phase_domain(["supabase/migrations/20261026_test.sql", "lib/database.types.ts"], []),
            "database",
        )
        self.assertEqual(
            generate_prompt.classify_phase_domain(["scripts/agent-resolve/pipeline.py", "lib/services/tripService.ts"], []),
            "backend_tooling",
        )

        # Verify database phase checkpoint prompt forbids inventing localhost:3000 steps
        db_prompt = generate_prompt.build_exec_prompt(
            track_name="db-security-hardening_20261026",
            phase_num=2,
            task_num=4,
            task_desc="Conductor - User Manual Verification 'Phase 2: Database Hardening & Security Regression' (Protocol in workflow.md)",
        )
        self.assertIn("no UI changes — do NOT invent `localhost:3000` browser steps", db_prompt)

    def test_baseline_sha_fallback_when_prior_phase_header_lacks_checkpoint_tag(self):
        """Verifies Phase 3 baseline resolves from Phase 2's last task commit_sha when Phase 2 header lacks [checkpoint: ...]."""
        phases = generate_prompt.parse_plan_tasks("agent-resolve-quality-hardening_20261021")
        self.assertIsNone(phases[2]["checkpoint_sha"])
        baseline_p3 = generate_prompt.resolve_phase_baseline_sha(phases, 3)
        self.assertEqual(baseline_p3, "8314526")

    def test_get_preceding_context_walks_backward_past_planless_tasks(self):
        """Verifies get_preceding_context walks backward to find the nearest existing sibling plan file."""
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            (tmp_path / "plan.md").write_text("## Phase 1: Test\n", encoding="utf-8")
            (tmp_path / "phase-1-task-2-plan.md").write_text("# Plan 1.2\n", encoding="utf-8")
            # Task 3 has no plan file; Task 4 should find phase-1-task-2-plan.md
            ctx = generate_prompt.get_preceding_context(str(tmp_path), 1, 4)
            self.assertIn("phase-1-task-2-plan.md", ctx)

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
        result = self.run_cli(["3", "32", "--plan", "--track", "agent-resolve-token-limits_20261019"])
        self.assertEqual(result.returncode, 1)
        self.assertIn("Error: Task 32 not found in Phase 3", result.stderr)
        self.assertIn("Valid tasks for Phase 3: 1..3", result.stderr)

    def test_rejects_non_existent_phase(self):
        result = self.run_cli(["99", "1", "--plan", "--track", "agent-resolve-token-limits_20261019"])
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
        result = self.run_cli([str(target_phase), "--plan", "--track", "agent-resolve-token-limits_20261019"])
        self.assertEqual(result.returncode, 0)
        self.assertIn(f"Plan Phase {target_phase} Task {pending_task_idx} only", result.stdout)

    def test_valid_exec_prompt_succeeds(self):
        result = self.run_cli(["3", "2", "--exec", "--track", "agent-resolve-token-limits_20261019"])
        self.assertEqual(result.returncode, 0)
        self.assertIn("Execute Phase 3 Task 2 following", result.stdout)
        self.assertIn("python3.12 -m unittest scripts/agent-resolve/tests/test_tracker.py", result.stdout)
        self.assertIn("python3.12 -m unittest scripts/agent-resolve/tests/test_llm.py", result.stdout)

    def test_cli_checkpoint_single_prompt_output_and_pending_warning(self):
        """Verifies default CLI output on checkpoint prints only a single prompt and warns when prior tasks are incomplete."""
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            (tmp_path / "plan.md").write_text(
                "## Phase 1: Verification Phase\n"
                "- [x] Task: Completed task [commit: abc1234]\n"
                "- [ ] Task: Unfinished cleanup task\n"
                "- [ ] Task: Conductor - User Manual Verification 'Phase 1: Verification Phase' (Protocol in workflow.md)\n",
                encoding="utf-8",
            )
            result = self.run_cli(["--track", str(tmp_path), "--phase", "1", "--checkpoint"])
            self.assertEqual(result.returncode, 0, msg=result.stderr)
            self.assertNotIn("PROMPT 1: RESEARCH & PLAN", result.stdout)
            self.assertIn("PHASE CHECKPOINT (WARM OR COLD SESSION)", result.stdout)
            self.assertIn("Warning: Phase 1 still has incomplete prior tasks: Task 2 ('Unfinished cleanup task')", result.stderr)


if __name__ == "__main__":
    unittest.main()
