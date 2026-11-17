"""Unit tests for `conductor_tools.models` dataclasses, enums, and exceptions."""

from __future__ import annotations

from dataclasses import FrozenInstanceError, is_dataclass
from enum import StrEnum
from pathlib import Path
import unittest

from conductor_tools.models import (
    ConductorError,
    GitTreeDirtyError,
    PhaseCheckpointContext,
    PhaseInfo,
    PlanInvariantError,
    ProcessExecutionError,
    PromptMode,
    ReviewResult,
    SupervisorInvariantError,
    TaskBlueprint,
    TaskInfo,
    TrackPlan,
    TurnStreamConfig,
    VerificationStrategy,
)


class TestExceptions(unittest.TestCase):
    """Verify the ConductorError inheritance hierarchy and message preservation."""

    def test_exception_hierarchy(self) -> None:
        self.assertTrue(issubclass(ConductorError, RuntimeError))
        self.assertTrue(issubclass(PlanInvariantError, ConductorError))
        self.assertTrue(issubclass(ProcessExecutionError, ConductorError))
        self.assertTrue(issubclass(SupervisorInvariantError, ConductorError))
        self.assertTrue(issubclass(GitTreeDirtyError, SupervisorInvariantError))
        self.assertTrue(issubclass(GitTreeDirtyError, ConductorError))

    def test_exceptions_preserve_messages_and_catch_as_conductor_error(self) -> None:
        cases = (
            (ConductorError, "base failure"),
            (PlanInvariantError, "plan invariant violated"),
            (ProcessExecutionError, "subprocess exited 1"),
            (SupervisorInvariantError, "supervisor gate failed"),
            (GitTreeDirtyError, "untracked files present"),
        )
        for exc_cls, message in cases:
            with self.subTest(exc_cls=exc_cls.__name__):
                with self.assertRaises(ConductorError) as ctx:
                    raise exc_cls(message)
                self.assertIsInstance(ctx.exception, exc_cls)
                self.assertEqual(str(ctx.exception), message)

        with self.assertRaises(SupervisorInvariantError):
            raise GitTreeDirtyError("dirty worktree")


class TestPromptMode(unittest.TestCase):
    """Verify PromptMode StrEnum members and removal of legacy FULL mode."""

    def test_members_and_values(self) -> None:
        self.assertTrue(issubclass(PromptMode, StrEnum))
        expected = {
            "PLAN": "plan",
            "RED": "red",
            "GREEN": "green",
            "EXEMPT": "exempt",
            "CHECKPOINT": "checkpoint",
            "RECOVERY": "recovery",
            "REVIEW": "review",
        }
        self.assertEqual({m.name: m.value for m in PromptMode}, expected)
        self.assertEqual(len(PromptMode), 7)
        self.assertEqual(PromptMode.RED, "red")
        self.assertEqual(str(PromptMode.PLAN), "plan")

    def test_full_mode_is_absent(self) -> None:
        self.assertFalse(hasattr(PromptMode, "FULL"))
        self.assertNotIn("full", [m.value for m in PromptMode])


class TestModels(unittest.TestCase):
    """Verify frozen slotted dataclasses, defaults, and absence of dict bridges."""

    def _build_sample_instances(self) -> list[tuple[type[object], object, str, object]]:
        task = TaskInfo(
            task_num=1,
            description="Write failing unit tests",
            status="pending",
            status_char=" ",
            is_checkpoint=False,
        )
        phase = PhaseInfo(
            phase_num=1,
            name="Phase 1",
            tasks=(task,),
        )
        track_plan = TrackPlan(
            track_name="demo-track",
            track_dir=Path("/tmp/conductor/tracks/demo-track"),
            plan_path=Path("/tmp/conductor/tracks/demo-track/plan.md"),
        )
        blueprint = TaskBlueprint(
            plan_path=Path("/tmp/conductor/tracks/demo-track/phase-1-task-1-plan.md"),
            target_files=("src/app.py",),
        )
        checkpoint_ctx = PhaseCheckpointContext(
            baseline_sha="abc1234",
            end_sha="def5678",
        )
        strategy = VerificationStrategy(mode=PromptMode.GREEN)
        stream_cfg = TurnStreamConfig()
        review_res = ReviewResult(report_path=Path("/tmp/phase-1-review.md"))
        return [
            (TaskInfo, task, "description", "mutated"),
            (PhaseInfo, phase, "name", "mutated"),
            (TrackPlan, track_plan, "track_name", "mutated"),
            (TaskBlueprint, blueprint, "post_exec_commit_msg", "mutated"),
            (PhaseCheckpointContext, checkpoint_ctx, "end_sha", "mutated"),
            (VerificationStrategy, strategy, "commit_msg", "mutated"),
            (TurnStreamConfig, stream_cfg, "stream", True),
            (ReviewResult, review_res, "exit_code", 2),
        ]

    def test_all_models_are_frozen_slotted_dataclasses(self) -> None:
        for cls, instance, attr, new_value in self._build_sample_instances():
            with self.subTest(cls=cls.__name__):
                self.assertTrue(is_dataclass(cls))
                self.assertTrue(hasattr(cls, "__slots__"))
                self.assertFalse(hasattr(instance, "__dict__"))
                with self.assertRaises(FrozenInstanceError):
                    setattr(instance, attr, new_value)

    def test_no_to_dict_bridges_on_plan_models(self) -> None:
        for cls in (TaskInfo, PhaseInfo, TrackPlan):
            with self.subTest(cls=cls.__name__):
                self.assertFalse(hasattr(cls, "to_dict"))

    def test_task_and_phase_defaults(self) -> None:
        task = TaskInfo(
            task_num=2,
            description="Implement parser",
            status="in_progress",
            status_char="~",
            is_checkpoint=False,
        )
        self.assertIsNone(task.commit_sha)
        self.assertIsNone(task.exempt)
        self.assertEqual(task.subtasks, ())
        self.assertEqual(task.raw_line, "")

        phase = PhaseInfo(phase_num=2, name="Parser")
        self.assertIsNone(phase.checkpoint_sha)
        self.assertEqual(phase.raw_heading, "")
        self.assertEqual(phase.tasks, ())
        self.assertFalse(phase.is_complete)
        self.assertEqual(phase.review_fixes, ())

    def test_track_plan_phases_default_is_isolated(self) -> None:
        p1 = TrackPlan(
            track_name="track-a",
            track_dir=Path("/tmp/a"),
            plan_path=Path("/tmp/a/plan.md"),
        )
        p2 = TrackPlan(
            track_name="track-b",
            track_dir=Path("/tmp/b"),
            plan_path=Path("/tmp/b/plan.md"),
        )
        self.assertEqual(p1.phases, {})
        self.assertEqual(p2.phases, {})
        self.assertIsNot(p1.phases, p2.phases)

    def test_task_blueprint_is_empty_property(self) -> None:
        plan_path = Path("/tmp/phase-1-task-1-plan.md")
        empty_bp = TaskBlueprint(plan_path=plan_path)
        self.assertTrue(empty_bp.is_empty)

        metadata_only_bp = TaskBlueprint(
            plan_path=plan_path,
            post_exec_section="Commit changes",
            post_exec_commit_msg="chore: update",
        )
        self.assertTrue(metadata_only_bp.is_empty)

        for kwargs in (
            {"target_files": ("src/mod.py",)},
            {"referenced_test_files": ("tests/test_mod.py",)},
            {"verification_commands": ("pytest",)},
        ):
            with self.subTest(kwargs=kwargs):
                bp = TaskBlueprint(plan_path=plan_path, **kwargs)
                self.assertFalse(bp.is_empty)

    def test_strategy_checkpoint_stream_and_review_defaults(self) -> None:
        strategy = VerificationStrategy(mode=PromptMode.GREEN)
        self.assertEqual(strategy.commands, ())
        self.assertEqual(strategy.instruction, "")
        self.assertEqual(strategy.commit_msg, "")
        self.assertFalse(strategy.is_red)
        self.assertFalse(strategy.is_checkpoint)
        self.assertIsNone(strategy.exempt)
        self.assertIsNone(strategy.checkpoint_context)
        self.assertFalse(strategy.is_python_only)

        ctx = PhaseCheckpointContext(baseline_sha=None, end_sha="1234abcd")
        self.assertIsNone(ctx.baseline_sha)
        self.assertEqual(ctx.changed_files, ())
        self.assertEqual(ctx.sibling_plans, ())
        self.assertEqual(ctx.commands, ())
        self.assertEqual(ctx.domain, "backend_tooling")
        self.assertFalse(ctx.has_checkpoint_plan)
        self.assertEqual(ctx.clean_phase_name, "")
        self.assertEqual(ctx.raw_heading, "")

        ckpt_strategy = VerificationStrategy(
            mode=PromptMode.CHECKPOINT,
            is_checkpoint=True,
            checkpoint_context=ctx,
        )
        self.assertEqual(ckpt_strategy.checkpoint_context, ctx)
        self.assertTrue(ckpt_strategy.is_checkpoint)

        stream_cfg = TurnStreamConfig()
        self.assertFalse(stream_cfg.stream)
        self.assertIsNone(stream_cfg.logger)
        self.assertEqual(stream_cfg.heartbeat_interval, 30.0)

        review = ReviewResult(report_path=Path("/tmp/review.md"))
        self.assertIsNone(review.conversation_id)
        self.assertFalse(review.has_critical_or_high)
        self.assertEqual(review.findings, ())
        self.assertEqual(review.exit_code, 0)


if __name__ == "__main__":
    unittest.main()
