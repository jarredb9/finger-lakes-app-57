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


class TestTier2ExecutionDispatch(unittest.TestCase):
    """Test suite for Tier 2 execution turn dispatch and agy subprocess invocation."""

    def test_dispatch_tier2_invokes_generate_prompt_exec(self):
        """Asserts dispatch_tier2_execution invokes generate_turn_prompt with mode='exec' and runs agy."""
        dispatch_tier2_execution = get_target("dispatch_tier2_execution", self)

        with patch.object(conductor_auto, "generate_turn_prompt", create=True, return_value="# Exec prompt") as mock_gen_prompt:
            with patch.object(conductor_auto, "run_agy_turn", create=True, return_value=(0, "Exec output", "")) as mock_run_turn:
                with patch.object(conductor_auto, "check_working_tree_cleanliness", create=True, return_value=(True, [])):
                    with patch.object(conductor_auto, "verify_task_execution", create=True, return_value=True):
                        with patch.object(conductor_auto, "audit_git_commit_and_notes", create=True, return_value=True):
                            res = dispatch_tier2_execution(
                                "test-track",
                                phase_num=4,
                                task_num=1,
                                exec_model="gemini-3.8-flash-medium",
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
                            self.assertEqual(kwargs.get("model"), "gemini-3.8-flash-medium")
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


if __name__ == "__main__":
    unittest.main()
