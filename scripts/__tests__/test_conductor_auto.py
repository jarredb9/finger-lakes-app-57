"""
Unit tests for Conductor Auto-Runner (scripts/agent/conductor-auto.py).

Covers Phase 3: Task Parsing, Plan Validation, and Planning Tier (Tier 1).
- Track plan parsing and task status extraction (TestTrackPlanParser)
- Tier 1 planning prompt generation and invocation (TestPlanningPromptGeneration)
- Subprocess protocol, flag ordering, stdin pipe, and process group isolation (TestAgySubprocessProtocol)
- Idempotent plan caching and cache bypass (TestIdempotentPlanCache)
- Post-plan invariant verification (TestPostPlanInvariants)
- Tier 1 planning turn orchestration (TestTier1PlanningDispatch)

Covers Phase 4: Execution Tier (Tier 2) and Supervisor Invariant Verification.
- Tier 2 execution turn dispatch (TestTier2ExecutionDispatch)
- Working tree cleanliness & auto-recover flow (TestWorkingTreeAndAutoRecover)
- Red task active supervisor verification (TestSupervisorRedTaskVerification)
- Green task active supervisor verification (TestSupervisorGreenTaskVerification)
- Exempt task active supervisor verification (TestSupervisorExemptTaskVerification)
- Git commit & notes auditing (TestGitCommitAndNotesAudit)
- Tier 2 execution coordination (TestTier2ExecutionCoordination)

Covers Phase 5: Phase Boundaries, Checkpoints, Review Handshake, Composable Model Matrix, and CLI Dual-Logging.
- Composable Gemini 4 Hydrogen model matrix & 3-tier resolution (TestModelMatrixAndResolution)
- Gate 1 unattended checkpoint dispatch & commit/notes audit (TestGate1CheckpointDispatch)
- Gate 2 unattended review dispatch & brain directory snapshotting (TestGate2ReviewAndBrainSnapshot)
- Strict regex severity parsing & phase boundary exit codes (TestReviewSeverityAndExitCodes)
- Subprocess streaming, configurable --timeout, & DualLogger teeing (TestSubprocessStreamingAndDualLogging)
"""

import contextlib
import importlib.util
import inspect
import io
import itertools
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time
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
    """Test suite for agy CLI flag ordering, --print prompt delivery, and process group isolation."""

    def test_build_agy_command_strict_flag_ordering(self):
        """Asserts build_agy_command positions configuration flags strictly before --print <prompt>."""
        build_agy_command = get_target("build_agy_command", self)
        DEFAULT_PLAN_MODEL = get_target("DEFAULT_PLAN_MODEL", self)

        cmd = build_agy_command(mode="plan", model=DEFAULT_PLAN_MODEL, prompt="Plan task 1")

        self.assertEqual(cmd[0], "agy")
        self.assertIn("--print", cmd)
        self.assertIn("--mode", cmd)
        self.assertIn("--model", cmd)
        self.assertIn("--dangerously-skip-permissions", cmd)

        print_idx = cmd.index("--print")
        mode_idx = cmd.index("--mode")
        model_idx = cmd.index("--model")
        skip_idx = cmd.index("--dangerously-skip-permissions")

        # Configuration flags must strictly precede --print <prompt>
        self.assertLess(mode_idx, print_idx)
        self.assertLess(model_idx, print_idx)
        self.assertLess(skip_idx, print_idx)
        self.assertEqual(print_idx, len(cmd) - 2)
        self.assertEqual(cmd[-1], "Plan task 1")

    @patch("subprocess.Popen")
    def test_run_agy_turn_print_prompt_delivery_and_session_isolation(self, mock_popen_cls):
        """Asserts prompt is passed as the --print argument with stdin closed and start_new_session=True."""
        run_agy_turn = get_target("run_agy_turn", self)
        DEFAULT_PLAN_MODEL = get_target("DEFAULT_PLAN_MODEL", self)

        mock_proc = MagicMock()
        mock_proc.communicate.return_value = ("Turn output", "")
        mock_proc.returncode = 0
        mock_proc.pid = 12345
        mock_popen_cls.return_value = mock_proc

        prompt_text = "Detailed plan request prompt content"
        ret, stdout, stderr = run_agy_turn(
            prompt=prompt_text,
            mode="plan",
            model=DEFAULT_PLAN_MODEL,
            timeout=900.0,
        )

        self.assertEqual(ret, 0)
        self.assertEqual(stdout, "Turn output")

        # Verify Popen call arguments
        popen_args, popen_kwargs = mock_popen_cls.call_args
        cmd_called = popen_args[0]

        # Prompt must be passed as the --print argument, and stdin must be closed (DEVNULL)
        self.assertEqual(cmd_called[-2:], ["--print", prompt_text])
        self.assertEqual(popen_kwargs.get("stdin"), subprocess.DEVNULL)
        # Must isolate process session (start_new_session=True or preexec_fn=os.setsid)
        has_session_isolation = popen_kwargs.get("start_new_session") is True or popen_kwargs.get(
            "preexec_fn"
        ) in (os.setsid, getattr(os, "setpgrp", None))
        self.assertTrue(has_session_isolation, "Popen must specify start_new_session=True or os.setsid")

        mock_proc.communicate.assert_called_once_with(timeout=900.0)

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
        DEFAULT_PLAN_MODEL = get_target("DEFAULT_PLAN_MODEL", self)

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
                            plan_model=DEFAULT_PLAN_MODEL,
                            force_plan=False,
                        )

                        self.assertTrue(res)
                        mock_gen_prompt.assert_called_once()
                        mock_turn.assert_called_once_with(
                            prompt="# Planning Prompt",
                            mode="plan",
                            model=DEFAULT_PLAN_MODEL,
                            timeout=900.0,
                            cwd=unittest.mock.ANY,
                            log_file=unittest.mock.ANY,
                        )
                        mock_invariants.assert_called_once()


class TestTier2ExecutionDispatch(unittest.TestCase):
    """Test suite for Tier 2 execution turn dispatch and agy subprocess invocation."""

    def test_dispatch_tier2_invokes_generate_prompt_exec(self):
        """Asserts dispatch_tier2_execution invokes generate_turn_prompt with mode='exec' and runs agy."""
        dispatch_tier2_execution = get_target("dispatch_tier2_execution", self)
        DEFAULT_EXEC_MODEL = get_target("DEFAULT_EXEC_MODEL", self)

        with patch.object(conductor_auto, "generate_turn_prompt", create=True, return_value="# Exec prompt") as mock_gen_prompt:
            with patch.object(conductor_auto, "run_agy_turn", create=True, return_value=(0, "Exec output", "")) as mock_run_turn:
                with patch.object(conductor_auto, "check_working_tree_cleanliness", create=True, return_value=(True, [])):
                    with patch.object(conductor_auto, "verify_task_execution", create=True, return_value=True):
                        with patch.object(conductor_auto, "audit_git_commit_and_notes", create=True, return_value=True):
                            res = dispatch_tier2_execution(
                                "test-track",
                                phase_num=4,
                                task_num=1,
                                exec_model=DEFAULT_EXEC_MODEL,
                            )
                            self.assertTrue(res)
                            mock_gen_prompt.assert_called_once_with(
                                track="test-track",
                                phase_num=4,
                                task_num=1,
                                mode="exec",
                                cwd=unittest.mock.ANY,
                            )
                            mock_run_turn.assert_called_once()
                            _, kwargs = mock_run_turn.call_args
                            self.assertEqual(kwargs.get("mode"), "auto")
                            self.assertEqual(kwargs.get("model"), DEFAULT_EXEC_MODEL)
                            self.assertEqual(kwargs.get("timeout"), 900.0)
                            self.assertTrue(str(kwargs.get("log_file", "")).endswith("phase-4-task-1-exec.log"))

    def test_dispatch_tier2_raises_on_agy_failure(self):
        """Asserts dispatch_tier2_execution raises ProcessExecutionError on agy non-zero exit."""
        dispatch_tier2_execution = get_target("dispatch_tier2_execution", self)
        ProcessExecutionError = get_target("ProcessExecutionError", self)

        with patch.object(conductor_auto, "generate_turn_prompt", create=True, return_value="# Exec prompt"):
            with patch.object(conductor_auto, "run_agy_turn", create=True, return_value=(1, "", "Process failed")):
                with self.assertRaises(ProcessExecutionError) as ctx:
                    dispatch_tier2_execution("test-track", phase_num=4, task_num=1)
                self.assertIn("1", str(ctx.exception))

    def test_dispatch_tier2_raises_on_timeout(self):
        """Asserts dispatch_tier2_execution propagates ProcessExecutionError on timeout."""
        dispatch_tier2_execution = get_target("dispatch_tier2_execution", self)
        ProcessExecutionError = get_target("ProcessExecutionError", self)

        with patch.object(conductor_auto, "generate_turn_prompt", create=True, return_value="# Exec prompt"):
            with patch.object(
                conductor_auto,
                "run_agy_turn",
                create=True,
                side_effect=ProcessExecutionError("Turn timed out after 900.0s"),
            ):
                with self.assertRaises(ProcessExecutionError) as ctx:
                    dispatch_tier2_execution("test-track", phase_num=4, task_num=1)
                self.assertIn("timed out", str(ctx.exception))


class TestWorkingTreeAndAutoRecover(unittest.TestCase):
    """Test suite for working tree cleanliness checks and single-turn --auto-recover flow."""

    @patch("subprocess.run")
    def test_check_working_tree_cleanliness_clean_tree(self, mock_run):
        """Asserts check_working_tree_cleanliness returns (True, []) when git status is empty."""
        check_working_tree_cleanliness = get_target("check_working_tree_cleanliness", self)

        mock_run.return_value = subprocess.CompletedProcess(
            args=["git", "status", "--porcelain"],
            returncode=0,
            stdout="",
            stderr="",
        )
        is_clean, dirty_files = check_working_tree_cleanliness()
        self.assertTrue(is_clean)
        self.assertEqual(dirty_files, [])

    @patch("subprocess.run")
    def test_check_working_tree_cleanliness_dirty_tree(self, mock_run):
        """Asserts check_working_tree_cleanliness returns (False, files) when working tree has changes."""
        check_working_tree_cleanliness = get_target("check_working_tree_cleanliness", self)

        mock_run.return_value = subprocess.CompletedProcess(
            args=["git", "status", "--porcelain"],
            returncode=0,
            stdout=" M scripts/agent/conductor-auto.py\n?? untracked.txt\n",
            stderr="",
        )
        is_clean, dirty_files = check_working_tree_cleanliness()
        self.assertFalse(is_clean)
        self.assertEqual(dirty_files, ["scripts/agent/conductor-auto.py", "untracked.txt"])

    def test_dispatch_recovery_turn_invokes_generate_prompt_recovery(self):
        """Asserts dispatch_recovery_turn generates recovery prompt and dispatches agy turn."""
        dispatch_recovery_turn = get_target("dispatch_recovery_turn", self)

        with patch.object(conductor_auto, "generate_turn_prompt", create=True, return_value="# Recovery prompt") as mock_gen_prompt:
            with patch.object(conductor_auto, "run_agy_turn", create=True, return_value=(0, "Recovered", "")) as mock_run_turn:
                res = dispatch_recovery_turn("test-track", phase_num=4, task_num=1)
                self.assertTrue(res)
                mock_gen_prompt.assert_called_once_with(
                    track="test-track",
                    phase_num=4,
                    task_num=1,
                    mode="recovery",
                    cwd=unittest.mock.ANY,
                )
                mock_run_turn.assert_called_once()
                _, kwargs = mock_run_turn.call_args
                self.assertEqual(kwargs.get("mode"), "auto")
                self.assertTrue(str(kwargs.get("log_file", "")).endswith("phase-4-task-1-recovery.log"))

    def test_auto_recover_succeeds_when_clean_after_recovery(self):
        """Asserts dispatch_tier2_execution succeeds when recovery turn cleans the dirty tree."""
        dispatch_tier2_execution = get_target("dispatch_tier2_execution", self)

        with patch.object(conductor_auto, "generate_turn_prompt", create=True, return_value="# Exec"):
            with patch.object(conductor_auto, "run_agy_turn", create=True, return_value=(0, "Done", "")):
                with patch.object(
                    conductor_auto,
                    "check_working_tree_cleanliness",
                    create=True,
                    side_effect=[(False, ["file.ts"]), (True, [])],
                ):
                    with patch.object(conductor_auto, "dispatch_recovery_turn", create=True, return_value=True) as mock_recover:
                        with patch.object(conductor_auto, "verify_task_execution", create=True, return_value=True):
                            with patch.object(conductor_auto, "audit_git_commit_and_notes", create=True, return_value=True):
                                res = dispatch_tier2_execution("test-track", phase_num=4, task_num=1, auto_recover=True)
                                self.assertTrue(res)
                                mock_recover.assert_called_once()

    def test_auto_recover_fails_when_still_dirty_after_recovery(self):
        """Asserts dispatch_tier2_execution raises SupervisorInvariantError if tree remains dirty after recovery."""
        dispatch_tier2_execution = get_target("dispatch_tier2_execution", self)
        SupervisorInvariantError = get_target("SupervisorInvariantError", self)

        with patch.object(conductor_auto, "generate_turn_prompt", create=True, return_value="# Exec"):
            with patch.object(conductor_auto, "run_agy_turn", create=True, return_value=(0, "Done", "")):
                with patch.object(
                    conductor_auto,
                    "check_working_tree_cleanliness",
                    create=True,
                    return_value=(False, ["file.ts"]),
                ):
                    with patch.object(conductor_auto, "dispatch_recovery_turn", create=True, return_value=True):
                        with self.assertRaises(SupervisorInvariantError):
                            dispatch_tier2_execution("test-track", phase_num=4, task_num=1, auto_recover=True)

    def test_uncommitted_changes_fail_fast_when_auto_recover_disabled(self):
        """Asserts dispatch_tier2_execution raises SupervisorInvariantError immediately if dirty and auto_recover=False."""
        dispatch_tier2_execution = get_target("dispatch_tier2_execution", self)
        SupervisorInvariantError = get_target("SupervisorInvariantError", self)

        with patch.object(conductor_auto, "generate_turn_prompt", create=True, return_value="# Exec"):
            with patch.object(conductor_auto, "run_agy_turn", create=True, return_value=(0, "Done", "")):
                with patch.object(
                    conductor_auto,
                    "check_working_tree_cleanliness",
                    create=True,
                    return_value=(False, ["file.ts"]),
                ):
                    with patch.object(conductor_auto, "dispatch_recovery_turn", create=True) as mock_recover:
                        with self.assertRaises(SupervisorInvariantError):
                            dispatch_tier2_execution("test-track", phase_num=4, task_num=1, auto_recover=False)
                        mock_recover.assert_not_called()


class TestSupervisorRedTaskVerification(unittest.TestCase):
    """Test suite for Red task active supervisor verification (exit != 0, assertion parsing, zero prod diff)."""

    def test_parse_test_failure_markers_jest_assertion(self):
        """Asserts parse_test_failure_markers detects Jest expect() assertion failure."""
        parse_test_failure_markers = get_target("parse_test_failure_markers", self)

        output = "Error: expect(received).toEqual(expected)\n\nExpected: 2\nReceived: 1\n    at Object.<anonymous> (/app/tests/unit.test.ts:25:12)"
        is_valid, reason = parse_test_failure_markers(output)
        self.assertTrue(is_valid)
        self.assertTrue(len(reason) > 0)

    def test_parse_test_failure_markers_python_assertion(self):
        """Asserts parse_test_failure_markers detects Python unittest FAIL / AssertionError."""
        parse_test_failure_markers = get_target("parse_test_failure_markers", self)

        output = "FAIL: test_feature (test_mod.TestClass)\nTraceback (most recent call last):\nAssertionError: False is not true"
        is_valid, reason = parse_test_failure_markers(output)
        self.assertTrue(is_valid)
        self.assertTrue(len(reason) > 0)

    def test_parse_test_failure_markers_rejects_jest_syntax_error(self):
        """Asserts parse_test_failure_markers rejects Jest SyntaxError as invalid assertion failure."""
        parse_test_failure_markers = get_target("parse_test_failure_markers", self)

        output = "SyntaxError: Unexpected token 'export'\n    at Runtime.createScriptFromCode (/node_modules/jest-runtime/build/index.js:1)"
        is_valid, reason = parse_test_failure_markers(output)
        self.assertFalse(is_valid)
        self.assertIn("SyntaxError", reason)

    def test_parse_test_failure_markers_rejects_jest_cannot_find_module(self):
        """Asserts parse_test_failure_markers rejects Cannot find module errors."""
        parse_test_failure_markers = get_target("parse_test_failure_markers", self)

        output = "Cannot find module './missingSeam' from 'tests/unit.test.ts'"
        is_valid, reason = parse_test_failure_markers(output)
        self.assertFalse(is_valid)
        self.assertIn("Cannot find module", reason)

    def test_parse_test_failure_markers_rejects_python_error_traceback(self):
        """Asserts parse_test_failure_markers rejects Python ERROR / ImportError tracebacks."""
        parse_test_failure_markers = get_target("parse_test_failure_markers", self)

        output = "ERROR: test_feature (test_mod.TestClass)\nImportError: cannot import name 'missing_func' from 'scripts.agent'"
        is_valid, reason = parse_test_failure_markers(output)
        self.assertFalse(is_valid)
        self.assertTrue("ERROR" in reason or "ImportError" in reason)

    @patch("subprocess.run")
    def test_verify_red_task_passes_on_assertion_failure_and_zero_production_diff(self, mock_run):
        """Asserts verify_red_task passes when test exits non-zero with assertion failure and 0 prod files modified."""
        verify_red_task = get_target("verify_red_task", self)

        def run_side_effect(cmd, *args, **kwargs):
            if isinstance(cmd, list) and cmd[0] == "git" and "diff" in cmd:
                return subprocess.CompletedProcess(
                    args=cmd,
                    returncode=0,
                    stdout="scripts/__tests__/test_conductor_auto.py\n",
                    stderr="",
                )
            return subprocess.CompletedProcess(
                args=cmd,
                returncode=1,
                stdout="Error: expect(received).toEqual(expected)\nExpected: 2\nReceived: 1\n",
                stderr="",
            )

        mock_run.side_effect = run_side_effect
        res = verify_red_task(test_cmd="npm test", base_sha="abc1234")
        self.assertTrue(res)

    @patch("subprocess.run")
    def test_verify_red_task_fails_when_test_exits_zero(self, mock_run):
        """Asserts verify_red_task raises SupervisorInvariantError when test exits 0 in Red phase."""
        verify_red_task = get_target("verify_red_task", self)
        SupervisorInvariantError = get_target("SupervisorInvariantError", self)

        mock_run.return_value = subprocess.CompletedProcess(
            args=["npm", "test"],
            returncode=0,
            stdout="Ran 5 tests, 5 passed",
            stderr="",
        )
        with self.assertRaises(SupervisorInvariantError) as ctx:
            verify_red_task(test_cmd="npm test", base_sha="abc1234")
        self.assertIn("Red task", str(ctx.exception))

    @patch("subprocess.run")
    def test_verify_red_task_fails_on_syntax_error(self, mock_run):
        """Asserts verify_red_task raises SupervisorInvariantError on syntax/module crash."""
        verify_red_task = get_target("verify_red_task", self)
        SupervisorInvariantError = get_target("SupervisorInvariantError", self)

        mock_run.return_value = subprocess.CompletedProcess(
            args=["npm", "test"],
            returncode=1,
            stdout="SyntaxError: Unexpected identifier\n",
            stderr="",
        )
        with self.assertRaises(SupervisorInvariantError) as ctx:
            verify_red_task(test_cmd="npm test", base_sha="abc1234")
        self.assertTrue("syntax" in str(ctx.exception).lower() or "SyntaxError" in str(ctx.exception))

    @patch("subprocess.run")
    def test_verify_red_task_fails_when_production_code_modified(self, mock_run):
        """Asserts verify_red_task raises SupervisorInvariantError when production code was modified."""
        verify_red_task = get_target("verify_red_task", self)
        SupervisorInvariantError = get_target("SupervisorInvariantError", self)

        def run_side_effect(cmd, *args, **kwargs):
            if isinstance(cmd, list) and cmd[0] == "git" and "diff" in cmd:
                return subprocess.CompletedProcess(
                    args=cmd,
                    returncode=0,
                    stdout="scripts/__tests__/test_conductor_auto.py\nscripts/agent/conductor-auto.py\n",
                    stderr="",
                )
            return subprocess.CompletedProcess(
                args=cmd,
                returncode=1,
                stdout="Error: expect(received).toEqual(expected)\n",
                stderr="",
            )

        mock_run.side_effect = run_side_effect
        with self.assertRaises(SupervisorInvariantError) as ctx:
            verify_red_task(test_cmd="npm test", base_sha="abc1234")
        self.assertIn("conductor-auto.py", str(ctx.exception))


class TestSupervisorGreenTaskVerification(unittest.TestCase):
    """Test suite for Green task active supervisor verification (test exit 0 AND type-check exit 0)."""

    @patch("subprocess.run")
    def test_verify_green_task_passes_when_test_and_typecheck_pass(self, mock_run):
        """Asserts verify_green_task passes when both test command and type-check succeed."""
        verify_green_task = get_target("verify_green_task", self)

        mock_run.return_value = subprocess.CompletedProcess(
            args=["cmd"],
            returncode=0,
            stdout="Success",
            stderr="",
        )
        res = verify_green_task(test_cmd="npm test", type_check_cmd="npm run type-check")
        self.assertTrue(res)

    @patch("subprocess.run")
    def test_verify_green_task_fails_when_test_fails(self, mock_run):
        """Asserts verify_green_task raises SupervisorInvariantError when test command exits non-zero."""
        verify_green_task = get_target("verify_green_task", self)
        SupervisorInvariantError = get_target("SupervisorInvariantError", self)

        def run_side_effect(cmd, *args, **kwargs):
            if "type-check" in str(cmd):
                return subprocess.CompletedProcess(args=cmd, returncode=0, stdout="", stderr="")
            return subprocess.CompletedProcess(args=cmd, returncode=1, stdout="Test failed", stderr="")

        mock_run.side_effect = run_side_effect
        with self.assertRaises(SupervisorInvariantError) as ctx:
            verify_green_task(test_cmd="npm test")
        self.assertIn("test", str(ctx.exception).lower())

    @patch("subprocess.run")
    def test_verify_green_task_fails_when_typecheck_fails(self, mock_run):
        """Asserts verify_green_task raises SupervisorInvariantError when type-check exits non-zero."""
        verify_green_task = get_target("verify_green_task", self)
        SupervisorInvariantError = get_target("SupervisorInvariantError", self)

        def run_side_effect(cmd, *args, **kwargs):
            if "type-check" in str(cmd):
                return subprocess.CompletedProcess(args=cmd, returncode=2, stdout="Type errors", stderr="")
            return subprocess.CompletedProcess(args=cmd, returncode=0, stdout="All tests passed", stderr="")

        mock_run.side_effect = run_side_effect
        with self.assertRaises(SupervisorInvariantError) as ctx:
            verify_green_task(test_cmd="npm test")
        self.assertTrue("type" in str(ctx.exception).lower())


class TestSupervisorExemptTaskVerification(unittest.TestCase):
    """Test suite for Exempt task category-specific active supervisor verification."""

    @patch("subprocess.run")
    def test_verify_exempt_task_ui_runs_build(self, mock_run):
        """Asserts verify_exempt_task('ui') runs npm run build and asserts exit 0."""
        verify_exempt_task = get_target("verify_exempt_task", self)

        mock_run.return_value = subprocess.CompletedProcess(args=["npm", "run", "build"], returncode=0, stdout="", stderr="")
        res = verify_exempt_task("ui")
        self.assertTrue(res)

    @patch("subprocess.run")
    def test_verify_exempt_task_infra_runs_lint(self, mock_run):
        """Asserts verify_exempt_task('infra') runs npm run lint and asserts exit 0."""
        verify_exempt_task = get_target("verify_exempt_task", self)

        mock_run.return_value = subprocess.CompletedProcess(args=["npm", "run", "lint"], returncode=0, stdout="", stderr="")
        res = verify_exempt_task("infra")
        self.assertTrue(res)

    @patch("subprocess.run")
    def test_verify_exempt_task_types_runs_typecheck(self, mock_run):
        """Asserts verify_exempt_task('types') runs npm run type-check and asserts exit 0."""
        verify_exempt_task = get_target("verify_exempt_task", self)

        mock_run.return_value = subprocess.CompletedProcess(args=["npm", "run", "type-check"], returncode=0, stdout="", stderr="")
        res = verify_exempt_task("types")
        self.assertTrue(res)

    @patch("subprocess.run")
    def test_verify_exempt_task_docs_passes_on_markdown_only(self, mock_run):
        """Asserts verify_exempt_task('docs') succeeds when only non-empty markdown files are modified."""
        verify_exempt_task = get_target("verify_exempt_task", self)

        with tempfile.TemporaryDirectory() as tmpdir:
            doc_file = Path(tmpdir) / "docs" / "agents" / "conductor-auto.md"
            doc_file.parent.mkdir(parents=True, exist_ok=True)
            doc_file.write_text("# Documentation\nNon-empty content.\n", encoding="utf-8")

            mock_run.return_value = subprocess.CompletedProcess(
                args=["git", "diff", "--name-only", "abc1234", "HEAD"],
                returncode=0,
                stdout="docs/agents/conductor-auto.md\n",
                stderr="",
            )
            res = verify_exempt_task("docs", base_sha="abc1234", cwd=Path(tmpdir))
            self.assertTrue(res)

    @patch("subprocess.run")
    def test_verify_exempt_task_docs_fails_on_non_markdown_modification(self, mock_run):
        """Asserts verify_exempt_task('docs') raises SupervisorInvariantError if non-markdown file modified."""
        verify_exempt_task = get_target("verify_exempt_task", self)
        SupervisorInvariantError = get_target("SupervisorInvariantError", self)

        mock_run.return_value = subprocess.CompletedProcess(
            args=["git", "diff", "--name-only"],
            returncode=0,
            stdout="docs/doc.md\nlib/helper.ts\n",
            stderr="",
        )
        with self.assertRaises(SupervisorInvariantError) as ctx:
            verify_exempt_task("docs", base_sha="abc1234")
        self.assertIn("lib/helper.ts", str(ctx.exception))

    @patch("subprocess.run")
    def test_verify_exempt_task_docs_fails_on_empty_file(self, mock_run):
        """Asserts verify_exempt_task('docs') raises SupervisorInvariantError if modified markdown is empty."""
        verify_exempt_task = get_target("verify_exempt_task", self)
        SupervisorInvariantError = get_target("SupervisorInvariantError", self)

        with tempfile.TemporaryDirectory() as tmpdir:
            empty_file = Path(tmpdir) / "docs" / "empty.md"
            empty_file.parent.mkdir(parents=True, exist_ok=True)
            empty_file.write_text("", encoding="utf-8")

            mock_run.return_value = subprocess.CompletedProcess(
                args=["git", "diff", "--name-only"],
                returncode=0,
                stdout="docs/empty.md\n",
                stderr="",
            )
            with self.assertRaises(SupervisorInvariantError) as ctx:
                verify_exempt_task("docs", base_sha="abc1234", cwd=Path(tmpdir))
            self.assertTrue("empty" in str(ctx.exception).lower())


class TestGitCommitAndNotesAudit(unittest.TestCase):
    """Test suite for Git conventional commit, git notes metadata, and plan update auditing."""

    @patch("subprocess.run")
    def test_audit_git_commit_valid_conventional_format(self, mock_run):
        """Asserts audit_git_commit_and_notes succeeds on valid conventional commit, complete notes, and plan update."""
        audit_git_commit_and_notes = get_target("audit_git_commit_and_notes", self)
        TaskInfo = get_target("TaskInfo", self)

        task = TaskInfo(
            task_num=1,
            description="Test task",
            status="complete",
            status_char="x",
            is_checkpoint=False,
            commit_sha="1122334",
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            plan_path = Path(tmpdir) / "plan.md"
            plan_path.write_text("- [x] Task: Test task [commit: 1122334]\n", encoding="utf-8")

            def run_side_effect(cmd, *args, **kwargs):
                cmd_str = " ".join(cmd) if isinstance(cmd, list) else str(cmd)
                if "log -1 --format=%B" in cmd_str:
                    return subprocess.CompletedProcess(
                        args=cmd,
                        returncode=0,
                        stdout="feat(agent): implement tier 2 execution turn in conductor-auto.py\n",
                        stderr="",
                    )
                if "notes show" in cmd_str:
                    note = (
                        "Task: Test task\n"
                        "Summary: Implemented tier 2 turn.\n"
                        "Files: scripts/agent/conductor-auto.py\n"
                        "Rationale: Issue #162 requirements.\n"
                    )
                    return subprocess.CompletedProcess(args=cmd, returncode=0, stdout=note, stderr="")
                if "log -1" in cmd_str and "plan.md" in cmd_str:
                    return subprocess.CompletedProcess(
                        args=cmd,
                        returncode=0,
                        stdout="conductor(plan): Mark task 'Test task' as complete\n",
                        stderr="",
                    )
                return subprocess.CompletedProcess(args=cmd, returncode=0, stdout="", stderr="")

            mock_run.side_effect = run_side_effect
            res = audit_git_commit_and_notes(task, "1122334", plan_path, cwd=Path(tmpdir))
            self.assertTrue(res)

    @patch("subprocess.run")
    def test_audit_git_commit_rejects_non_conventional_message(self, mock_run):
        """Asserts audit_git_commit_and_notes raises SupervisorInvariantError on non-conventional commit message."""
        audit_git_commit_and_notes = get_target("audit_git_commit_and_notes", self)
        SupervisorInvariantError = get_target("SupervisorInvariantError", self)
        TaskInfo = get_target("TaskInfo", self)

        task = TaskInfo(task_num=1, description="Test", status="complete", status_char="x", is_checkpoint=False)

        mock_run.return_value = subprocess.CompletedProcess(
            args=["git", "log", "-1", "--format=%B", "1122334"],
            returncode=0,
            stdout="Fixed some stuff and wrote code\n",
            stderr="",
        )
        with self.assertRaises(SupervisorInvariantError) as ctx:
            audit_git_commit_and_notes(task, "1122334", Path("dummy.md"))
        self.assertTrue("conventional" in str(ctx.exception).lower())

    @patch("subprocess.run")
    def test_audit_git_notes_rejects_missing_metadata_fields(self, mock_run):
        """Asserts audit_git_commit_and_notes raises SupervisorInvariantError if git note lacks required metadata."""
        audit_git_commit_and_notes = get_target("audit_git_commit_and_notes", self)
        SupervisorInvariantError = get_target("SupervisorInvariantError", self)
        TaskInfo = get_target("TaskInfo", self)

        task = TaskInfo(task_num=1, description="Test", status="complete", status_char="x", is_checkpoint=False)

        def run_side_effect(cmd, *args, **kwargs):
            cmd_str = " ".join(cmd) if isinstance(cmd, list) else str(cmd)
            if "log -1 --format=%B" in cmd_str:
                return subprocess.CompletedProcess(
                    args=cmd,
                    returncode=0,
                    stdout="feat(agent): valid commit message\n",
                    stderr="",
                )
            if "notes show" in cmd_str:
                # Missing Rationale
                note = "Task: Test task\nSummary: Implemented.\nFiles: file.py\n"
                return subprocess.CompletedProcess(args=cmd, returncode=0, stdout=note, stderr="")
            return subprocess.CompletedProcess(args=cmd, returncode=0, stdout="", stderr="")

        mock_run.side_effect = run_side_effect
        with self.assertRaises(SupervisorInvariantError) as ctx:
            audit_git_commit_and_notes(task, "1122334", Path("dummy.md"))
        self.assertIn("Rationale", str(ctx.exception))

    @patch("subprocess.run")
    def test_audit_plan_update_rejects_incomplete_plan_or_missing_sha(self, mock_run):
        """Asserts audit_git_commit_and_notes raises SupervisorInvariantError if plan.md not updated with [x] and SHA."""
        audit_git_commit_and_notes = get_target("audit_git_commit_and_notes", self)
        SupervisorInvariantError = get_target("SupervisorInvariantError", self)
        TaskInfo = get_target("TaskInfo", self)

        task = TaskInfo(task_num=1, description="Test task", status="pending", status_char=" ", is_checkpoint=False)

        with tempfile.TemporaryDirectory() as tmpdir:
            plan_path = Path(tmpdir) / "plan.md"
            plan_path.write_text("- [ ] Task: Test task\n", encoding="utf-8")

            def run_side_effect(cmd, *args, **kwargs):
                cmd_str = " ".join(cmd) if isinstance(cmd, list) else str(cmd)
                if "log -1 --format=%B" in cmd_str:
                    return subprocess.CompletedProcess(
                        args=cmd,
                        returncode=0,
                        stdout="feat(agent): valid commit message\n",
                        stderr="",
                    )
                if "notes show" in cmd_str:
                    note = "Task: Test\nSummary: S\nFiles: F\nRationale: R\n"
                    return subprocess.CompletedProcess(args=cmd, returncode=0, stdout=note, stderr="")
                return subprocess.CompletedProcess(args=cmd, returncode=0, stdout="", stderr="")

            mock_run.side_effect = run_side_effect
            with self.assertRaises(SupervisorInvariantError) as ctx:
                audit_git_commit_and_notes(task, "1122334", plan_path)
            self.assertTrue("plan" in str(ctx.exception).lower())

    @patch("subprocess.run")
    def test_audit_plan_commit_rejects_missing_plan_commit(self, mock_run):
        """Asserts audit_git_commit_and_notes raises SupervisorInvariantError if conductor(plan) commit is missing."""
        audit_git_commit_and_notes = get_target("audit_git_commit_and_notes", self)
        SupervisorInvariantError = get_target("SupervisorInvariantError", self)
        TaskInfo = get_target("TaskInfo", self)

        task = TaskInfo(task_num=1, description="Test task", status="complete", status_char="x", is_checkpoint=False)

        with tempfile.TemporaryDirectory() as tmpdir:
            plan_path = Path(tmpdir) / "plan.md"
            plan_path.write_text("- [x] Task: Test task [commit: 1122334]\n", encoding="utf-8")

            def run_side_effect(cmd, *args, **kwargs):
                cmd_str = " ".join(cmd) if isinstance(cmd, list) else str(cmd)
                if "log -1 --format=%B" in cmd_str:
                    return subprocess.CompletedProcess(
                        args=cmd,
                        returncode=0,
                        stdout="feat(agent): valid commit message\n",
                        stderr="",
                    )
                if "notes show" in cmd_str:
                    note = "Task: Test\nSummary: S\nFiles: F\nRationale: R\n"
                    return subprocess.CompletedProcess(args=cmd, returncode=0, stdout=note, stderr="")
                if "log -1" in cmd_str and "plan.md" in cmd_str:
                    # Latest commit on plan.md was unrelated
                    return subprocess.CompletedProcess(args=cmd, returncode=0, stdout="chore: other commit\n", stderr="")
                return subprocess.CompletedProcess(args=cmd, returncode=0, stdout="", stderr="")

            mock_run.side_effect = run_side_effect
            with self.assertRaises(SupervisorInvariantError) as ctx:
                audit_git_commit_and_notes(task, "1122334", plan_path)
            self.assertIn("conductor(plan)", str(ctx.exception))

    @patch("subprocess.run")
    def test_audit_rejects_commit_matching_base_sha(self, mock_run):
        """Asserts audit_git_commit_and_notes raises SupervisorInvariantError if commit SHA matches baseline."""
        audit_git_commit_and_notes = get_target("audit_git_commit_and_notes", self)
        SupervisorInvariantError = get_target("SupervisorInvariantError", self)
        TaskInfo = get_target("TaskInfo", self)

        task = TaskInfo(task_num=1, description="Test task", status="complete", status_char="x", is_checkpoint=False)
        with self.assertRaises(SupervisorInvariantError) as ctx:
            audit_git_commit_and_notes(task, "1122334", Path("dummy.md"), base_sha="1122334abcdef")
        self.assertIn("no new task commit", str(ctx.exception).lower())
        mock_run.assert_not_called()

    @patch("subprocess.run")
    def test_audit_rejects_incomplete_task_status_even_if_another_line_has_sha(self, mock_run):
        """Asserts audit_git_commit_and_notes rejects when target TaskInfo.status is not complete."""
        audit_git_commit_and_notes = get_target("audit_git_commit_and_notes", self)
        SupervisorInvariantError = get_target("SupervisorInvariantError", self)
        TaskInfo = get_target("TaskInfo", self)

        task = TaskInfo(task_num=2, description="Second task", status="pending", status_char=" ", is_checkpoint=False)
        with tempfile.TemporaryDirectory() as tmpdir:
            plan_path = Path(tmpdir) / "plan.md"
            plan_path.write_text("- [x] Task: First task [commit: 1122334]\n- [ ] Task: Second task\n", encoding="utf-8")

            def run_side_effect(cmd, *args, **kwargs):
                cmd_str = " ".join(cmd) if isinstance(cmd, list) else str(cmd)
                if "log -1 --format=%B" in cmd_str:
                    return subprocess.CompletedProcess(args=cmd, returncode=0, stdout="feat(agent): msg\n", stderr="")
                if "notes show" in cmd_str:
                    return subprocess.CompletedProcess(
                        args=cmd, returncode=0, stdout="Task: T\nSummary: S\nFiles: F\nRationale: R\n", stderr=""
                    )
                return subprocess.CompletedProcess(args=cmd, returncode=0, stdout="", stderr="")

            mock_run.side_effect = run_side_effect
            with self.assertRaises(SupervisorInvariantError) as ctx:
                audit_git_commit_and_notes(task, "1122334", plan_path)
            self.assertIn("not marked [x]", str(ctx.exception))


class TestSupervisorTaskVerificationRouter(unittest.TestCase):
    """Test suite for verify_task_execution command resolution, Red/Green routing, and edge cases."""

    def test_is_red_task_production_violation_uses_path_segments(self):
        """Asserts directories ending in 'test' or 'e2e' (e.g. contest/) do not bypass Red production checks."""
        is_red_violation = get_target("_is_red_task_production_violation", self)

        self.assertTrue(is_red_violation("app/api/contest/route.ts"))
        self.assertTrue(is_red_violation("lib/backtest/engine.ts"))
        self.assertFalse(is_red_violation("app/api/__tests__/route.test.ts"))
        self.assertFalse(is_red_violation("scripts/__tests__/test_conductor_auto.py"))

    @patch("subprocess.run")
    def test_verify_exempt_task_docs_fails_on_empty_diff(self, mock_run):
        """Asserts verify_exempt_task('docs') raises SupervisorInvariantError when no files were modified."""
        verify_exempt_task = get_target("verify_exempt_task", self)
        SupervisorInvariantError = get_target("SupervisorInvariantError", self)

        mock_run.return_value = subprocess.CompletedProcess(
            args=["git", "diff", "--name-only"],
            returncode=0,
            stdout="",
            stderr="",
        )
        with self.assertRaises(SupervisorInvariantError) as ctx:
            verify_exempt_task("docs", base_sha="abc1234")
        self.assertIn("no modified markdown", str(ctx.exception).lower())

    @patch("subprocess.run")
    def test_verify_red_task_preserves_quoted_args_via_shlex(self, mock_run):
        """Asserts verify_red_task splits quoted command flags using shlex rather than naive whitespace split."""
        verify_red_task = get_target("verify_red_task", self)

        def run_side_effect(cmd, *args, **kwargs):
            if isinstance(cmd, list) and cmd[0] == "git":
                return subprocess.CompletedProcess(args=cmd, returncode=0, stdout="scripts/__tests__/test_a.py\n", stderr="")
            self.assertEqual(cmd, ["pytest", "-k", "test_a or test_b"])
            return subprocess.CompletedProcess(args=cmd, returncode=1, stdout="AssertionError: boom\n", stderr="")

        mock_run.side_effect = run_side_effect
        self.assertTrue(verify_red_task('pytest -k "test_a or test_b"', base_sha="abc1234"))

    def test_verify_task_execution_routes_python_red_and_green_from_task_plan(self):
        """Asserts verify_task_execution resolves target Python commands and skips npm type-check for Python-only tasks."""
        verify_task_execution = get_target("verify_task_execution", self)

        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            track_dir = root / "conductor" / "tracks" / "py-track"
            track_dir.mkdir(parents=True)
            (track_dir / "plan.md").write_text(
                "## Phase 1: Runner\n"
                "- [ ] Task: Write failing unit tests for runner\n"
                "- [ ] Task: Implement runner to pass tests\n",
                encoding="utf-8",
            )
            (track_dir / "phase-1-task-1-plan.md").write_text(
                "- **Path:** `scripts/__tests__/test_runner.py`\n\n"
                "## Execution Verification Protocol\n"
                "```bash\npython3.11 -m unittest scripts/__tests__/test_runner.py\n```\n",
                encoding="utf-8",
            )
            (track_dir / "phase-1-task-2-plan.md").write_text(
                "- **Path:** `scripts/agent/runner.py`\n\n"
                "## Execution Verification Protocol\n"
                "```bash\npython3.11 -m unittest scripts/__tests__/test_runner.py\n```\n",
                encoding="utf-8",
            )

            with patch.object(conductor_auto, "verify_red_task", return_value=True) as mock_red:
                self.assertTrue(verify_task_execution("py-track", phase_num=1, task_num=1, base_sha="abc1234", cwd=root))
                mock_red.assert_called_once()
                self.assertEqual(
                    mock_red.call_args.kwargs["test_cmd"],
                    "python3.11 -m unittest scripts/__tests__/test_runner.py",
                )

            with patch.object(conductor_auto, "verify_green_task", return_value=True) as mock_green:
                self.assertTrue(verify_task_execution("py-track", phase_num=1, task_num=2, base_sha="abc1234", cwd=root))
                mock_green.assert_called_once()
                self.assertEqual(
                    mock_green.call_args.kwargs["test_cmd"],
                    "python3.11 -m unittest scripts/__tests__/test_runner.py",
                )
                self.assertIsNone(mock_green.call_args.kwargs["type_check_cmd"])

    def test_verify_task_execution_routes_ts_failing_test_without_red_phase_phrase(self):
        """Asserts 'Write failing unit tests...' routes to verify_red_task with containerized Jest and TS Green includes type-check."""
        verify_task_execution = get_target("verify_task_execution", self)

        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            track_dir = root / "conductor" / "tracks" / "ts-track"
            track_dir.mkdir(parents=True)
            (track_dir / "plan.md").write_text(
                "## Phase 1: Feature\n"
                "- [ ] Task: Write failing unit tests for `lib/__tests__/foo.test.ts`\n"
                "- [ ] Task: Implement foo service in `lib/foo.ts`\n",
                encoding="utf-8",
            )

            with patch.object(conductor_auto, "verify_red_task", return_value=True) as mock_red:
                self.assertTrue(verify_task_execution("ts-track", phase_num=1, task_num=1, base_sha="abc1234", cwd=root))
                mock_red.assert_called_once()
                self.assertIn("run-jest-container.sh", mock_red.call_args.kwargs["test_cmd"])

            with patch.object(conductor_auto, "verify_green_task", return_value=True) as mock_green:
                self.assertTrue(verify_task_execution("ts-track", phase_num=1, task_num=2, base_sha="abc1234", cwd=root))
                mock_green.assert_called_once()
                self.assertEqual(mock_green.call_args.kwargs["type_check_cmd"], "npm run type-check")


class TestTier2ExecutionCoordination(unittest.TestCase):
    """Test suite for end-to-end Tier 2 turn coordination and fail-fast invariant pipeline."""

    def test_dispatch_tier2_execution_full_pipeline_success(self):
        """Asserts dispatch_tier2_execution coordinates all pipeline steps in sequence."""
        dispatch_tier2_execution = get_target("dispatch_tier2_execution", self)

        with patch.object(conductor_auto, "generate_turn_prompt", create=True, return_value="# Exec") as mock_gen_prompt:
            with patch.object(conductor_auto, "run_agy_turn", create=True, return_value=(0, "Done", "")) as mock_run_turn:
                with patch.object(conductor_auto, "check_working_tree_cleanliness", create=True, return_value=(True, [])) as mock_tree:
                    with patch.object(conductor_auto, "verify_task_execution", create=True, return_value=True) as mock_verify:
                        with patch.object(conductor_auto, "audit_git_commit_and_notes", create=True, return_value=True) as mock_audit:
                            res = dispatch_tier2_execution("test-track", phase_num=4, task_num=1)
                            self.assertTrue(res)
                            mock_gen_prompt.assert_called_once()
                            mock_run_turn.assert_called_once()
                            mock_tree.assert_called_once()
                            mock_verify.assert_called_once()
                            mock_audit.assert_called_once()

    def test_dispatch_tier2_execution_halts_on_audit_failure(self):
        """Asserts dispatch_tier2_execution halts immediately if audit fails."""
        dispatch_tier2_execution = get_target("dispatch_tier2_execution", self)
        SupervisorInvariantError = get_target("SupervisorInvariantError", self)

        with patch.object(conductor_auto, "generate_turn_prompt", create=True, return_value="# Exec"):
            with patch.object(conductor_auto, "run_agy_turn", create=True, return_value=(0, "Done", "")):
                with patch.object(conductor_auto, "check_working_tree_cleanliness", create=True, return_value=(True, [])):
                    with patch.object(conductor_auto, "verify_task_execution", create=True, return_value=True):
                        with patch.object(
                            conductor_auto,
                            "audit_git_commit_and_notes",
                            create=True,
                            side_effect=SupervisorInvariantError("Audit failed"),
                        ):
                            with self.assertRaises(SupervisorInvariantError):
                                dispatch_tier2_execution("test-track", phase_num=4, task_num=1)


class TestModelMatrixAndResolution(unittest.TestCase):
    """Test suite for composable Gemini 4 Hydrogen model matrix and 3-tier resolution."""

    def test_default_model_matrix_constants(self):
        """Asserts centralized Gemini 4 Hydrogen model family, effort map, and per-role defaults."""
        DEFAULT_MODEL_FAMILY = get_target("DEFAULT_MODEL_FAMILY", self)
        ROLE_EFFORT_MAP = get_target("ROLE_EFFORT_MAP", self)
        DEFAULT_PLAN_MODEL = get_target("DEFAULT_PLAN_MODEL", self)
        DEFAULT_EXEC_MODEL = get_target("DEFAULT_EXEC_MODEL", self)
        DEFAULT_CHECKPOINT_MODEL = get_target("DEFAULT_CHECKPOINT_MODEL", self)
        DEFAULT_REVIEW_MODEL = get_target("DEFAULT_REVIEW_MODEL", self)

        self.assertEqual(DEFAULT_MODEL_FAMILY, "gemini-4-hydrogen")
        self.assertEqual(
            ROLE_EFFORT_MAP,
            {"plan": "high", "exec": "high", "checkpoint": "medium", "review": "high"},
        )
        self.assertEqual(DEFAULT_PLAN_MODEL, "gemini-4-hydrogen-high")
        self.assertEqual(DEFAULT_EXEC_MODEL, "gemini-4-hydrogen-high")
        self.assertEqual(DEFAULT_CHECKPOINT_MODEL, "gemini-4-hydrogen-medium")
        self.assertEqual(DEFAULT_REVIEW_MODEL, "gemini-4-hydrogen-high")

    def test_resolve_model_config_defaults_with_empty_args_and_env(self):
        """Asserts resolve_model_config composes Gemini 4 Hydrogen defaults when no overrides exist."""
        resolve_model_config = get_target("resolve_model_config", self)
        parse_args = get_target("parse_args", self)
        DEFAULT_PLAN_MODEL = get_target("DEFAULT_PLAN_MODEL", self)
        DEFAULT_EXEC_MODEL = get_target("DEFAULT_EXEC_MODEL", self)
        DEFAULT_CHECKPOINT_MODEL = get_target("DEFAULT_CHECKPOINT_MODEL", self)
        DEFAULT_REVIEW_MODEL = get_target("DEFAULT_REVIEW_MODEL", self)

        args = parse_args([])
        cfg = resolve_model_config(args, env={})
        self.assertEqual(
            cfg,
            {
                "family": "gemini-4-hydrogen",
                "plan": DEFAULT_PLAN_MODEL,
                "exec": DEFAULT_EXEC_MODEL,
                "checkpoint": DEFAULT_CHECKPOINT_MODEL,
                "review": DEFAULT_REVIEW_MODEL,
            },
        )

    def test_resolve_model_config_composes_from_env_family(self):
        """Asserts CONDUCTOR_MODEL_FAMILY env var composes all roles using ROLE_EFFORT_MAP."""
        resolve_model_config = get_target("resolve_model_config", self)
        parse_args = get_target("parse_args", self)

        args = parse_args([])
        cfg = resolve_model_config(args, env={"CONDUCTOR_MODEL_FAMILY": "gemini-4-argon"})
        self.assertEqual(
            cfg,
            {
                "family": "gemini-4-argon",
                "plan": "gemini-4-argon-high",
                "exec": "gemini-4-argon-high",
                "checkpoint": "gemini-4-argon-medium",
                "review": "gemini-4-argon-high",
            },
        )

    def test_resolve_model_config_cli_model_family_overrides_env_family(self):
        """Asserts CLI --model-family overrides CONDUCTOR_MODEL_FAMILY env var."""
        resolve_model_config = get_target("resolve_model_config", self)
        parse_args = get_target("parse_args", self)

        args = parse_args(["--model-family", "gemini-4.5-pro"])
        cfg = resolve_model_config(args, env={"CONDUCTOR_MODEL_FAMILY": "gemini-4-argon"})
        self.assertEqual(
            cfg,
            {
                "family": "gemini-4.5-pro",
                "plan": "gemini-4.5-pro-high",
                "exec": "gemini-4.5-pro-high",
                "checkpoint": "gemini-4.5-pro-medium",
                "review": "gemini-4.5-pro-high",
            },
        )

    def test_resolve_model_config_role_env_vars_override_family_composition(self):
        """Asserts per-role CONDUCTOR_*_MODEL env vars override family composition while unpinned roles still compose."""
        resolve_model_config = get_target("resolve_model_config", self)
        parse_args = get_target("parse_args", self)

        args = parse_args(["--model-family", "gemini-4-argon"])
        cfg = resolve_model_config(
            args,
            env={
                "CONDUCTOR_EXEC_MODEL": "custom-exec",
                "CONDUCTOR_CHECKPOINT_MODEL": "custom-cp",
            },
        )
        self.assertEqual(cfg["family"], "gemini-4-argon")
        self.assertEqual(cfg["plan"], "gemini-4-argon-high")
        self.assertEqual(cfg["exec"], "custom-exec")
        self.assertEqual(cfg["checkpoint"], "custom-cp")
        self.assertEqual(cfg["review"], "gemini-4-argon-high")

    def test_resolve_model_config_per_role_cli_flags_override_env_vars(self):
        """Asserts explicit per-role CLI flags take highest precedence over env vars and family composition."""
        resolve_model_config = get_target("resolve_model_config", self)
        parse_args = get_target("parse_args", self)

        args = parse_args(
            [
                "--plan-model",
                "cli-plan",
                "--exec-model",
                "cli-exec",
                "--checkpoint-model",
                "cli-cp",
                "--review-model",
                "cli-rev",
            ]
        )
        cfg = resolve_model_config(
            args,
            env={
                "CONDUCTOR_MODEL_FAMILY": "gemini-4-argon",
                "CONDUCTOR_PLAN_MODEL": "env-plan",
                "CONDUCTOR_EXEC_MODEL": "env-exec",
                "CONDUCTOR_CHECKPOINT_MODEL": "env-cp",
                "CONDUCTOR_REVIEW_MODEL": "env-rev",
            },
        )
        self.assertEqual(cfg["plan"], "cli-plan")
        self.assertEqual(cfg["exec"], "cli-exec")
        self.assertEqual(cfg["checkpoint"], "cli-cp")
        self.assertEqual(cfg["review"], "cli-rev")

    def test_parse_args_accepts_phase5_model_flags_and_leaves_unset_as_none(self):
        """Asserts parse_args accepts --model-family and --checkpoint-model and leaves unset overrides as None."""
        parse_args = get_target("parse_args", self)

        with contextlib.redirect_stderr(io.StringIO()):
            try:
                args = parse_args(
                    [
                        "my-track",
                        "--phase",
                        "5",
                        "--model-family",
                        "gemini-4-hydrogen",
                        "--checkpoint-model",
                        "custom-cp",
                    ]
                )
            except SystemExit as exc:
                self.fail(f"parse_args rejected Phase 5 model flags (--model-family / --checkpoint-model): {exc}")

        self.assertEqual(args.track, "my-track")
        self.assertEqual(args.phase, 5)
        self.assertEqual(args.model_family, "gemini-4-hydrogen")
        self.assertEqual(args.checkpoint_model, "custom-cp")
        self.assertIsNone(args.plan_model)
        self.assertIsNone(args.exec_model)
        self.assertIsNone(args.review_model)


class TestGate1CheckpointDispatch(unittest.TestCase):
    """Test suite for Gate 1 unattended phase verification checkpoint and commit/notes audit."""

    @patch("subprocess.run")
    def test_generate_turn_prompt_checkpoint_unattended_omits_task_and_passes_flag(self, mock_run):
        """Asserts generate_turn_prompt supports mode='checkpoint', task_num=None, and unattended=True."""
        generate_turn_prompt = get_target("generate_turn_prompt", self)
        sig = inspect.signature(generate_turn_prompt)
        self.assertIn(
            "unattended",
            sig.parameters,
            "generate_turn_prompt does not yet accept 'unattended' parameter",
        )

        mock_run.return_value = subprocess.CompletedProcess(
            args=["python3.11", "scripts/agent/generate-prompt.py"],
            returncode=0,
            stdout="# Unattended Checkpoint Prompt\n",
            stderr="",
        )

        prompt = generate_turn_prompt(
            "test-track",
            phase_num=5,
            task_num=None,
            mode="checkpoint",
            unattended=True,
        )
        self.assertEqual(prompt, "# Unattended Checkpoint Prompt")
        cmd_called = mock_run.call_args[0][0]
        self.assertIn("test-track", cmd_called)
        self.assertIn("5", cmd_called)
        self.assertIn("--checkpoint", cmd_called)
        self.assertIn("--unattended", cmd_called)
        self.assertNotIn("None", cmd_called)

    def test_dispatch_gate1_checkpoint_uses_default_checkpoint_model_and_unattended(self):
        """Asserts dispatch_gate1_checkpoint invokes generate_turn_prompt(--checkpoint --unattended) and agy with DEFAULT_CHECKPOINT_MODEL."""
        dispatch_gate1_checkpoint = get_target("dispatch_gate1_checkpoint", self)
        DEFAULT_CHECKPOINT_MODEL = get_target("DEFAULT_CHECKPOINT_MODEL", self)

        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            track_dir = root / "conductor" / "tracks" / "test-track"
            track_dir.mkdir(parents=True)
            (track_dir / "plan.md").write_text("## Phase 5: Boundaries\n- [x] Task: Done [commit: 1122334]\n", encoding="utf-8")

            with patch.object(
                conductor_auto, "generate_turn_prompt", return_value="# Unattended Checkpoint"
            ) as mock_gen_prompt:
                with patch.object(
                    conductor_auto, "run_agy_turn", return_value=(0, "Done", "")
                ) as mock_turn:
                    with patch.object(
                        conductor_auto, "check_working_tree_cleanliness", return_value=(True, [])
                    ):
                        with patch.object(
                            conductor_auto, "verify_checkpoint_commit_and_notes", create=True, return_value="abc1234"
                        ) as mock_verify:
                            sha = dispatch_gate1_checkpoint("test-track", phase_num=5, cwd=root)

                            self.assertEqual(sha, "abc1234")
                            mock_gen_prompt.assert_called_once()
                            gp_kwargs = mock_gen_prompt.call_args.kwargs
                            self.assertEqual(gp_kwargs.get("mode"), "checkpoint")
                            self.assertTrue(gp_kwargs.get("unattended"))
                            self.assertEqual(gp_kwargs.get("phase_num"), 5)

                            mock_turn.assert_called_once()
                            turn_kwargs = mock_turn.call_args.kwargs
                            self.assertEqual(turn_kwargs.get("mode"), "auto")
                            self.assertEqual(turn_kwargs.get("model"), DEFAULT_CHECKPOINT_MODEL)
                            self.assertTrue(
                                str(turn_kwargs.get("log_file", "")).endswith("phase-5-checkpoint.log")
                            )
                            mock_verify.assert_called_once()

    def test_dispatch_gate1_checkpoint_raises_on_dirty_tree_or_agy_failure(self):
        """Asserts dispatch_gate1_checkpoint raises ProcessExecutionError on agy failure and GitTreeDirtyError on dirty tree."""
        dispatch_gate1_checkpoint = get_target("dispatch_gate1_checkpoint", self)
        ProcessExecutionError = get_target("ProcessExecutionError", self)
        GitTreeDirtyError = get_target("GitTreeDirtyError", self)

        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            track_dir = root / "conductor" / "tracks" / "test-track"
            track_dir.mkdir(parents=True)
            (track_dir / "plan.md").write_text("## Phase 5: Boundaries\n", encoding="utf-8")

            with patch.object(conductor_auto, "generate_turn_prompt", return_value="# Unattended Checkpoint"):
                with patch.object(conductor_auto, "run_agy_turn", return_value=(1, "", "Checkpoint crash")):
                    with self.assertRaises(ProcessExecutionError):
                        dispatch_gate1_checkpoint("test-track", phase_num=5, cwd=root)

                with patch.object(conductor_auto, "run_agy_turn", return_value=(0, "ok", "")):
                    with patch.object(
                        conductor_auto, "check_working_tree_cleanliness", return_value=(False, ["dirty.py"])
                    ):
                        with self.assertRaises(GitTreeDirtyError):
                            dispatch_gate1_checkpoint("test-track", phase_num=5, cwd=root)

    @patch("subprocess.run")
    def test_verify_checkpoint_commit_and_notes_valid_passes(self, mock_run):
        """Asserts verify_checkpoint_commit_and_notes passes and returns SHA when tag, commit, notes, and plan commit are valid."""
        verify_checkpoint_commit_and_notes = get_target("verify_checkpoint_commit_and_notes", self)

        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            plan_path = root / "plan.md"
            plan_path.write_text(
                "## Phase 5: Boundaries [checkpoint: abc1234]\n- [x] Task: Done [commit: 1122334]\n",
                encoding="utf-8",
            )

            def run_side_effect(cmd, *args, **kwargs):
                cmd_str = " ".join(cmd) if isinstance(cmd, list) else str(cmd)
                if "log -1" in cmd_str and "plan.md" in cmd_str:
                    return subprocess.CompletedProcess(
                        args=cmd,
                        returncode=0,
                        stdout="conductor(plan): Mark phase 'Phase 5: Boundaries' as complete\n",
                        stderr="",
                    )
                if "log -1" in cmd_str:
                    return subprocess.CompletedProcess(
                        args=cmd,
                        returncode=0,
                        stdout="conductor(checkpoint): Checkpoint end of Phase 5\n",
                        stderr="",
                    )
                if "notes show" in cmd_str:
                    return subprocess.CompletedProcess(
                        args=cmd,
                        returncode=0,
                        stdout=(
                            "Phase: Phase 5: Boundaries\n"
                            "Automated Tests:\nOK\n"
                            "Manual Verification:\nDeferred\n"
                            "User Confirmation: Unattended execution mode\n"
                        ),
                        stderr="",
                    )
                return subprocess.CompletedProcess(args=cmd, returncode=0, stdout="", stderr="")

            mock_run.side_effect = run_side_effect
            sha = verify_checkpoint_commit_and_notes(5, plan_path, cwd=root, base_sha="0001112")
            self.assertEqual(sha, "abc1234")

    @patch("subprocess.run")
    def test_verify_checkpoint_commit_and_notes_rejects_missing_tag_wrong_msg_or_missing_notes(self, mock_run):
        """Asserts verify_checkpoint_commit_and_notes raises SupervisorInvariantError on missing tag, wrong message, or missing notes."""
        verify_checkpoint_commit_and_notes = get_target("verify_checkpoint_commit_and_notes", self)
        SupervisorInvariantError = get_target("SupervisorInvariantError", self)

        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            plan_path = root / "plan.md"

            # Case 1: Missing [checkpoint: <sha>] tag on phase heading
            with self.subTest("missing checkpoint tag"):
                plan_path.write_text("## Phase 5: Boundaries\n- [x] Task: Done [commit: 1122334]\n", encoding="utf-8")
                with self.assertRaises(SupervisorInvariantError):
                    verify_checkpoint_commit_and_notes(5, plan_path, cwd=root, base_sha="0001112")

            plan_path.write_text("## Phase 5: Boundaries [checkpoint: abc1234]\n", encoding="utf-8")

            # Case 2: Wrong checkpoint commit message
            with self.subTest("wrong commit message"):
                mock_run.return_value = subprocess.CompletedProcess(
                    args=["git", "log"],
                    returncode=0,
                    stdout="chore: random commit\n",
                    stderr="",
                )
                with self.assertRaises(SupervisorInvariantError):
                    verify_checkpoint_commit_and_notes(5, plan_path, cwd=root, base_sha="0001112")

            # Case 3: Missing or empty git notes
            with self.subTest("missing git notes"):
                def missing_notes_side_effect(cmd, *args, **kwargs):
                    cmd_str = " ".join(cmd) if isinstance(cmd, list) else str(cmd)
                    if "notes show" in cmd_str:
                        return subprocess.CompletedProcess(args=cmd, returncode=1, stdout="", stderr="No note found")
                    return subprocess.CompletedProcess(
                        args=cmd,
                        returncode=0,
                        stdout="conductor(checkpoint): Checkpoint end of Phase 5\n",
                        stderr="",
                    )

                mock_run.side_effect = missing_notes_side_effect
                with self.assertRaises(SupervisorInvariantError):
                    verify_checkpoint_commit_and_notes(5, plan_path, cwd=root, base_sha="0001112")


class TestGate2ReviewAndBrainSnapshot(unittest.TestCase):
    """Test suite for Gate 2 unattended /conductor:review dispatch and brain directory snapshotting."""

    def test_snapshot_brain_dirs_lists_existing_and_handles_missing_dir(self):
        """Asserts snapshot_brain_dirs returns existing subdirectory names and returns empty set if dir missing."""
        snapshot_brain_dirs = get_target("snapshot_brain_dirs", self)

        with tempfile.TemporaryDirectory() as tmpdir:
            brain_dir = Path(tmpdir) / "brain"
            brain_dir.mkdir()
            (brain_dir / "uuid-1").mkdir()
            (brain_dir / "uuid-2").mkdir()
            (brain_dir / ".DS_Store").write_text("junk", encoding="utf-8")

            self.assertEqual(snapshot_brain_dirs(brain_dir), {"uuid-1", "uuid-2"})
            self.assertEqual(snapshot_brain_dirs(Path(tmpdir) / "nonexistent"), set())

    def test_capture_conversation_id_returns_newly_created_dir(self):
        """Asserts capture_conversation_id returns newly added directory ID (newest mtime if multiple)."""
        capture_conversation_id = get_target("capture_conversation_id", self)

        with tempfile.TemporaryDirectory() as tmpdir:
            brain_dir = Path(tmpdir) / "brain"
            brain_dir.mkdir()
            d1 = brain_dir / "uuid-1"
            d2 = brain_dir / "uuid-2"
            d1.mkdir()
            d2.mkdir()
            os.utime(d1, (1000.0, 1000.0))
            os.utime(d2, (1500.0, 1500.0))

            self.assertEqual(capture_conversation_id({"uuid-1"}, brain_dir=brain_dir), "uuid-2")

            d3 = brain_dir / "uuid-3"
            d3.mkdir()
            os.utime(d3, (2000.0, 2000.0))
            self.assertEqual(capture_conversation_id({"uuid-1"}, brain_dir=brain_dir), "uuid-3")

    def test_capture_conversation_id_falls_back_to_newest_transcript_jsonl(self):
        """Asserts capture_conversation_id falls back to directory with newest transcript.jsonl when no new dir appears."""
        capture_conversation_id = get_target("capture_conversation_id", self)

        with tempfile.TemporaryDirectory() as tmpdir:
            brain_dir = Path(tmpdir) / "brain"
            for cid, ts in [("uuid-1", 1000.0), ("uuid-2", 2000.0)]:
                logs_dir = brain_dir / cid / ".system_generated" / "logs"
                logs_dir.mkdir(parents=True)
                transcript = logs_dir / "transcript.jsonl"
                transcript.write_text('{"step": 1}\n', encoding="utf-8")
                os.utime(transcript, (ts, ts))

            conv_id = capture_conversation_id({"uuid-1", "uuid-2"}, brain_dir=brain_dir)
            self.assertEqual(conv_id, "uuid-2")

    def test_build_review_prompt_includes_conductor_review_and_unattended_overrides(self):
        """Asserts build_review_prompt includes /conductor:review, unattended scope confirmation, and output report path."""
        build_review_prompt = get_target("build_review_prompt", self)

        report_path = Path("conductor/tracks/test-track/phase-5-review.md")
        prompt = build_review_prompt("test-track", phase_num=5, report_path=report_path)

        self.assertIn("/conductor:review", prompt)
        self.assertIn("test-track", prompt)
        self.assertIn("phase-5-review.md", prompt)
        self.assertTrue(
            "300" in prompt or "iterative" in prompt.lower(),
            "Review prompt must handle >300 line iterative review confirmation without modal pause",
        )
        self.assertTrue(
            "unattended" in prompt.lower() or "non-interactive" in prompt.lower() or "auto-confirm" in prompt.lower(),
            "Review prompt must instruct non-interactive scope confirmation",
        )

    def test_dispatch_gate2_review_captures_conv_id_uses_review_model_and_reads_report(self):
        """Asserts dispatch_gate2_review snapshots brain_dir, invokes agy with DEFAULT_REVIEW_MODEL, and parses severity."""
        dispatch_gate2_review = get_target("dispatch_gate2_review", self)
        DEFAULT_REVIEW_MODEL = get_target("DEFAULT_REVIEW_MODEL", self)

        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            track_dir = root / "conductor" / "tracks" / "test-track"
            track_dir.mkdir(parents=True)
            brain_dir = root / "brain"
            brain_dir.mkdir()
            (brain_dir / "uuid-old").mkdir()

            def agy_side_effect(**kwargs):
                (brain_dir / "uuid-new").mkdir()
                (track_dir / "phase-5-review.md").write_text(
                    "# Phase 5 Review\n\n### High: Fix race condition\nDetails here.\n",
                    encoding="utf-8",
                )
                return (0, "Review complete", "")

            with patch.object(conductor_auto, "run_agy_turn", side_effect=agy_side_effect) as mock_turn:
                result = dispatch_gate2_review(
                    "test-track",
                    phase_num=5,
                    cwd=root,
                    brain_dir=brain_dir,
                )

                mock_turn.assert_called_once()
                turn_kwargs = mock_turn.call_args.kwargs
                self.assertEqual(turn_kwargs.get("mode"), "auto")
                self.assertEqual(turn_kwargs.get("model"), DEFAULT_REVIEW_MODEL)
                self.assertTrue(str(turn_kwargs.get("log_file", "")).endswith("phase-5-review.log"))

                self.assertEqual(result.conversation_id, "uuid-new")
                self.assertTrue(result.has_critical_or_high)
                self.assertEqual(result.exit_code, 2)
                self.assertEqual(result.report_path.name, "phase-5-review.md")

    def test_dispatch_gate2_review_persists_stdout_fallback_if_report_not_written_and_raises_on_crash(self):
        """Asserts dispatch_gate2_review persists stdout fallback report when file missing and raises on non-zero agy exit."""
        dispatch_gate2_review = get_target("dispatch_gate2_review", self)
        ProcessExecutionError = get_target("ProcessExecutionError", self)

        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            track_dir = root / "conductor" / "tracks" / "test-track"
            track_dir.mkdir(parents=True)
            brain_dir = root / "brain"
            brain_dir.mkdir()

            with patch.object(
                conductor_auto,
                "run_agy_turn",
                return_value=(0, "## Review\n### Medium: Polish docs\n", ""),
            ):
                result = dispatch_gate2_review(
                    "test-track",
                    phase_num=5,
                    cwd=root,
                    brain_dir=brain_dir,
                )
                self.assertEqual(result.exit_code, 0)
                self.assertFalse(result.has_critical_or_high)
                self.assertTrue((track_dir / "phase-5-review.md").exists())
                self.assertIn("Medium: Polish docs", (track_dir / "phase-5-review.md").read_text(encoding="utf-8"))

            with patch.object(
                conductor_auto,
                "run_agy_turn",
                return_value=(1, "", "Review crashed"),
            ):
                with self.assertRaises(ProcessExecutionError):
                    dispatch_gate2_review(
                        "test-track",
                        phase_num=5,
                        cwd=root,
                        brain_dir=brain_dir,
                    )

    def test_dispatch_gate2_review_ignores_stale_report_and_uses_stdout_fallback(self):
        """Asserts dispatch_gate2_review ignores an untouched pre-existing report and falls back to stdout."""
        dispatch_gate2_review = get_target("dispatch_gate2_review", self)

        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            track_dir = root / "conductor" / "tracks" / "test-track"
            track_dir.mkdir(parents=True)
            brain_dir = root / "brain"
            brain_dir.mkdir()
            report_path = track_dir / "phase-5-review.md"
            report_path.write_text("### [Critical] Stale issue\n", encoding="utf-8")
            os.utime(report_path, (1000.0, 1000.0))

            with patch.object(
                conductor_auto,
                "run_agy_turn",
                return_value=(0, "## Review Report\n\n### Medium: Clean pass\n", ""),
            ):
                result = dispatch_gate2_review(
                    "test-track",
                    phase_num=5,
                    cwd=root,
                    brain_dir=brain_dir,
                )
                self.assertEqual(result.exit_code, 0)
                self.assertFalse(result.has_critical_or_high)
                self.assertIn("Clean pass", report_path.read_text(encoding="utf-8"))


class TestReviewSeverityAndExitCodes(unittest.TestCase):
    """Test suite for strict review severity regex parsing and main() phase-boundary exit codes."""

    def test_parse_review_severity_matches_critical_and_high_headings(self):
        """Asserts parse_review_severity matches strict H3 Critical/High headings with or without brackets."""
        parse_review_severity = get_target("parse_review_severity", self)

        report = (
            "# Review Report\n\n"
            "### Critical: SQL Injection\nDetails\n\n"
            "### [High] Missing auth guard\nDetails\n\n"
            "### [Critical] Data loss\nDetails\n"
        )
        has_crit_high, findings = parse_review_severity(report)
        self.assertTrue(has_crit_high)
        self.assertEqual(len(findings), 3)

    def test_parse_review_severity_ignores_medium_low_h2_and_inline_prose(self):
        """Asserts parse_review_severity ignores Medium, Low, H2 headings, and inline prose mentions."""
        parse_review_severity = get_target("parse_review_severity", self)

        report = (
            "## Critical Summary\n\n"
            "No Critical or High issues detected in High-traffic path.\n\n"
            "### High-Level Overview\nDetails\n\n"
            "### Highlights\nDetails\n\n"
            "### Criticality Assessment\nDetails\n\n"
            "### Medium: Minor cleanup\nDetails\n\n"
            "### Low: Typo\nDetails\n"
        )
        has_crit_high, findings = parse_review_severity(report)
        self.assertFalse(has_crit_high)
        self.assertEqual(findings, [])

    def test_format_resume_command_formats_exact_agy_invocation(self):
        """Asserts format_resume_command produces the exact agy --conversation continuation command."""
        format_resume_command = get_target("format_resume_command", self)

        cmd = format_resume_command("abc-123", 5)
        self.assertEqual(
            cmd,
            'agy --conversation abc-123 "Apply the review suggestions from phase-5-review.md"',
        )

    def test_main_exit_code_0_on_clean_or_medium_low_review_and_halts_at_phase_boundary(self):
        """Asserts main returns 0 after completing Phase 5 + Gate 1 + Gate 2 and halts before Phase 6."""
        main = get_target("main", self)
        ReviewResult = get_target("ReviewResult", self)
        get_target("dispatch_gate1_checkpoint", self)
        get_target("dispatch_gate2_review", self)

        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            track_dir = root / "conductor" / "tracks" / "test-track"
            track_dir.mkdir(parents=True)
            (track_dir / "plan.md").write_text(
                "## Phase 5: Boundaries\n"
                "- [ ] Task: Implement boundaries\n"
                "- [ ] Task: Conductor - User Manual Verification 'Phase 5' (Protocol in workflow.md)\n\n"
                "## Phase 6: Documentation\n"
                "- [ ] Task: Write docs\n",
                encoding="utf-8",
            )

            clean_result = ReviewResult(
                report_path=track_dir / "phase-5-review.md",
                conversation_id="conv-100",
                has_critical_or_high=False,
                findings=[],
                exit_code=0,
            )

            with patch.object(conductor_auto, "PROJECT_ROOT", root):
                with patch.object(conductor_auto, "dispatch_tier1_planning", return_value=True) as mock_t1:
                    with patch.object(conductor_auto, "dispatch_tier2_execution", return_value=True) as mock_t2:
                        with patch.object(
                            conductor_auto, "dispatch_gate1_checkpoint", create=True, return_value="sha1234"
                        ) as mock_g1:
                            with patch.object(
                                conductor_auto, "dispatch_gate2_review", create=True, return_value=clean_result
                            ) as mock_g2:
                                with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                                    rc = main(["test-track"])

                                self.assertEqual(rc, 0)
                                mock_t1.assert_called_once()
                                mock_t2.assert_called_once()
                                self.assertEqual(mock_t1.call_args.kwargs.get("phase_num"), 5)
                                self.assertEqual(mock_t2.call_args.kwargs.get("phase_num"), 5)
                                mock_g1.assert_called_once()
                                mock_g2.assert_called_once()

    def test_main_exit_code_0_skips_gate2_when_no_review_flagged(self):
        """Asserts main skips Gate 2 review when --no-review is passed and returns 0."""
        main = get_target("main", self)
        get_target("dispatch_gate1_checkpoint", self)
        get_target("dispatch_gate2_review", self)

        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            track_dir = root / "conductor" / "tracks" / "test-track"
            track_dir.mkdir(parents=True)
            (track_dir / "plan.md").write_text(
                "## Phase 5: Boundaries\n"
                "- [ ] Task: Implement boundaries\n"
                "- [ ] Task: Conductor - User Manual Verification 'Phase 5' (Protocol in workflow.md)\n",
                encoding="utf-8",
            )

            with patch.object(conductor_auto, "PROJECT_ROOT", root):
                with patch.object(conductor_auto, "dispatch_tier1_planning", return_value=True):
                    with patch.object(conductor_auto, "dispatch_tier2_execution", return_value=True):
                        with patch.object(
                            conductor_auto, "dispatch_gate1_checkpoint", create=True, return_value="sha1234"
                        ) as mock_g1:
                            with patch.object(
                                conductor_auto, "dispatch_gate2_review", create=True
                            ) as mock_g2:
                                with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                                    rc = main(["test-track", "--no-review"])

                                self.assertEqual(rc, 0)
                                mock_g1.assert_called_once()
                                mock_g2.assert_not_called()

    def test_main_exit_code_2_on_critical_or_high_review_prints_resume_cmd(self):
        """Asserts main returns 2 and prints finding warning + exact agy --conversation resume command on Critical/High findings."""
        main = get_target("main", self)
        ReviewResult = get_target("ReviewResult", self)
        get_target("dispatch_gate1_checkpoint", self)
        get_target("dispatch_gate2_review", self)

        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            track_dir = root / "conductor" / "tracks" / "test-track"
            track_dir.mkdir(parents=True)
            (track_dir / "plan.md").write_text(
                "## Phase 5: Boundaries\n"
                "- [ ] Task: Implement boundaries\n"
                "- [ ] Task: Conductor - User Manual Verification 'Phase 5' (Protocol in workflow.md)\n",
                encoding="utf-8",
            )

            crit_result = ReviewResult(
                report_path=track_dir / "phase-5-review.md",
                conversation_id="conv-999",
                has_critical_or_high=True,
                findings=["### [Critical] Broken invariant"],
                exit_code=2,
            )

            stdout_buf = io.StringIO()
            stderr_buf = io.StringIO()
            with patch.object(conductor_auto, "PROJECT_ROOT", root):
                with patch.object(conductor_auto, "dispatch_tier1_planning", return_value=True):
                    with patch.object(conductor_auto, "dispatch_tier2_execution", return_value=True):
                        with patch.object(
                            conductor_auto, "dispatch_gate1_checkpoint", create=True, return_value="sha1234"
                        ):
                            with patch.object(
                                conductor_auto, "dispatch_gate2_review", create=True, return_value=crit_result
                            ):
                                with contextlib.redirect_stdout(stdout_buf), contextlib.redirect_stderr(stderr_buf):
                                    rc = main(["test-track"])

            combined = stdout_buf.getvalue() + "\n" + stderr_buf.getvalue()
            self.assertEqual(rc, 2)
            self.assertIn(
                'agy --conversation conv-999 "Apply the review suggestions from phase-5-review.md"',
                combined,
            )
            self.assertIn("Broken invariant", combined)

    def test_main_exit_code_1_on_gate1_failure_or_gate2_crash(self):
        """Asserts main returns 1 on Gate 1 invariant failure (without running Gate 2) or Gate 2 subprocess crash."""
        main = get_target("main", self)
        SupervisorInvariantError = get_target("SupervisorInvariantError", self)
        ProcessExecutionError = get_target("ProcessExecutionError", self)
        get_target("dispatch_gate1_checkpoint", self)
        get_target("dispatch_gate2_review", self)

        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            track_dir = root / "conductor" / "tracks" / "test-track"
            track_dir.mkdir(parents=True)
            (track_dir / "plan.md").write_text(
                "## Phase 5: Boundaries\n"
                "- [ ] Task: Implement boundaries\n",
                encoding="utf-8",
            )

            with patch.object(conductor_auto, "PROJECT_ROOT", root):
                with patch.object(conductor_auto, "dispatch_tier1_planning", return_value=True):
                    with patch.object(conductor_auto, "dispatch_tier2_execution", return_value=True):
                        with patch.object(
                            conductor_auto,
                            "dispatch_gate1_checkpoint",
                            create=True,
                            side_effect=SupervisorInvariantError("Gate 1 failed"),
                        ):
                            with patch.object(conductor_auto, "dispatch_gate2_review", create=True) as mock_g2:
                                with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                                    rc = main(["test-track"])
                                self.assertEqual(rc, 1)
                                mock_g2.assert_not_called()

                        with patch.object(
                            conductor_auto, "dispatch_gate1_checkpoint", create=True, return_value="sha1234"
                        ):
                            with patch.object(
                                conductor_auto,
                                "dispatch_gate2_review",
                                create=True,
                                side_effect=ProcessExecutionError("Gate 2 crashed"),
                            ):
                                with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                                    rc = main(["test-track"])
                                self.assertEqual(rc, 1)


class TestSubprocessStreamingAndDualLogging(unittest.TestCase):
    """Test suite for DualLogger unredacted teeing, streaming subprocess stdout, and configurable --timeout."""

    def test_dual_logger_writes_formatted_progress_to_stdout_and_unredacted_to_file(self):
        """Asserts DualLogger emits formatted banners/status to stdout and tees raw unredacted payloads to log_file."""
        DualLogger = get_target("DualLogger", self)

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_log = Path(tmpdir) / "logs" / "turn.log"
            stdout_buf = io.StringIO()
            logger = DualLogger(log_file=tmp_log, stdout_stream=stdout_buf)

            logger.log_banner("Phase 5 Task 1", "Model: gemini-4-hydrogen-xhigh")
            logger.log_status("Dispatching turn...")
            logger.write_raw("[tool_call] raw unredacted payload\n")

            stdout_text = stdout_buf.getvalue()
            self.assertIn("Phase 5 Task 1", stdout_text)
            self.assertIn("Dispatching turn...", stdout_text)

            self.assertTrue(tmp_log.exists())
            log_text = tmp_log.read_text(encoding="utf-8")
            self.assertIn("[tool_call] raw unredacted payload", log_text)

    @patch("subprocess.Popen")
    def test_run_agy_turn_streaming_passes_print_arg_and_tees_lines_incrementally(self, mock_popen_cls):
        """Asserts run_agy_turn(..., stream=True) passes --print <prompt>, streams stdout lines, and tees unredacted output to log_file."""
        run_agy_turn = get_target("run_agy_turn", self)
        DualLogger = get_target("DualLogger", self)

        mock_proc = MagicMock()
        mock_proc.stdin = None
        mock_proc.stdout = io.StringIO("line 1\nline 2\n")
        mock_proc.stderr = io.StringIO("")
        mock_proc.wait.return_value = 0
        mock_proc.returncode = 0
        mock_proc.pid = 54321
        mock_popen_cls.return_value = mock_proc

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_log = Path(tmpdir) / "logs" / "phase-5-review.log"
            stdout_buf = io.StringIO()
            logger = DualLogger(log_file=tmp_log, stdout_stream=stdout_buf)

            ret, stdout, stderr = run_agy_turn(
                prompt="Run review",
                mode="auto",
                model="gemini-4-hydrogen-xhigh",
                timeout=60.0,
                log_file=tmp_log,
                stream=True,
                logger=logger,
            )

            self.assertEqual(ret, 0)
            self.assertEqual(stdout, "line 1\nline 2\n")
            self.assertEqual(stderr, "")
            popen_args, popen_kwargs = mock_popen_cls.call_args
            self.assertEqual(popen_args[0][-2:], ["--print", "Run review"])
            self.assertEqual(popen_kwargs.get("stdin"), subprocess.DEVNULL)
            self.assertIn("line 1", stdout_buf.getvalue())
            self.assertIn("line 2", stdout_buf.getvalue())
            log_text = tmp_log.read_text(encoding="utf-8")
            self.assertIn("line 1", log_text)
            self.assertIn("line 2", log_text)

    @patch("time.monotonic", side_effect=itertools.chain([0.0], itertools.repeat(0.1)))
    @patch("os.killpg")
    @patch("os.getpgid", return_value=54321)
    @patch("subprocess.Popen")
    def test_run_agy_turn_streaming_enforces_configurable_timeout_and_kills_pg(
        self, mock_popen_cls, mock_getpgid, mock_killpg, _mock_monotonic
    ):
        """Asserts streaming run_agy_turn enforces timeout and terminates process group via SIGTERM."""
        run_agy_turn = get_target("run_agy_turn", self)
        ProcessExecutionError = get_target("ProcessExecutionError", self)
        sig = inspect.signature(run_agy_turn)
        self.assertIn(
            "stream",
            sig.parameters,
            "run_agy_turn does not yet accept 'stream' parameter",
        )

        mock_stdout = MagicMock()
        mock_stdout.readline.side_effect = ["partial\n", ""]
        mock_stdout.__iter__.return_value = iter(["partial\n"])

        mock_proc = MagicMock()
        mock_proc.pid = 54321
        mock_proc.stdin = MagicMock()
        mock_proc.stdout = mock_stdout
        mock_proc.stderr = io.StringIO("")
        mock_proc.wait.side_effect = subprocess.TimeoutExpired(cmd=["agy"], timeout=0.05)
        mock_popen_cls.return_value = mock_proc

        with self.assertRaises(ProcessExecutionError) as ctx:
            run_agy_turn(
                prompt="Run review",
                mode="auto",
                timeout=0.05,
                stream=True,
            )

        self.assertIn("timed out", str(ctx.exception).lower())
        mock_killpg.assert_any_call(54321, signal.SIGTERM)

    def test_parse_timeout_supports_minutes_seconds_hours_and_main_forwards_timeout(self):
        """Asserts parse_timeout handles m/s/h/plain numbers and main forwards --timeout to all turn dispatchers."""
        parse_timeout = get_target("parse_timeout", self)
        main = get_target("main", self)
        ReviewResult = get_target("ReviewResult", self)
        get_target("dispatch_gate1_checkpoint", self)
        get_target("dispatch_gate2_review", self)

        self.assertEqual(parse_timeout("15m"), 900.0)
        self.assertEqual(parse_timeout("45s"), 45.0)
        self.assertEqual(parse_timeout("1h"), 3600.0)
        self.assertEqual(parse_timeout("120"), 120.0)

        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            track_dir = root / "conductor" / "tracks" / "test-track"
            track_dir.mkdir(parents=True)
            (track_dir / "plan.md").write_text(
                "## Phase 5: Boundaries\n"
                "- [ ] Task: Implement boundaries\n"
                "- [ ] Task: Conductor - User Manual Verification 'Phase 5' (Protocol in workflow.md)\n",
                encoding="utf-8",
            )

            clean_result = ReviewResult(
                report_path=track_dir / "phase-5-review.md",
                conversation_id="conv-200",
                has_critical_or_high=False,
                findings=[],
                exit_code=0,
            )

            with patch.object(conductor_auto, "PROJECT_ROOT", root):
                with patch.object(conductor_auto, "dispatch_tier1_planning", return_value=True) as mock_t1:
                    with patch.object(conductor_auto, "dispatch_tier2_execution", return_value=True) as mock_t2:
                        with patch.object(
                            conductor_auto, "dispatch_gate1_checkpoint", create=True, return_value="sha1234"
                        ) as mock_g1:
                            with patch.object(
                                conductor_auto, "dispatch_gate2_review", create=True, return_value=clean_result
                            ) as mock_g2:
                                with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                                    rc = main(["test-track", "--timeout", "20m"])

                                self.assertEqual(rc, 0)
                                self.assertEqual(mock_t1.call_args.kwargs.get("timeout"), 1200.0)
                                self.assertEqual(mock_t2.call_args.kwargs.get("timeout"), 1200.0)
                                self.assertEqual(mock_g1.call_args.kwargs.get("timeout"), 1200.0)
                                self.assertEqual(mock_g2.call_args.kwargs.get("timeout"), 1200.0)

    def test_run_agy_turn_streaming_real_pipe_multiline_burst_does_not_stall(self):
        """Asserts real-pipe streaming emits multi-line bursts without stalling in BufferedReader before timeout."""
        run_agy_turn = get_target("run_agy_turn", self)
        DualLogger = get_target("DualLogger", self)

        child_code = (
            "import sys, time; "
            "_ = sys.stdin.read(); "
            "sys.stdout.write('line 1\\nline 2\\n'); sys.stdout.flush(); "
            "time.sleep(0.05); "
            "sys.stdout.write('line 3\\n'); sys.stdout.flush()"
        )
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_log = Path(tmpdir) / "logs" / "real-pipe.log"
            stdout_buf = io.StringIO()
            logger = DualLogger(log_file=tmp_log, stdout_stream=stdout_buf)

            with patch.object(
                conductor_auto,
                "build_agy_command",
                return_value=[sys.executable, "-c", child_code],
            ):
                ret, stdout, stderr = run_agy_turn(
                    prompt="hello",
                    mode="auto",
                    timeout=2.0,
                    log_file=tmp_log,
                    stream=True,
                    logger=logger,
                )

            self.assertEqual(ret, 0)
            self.assertEqual(stderr, "")
            self.assertEqual(stdout, "line 1\nline 2\nline 3\n")
            self.assertIn("line 2\n", stdout_buf.getvalue())
            self.assertIn("line 3\n", tmp_log.read_text(encoding="utf-8"))


class TestDocsFastPathAndSkipFlags(unittest.TestCase):
    """Test suite for [exempt: docs] Tier 1 & Gate 2 fast-path and --skip-plan / --force-review flags."""

    def test_should_skip_tier1_plan_matrix(self):
        """Asserts should_skip_tier1_plan skips for [exempt: docs] or --skip-plan unless --force-plan is set."""
        should_skip_tier1_plan = get_target("should_skip_tier1_plan", self)
        TaskInfo = get_target("TaskInfo", self)

        docs_task = TaskInfo(
            task_num=1,
            description="Author docs",
            status="pending",
            status_char=" ",
            is_checkpoint=False,
            exempt="docs",
        )
        scripts_task = TaskInfo(
            task_num=2,
            description="Update script",
            status="pending",
            status_char=" ",
            is_checkpoint=False,
            exempt="scripts",
        )
        tdd_task = TaskInfo(
            task_num=3,
            description="Write failing test",
            status="pending",
            status_char=" ",
            is_checkpoint=False,
            exempt=None,
        )

        # Default behavior: only exempt=docs skips Tier 1
        self.assertTrue(should_skip_tier1_plan(docs_task))
        self.assertFalse(should_skip_tier1_plan(scripts_task))
        self.assertFalse(should_skip_tier1_plan(tdd_task))

        # --force-plan overrides everything
        self.assertFalse(should_skip_tier1_plan(docs_task, force_plan=True))
        self.assertFalse(should_skip_tier1_plan(tdd_task, force_plan=True, skip_plan=True))

        # --skip-plan skips Tier 1 for any task when force_plan is False
        self.assertTrue(should_skip_tier1_plan(scripts_task, skip_plan=True))
        self.assertTrue(should_skip_tier1_plan(tdd_task, skip_plan=True))

    def test_is_docs_only_phase_and_should_skip_gate2_review(self):
        """Asserts is_docs_only_phase and should_skip_gate2_review identify docs-only phases and honor flags."""
        is_docs_only_phase = get_target("is_docs_only_phase", self)
        should_skip_gate2_review = get_target("should_skip_gate2_review", self)
        PhaseInfo = get_target("PhaseInfo", self)
        TaskInfo = get_target("TaskInfo", self)

        docs_phase = PhaseInfo(
            phase_num=6,
            name="Documentation",
            checkpoint_sha=None,
            raw_heading="## Phase 6: Documentation",
            tasks=[
                TaskInfo(1, "Author docs", "pending", " ", False, exempt="docs"),
                TaskInfo(2, "Skipped chore", "skipped", "-", False, exempt="scripts"),
                TaskInfo(3, "Conductor - User Manual Verification", "pending", " ", True),
            ],
        )
        mixed_phase = PhaseInfo(
            phase_num=6,
            name="Mixed",
            checkpoint_sha=None,
            raw_heading="## Phase 6: Mixed",
            tasks=[
                TaskInfo(1, "Author docs", "pending", " ", False, exempt="docs"),
                TaskInfo(2, "Run script validation", "pending", " ", False, exempt="scripts"),
                TaskInfo(3, "Conductor - User Manual Verification", "pending", " ", True),
            ],
        )
        empty_phase = PhaseInfo(
            phase_num=7,
            name="Checkpoint Only",
            checkpoint_sha=None,
            raw_heading="## Phase 7: Checkpoint Only",
            tasks=[
                TaskInfo(1, "Conductor - User Manual Verification", "pending", " ", True),
            ],
        )

        self.assertTrue(is_docs_only_phase(docs_phase))
        self.assertFalse(is_docs_only_phase(mixed_phase))
        self.assertFalse(is_docs_only_phase(empty_phase))

        # Gate 2 skip logic
        self.assertTrue(should_skip_gate2_review(docs_phase))
        self.assertFalse(should_skip_gate2_review(docs_phase, force_review=True))
        self.assertTrue(should_skip_gate2_review(docs_phase, no_review=True, force_review=True))
        self.assertFalse(should_skip_gate2_review(mixed_phase))
        self.assertTrue(should_skip_gate2_review(mixed_phase, no_review=True))

    def test_parse_args_accepts_skip_plan_and_force_review(self):
        """Asserts parse_args supports --skip-plan and --force-review flags."""
        parse_args = get_target("parse_args", self)

        default_args = parse_args([])
        self.assertFalse(default_args.skip_plan)
        self.assertFalse(default_args.force_review)

        flagged_args = parse_args(["--skip-plan", "--force-review"])
        self.assertTrue(flagged_args.skip_plan)
        self.assertTrue(flagged_args.force_review)

    def test_main_docs_only_phase_skips_tier1_and_gate2_by_default(self):
        """Asserts main auto-skips Tier 1 planning and Gate 2 review for a docs-only phase (2-turn fast-path)."""
        main = get_target("main", self)

        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            track_dir = root / "conductor" / "tracks" / "test-track"
            track_dir.mkdir(parents=True)
            (track_dir / "plan.md").write_text(
                "## Phase 6: Documentation\n"
                "- [ ] Task: Author docs/agents/conductor-auto.md [exempt: docs]\n"
                "    - [ ] Document CLI flags and fast-path\n"
                "- [ ] Task: Conductor - User Manual Verification 'Phase 6' (Protocol in workflow.md)\n",
                encoding="utf-8",
            )

            stdout_buf = io.StringIO()
            with patch.object(conductor_auto, "PROJECT_ROOT", root):
                with patch.object(conductor_auto, "dispatch_tier1_planning", return_value=True) as mock_t1:
                    with patch.object(conductor_auto, "dispatch_tier2_execution", return_value=True) as mock_t2:
                        with patch.object(
                            conductor_auto, "dispatch_gate1_checkpoint", return_value="sha1234"
                        ) as mock_g1:
                            with patch.object(
                                conductor_auto, "dispatch_gate2_review"
                            ) as mock_g2:
                                with contextlib.redirect_stdout(stdout_buf), contextlib.redirect_stderr(io.StringIO()):
                                    rc = main(["test-track"])

            self.assertEqual(rc, 0)
            mock_t1.assert_not_called()
            mock_t2.assert_called_once()
            self.assertTrue(mock_t2.call_args.kwargs.get("skip_plan"))
            mock_g1.assert_called_once()
            mock_g2.assert_not_called()

            out = stdout_buf.getvalue()
            self.assertIn("Skipping Tier 1 planning for Phase 6 Task 1", out)
            self.assertIn("Skipping Gate 2 review for Phase 6", out)
            self.assertIn("--force-review", out)

    def test_main_docs_only_phase_respects_force_plan_and_force_review(self):
        """Asserts --force-plan and --force-review override the docs-only fast-path."""
        main = get_target("main", self)
        ReviewResult = get_target("ReviewResult", self)

        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            track_dir = root / "conductor" / "tracks" / "test-track"
            track_dir.mkdir(parents=True)
            (track_dir / "plan.md").write_text(
                "## Phase 6: Documentation\n"
                "- [ ] Task: Author docs/agents/conductor-auto.md [exempt: docs]\n"
                "- [ ] Task: Conductor - User Manual Verification 'Phase 6' (Protocol in workflow.md)\n",
                encoding="utf-8",
            )

            clean_result = ReviewResult(
                report_path=track_dir / "phase-6-review.md",
                conversation_id="conv-600",
                has_critical_or_high=False,
                findings=[],
                exit_code=0,
            )

            with patch.object(conductor_auto, "PROJECT_ROOT", root):
                with patch.object(conductor_auto, "dispatch_tier1_planning", return_value=True) as mock_t1:
                    with patch.object(conductor_auto, "dispatch_tier2_execution", return_value=True) as mock_t2:
                        with patch.object(
                            conductor_auto, "dispatch_gate1_checkpoint", return_value="sha1234"
                        ) as mock_g1:
                            with patch.object(
                                conductor_auto, "dispatch_gate2_review", return_value=clean_result
                            ) as mock_g2:
                                with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                                    rc = main(["test-track", "--force-plan", "--force-review"])

            self.assertEqual(rc, 0)
            mock_t1.assert_called_once()
            mock_t2.assert_called_once()
            mock_g1.assert_called_once()
            mock_g2.assert_called_once()

    def test_main_dry_run_docs_only_phase_logs_2_turn_fast_path(self):
        """Asserts --dry-run on a docs-only phase logs Tier 1 skip and Gate 2 auto-skip."""
        main = get_target("main", self)

        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            track_dir = root / "conductor" / "tracks" / "test-track"
            track_dir.mkdir(parents=True)
            (track_dir / "plan.md").write_text(
                "## Phase 6: Documentation\n"
                "- [ ] Task: Author docs/agents/conductor-auto.md [exempt: docs]\n"
                "- [ ] Task: Conductor - User Manual Verification 'Phase 6' (Protocol in workflow.md)\n",
                encoding="utf-8",
            )

            stdout_buf = io.StringIO()
            with patch.object(conductor_auto, "PROJECT_ROOT", root):
                with contextlib.redirect_stdout(stdout_buf), contextlib.redirect_stderr(io.StringIO()):
                    rc = main(["test-track", "--dry-run"])

            self.assertEqual(rc, 0)
            out = stdout_buf.getvalue()
            self.assertIn("[DRY-RUN] Would skip Tier 1 planning for Phase 6 Task 1", out)
            self.assertIn("[DRY-RUN] Would dispatch Tier 2 execution", out)
            self.assertIn("[DRY-RUN] Would dispatch Gate 1 checkpoint", out)
            self.assertIn("[DRY-RUN] Would skip Gate 2 review", out)
            self.assertIn("--force-review", out)

    def test_main_dry_run_non_docs_phase_prefixes_all_logs_with_dry_run(self):
        """Asserts --dry-run on a standard TDD task prefixes both Tier 1 and Tier 2 logs with [DRY-RUN]."""
        main = get_target("main", self)

        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            track_dir = root / "conductor" / "tracks" / "test-track"
            track_dir.mkdir(parents=True)
            (track_dir / "plan.md").write_text(
                "## Phase 1: Implementation\n"
                "- [ ] Task: Implement feature X\n"
                "- [ ] Task: Conductor - User Manual Verification 'Phase 1' (Protocol in workflow.md)\n",
                encoding="utf-8",
            )

            stdout_buf = io.StringIO()
            with patch.object(conductor_auto, "PROJECT_ROOT", root):
                with contextlib.redirect_stdout(stdout_buf), contextlib.redirect_stderr(io.StringIO()):
                    rc = main(["test-track", "--dry-run"])

            self.assertEqual(rc, 0)
            out = stdout_buf.getvalue()
            self.assertIn("[DRY-RUN] Would dispatch Tier 1 planning for Phase 1 Task 1", out)
            self.assertIn("[DRY-RUN] Would dispatch Tier 2 execution", out)
            self.assertNotIn("Dispatching Tier 1 planning", out)


class TestAgyCliContract(unittest.TestCase):
    """Contract tests verifying build_agy_command matches the installed agy CLI binary."""

    @unittest.skipUnless(shutil.which("agy"), "agy CLI not installed in environment")
    def test_agy_help_supports_required_flags_and_modes(self):
        """Asserts installed agy --help advertises all flags and modes used by conductor-auto."""
        res = subprocess.run(
            ["agy", "--help"],
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
            timeout=5,
        )
        help_text = res.stdout + res.stderr
        for token in ("--mode", "--model", "--dangerously-skip-permissions", "--print", "plan", "auto"):
            self.assertIn(token, help_text)

    @unittest.skipUnless(shutil.which("agy"), "agy CLI not installed in environment")
    def test_build_agy_command_passes_real_agy_flag_parser(self):
        """Asserts agy flag.Parse accepts build_agy_command output and consumes the prompt under --print."""
        build_agy_command = get_target("build_agy_command", self)
        role_configs = [
            ("plan", get_target("DEFAULT_PLAN_MODEL", self)),
            ("auto", get_target("DEFAULT_EXEC_MODEL", self)),
            ("auto", get_target("DEFAULT_CHECKPOINT_MODEL", self)),
            ("auto", get_target("DEFAULT_REVIEW_MODEL", self)),
        ]
        probe_flag = "--__contract_probe__"

        for mode, model in role_configs:
            cmd = build_agy_command(mode=mode, model=model, prompt="contract check")
            res = subprocess.run(
                cmd + [probe_flag],
                stdin=subprocess.DEVNULL,
                capture_output=True,
                text=True,
                timeout=5,
            )
            self.assertEqual(res.returncode, 2, f"Unexpected exit code for {(mode, model)}: {res.stderr}")
            self.assertIn("flags provided but not defined: -__contract_probe__", res.stderr)
            self.assertNotIn("flag needs an argument", res.stderr)

    @unittest.skipUnless(
        bool(shutil.which("agy")) and os.environ.get("CONDUCTOR_LIVE_AGY_TEST") == "1",
        "Set CONDUCTOR_LIVE_AGY_TEST=1 to run live agy smoke test",
    )
    def test_run_agy_turn_live_smoke(self):
        """Optional live smoke test verifying agy executes a real non-interactive print turn."""
        run_agy_turn = get_target("run_agy_turn", self)
        checkpoint_model = get_target("DEFAULT_CHECKPOINT_MODEL", self)

        ret, stdout, stderr = run_agy_turn(
            prompt="Reply with only the single word OK.",
            mode="plan",
            model=checkpoint_model,
            timeout=60.0,
        )
        self.assertEqual(ret, 0, f"Live agy turn failed: {stderr}")
        self.assertIn("OK", stdout.upper())


if __name__ == "__main__":
    unittest.main()
