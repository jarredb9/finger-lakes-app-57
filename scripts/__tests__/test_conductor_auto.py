"""
Unit tests for Conductor Auto-Runner (scripts/agent/conductor-auto.py).

Covers Phase 3: Task Parsing, Plan Validation, and Planning Tier (Tier 1).
- Track plan parsing and task status extraction (TestTrackPlanParser)
- Tier 1 planning prompt generation and invocation (TestPlanningPromptGeneration)
- Subprocess protocol, flag ordering, stdin pipe, and process group isolation (TestAgySubprocessProtocol)
- Idempotent plan caching and cache bypass (TestIdempotentPlanCache)
- Post-plan invariant verification (TestPostPlanInvariants)
- Tier 1 planning turn orchestration (TestTier1PlanningDispatch)
"""

import importlib.util
import os
import signal
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any, Callable
from unittest.mock import MagicMock, call, patch

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPO_ROOT / "scripts" / "agent" / "conductor-auto.py"

# Dynamically import scripts/agent/conductor-auto.py if it exists
conductor_auto = None
if SCRIPT_PATH.exists():
    spec = importlib.util.spec_from_file_location("conductor_auto", SCRIPT_PATH)
    if spec and spec.loader:
        conductor_auto = importlib.util.module_from_spec(spec)
        sys.modules["conductor_auto"] = conductor_auto
        try:
            spec.loader.exec_module(conductor_auto)
        except Exception:
            conductor_auto = None


def get_target(attr_name: str, test_case: unittest.TestCase) -> Any:
    """Helper to retrieve a target function/class from conductor_auto or fail with AssertionError."""
    if conductor_auto is None:
        test_case.fail(
            f"scripts/agent/conductor-auto.py is not yet implemented (cannot load '{attr_name}')"
        )
    target = getattr(conductor_auto, attr_name, None)
    if target is None:
        test_case.fail(
            f"'{attr_name}' is not yet implemented in scripts/agent/conductor-auto.py"
        )
    return target


class TestTrackPlanParser(unittest.TestCase):
    """Test suite for parsing track plan markdown, phases, tasks, and metadata."""

    def test_parse_track_plan_phases_and_checkpoints(self):
        """Asserts parse_track_plan identifies phases, checkpoint headers, raw headings, and completion state."""
        parse_track_plan = get_target("parse_track_plan", self)

        plan_content = """# Conductor Track Plan

## Phase 1: Setup & Scaffolding [checkpoint: abc1234]
- [x] Task: Initial project scaffolding (1122334)
- [x] Task: Conductor - User Manual Verification 'Phase 1' [commit: 2233445]

## Phase 2: Core Engine Implementation
- [~] Task: In-progress engine task
- [ ] Task: Pending engine task

## Phase 3: Documentation & Hardening
- [ ] Task: Author documentation [exempt: docs]
"""
        with tempfile.TemporaryDirectory() as tmpdir:
            plan_file = Path(tmpdir) / "plan.md"
            plan_file.write_text(plan_content, encoding="utf-8")

            phases = parse_track_plan(plan_file)

            self.assertIn(1, phases)
            self.assertIn(2, phases)
            self.assertIn(3, phases)

            # Phase 1 assertions
            p1 = phases[1]
            self.assertEqual(p1.phase_num, 1)
            self.assertEqual(p1.name, "Setup & Scaffolding")
            self.assertEqual(p1.checkpoint_sha, "abc1234")
            self.assertTrue(p1.is_complete)
            self.assertIn("## Phase 1: Setup & Scaffolding", p1.raw_heading)

            # Phase 2 assertions
            p2 = phases[2]
            self.assertEqual(p2.phase_num, 2)
            self.assertEqual(p2.name, "Core Engine Implementation")
            self.assertIsNone(p2.checkpoint_sha)
            self.assertFalse(p2.is_complete)
            self.assertEqual(p2.raw_heading, "## Phase 2: Core Engine Implementation")

            # Phase 3 assertions
            p3 = phases[3]
            self.assertEqual(p3.phase_num, 3)
            self.assertEqual(p3.name, "Documentation & Hardening")
            self.assertFalse(p3.is_complete)

    def test_parse_track_plan_task_statuses_and_metadata(self):
        """Asserts extraction of task statuses, commit SHAs, exempt tags, checkpoint tasks, and subtasks."""
        parse_track_plan = get_target("parse_track_plan", self)

        plan_content = """## Phase 2: Core Engine Implementation
- [x] Task: Test baseline commit (1122334)
- [~] Task: Active in-progress work
- [ ] Task: Write failing unit tests [exempt: scripts]
    - [ ] Subtask 1: Detailed requirement A
    - [ ] Subtask 2: Detailed requirement B
- [-] Task: Deprecated or skipped item
- [ ] Task: Conductor - User Manual Verification 'Phase 2' (Protocol in workflow.md)
"""
        with tempfile.TemporaryDirectory() as tmpdir:
            plan_file = Path(tmpdir) / "plan.md"
            plan_file.write_text(plan_content, encoding="utf-8")

            phases = parse_track_plan(plan_file)
            p2 = phases[2]
            tasks = p2.tasks

            self.assertEqual(len(tasks), 5)

            # Task 1: Complete with commit SHA
            self.assertEqual(tasks[0].task_num, 1)
            self.assertEqual(tasks[0].status, "complete")
            self.assertEqual(tasks[0].status_char, "x")
            self.assertEqual(tasks[0].commit_sha, "1122334")
            self.assertFalse(tasks[0].is_checkpoint)

            # Task 2: In progress
            self.assertEqual(tasks[1].task_num, 2)
            self.assertEqual(tasks[1].status, "in_progress")
            self.assertEqual(tasks[1].status_char, "~")
            self.assertIsNone(tasks[1].commit_sha)

            # Task 3: Pending with exempt tag and subtasks
            self.assertEqual(tasks[2].task_num, 3)
            self.assertEqual(tasks[2].status, "pending")
            self.assertEqual(tasks[2].status_char, " ")
            self.assertEqual(tasks[2].exempt, "scripts")
            self.assertFalse(tasks[2].is_checkpoint)
            self.assertGreaterEqual(len(tasks[2].subtasks), 2)
            self.assertIn("Subtask 1: Detailed requirement A", tasks[2].subtasks[0])

            # Task 4: Skipped
            self.assertEqual(tasks[3].task_num, 4)
            self.assertEqual(tasks[3].status, "skipped")
            self.assertEqual(tasks[3].status_char, "-")

            # Task 5: Checkpoint manual verification task
            self.assertEqual(tasks[4].task_num, 5)
            self.assertEqual(tasks[4].status, "pending")
            self.assertTrue(tasks[4].is_checkpoint)

    def test_is_checkpoint_task_classification_and_false_positives(self):
        """Asserts is_checkpoint_task identifies verification checkpoints and avoids false positives on tasks mentioning checkpoint."""
        is_checkpoint_task = get_target("is_checkpoint_task", self)

        # Verification checkpoint forms (must return True)
        self.assertTrue(
            is_checkpoint_task("Conductor - User Manual Verification 'Phase 3' (Protocol in workflow.md)")
        )
        self.assertTrue(is_checkpoint_task("Checkpoint end of Phase 3"))
        self.assertTrue(is_checkpoint_task("Final checkpoint"))
        self.assertTrue(is_checkpoint_task("checkpoint: abc1234"))
        self.assertTrue(is_checkpoint_task("User manual verification"))

        # Implementation / test tasks mentioning checkpoint (must return False)
        self.assertFalse(
            is_checkpoint_task("Write failing unit tests for Gate 1 checkpoint, Gate 2 review dispatch")
        )
        self.assertFalse(
            is_checkpoint_task("Implement Gate 1 checkpoint, Gate 2 review handling, brain snapshotting")
        )
        self.assertFalse(
            is_checkpoint_task("Write failing unit tests for `--unattended` checkpoint prompt generation")
        )
        self.assertFalse(
            is_checkpoint_task("Implement `--unattended` checkpoint prompt generation in generate-prompt.py")
        )

    def test_get_active_phase_resolution(self):
        """Asserts get_active_phase returns the first incomplete phase or requested target phase."""
        parse_track_plan = get_target("parse_track_plan", self)
        get_active_phase = get_target("get_active_phase", self)

        plan_content = """## Phase 1: Setup [checkpoint: abc1234]
- [x] Task: Done (1111111)

## Phase 2: Active Work
- [ ] Task: Incomplete (pending)

## Phase 3: Future Work
- [ ] Task: Future item
"""
        with tempfile.TemporaryDirectory() as tmpdir:
            plan_file = Path(tmpdir) / "plan.md"
            plan_file.write_text(plan_content, encoding="utf-8")
            phases = parse_track_plan(plan_file)

            # Default: resolves first incomplete phase (Phase 2)
            active_default = get_active_phase(phases)
            self.assertIsNotNone(active_default)
            self.assertEqual(active_default.phase_num, 2)

            # Explicit target phase 1
            target_1 = get_active_phase(phases, target_phase=1)
            self.assertIsNotNone(target_1)
            self.assertEqual(target_1.phase_num, 1)

            # Non-existent target phase 99
            target_none = get_active_phase(phases, target_phase=99)
            self.assertIsNone(target_none)

    def test_get_pending_tasks_filtering(self):
        """Asserts get_pending_tasks extracts only pending and in-progress tasks."""
        parse_track_plan = get_target("parse_track_plan", self)
        get_pending_tasks = get_target("get_pending_tasks", self)

        plan_content = """## Phase 1: Mixed Tasks
- [x] Task: Already completed (1234567)
- [~] Task: Currently in progress
- [ ] Task: Next up pending
- [-] Task: Abandoned or skipped
- [ ] Task: Final checkpoint
"""
        with tempfile.TemporaryDirectory() as tmpdir:
            plan_file = Path(tmpdir) / "plan.md"
            plan_file.write_text(plan_content, encoding="utf-8")
            phases = parse_track_plan(plan_file)
            p1 = phases[1]

            pending = get_pending_tasks(p1)
            # Should include in_progress (Task 2), pending (Task 3), pending checkpoint (Task 5)
            # Should NOT include complete (Task 1) or skipped (Task 4)
            statuses = [t.status for t in pending]
            self.assertNotIn("complete", statuses)
            self.assertNotIn("skipped", statuses)
            self.assertIn("in_progress", statuses)
            self.assertIn("pending", statuses)
            self.assertEqual(len(pending), 3)


class TestPlanningPromptGeneration(unittest.TestCase):
    """Test suite for Tier 1 planning prompt construction via generate-prompt.py."""

    @patch("subprocess.run")
    def test_generate_turn_prompt_invokes_generate_prompt_plan(self, mock_run):
        """Asserts generate_turn_prompt executes generate-prompt.py --plan and returns stripped prompt."""
        generate_turn_prompt = get_target("generate_turn_prompt", self)

        mock_run.return_value = subprocess.CompletedProcess(
            args=["python3.11", "scripts/agent/generate-prompt.py", "test-track", "3", "1", "--plan"],
            returncode=0,
            stdout="# Conductor Implementation Plan Request\n\nPrompt details...\n\n",
            stderr="",
        )

        prompt = generate_turn_prompt("test-track", 3, 1, mode="plan")

        self.assertTrue(mock_run.called)
        called_args = mock_run.call_args[0][0]
        self.assertIn("test-track", called_args)
        self.assertIn("3", called_args)
        self.assertIn("1", called_args)
        self.assertIn("--plan", called_args)
        self.assertEqual(prompt, "# Conductor Implementation Plan Request\n\nPrompt details...")

    @patch("subprocess.run")
    def test_generate_turn_prompt_raises_on_subprocess_error(self, mock_run):
        """Asserts generate_turn_prompt raises RuntimeError on subprocess failure."""
        generate_turn_prompt = get_target("generate_turn_prompt", self)
        ProcessExecutionError = getattr(conductor_auto, "ProcessExecutionError", RuntimeError)

        mock_run.return_value = subprocess.CompletedProcess(
            args=["python3.11", "scripts/agent/generate-prompt.py"],
            returncode=1,
            stdout="",
            stderr="Error: track 'test-track' not found in registry",
        )

        with self.assertRaises((RuntimeError, ProcessExecutionError)) as ctx:
            generate_turn_prompt("test-track", 3, 1, mode="plan")

        self.assertIn("track 'test-track' not found", str(ctx.exception))


class TestAgySubprocessProtocol(unittest.TestCase):
    """Test suite for agy CLI flag ordering, stdin pipe delivery, and process group isolation."""

    def test_build_agy_command_strict_flag_ordering(self):
        """Asserts build_agy_command positions configuration flags strictly before --print."""
        build_agy_command = get_target("build_agy_command", self)

        cmd = build_agy_command(mode="plan", model="gemini-3.8-flash-high")

        self.assertEqual(cmd[0], "agy")
        self.assertIn("--print", cmd)
        self.assertIn("--mode", cmd)
        self.assertIn("--model", cmd)
        self.assertIn("--dangerously-skip-permissions", cmd)

        print_idx = cmd.index("--print")
        mode_idx = cmd.index("--mode")
        model_idx = cmd.index("--model")
        skip_idx = cmd.index("--dangerously-skip-permissions")

        # Configuration flags must strictly precede --print
        self.assertLess(mode_idx, print_idx)
        self.assertLess(model_idx, print_idx)
        self.assertLess(skip_idx, print_idx)
        self.assertEqual(print_idx, len(cmd) - 1)

    @patch("subprocess.Popen")
    def test_run_agy_turn_stdin_prompt_delivery_and_session_isolation(self, mock_popen_cls):
        """Asserts prompt is delivered via stdin, not argv, and session is isolated via start_new_session."""
        run_agy_turn = get_target("run_agy_turn", self)

        mock_proc = MagicMock()
        mock_proc.communicate.return_value = ("Turn output", "")
        mock_proc.returncode = 0
        mock_proc.pid = 12345
        mock_popen_cls.return_value = mock_proc

        prompt_text = "Detailed plan request prompt content"
        ret, stdout, stderr = run_agy_turn(
            prompt=prompt_text,
            mode="plan",
            model="gemini-3.8-flash-high",
            timeout=900.0,
        )

        self.assertEqual(ret, 0)
        self.assertEqual(stdout, "Turn output")

        # Verify Popen call arguments
        popen_args, popen_kwargs = mock_popen_cls.call_args
        cmd_called = popen_args[0]

        # Prompt must NOT be in argv
        self.assertNotIn(prompt_text, cmd_called)
        # Stdin must be a pipe
        self.assertEqual(popen_kwargs.get("stdin"), subprocess.PIPE)
        # Must isolate process session (start_new_session=True or preexec_fn=os.setsid)
        has_session_isolation = popen_kwargs.get("start_new_session") is True or popen_kwargs.get(
            "preexec_fn"
        ) in (os.setsid, getattr(os, "setpgrp", None))
        self.assertTrue(has_session_isolation, "Popen must specify start_new_session=True or os.setsid")

        # Verify prompt delivered to communicate
        mock_proc.communicate.assert_called_once()
        comm_input = mock_proc.communicate.call_args[1].get("input") or mock_proc.communicate.call_args[0][0]
        if isinstance(comm_input, bytes):
            comm_input = comm_input.decode("utf-8")
        self.assertEqual(comm_input, prompt_text)

    @patch("os.killpg")
    @patch("os.getpgid", return_value=12345)
    @patch("subprocess.Popen")
    def test_run_agy_turn_timeout_process_group_termination(
        self, mock_popen_cls, mock_getpgid, mock_killpg
    ):
        """Asserts timeout expiration triggers process group SIGTERM followed by SIGKILL."""
        run_agy_turn = get_target("run_agy_turn", self)
        ProcessExecutionError = getattr(conductor_auto, "ProcessExecutionError", subprocess.TimeoutExpired)

        mock_proc = MagicMock()
        mock_proc.pid = 12345
        mock_proc.communicate.side_effect = subprocess.TimeoutExpired(cmd=["agy"], timeout=900)
        mock_popen_cls.return_value = mock_proc

        with self.assertRaises((subprocess.TimeoutExpired, ProcessExecutionError)):
            run_agy_turn(prompt="Prompt", timeout=900.0)

        # Verify os.killpg was called with SIGTERM
        mock_killpg.assert_any_call(12345, signal.SIGTERM)

    @patch("os.killpg")
    @patch("os.getpgid", return_value=12345)
    @patch("subprocess.Popen")
    def test_run_agy_turn_sigint_process_group_cleanup(
        self, mock_popen_cls, mock_getpgid, mock_killpg
    ):
        """Asserts SIGINT/KeyboardInterrupt triggers process group termination and re-raises cleanly."""
        run_agy_turn = get_target("run_agy_turn", self)

        mock_proc = MagicMock()
        mock_proc.pid = 12345
        mock_proc.communicate.side_effect = KeyboardInterrupt()
        mock_popen_cls.return_value = mock_proc

        with self.assertRaises(KeyboardInterrupt):
            run_agy_turn(prompt="Prompt")

        # Verify os.killpg cleanup was called on child process group
        self.assertTrue(mock_killpg.called)
        kill_signal = mock_killpg.call_args[0][1]
        self.assertIn(kill_signal, (signal.SIGTERM, signal.SIGKILL))


class TestIdempotentPlanCache(unittest.TestCase):
    """Test suite for idempotent plan file cache checking and bypass."""

    def test_check_plan_cache_missing_file_returns_false(self):
        """Asserts check_plan_cache returns (False, path) when plan file does not exist."""
        check_plan_cache = get_target("check_plan_cache", self)

        with tempfile.TemporaryDirectory() as tmpdir:
            track_dir = Path(tmpdir)
            cached, plan_path = check_plan_cache(track_dir, phase_num=3, task_num=1)
            self.assertFalse(cached)
            self.assertEqual(plan_path.name, "phase-3-task-1-plan.md")

    def test_check_plan_cache_existing_non_empty_returns_true(self):
        """Asserts check_plan_cache returns (True, path) when plan file exists and is non-empty."""
        check_plan_cache = get_target("check_plan_cache", self)

        with tempfile.TemporaryDirectory() as tmpdir:
            track_dir = Path(tmpdir)
            plan_file = track_dir / "phase-3-task-1-plan.md"
            plan_file.write_text("# Implementation Plan: Phase 3 Task 1\n", encoding="utf-8")

            cached, plan_path = check_plan_cache(track_dir, phase_num=3, task_num=1)
            self.assertTrue(cached)
            self.assertEqual(plan_path, plan_file)

    def test_check_plan_cache_empty_file_returns_false(self):
        """Asserts check_plan_cache returns (False, path) when plan file has size 0."""
        check_plan_cache = get_target("check_plan_cache", self)

        with tempfile.TemporaryDirectory() as tmpdir:
            track_dir = Path(tmpdir)
            plan_file = track_dir / "phase-3-task-1-plan.md"
            plan_file.write_text("", encoding="utf-8")

            cached, plan_path = check_plan_cache(track_dir, phase_num=3, task_num=1)
            self.assertFalse(cached)

    def test_check_plan_cache_force_plan_bypasses_cache(self):
        """Asserts force_plan=True bypasses plan cache even if non-empty file exists."""
        check_plan_cache = get_target("check_plan_cache", self)

        with tempfile.TemporaryDirectory() as tmpdir:
            track_dir = Path(tmpdir)
            plan_file = track_dir / "phase-3-task-1-plan.md"
            plan_file.write_text("# Cached Plan Content\n", encoding="utf-8")

            cached, plan_path = check_plan_cache(
                track_dir, phase_num=3, task_num=1, force_plan=True
            )
            self.assertFalse(cached)


class TestPostPlanInvariants(unittest.TestCase):
    """Test suite for post-plan invariant verification (blueprint exists, 0 production files modified)."""

    @patch("subprocess.run")
    def test_assert_post_plan_invariants_passes_when_clean(self, mock_run):
        """Asserts post-plan verification passes when plan exists and git status is clean of app code."""
        assert_post_plan_invariants = get_target("assert_post_plan_invariants", self)

        with tempfile.TemporaryDirectory() as tmpdir:
            track_dir = Path(tmpdir)
            plan_file = track_dir / "phase-3-task-1-plan.md"
            plan_file.write_text("# Implementation Plan\n", encoding="utf-8")

            # Mock git status --porcelain returning only the untracked plan file
            mock_run.return_value = subprocess.CompletedProcess(
                args=["git", "status", "--porcelain"],
                returncode=0,
                stdout="?? conductor/tracks/test/phase-3-task-1-plan.md\n",
                stderr="",
            )

            # Should not raise
            assert_post_plan_invariants(track_dir, phase_num=3, task_num=1)

    def test_assert_post_plan_invariants_fails_when_plan_missing_or_empty(self):
        """Asserts PlanInvariantError is raised when plan file is missing or 0 bytes."""
        assert_post_plan_invariants = get_target("assert_post_plan_invariants", self)
        PlanInvariantError = get_target("PlanInvariantError", self)

        with tempfile.TemporaryDirectory() as tmpdir:
            track_dir = Path(tmpdir)

            # Missing plan file
            with self.assertRaises(PlanInvariantError):
                assert_post_plan_invariants(track_dir, phase_num=3, task_num=1)

            # Empty plan file
            plan_file = track_dir / "phase-3-task-1-plan.md"
            plan_file.write_text("", encoding="utf-8")
            with self.assertRaises(PlanInvariantError):
                assert_post_plan_invariants(track_dir, phase_num=3, task_num=1)

    @patch("subprocess.run")
    def test_assert_post_plan_invariants_fails_when_production_code_modified(self, mock_run):
        """Asserts PlanInvariantError is raised if production application code was modified during planning."""
        assert_post_plan_invariants = get_target("assert_post_plan_invariants", self)
        PlanInvariantError = get_target("PlanInvariantError", self)

        with tempfile.TemporaryDirectory() as tmpdir:
            track_dir = Path(tmpdir)
            plan_file = track_dir / "phase-3-task-1-plan.md"
            plan_file.write_text("# Implementation Plan\n", encoding="utf-8")

            # Mock git status --porcelain reporting modified production code
            mock_run.return_value = subprocess.CompletedProcess(
                args=["git", "status", "--porcelain"],
                returncode=0,
                stdout=" M lib/services/tripService.ts\n?? conductor/tracks/test/phase-3-task-1-plan.md\n",
                stderr="",
            )

            with self.assertRaises(PlanInvariantError) as ctx:
                assert_post_plan_invariants(track_dir, phase_num=3, task_num=1)

            self.assertIn("tripService.ts", str(ctx.exception))


class TestTier1PlanningDispatch(unittest.TestCase):
    """Test suite for Tier 1 planning turn orchestration."""

    def test_dispatch_tier1_planning_skips_when_cached(self):
        """Asserts dispatch_tier1_planning skips agy turn execution when cached plan exists."""
        dispatch_tier1_planning = get_target("dispatch_tier1_planning", self)

        with patch.object(conductor_auto, "check_plan_cache", return_value=(True, Path("dummy.md"))) as mock_cache:
            with patch.object(conductor_auto, "run_agy_turn") as mock_turn:
                res = dispatch_tier1_planning("dummy-track", phase_num=3, task_num=1)

                self.assertTrue(res)
                mock_cache.assert_called_once()
                mock_turn.assert_not_called()

    def test_dispatch_tier1_planning_executes_turn_and_audits_invariants(self):
        """Asserts dispatch_tier1_planning generates prompt, runs agy turn, and verifies invariants on cache miss."""
        dispatch_tier1_planning = get_target("dispatch_tier1_planning", self)

        with patch.object(conductor_auto, "check_plan_cache", return_value=(False, Path("dummy.md"))):
            with patch.object(
                conductor_auto, "generate_turn_prompt", return_value="# Planning Prompt"
            ) as mock_gen_prompt:
                with patch.object(
                    conductor_auto, "run_agy_turn", return_value=(0, "Turn output", "")
                ) as mock_turn:
                    with patch.object(
                        conductor_auto, "assert_post_plan_invariants"
                    ) as mock_invariants:
                        res = dispatch_tier1_planning(
                            "dummy-track",
                            phase_num=3,
                            task_num=1,
                            plan_model="gemini-3.8-flash-high",
                            force_plan=False,
                        )

                        self.assertTrue(res)
                        mock_gen_prompt.assert_called_once()
                        mock_turn.assert_called_once_with(
                            prompt="# Planning Prompt",
                            mode="plan",
                            model="gemini-3.8-flash-high",
                            timeout=900.0,
                            cwd=unittest.mock.ANY,
                            log_file=unittest.mock.ANY,
                        )
                        mock_invariants.assert_called_once()


if __name__ == "__main__":
    unittest.main()
