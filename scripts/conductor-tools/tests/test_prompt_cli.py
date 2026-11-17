"""Unit tests for `conductor_tools.prompt_cli` CLI parser, routing, and invariants."""

from __future__ import annotations

import contextlib
import importlib
import io
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from conductor_tools import git_scope, strategy as strategy_mod
from conductor_tools.prompt_cli import build_parser, main
import conductor_tools.prompt_cli as prompt_cli


def _write_synthetic_repo(
    root: Path,
    *,
    tracks: dict[str, str] | None = None,
    tracks_md: str | None = None,
    spec_text: str = "# Synthetic Spec\n\nGeneric repository specification.\n",
    task_plans: dict[str, dict[str, str]] | None = None,
) -> Path:
    """Create a minimal synthetic repo with `conductor/` and no `profile.toml`."""
    conductor_dir = root / "conductor"
    tracks_dir = conductor_dir / "tracks"
    tracks_dir.mkdir(parents=True, exist_ok=True)

    if tracks is None:
        tracks = {
            "alpha-track_20261117": (
                "# Implementation Plan: Alpha Track\n\n"
                "## Phase 1: Core Module\n"
                "- [ ] Task: Write failing unit tests for widget (Red phase)\n"
                "    - [ ] Add assertions in `tests/test_widget.py`\n"
                "- [ ] Task: Implement widget module (Green phase)\n"
                "    - [ ] Create `src/widget.py`\n"
                "- [ ] Task: Update README documentation [exempt: docs]\n"
                "- [ ] Task: Conductor - User Manual Verification 'Phase 1: Core Module' (Protocol in workflow.md)\n"
            )
        }

    for track_name, plan_text in tracks.items():
        t_dir = tracks_dir / track_name
        t_dir.mkdir(parents=True, exist_ok=True)
        (t_dir / "plan.md").write_text(plan_text, encoding="utf-8")
        (t_dir / "spec.md").write_text(spec_text, encoding="utf-8")
        if task_plans and track_name in task_plans:
            for filename, content in task_plans[track_name].items():
                (t_dir / filename).write_text(content, encoding="utf-8")

    if tracks_md is None:
        rows = []
        for idx, track_name in enumerate(tracks):
            marker = "[~]" if idx == 0 else "[ ]"
            rows.append(f"| **{track_name}** | Synthetic track | {marker} |")
        tracks_md = (
            "# Tracks Registry\n\n"
            "| Track | Description | Status |\n"
            "| :--- | :--- | :--- |\n"
            + "\n".join(rows)
            + "\n"
        )
    (conductor_dir / "tracks.md").write_text(tracks_md, encoding="utf-8")
    return root


def _run_main(argv: list[str]) -> tuple[int, str, str]:
    """Invoke `prompt_cli.main(argv)` and return `(exit_code, stdout, stderr)`."""
    out_buf = io.StringIO()
    err_buf = io.StringIO()
    with contextlib.redirect_stdout(out_buf), contextlib.redirect_stderr(err_buf):
        rc = main(argv)
    return rc, out_buf.getvalue(), err_buf.getvalue()


class TestPromptCliParserAndRemovedFlags(unittest.TestCase):
    """Verify `build_parser()` flag registration, mutual exclusion, and `--full` removal."""

    def test_exports_and_supported_flags(self) -> None:
        self.assertEqual(prompt_cli.__all__, ["build_parser", "main"])
        parser = build_parser()

        parsed_long = parser.parse_args(
            [
                "--repo-root",
                "/tmp/example-repo",
                "--track",
                "demo-track",
                "--phase",
                "2",
                "--task",
                "3",
                "--plan-only",
                "--exec-only",
                "--copy",
                "--copy-plan",
                "--copy-exec",
                "--recovery",
                "--unattended",
                "--skip-plan",
                "--report-path",
                "custom/review.md",
                "--red",
                "pos1",
                "pos2",
            ]
        )
        self.assertEqual(str(parsed_long.repo_root), "/tmp/example-repo")
        self.assertEqual(parsed_long.track, "demo-track")
        self.assertEqual(parsed_long.phase, 2)
        self.assertEqual(parsed_long.task, 3)
        self.assertTrue(parsed_long.plan_only)
        self.assertTrue(parsed_long.exec_only)
        self.assertTrue(parsed_long.copy)
        self.assertTrue(parsed_long.copy_plan)
        self.assertTrue(parsed_long.copy_exec)
        self.assertTrue(parsed_long.recovery)
        self.assertTrue(parsed_long.unattended)
        self.assertTrue(parsed_long.skip_plan)
        self.assertEqual(parsed_long.report_path, Path("custom/review.md"))
        self.assertTrue(parsed_long.red)
        self.assertFalse(parsed_long.green)
        self.assertFalse(parsed_long.checkpoint)
        self.assertFalse(parsed_long.review)
        self.assertEqual(parsed_long.args, ["pos1", "pos2"])

        parsed_short = parser.parse_args(
            [
                "-C",
                "/tmp/short-repo",
                "-t",
                "short-track",
                "-p",
                "1",
                "-k",
                "4",
                "--plan",
                "--exec",
                "-c",
                "-r",
                "-u",
                "--green",
            ]
        )
        self.assertEqual(str(parsed_short.repo_root), "/tmp/short-repo")
        self.assertEqual(parsed_short.track, "short-track")
        self.assertEqual(parsed_short.phase, 1)
        self.assertEqual(parsed_short.task, 4)
        self.assertTrue(parsed_short.plan_only)
        self.assertTrue(parsed_short.exec_only)
        self.assertTrue(parsed_short.copy)
        self.assertTrue(parsed_short.recovery)
        self.assertTrue(parsed_short.unattended)
        self.assertTrue(parsed_short.green)

        self.assertTrue(parser.parse_args(["--checkpoint"]).checkpoint)
        self.assertTrue(parser.parse_args(["--review"]).review)

    def test_removed_full_flag_is_rejected(self) -> None:
        parser = build_parser()
        err_parse = io.StringIO()
        with contextlib.redirect_stderr(err_parse):
            with self.assertRaises(SystemExit) as parse_cm:
                parser.parse_args(["1", "1", "--full"])
        self.assertEqual(parse_cm.exception.code, 2)
        self.assertIn("--full", err_parse.getvalue())

        err_main = io.StringIO()
        with contextlib.redirect_stderr(err_main):
            with self.assertRaises(SystemExit) as main_cm:
                main(["1", "1", "--full"])
        self.assertEqual(main_cm.exception.code, 2)
        self.assertIn("--full", err_main.getvalue())

    def test_mutually_exclusive_mode_flags(self) -> None:
        parser = build_parser()
        for combo in (
            ["--red", "--green"],
            ["--red", "--checkpoint"],
            ["--review", "--checkpoint"],
            ["--green", "--review"],
        ):
            with self.subTest(combo=combo):
                err_buf = io.StringIO()
                with contextlib.redirect_stderr(err_buf):
                    with self.assertRaises(SystemExit) as cm:
                        parser.parse_args(combo)
                self.assertEqual(cm.exception.code, 2)
                self.assertIn("not allowed with argument", err_buf.getvalue())


class TestRepoRootAndSyntheticRepoExecution(unittest.TestCase):
    """Verify `-C`/`--repo-root` resolution, `.git` boundary guard, and generic defaults."""

    def test_repo_root_without_profile_toml_from_unrelated_cwd(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = _write_synthetic_repo(Path(tmp) / "synthetic-repo")
            unrelated_cwd = Path(tmp) / "unrelated-dir"
            unrelated_cwd.mkdir(parents=True, exist_ok=True)
            self.assertFalse((root / "conductor" / "profile.toml").exists())

            orig_cwd = Path.cwd()
            try:
                os.chdir(unrelated_cwd)
                with patch(
                    "subprocess.run",
                    side_effect=AssertionError("subprocess.run must not be called"),
                ):
                    rc_plan, out_plan, err_plan = _run_main(["-C", str(root), "--plan"])
                    rc_exec, out_exec, err_exec = _run_main(
                        ["--repo-root", str(root), "--exec"]
                    )
            finally:
                os.chdir(orig_cwd)

            self.assertEqual(rc_plan, 0, msg=err_plan)
            self.assertIn("Plan Phase 1 Task 1 only", out_plan)
            self.assertIn("alpha-track_20261117", out_plan)
            self.assertNotIn("finger-lakes", out_plan.lower())
            self.assertNotIn("run-jest-container", out_plan)

            self.assertEqual(rc_exec, 0, msg=err_exec)
            self.assertIn("Execute Phase 1 Task 1 following", out_exec)
            self.assertIn("2. Targeted Verification (Red Phase):", out_exec)
            self.assertIn("pytest", out_exec)
            self.assertNotIn("run-jest-container", out_exec)

    def test_invalid_repo_root_fast_fails(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            nonexistent = Path(tmp) / "missing-repo"
            plain_dir = Path(tmp) / "plain-dir"
            plain_dir.mkdir(parents=True, exist_ok=True)

            for bad_root in (str(nonexistent), str(plain_dir), ""):
                with self.subTest(bad_root=bad_root):
                    rc, out, err = _run_main(["-C", bad_root, "--plan"])
                    self.assertEqual(rc, 1)
                    self.assertEqual(out, "")
                    self.assertIn("Error:", err)

    def test_cwd_git_boundary_stops_before_outer_conductor(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            outer = _write_synthetic_repo(Path(tmp) / "outer")
            inner_repo = outer / "nested-project"
            (inner_repo / ".git").mkdir(parents=True, exist_ok=True)
            nested_sub = inner_repo / "src"
            nested_sub.mkdir(parents=True, exist_ok=True)

            orig_cwd = Path.cwd()
            try:
                os.chdir(nested_sub)
                rc, out, err = _run_main(["--plan"])
            finally:
                os.chdir(orig_cwd)

            self.assertEqual(rc, 1)
            self.assertEqual(out, "")
            self.assertIn("Error:", err)


class TestPositionalAndTaskResolutionValidation(unittest.TestCase):
    """Verify positional argument permutations, validation errors, and in-process execution."""

    def _make_multi_track_repo(self, root: Path) -> Path:
        alpha_plan = (
            "# Implementation Plan: Alpha\n\n"
            "## Phase 1: Setup [checkpoint: 1111111]\n"
            "- [x] Task: Init repo [commit: 1111110]\n"
            "- [ ] Task: Add tests (Red phase)\n\n"
            "## Phase 2: Engine\n"
            "- [x] Task: Write core tests [commit: 2222221]\n"
            "- [ ] Task: Implement core engine\n"
            "- [ ] Task: Implement helper utilities\n"
        )
        beta_plan = (
            "# Implementation Plan: Beta\n\n"
            "## Phase 1: Bootstrap\n"
            "- [ ] Task: Bootstrap beta\n\n"
            "## Phase 2: Finish\n"
            "- [ ] Task: Finish beta\n"
        )
        return _write_synthetic_repo(
            root,
            tracks={
                "alpha-track_20261117": alpha_plan,
                "beta-track_20261117": beta_plan,
            },
        )

    def test_positional_argument_permutations(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = self._make_multi_track_repo(Path(tmp))

            # [track] [phase] [task]
            rc, out, err = _run_main(
                ["-C", str(root), "beta-track_20261117", "2", "1", "--plan"]
            )
            self.assertEqual(rc, 0, msg=err)
            self.assertIn("beta-track_20261117", out)
            self.assertIn("Plan Phase 2 Task 1 only", out)

            # [phase] [task] -> active track alpha
            rc, out, err = _run_main(["-C", str(root), "2", "3", "--plan"])
            self.assertEqual(rc, 0, msg=err)
            self.assertIn("alpha-track_20261117", out)
            self.assertIn("Plan Phase 2 Task 3 only", out)

            # [track] [phase] -> first pending in phase
            rc, out, err = _run_main(
                ["-C", str(root), "beta-track_20261117", "2", "--plan"]
            )
            self.assertEqual(rc, 0, msg=err)
            self.assertIn("beta-track_20261117", out)
            self.assertIn("Plan Phase 2 Task 1 only", out)

            # [phase] -> first pending in active track's phase 2 (Task 2)
            rc, out, err = _run_main(["-C", str(root), "2", "--plan"])
            self.assertEqual(rc, 0, msg=err)
            self.assertIn("alpha-track_20261117", out)
            self.assertIn("Plan Phase 2 Task 2 only", out)

            # [track] -> first pending in beta (Phase 1 Task 1)
            rc, out, err = _run_main(["-C", str(root), "beta-track_20261117", "--plan"])
            self.assertEqual(rc, 0, msg=err)
            self.assertIn("beta-track_20261117", out)
            self.assertIn("Plan Phase 1 Task 1 only", out)

            # empty positional -> active track alpha, first pending task (Phase 1 Task 2)
            rc, out, err = _run_main(["-C", str(root), "--plan"])
            self.assertEqual(rc, 0, msg=err)
            self.assertIn("alpha-track_20261117", out)
            self.assertIn("Plan Phase 1 Task 2 only", out)

    def test_validation_errors_return_exit_code_1(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = _write_synthetic_repo(
                Path(tmp) / "repo",
                tracks={
                    "demo-track_20261117": (
                        "# Plan\n\n"
                        "## Phase 1: Core\n"
                        "- [ ] Task: First task\n"
                        "- [ ] Task: Second task\n\n"
                        "## Phase 2: Empty Phase\n"
                    )
                },
            )

            # Out-of-bounds task
            rc, out, err = _run_main(["-C", str(root), "1", "99", "--plan"])
            self.assertEqual(rc, 1)
            self.assertEqual(out, "")
            self.assertIn("Error:", err)
            self.assertIn("Valid tasks for Phase 1: 1..2", err)

            # Nonexistent phase
            rc, out, err = _run_main(["-C", str(root), "99", "1", "--plan"])
            self.assertEqual(rc, 1)
            self.assertEqual(out, "")
            self.assertIn("Error:", err)
            self.assertIn("Available phases:", err)

            # Non-positive phase / task numbers
            for bad_args in (
                ["-C", str(root), "0", "1", "--plan"],
                ["-C", str(root), "1", "0", "--plan"],
                ["-C", str(root), "--phase", "-1", "--plan"],
                ["-C", str(root), "--task", "-2", "--plan"],
            ):
                with self.subTest(bad_args=bad_args):
                    rc, out, err = _run_main(bad_args)
                    self.assertEqual(rc, 1)
                    self.assertEqual(out, "")
                    self.assertIn("Error:", err)

            # Non-numeric phase / task positional arguments
            for bad_args in (
                ["-C", str(root), "demo-track_20261117", "abc", "--plan"],
                ["-C", str(root), "demo-track_20261117", "1", "xyz", "--plan"],
                ["-C", str(root), "1", "xyz", "--plan"],
            ):
                with self.subTest(bad_args=bad_args):
                    rc, out, err = _run_main(bad_args)
                    self.assertEqual(rc, 1)
                    self.assertEqual(out, "")
                    self.assertIn("Error:", err)

            # Empty phase with no tasks
            rc, out, err = _run_main(["-C", str(root), "2", "--plan"])
            self.assertEqual(rc, 1)
            self.assertEqual(out, "")
            self.assertIn("Error:", err)

            # Too many positional arguments (> 3)
            rc, out, err = _run_main(
                ["-C", str(root), "demo-track_20261117", "1", "1", "extra"]
            )
            self.assertEqual(rc, 1)
            self.assertEqual(out, "")
            self.assertIn("Error:", err)

            # Missing plan.md / empty phases
            no_plan_root = _write_synthetic_repo(
                Path(tmp) / "no-plan-repo",
                tracks={"empty-track_20261117": "# No phases here\n"},
            )
            rc, out, err = _run_main(["-C", str(no_plan_root), "--plan"])
            self.assertEqual(rc, 1)
            self.assertEqual(out, "")
            self.assertIn("Error:", err)

            # Missing active track when tracks.md and tracks/ have no tracks
            no_tracks_root = Path(tmp) / "no-tracks-repo"
            (no_tracks_root / "conductor" / "tracks").mkdir(parents=True, exist_ok=True)
            (no_tracks_root / "conductor" / "tracks.md").write_text(
                "# Empty Registry\n", encoding="utf-8"
            )
            rc, out, err = _run_main(["-C", str(no_tracks_root), "--plan"])
            self.assertEqual(rc, 1)
            self.assertEqual(out, "")
            self.assertIn("Error:", err)

    def test_zero_subprocess_and_zero_importlib_invocations(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = _write_synthetic_repo(Path(tmp))
            with (
                patch(
                    "subprocess.run",
                    side_effect=AssertionError("subprocess.run must not be called"),
                ),
                patch(
                    "importlib.import_module",
                    side_effect=AssertionError("importlib.import_module must not be called"),
                ),
            ):
                rc1, out1, err1 = _run_main(["-C", str(root), "1", "1", "--plan"])
                rc2, out2, err2 = _run_main(["-C", str(root), "1", "1", "--exec"])

            self.assertEqual(rc1, 0, msg=err1)
            self.assertIn("Plan Phase 1 Task 1 only", out1)
            self.assertEqual(rc2, 0, msg=err2)
            self.assertIn("Execute Phase 1 Task 1 following", out2)


class TestPromptModesAndOutputRouting(unittest.TestCase):
    """Verify dual output, `--plan`/`--exec`/`--skip-plan`, checkpoint, recovery, and copy."""

    def test_default_dual_output_and_single_prompt_flags(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = _write_synthetic_repo(Path(tmp))

            rc_dual, out_dual, err_dual = _run_main(["-C", str(root), "1", "1"])
            self.assertEqual(rc_dual, 0, msg=err_dual)
            self.assertIn("PROMPT 1: RESEARCH & PLAN (SESSION 1)", out_dual)
            self.assertIn("PROMPT 2: IMPLEMENTATION (SESSION 2)", out_dual)
            self.assertIn("Plan Phase 1 Task 1 only", out_dual)
            self.assertIn("Execute Phase 1 Task 1 following", out_dual)

            rc_plan, out_plan, _ = _run_main(["-C", str(root), "1", "1", "--plan"])
            self.assertEqual(rc_plan, 0)
            self.assertIn("Plan Phase 1 Task 1 only", out_plan)
            self.assertNotIn("PROMPT 1:", out_plan)
            self.assertNotIn("Execute Phase 1 Task 1 following", out_plan)

            rc_exec, out_exec, _ = _run_main(["-C", str(root), "1", "1", "--exec"])
            self.assertEqual(rc_exec, 0)
            self.assertIn("Execute Phase 1 Task 1 following", out_exec)
            self.assertNotIn("PROMPT 2:", out_exec)
            self.assertNotIn("Plan Phase 1 Task 1 only", out_exec)

    def test_exec_skip_plan_with_missing_or_whitespace_task_plan(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = _write_synthetic_repo(
                Path(tmp),
                task_plans={
                    "alpha-track_20261117": {
                        "phase-1-task-2-plan.md": "   \n\t\n ",
                    }
                },
            )
            # Task 1 has no plan file; Task 2 has whitespace-only plan file.
            for task_num, expected_subtask in (
                ("1", "Add assertions in `tests/test_widget.py`"),
                ("2", "Create `src/widget.py`"),
            ):
                with self.subTest(task_num=task_num):
                    rc, out, err = _run_main(
                        ["-C", str(root), "1", task_num, "--exec", "--skip-plan"]
                    )
                    self.assertEqual(rc, 0, msg=err)
                    self.assertIn("Direct execution mode (Tier 1 task plan skipped)", out)
                    self.assertIn(expected_subtask, out)
                    self.assertNotIn(f"phase-1-task-{task_num}-plan.md", out)

    def test_checkpoint_variable_task_counts_skipped_indexing_and_unattended(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            # Variable task counts: 2, 3, 4, 6 tasks
            for count in (2, 3, 4, 6):
                tasks_md = "\n".join(
                    f"- [x] Task: Completed step {i} [commit: abc123{i}]"
                    for i in range(1, count)
                )
                plan_text = (
                    "# Plan\n\n## Phase 1: Variable Count\n"
                    f"{tasks_md}\n"
                    "- [ ] Task: Conductor - User Manual Verification 'Phase 1: Variable Count' (Protocol in workflow.md)\n"
                )
                repo = _write_synthetic_repo(
                    Path(tmp) / f"count-{count}",
                    tracks={"var-track_20261117": plan_text},
                )
                with self.subTest(count=count):
                    rc, out, err = _run_main(["-C", str(repo), "--checkpoint"])
                    self.assertEqual(rc, 0, msg=err)
                    self.assertIn("PHASE CHECKPOINT (WARM OR COLD SESSION)", out)
                    self.assertNotIn("PROMPT 1: RESEARCH & PLAN", out)
                    self.assertIn(f"Execute Phase 1 Checkpoint (Task {count})", out)
                    self.assertIn("ask_question", out)
                    self.assertNotIn("incomplete prior tasks", err)

            # Skipped [-] prior tasks preserve 1-based indexing and do not trigger warning
            skipped_repo = _write_synthetic_repo(
                Path(tmp) / "skipped",
                tracks={
                    "skip-track_20261117": (
                        "# Plan\n\n## Phase 1: Skipped Handling\n"
                        "- [-] Task: Skipped legacy task\n"
                        "- [x] Task: Completed implementation [commit: abc1234]\n"
                        "- [ ] Task: Conductor - User Manual Verification 'Phase 1: Skipped Handling' (Protocol in workflow.md)\n"
                    )
                },
            )
            rc_skip, out_skip, err_skip = _run_main(
                ["-C", str(skipped_repo), "--checkpoint", "--unattended"]
            )
            self.assertEqual(rc_skip, 0, msg=err_skip)
            self.assertIn("Phase 1, Task 3", out_skip)
            self.assertIn("Execute Phase 1 Checkpoint (Task 3)", out_skip)
            self.assertNotIn("incomplete prior tasks", err_skip)
            self.assertNotIn("ask_question", out_skip)
            self.assertIn("Unattended Execution Mode", out_skip)

            # Incomplete non-skipped prior task triggers stderr warning; -u also omits ask_question
            warn_repo = _write_synthetic_repo(
                Path(tmp) / "warn",
                tracks={
                    "warn-track_20261117": (
                        "# Plan\n\n## Phase 1: Incomplete Prior\n"
                        "- [x] Task: Done [commit: abc1234]\n"
                        "- [ ] Task: Pending cleanup\n"
                        "- [ ] Task: Conductor - User Manual Verification 'Phase 1: Incomplete Prior' (Protocol in workflow.md)\n"
                    )
                },
            )
            rc_warn, out_warn, err_warn = _run_main(
                ["-C", str(warn_repo), "--checkpoint", "-u"]
            )
            self.assertEqual(rc_warn, 0)
            self.assertIn("Warning:", err_warn)
            self.assertIn("Task 2 ('Pending cleanup')", err_warn)
            self.assertNotIn("ask_question", out_warn)
            self.assertIn("Unattended Execution Mode", out_warn)

    def test_recovery_and_clipboard_copy_variants(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = _write_synthetic_repo(Path(tmp))

            # Recovery prompt without copy
            rc_rec, out_rec, err_rec = _run_main(["-C", str(root), "1", "2", "-r"])
            self.assertEqual(rc_rec, 0, msg=err_rec)
            self.assertIn("Recover uncommitted changes", out_rec)
            self.assertIn("Phase 1, Task 2", out_rec)
            self.assertIn("Headless --print mode", out_rec)

            # Clipboard copy variants returning True and False
            copy_cases = (
                (["-C", str(root), "1", "1", "--copy-plan"], "Plan Phase 1 Task 1 only", "plan"),
                (["-C", str(root), "1", "1", "--copy", "--plan"], "Plan Phase 1 Task 1 only", "plan"),
                (["-C", str(root), "1", "1", "--copy-exec"], "Execute Phase 1 Task 1", "exec"),
                (["-C", str(root), "1", "1", "--copy", "--exec"], "Execute Phase 1 Task 1", "exec"),
                (
                    ["-C", str(root), "--checkpoint", "--copy"],
                    "Execute Phase 1 Checkpoint (Task 4)",
                    "checkpoint",
                ),
                (
                    ["-C", str(root), "1", "2", "--recovery", "--copy"],
                    "Recover uncommitted changes",
                    "recovery",
                ),
            )
            for argv, expected_substr, label in copy_cases:
                with self.subTest(argv=argv, copy_ok=True):
                    with patch.object(
                        git_scope, "copy_to_clipboard", return_value=True
                    ) as mock_copy:
                        rc, out, err = _run_main(argv)
                    self.assertEqual(rc, 0, msg=err)
                    self.assertIn(expected_substr, out)
                    mock_copy.assert_called_once()
                    self.assertEqual(mock_copy.call_args[0][0], out.rstrip("\n"))
                    self.assertIn("[copied", err.lower())
                    self.assertIn(label, err.lower())
                    self.assertIn("prompt to clipboard]", err.lower())

                with self.subTest(argv=argv, copy_ok=False):
                    with patch.object(
                        git_scope, "copy_to_clipboard", return_value=False
                    ) as mock_copy:
                        rc, out, err = _run_main(argv)
                    self.assertEqual(rc, 0, msg=err)
                    self.assertIn(expected_substr, out)
                    mock_copy.assert_called_once()
                    self.assertNotIn("prompt to clipboard]", err.lower())


class TestModeOverridesRedAndGreen(unittest.TestCase):
    """Verify `--red`/`--green` overrides, `[exempt]` warnings, and checkpoint errors."""

    def test_red_and_green_overrides_on_standard_tasks(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = _write_synthetic_repo(Path(tmp))

            # Task 2 is Green by wording; --red forces Red Phase
            rc_red, out_red, err_red = _run_main(
                ["-C", str(root), "1", "2", "--exec", "--red"]
            )
            self.assertEqual(rc_red, 0, msg=err_red)
            self.assertIn("2. Targeted Verification (Red Phase):", out_red)

            # Task 1 is Red by wording; --green forces Green Phase
            rc_green, out_green, err_green = _run_main(
                ["-C", str(root), "1", "1", "--exec", "--green"]
            )
            self.assertEqual(rc_green, 0, msg=err_green)
            self.assertIn("2. Targeted Verification (Green Phase):", out_green)

    def test_red_and_green_override_on_exempt_task_warns_and_succeeds(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = _write_synthetic_repo(Path(tmp))

            for flag, expected_heading in (
                ("--red", "2. Targeted Verification (Red Phase):"),
                ("--green", "2. Targeted Verification (Green Phase):"),
            ):
                with self.subTest(flag=flag):
                    rc, out, err = _run_main(
                        ["-C", str(root), "1", "3", "--exec", flag]
                    )
                    self.assertEqual(rc, 0, msg=err)
                    self.assertIn(expected_heading, out)
                    self.assertIn("Warning:", err)
                    self.assertIn("exempt", err.lower())

    def test_red_and_green_override_on_checkpoint_task_errors(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = _write_synthetic_repo(Path(tmp))

            for flag in ("--red", "--green"):
                with self.subTest(flag=flag):
                    rc, out, err = _run_main(["-C", str(root), "1", "4", flag])
                    self.assertEqual(rc, 1)
                    self.assertEqual(out, "")
                    self.assertIn("Error:", err)

    def test_undeclared_exempt_category_fails_fast(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = _write_synthetic_repo(
                Path(tmp),
                tracks={
                    "bad-exempt_20261117": (
                        "# Plan\n\n## Phase 1: Core\n"
                        "- [ ] Task: Something weird [exempt: unknown_cat]\n"
                    )
                },
            )
            rc, out, err = _run_main(["-C", str(root), "1", "1", "--exec"])
            self.assertEqual(rc, 1)
            self.assertEqual(out, "")
            self.assertIn("Error:", err)
            self.assertIn("unknown_cat", err)


class TestReviewCliMode(unittest.TestCase):
    """Verify `--review` CLI mode with auto-detection, explicit args, `--report-path`, and `--copy`."""

    def test_review_auto_detects_active_track_and_pending_or_latest_phase(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            # Phase 1 complete, Phase 2 pending -> picks Phase 2
            root_pending = _write_synthetic_repo(
                Path(tmp) / "pending",
                tracks={
                    "rev-track_20261117": (
                        "# Plan\n\n"
                        "## Phase 1: Done [checkpoint: 1111111]\n"
                        "- [x] Task: Done 1 [commit: 1111110]\n\n"
                        "## Phase 2: Active\n"
                        "- [ ] Task: Pending 2\n"
                    )
                },
            )
            rc, out, err = _run_main(["-C", str(root_pending), "--review"])
            self.assertEqual(rc, 0, msg=err)
            self.assertIn("/conductor:review rev-track_20261117", out)
            self.assertIn("Phase 2", out)
            expected_default_report = str(
                root_pending / "conductor" / "tracks" / "rev-track_20261117" / "phase-2-review.md"
            )
            self.assertIn(expected_default_report, out)

            # All tasks complete -> picks latest phase (Phase 2)
            root_done = _write_synthetic_repo(
                Path(tmp) / "done",
                tracks={
                    "done-track_20261117": (
                        "# Plan\n\n"
                        "## Phase 1: Done [checkpoint: 1111111]\n"
                        "- [x] Task: Done 1 [commit: 1111110]\n\n"
                        "## Phase 2: Also Done [checkpoint: 2222222]\n"
                        "- [x] Task: Done 2 [commit: 2222220]\n"
                    )
                },
            )
            rc2, out2, err2 = _run_main(["-C", str(root_done), "--review"])
            self.assertEqual(rc2, 0, msg=err2)
            self.assertIn("/conductor:review done-track_20261117", out2)
            self.assertIn("Phase 2", out2)

    def test_review_explicit_track_phase_and_report_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = _write_synthetic_repo(
                Path(tmp),
                tracks={
                    "first-track_20261117": "# Plan\n\n## Phase 1: P1\n- [ ] Task: T1\n",
                    "second-track_20261117": (
                        "# Plan\n\n"
                        "## Phase 1: P1\n- [x] Task: T1 [commit: 1111111]\n\n"
                        "## Phase 2: P2\n- [ ] Task: T2\n"
                    ),
                },
            )
            custom_report = Path(tmp) / "reports" / "custom-phase2-review.md"

            rc_pos, out_pos, err_pos = _run_main(
                [
                    "-C",
                    str(root),
                    "--review",
                    "second-track_20261117",
                    "2",
                    "--report-path",
                    str(custom_report),
                ]
            )
            self.assertEqual(rc_pos, 0, msg=err_pos)
            self.assertIn("/conductor:review second-track_20261117", out_pos)
            self.assertIn("Phase 2", out_pos)
            self.assertIn(str(custom_report), out_pos)

            rc_flags, out_flags, err_flags = _run_main(
                [
                    "-C",
                    str(root),
                    "--review",
                    "--track",
                    "second-track_20261117",
                    "--phase",
                    "2",
                    "--report-path",
                    str(custom_report),
                ]
            )
            self.assertEqual(rc_flags, 0, msg=err_flags)
            self.assertEqual(out_flags, out_pos)

    def test_review_copy_and_validation_errors(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = _write_synthetic_repo(Path(tmp))

            with patch.object(git_scope, "copy_to_clipboard", return_value=True) as mock_copy:
                rc, out, err = _run_main(["-C", str(root), "--review", "--copy"])
            self.assertEqual(rc, 0, msg=err)
            self.assertIn("/conductor:review alpha-track_20261117", out)
            mock_copy.assert_called_once_with(out.rstrip("\n"))
            self.assertIn("[copied", err.lower())
            self.assertIn("prompt to clipboard]", err.lower())

            for bad_args in (
                ["-C", str(root), "--review", "--task", "1"],
                ["-C", str(root), "--review", "alpha-track_20261117", "1", "1"],
                ["-C", str(root), "--review", "99"],
                ["-C", str(root), "--review", "0"],
                ["-C", str(root), "--review", "alpha-track_20261117", "not-a-num"],
            ):
                with self.subTest(bad_args=bad_args):
                    rc_err, out_err, stderr_err = _run_main(bad_args)
                    self.assertEqual(rc_err, 1)
                    self.assertEqual(out_err, "")
                    self.assertIn("Error:", stderr_err)


class TestSinglePassStrategyInvariant(unittest.TestCase):
    """Verify `infer_verification_strategy()` is invoked at most once per CLI run."""

    def test_single_infer_verification_strategy_call_per_invocation(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = _write_synthetic_repo(Path(tmp))

            for argv in (
                ["-C", str(root), "1", "1"],
                ["-C", str(root), "1", "1", "--plan"],
                ["-C", str(root), "1", "1", "--exec"],
            ):
                with self.subTest(argv=argv):
                    with patch(
                        "conductor_tools.strategy.infer_verification_strategy",
                        wraps=strategy_mod.infer_verification_strategy,
                    ) as mock_infer:
                        rc, out, err = _run_main(argv)
                    self.assertEqual(rc, 0, msg=err)
                    self.assertTrue(out.strip())
                    self.assertEqual(mock_infer.call_count, 1)


if __name__ == "__main__":
    unittest.main()
