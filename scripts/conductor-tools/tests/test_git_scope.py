"""Unit tests for `conductor_tools.git_scope` workspace discovery and git adapters."""

from __future__ import annotations

import base64
import io
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import MagicMock, mock_open, patch

from conductor_tools.git_scope import (
    audit_git_commit_and_notes,
    check_working_tree_cleanliness,
    copy_to_clipboard,
    derive_scope,
    get_diff_name_only,
    get_phase_changed_files,
    git_add_and_commit,
    is_ephemeral_supervisor_path,
    is_supervisor_log_path,
    normalize_repo_path,
    rel_to_root,
    resolve_phase_baseline_sha,
    resolve_phase_end_sha,
    resolve_repo_root,
    resolve_track_dir,
    verify_checkpoint_commit_and_notes,
    verify_git_commit,
)
from conductor_tools.models import (
    ConductorError,
    PhaseInfo,
    ProcessExecutionError,
    SupervisorInvariantError,
    TaskInfo,
)
from conductor_tools.profile import PathRules, PlanningProfile, SupervisorProfile


def _git(cwd: Path, *args: str) -> str:
    """Run a git command inside an isolated temporary repository."""
    res = subprocess.run(
        ["git", *args],
        cwd=str(cwd),
        capture_output=True,
        text=True,
        check=True,
    )
    return res.stdout.strip()


def _init_git_repo(root: Path, branch: str = "main") -> Path:
    """Initialize an isolated git repo with local author metadata."""
    root.mkdir(parents=True, exist_ok=True)
    _git(root, "init")
    _git(root, "checkout", "-B", branch)
    _git(root, "config", "user.name", "Test User")
    _git(root, "config", "user.email", "test@example.com")
    return root


def _commit_file(root: Path, rel_path: str, content: str, message: str) -> str:
    """Create/update a file and commit it, returning the 7-char short SHA."""
    target = root / rel_path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    _git(root, "add", rel_path)
    _git(root, "commit", "-m", message)
    return _git(root, "rev-parse", "--short=7", "HEAD")


class TestResolveRepoRoot(unittest.TestCase):
    """Verify git-boundary-guarded repository root discovery."""

    def test_explicit_repo_root_valid_resolves(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "repo"
            (root / "conductor").mkdir(parents=True)
            (root / "planning").mkdir(parents=True)

            self.assertEqual(resolve_repo_root(str(root)), root.resolve())
            self.assertEqual(resolve_repo_root(root), root.resolve())
            self.assertEqual(
                resolve_repo_root(root, conductor_dir_name="planning"),
                root.resolve(),
            )

    def test_explicit_repo_root_invalid_raises_fast_without_fallback(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            base = Path(tmpdir)
            valid_repo = base / "valid_repo"
            (valid_repo / ".git").mkdir(parents=True)
            (valid_repo / "conductor").mkdir(parents=True)
            valid_script = valid_repo / "scripts" / "tool.py"
            valid_script.parent.mkdir(parents=True)
            valid_script.write_text("#!/usr/bin/env python3\n", encoding="utf-8")

            missing_dir = base / "does-not-exist"
            regular_file = base / "not-a-dir.txt"
            regular_file.write_text("file", encoding="utf-8")
            no_conductor_dir = base / "no-conductor"
            no_conductor_dir.mkdir()
            conductor_is_file = base / "conductor-file"
            conductor_is_file.mkdir()
            (conductor_is_file / "conductor").write_text("not a dir", encoding="utf-8")

            for bad_root in (missing_dir, regular_file, no_conductor_dir, conductor_is_file, "", "   "):
                with self.subTest(bad_root=repr(bad_root)):
                    with self.assertRaises(ConductorError):
                        resolve_repo_root(
                            bad_root,
                            cwd=valid_repo,
                            script_path=valid_script,
                        )

    def test_cwd_ancestor_walk_resolves_within_repo(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            repo = Path(tmpdir) / "repo"
            (repo / ".git").mkdir(parents=True)
            (repo / "conductor").mkdir(parents=True)
            nested = repo / "packages" / "core" / "src"
            nested.mkdir(parents=True)

            self.assertEqual(resolve_repo_root(cwd=nested), repo.resolve())

    def test_git_boundary_guard_stops_at_nested_git_dir_and_worktree_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            outer = Path(tmpdir) / "outer"
            (outer / ".git").mkdir(parents=True)
            (outer / "conductor").mkdir(parents=True)
            outer_script = outer / "scripts" / "tool.py"
            outer_script.parent.mkdir(parents=True)
            outer_script.write_text("", encoding="utf-8")

            for kind in ("directory", "worktree_file"):
                with self.subTest(git_marker=kind):
                    nested_repo = outer / "sub" / f"nested_{kind}"
                    nested_deep = nested_repo / "src" / "pkg"
                    nested_deep.mkdir(parents=True, exist_ok=True)
                    git_marker = nested_repo / ".git"
                    if kind == "directory":
                        git_marker.mkdir(exist_ok=True)
                    else:
                        git_marker.write_text("gitdir: /tmp/fake-worktree\n", encoding="utf-8")

                    with self.assertRaises(ConductorError):
                        resolve_repo_root(cwd=nested_deep, script_path=outer_script)

                    # When the nested .git repo itself has conductor/, resolve to nested_repo.
                    (nested_repo / "conductor").mkdir()
                    self.assertEqual(
                        resolve_repo_root(cwd=nested_deep, script_path=outer_script),
                        nested_repo.resolve(),
                    )
                    (nested_repo / "conductor").rmdir()

    def test_script_path_fallback_only_when_cwd_outside_git_repo(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            base = Path(tmpdir)
            outside_cwd = base / "outside" / "work"
            outside_cwd.mkdir(parents=True)

            repo = base / "repo"
            (repo / ".git").mkdir(parents=True)
            (repo / "conductor").mkdir(parents=True)
            script_path = repo / "scripts" / "conductor-tools" / "cli.py"
            script_path.parent.mkdir(parents=True)
            script_path.write_text("", encoding="utf-8")

            self.assertEqual(
                resolve_repo_root(cwd=outside_cwd, script_path=script_path),
                repo.resolve(),
            )

            # No conductor/ anywhere -> raises ConductorError.
            plain_script = outside_cwd / "tool.py"
            plain_script.write_text("", encoding="utf-8")
            with self.assertRaises(ConductorError):
                resolve_repo_root(cwd=outside_cwd, script_path=plain_script)

            # Nested .git boundary around script_path also blocks walking into outer conductor/.
            outer_with_conductor = base / "outer_with_conductor"
            (outer_with_conductor / "conductor").mkdir(parents=True)
            inner_git = outer_with_conductor / "inner"
            (inner_git / ".git").mkdir(parents=True)
            inner_script = inner_git / "tool.py"
            inner_script.write_text("", encoding="utf-8")
            with self.assertRaises(ConductorError):
                resolve_repo_root(cwd=outside_cwd, script_path=inner_script)


class TestTrackRootAndScopeHelpers(unittest.TestCase):
    """Verify track directory resolution, scope derivation, and relative path formatting."""

    def test_resolve_track_dir_none_or_empty_returns_none(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            self.assertIsNone(resolve_track_dir(None, root))
            self.assertIsNone(resolve_track_dir("", root))

    def test_resolve_track_dir_resolution_tiers_and_custom_profile(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)

            # 1. Direct path (relative and absolute) containing plan.md
            direct_rel = root / "custom" / "my-track"
            direct_rel.mkdir(parents=True)
            (direct_rel / "plan.md").write_text("# Plan\n", encoding="utf-8")
            self.assertEqual(
                resolve_track_dir("custom/my-track", root),
                direct_rel.resolve(),
            )
            self.assertEqual(
                resolve_track_dir(str(direct_rel), root),
                direct_rel.resolve(),
            )

            # Direct directory without plan.md does not match tier 1
            no_plan_dir = root / "custom" / "no-plan"
            no_plan_dir.mkdir(parents=True)
            self.assertEqual(
                resolve_track_dir("custom/no-plan", root),
                (root / "conductor" / "tracks" / "custom" / "no-plan").resolve(),
            )

            # 2. Bare track name under default tracks_dir and archive_dir
            active_track = root / "conductor" / "tracks" / "alpha_20261117"
            active_track.mkdir(parents=True)
            archived_track = root / "conductor" / "archive" / "beta_20260101"
            archived_track.mkdir(parents=True)
            self.assertEqual(resolve_track_dir("alpha_20261117", root), active_track.resolve())
            self.assertEqual(resolve_track_dir("beta_20260101", root), archived_track.resolve())

            # 3. Custom PlanningProfile paths
            custom_planning = PlanningProfile(
                tracks_dir="planning/active",
                archive_dir="planning/done",
            )
            custom_active = root / "planning" / "active" / "gamma_20261117"
            custom_archived = root / "planning" / "done" / "delta_20260101"
            custom_active.mkdir(parents=True)
            custom_archived.mkdir(parents=True)

            self.assertEqual(
                resolve_track_dir("gamma_20261117", root, planning=custom_planning),
                custom_active.resolve(),
            )
            self.assertEqual(
                resolve_track_dir("delta_20260101", root, planning=custom_planning),
                custom_archived.resolve(),
            )

            # 4. Missing bare track name falls back to <repo_root>/<tracks_dir>/<track_name>
            self.assertEqual(
                resolve_track_dir("future_20261201", root, planning=custom_planning),
                (root / "planning" / "active" / "future_20261201").resolve(),
            )

    def test_derive_scope(self) -> None:
        self.assertEqual(derive_scope("auth-refactor_20261117"), "auth")
        self.assertEqual(derive_scope("conductor/tracks/ui-modal_20260101"), "ui")
        self.assertEqual(derive_scope("payments_20260501"), "payments")
        self.assertEqual(derive_scope(""), "core")
        self.assertEqual(derive_scope("_20260101"), "core")
        self.assertEqual(derive_scope("-lead_20260101"), "core")

    def test_rel_to_root(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            base = Path(tmpdir)
            repo_root = base / "repo"
            repo_root.mkdir()
            inside = repo_root / "conductor" / "tracks" / "demo" / "plan.md"
            outside = base / "external" / "notes.md"

            self.assertEqual(
                rel_to_root(inside, repo_root),
                "conductor/tracks/demo/plan.md",
            )
            self.assertEqual(rel_to_root(repo_root, repo_root), ".")
            self.assertEqual(rel_to_root(outside, repo_root), str(outside))


class TestPhaseShaResolution(unittest.TestCase):
    """Verify git SHA verification and phase baseline/end SHA resolution."""

    def test_verify_git_commit_real_repo_and_error_cases(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            base = Path(tmpdir)
            non_git = base / "plain"
            non_git.mkdir()
            self.assertIsNone(verify_git_commit("HEAD", non_git))
            self.assertIsNone(verify_git_commit("", non_git))

            repo = _init_git_repo(base / "repo")
            sha1 = _commit_file(repo, "a.txt", "one\n", "chore: initial commit")
            full_sha1 = _git(repo, "rev-parse", "HEAD")

            self.assertEqual(verify_git_commit("HEAD", repo), sha1)
            self.assertEqual(verify_git_commit(full_sha1, repo), sha1)
            self.assertIsNone(verify_git_commit("deadbeefdeadbeef", repo))
            self.assertIsNone(verify_git_commit("", repo))

        with patch("subprocess.run", side_effect=OSError("git missing")):
            self.assertIsNone(verify_git_commit("HEAD", Path(".")))

    def test_out_of_bounds_or_none_phase_returns_defaults(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            non_git = Path(tmpdir)
            phases = {
                1: PhaseInfo(phase_num=1, name="Phase 1"),
            }
            self.assertIsNone(resolve_phase_baseline_sha(phases, None, non_git))
            self.assertIsNone(resolve_phase_baseline_sha(phases, 99, non_git))
            self.assertEqual(resolve_phase_end_sha(phases, None, non_git), "HEAD")
            self.assertEqual(resolve_phase_end_sha(phases, 99, non_git), "HEAD")

    def test_precedence_and_verified_sha_skipping(self) -> None:
        valid_shas = {
            "HEAD": "feed000",
            "1111111aaaa": "1111111",
            "2222222bbbb": "2222222",
            "3333333cccc": "3333333",
            "4444444dddd": "4444444",
        }

        def fake_verify(rev: str, cwd: Path) -> str | None:
            return valid_shas.get(rev)

        phases = {
            1: PhaseInfo(
                phase_num=1,
                name="One",
                checkpoint_sha="3333333cccc",
                tasks=(
                    TaskInfo(1, "T1.1", "complete", "x", False, commit_sha="1111111aaaa"),
                    TaskInfo(2, "T1.2", "complete", "x", False, commit_sha="9999999bad1"),
                ),
                review_fixes=(
                    TaskInfo(1, "Fix 1", "complete", "x", False, commit_sha="2222222bbbb"),
                    TaskInfo(2, "Fix 2", "complete", "x", False, commit_sha="8888888bad2"),
                ),
            ),
            2: PhaseInfo(
                phase_num=2,
                name="Two",
                checkpoint_sha="7777777bad3",
                tasks=(
                    TaskInfo(1, "T2.1", "complete", "x", False, commit_sha="4444444dddd"),
                ),
            ),
            3: PhaseInfo(
                phase_num=3,
                name="Three",
                checkpoint_sha="deadbeef123",
                tasks=(
                    TaskInfo(1, "T3.1", "complete", "x", False, commit_sha="cafebabe456"),
                ),
                review_fixes=(
                    TaskInfo(1, "Fix 3", "complete", "x", False, commit_sha="feedface789"),
                ),
            ),
            4: PhaseInfo(
                phase_num=4,
                name="Four",
                tasks=(
                    TaskInfo(1, "T4.1", "pending", " ", False, commit_sha=None),
                ),
            ),
        }

        with patch("conductor_tools.git_scope.verify_git_commit", side_effect=fake_verify):
            # Prefers verified review_fixes ("2222222") while skipping unverified "8888888bad2"
            self.assertEqual(resolve_phase_baseline_sha(phases, 2, Path(".")), "2222222")
            self.assertEqual(resolve_phase_end_sha(phases, 1, Path(".")), "2222222")

            # If review_fixes are all unverified, falls back to checkpoint_sha ("3333333")
            phases_cp = {
                **phases,
                1: PhaseInfo(
                    phase_num=1,
                    name="One",
                    checkpoint_sha="3333333cccc",
                    tasks=phases[1].tasks,
                    review_fixes=(
                        TaskInfo(1, "Fix bad", "complete", "x", False, commit_sha="8888888bad2"),
                    ),
                ),
            }
            self.assertEqual(resolve_phase_baseline_sha(phases_cp, 2, Path(".")), "3333333")
            self.assertEqual(resolve_phase_end_sha(phases_cp, 1, Path(".")), "3333333")

            # If checkpoint_sha is also absent/unverified, falls back to verified task SHA ("1111111")
            phases_tasks = {
                **phases_cp,
                1: PhaseInfo(
                    phase_num=1,
                    name="One",
                    checkpoint_sha=None,
                    tasks=phases[1].tasks,
                    review_fixes=phases_cp[1].review_fixes,
                ),
            }
            self.assertEqual(resolve_phase_baseline_sha(phases_tasks, 2, Path(".")), "1111111")
            self.assertEqual(resolve_phase_end_sha(phases_tasks, 1, Path(".")), "1111111")

            # Phase 2 has unverified checkpoint_sha ("7777777bad3") -> falls back to verified task ("4444444")
            self.assertEqual(resolve_phase_end_sha(phases, 2, Path(".")), "4444444")

            # Phase 3 has all unverified SHAs, next phase (4) has no baseline,
            # so end SHA falls back to unverified sha[:7] ("feedfac").
            self.assertEqual(resolve_phase_end_sha(phases, 3, Path(".")), "feedfac")

            # Phase 4 has no SHAs at all -> falls back to "HEAD".
            self.assertEqual(resolve_phase_end_sha(phases, 4, Path(".")), "HEAD")

            # Tier 3: Phase with no own SHAs uses next phase's baseline SHA.
            phases_next = {
                1: PhaseInfo(
                    phase_num=1,
                    name="One",
                    tasks=(TaskInfo(1, "T1", "pending", " ", False),),
                ),
                2: PhaseInfo(
                    phase_num=2,
                    name="Two",
                    tasks=(TaskInfo(1, "T2", "complete", "x", False, commit_sha="4444444dddd"),),
                ),
            }
            valid_shas["4444444dddd~1"] = "3333333"
            self.assertEqual(resolve_phase_end_sha(phases_next, 1, Path(".")), "3333333")

    def test_phase_one_parent_and_merge_base_fallbacks_in_real_git_repo(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            repo = _init_git_repo(Path(tmpdir) / "repo", branch="main")
            base_sha = _commit_file(repo, "README.md", "base\n", "chore: base on main")
            _git(repo, "checkout", "-b", "feature/test")
            t1_sha = _commit_file(repo, "feat.py", "x = 1\n", "feat: task 1")

            phases_with_task = {
                1: PhaseInfo(
                    phase_num=1,
                    name="One",
                    tasks=(TaskInfo(1, "T1", "complete", "x", False, commit_sha=t1_sha),),
                ),
            }
            self.assertEqual(resolve_phase_baseline_sha(phases_with_task, 1, repo), base_sha)

            # Without task SHAs, falls back to git merge-base HEAD main
            phases_empty = {
                1: PhaseInfo(
                    phase_num=1,
                    name="One",
                    tasks=(TaskInfo(1, "T1", "pending", " ", False),),
                ),
            }
            self.assertEqual(resolve_phase_baseline_sha(phases_empty, 1, repo), base_sha)

        # Single-commit repo on non-main branch with no main/origin/main returns None
        with tempfile.TemporaryDirectory() as tmpdir:
            solo = _init_git_repo(Path(tmpdir) / "solo", branch="topic")
            _commit_file(solo, "only.txt", "solo\n", "chore: root")
            phases_empty = {
                1: PhaseInfo(
                    phase_num=1,
                    name="One",
                    tasks=(TaskInfo(1, "T1", "pending", " ", False),),
                ),
            }
            self.assertIsNone(resolve_phase_baseline_sha(phases_empty, 1, solo))

    def test_non_git_directory_returns_unverified_short_shas(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            non_git = Path(tmpdir)
            phases = {
                1: PhaseInfo(
                    phase_num=1,
                    name="One",
                    checkpoint_sha="cc11223344",
                    tasks=(TaskInfo(1, "T1.1", "complete", "x", False, commit_sha="abcdef123456"),),
                ),
                2: PhaseInfo(
                    phase_num=2,
                    name="Two",
                    tasks=(TaskInfo(1, "T2.1", "complete", "x", False, commit_sha="1234567890ab"),),
                    review_fixes=(TaskInfo(1, "Fix 2.1", "complete", "x", False, commit_sha="fedcba987654"),),
                ),
                3: PhaseInfo(
                    phase_num=3,
                    name="Three",
                    tasks=(TaskInfo(1, "T3.1", "pending", " ", False),),
                ),
            }
            self.assertEqual(resolve_phase_baseline_sha(phases, 2, non_git), "cc11223")
            self.assertEqual(resolve_phase_end_sha(phases, 1, non_git), "cc11223")
            self.assertEqual(resolve_phase_baseline_sha(phases, 3, non_git), "fedcba9")
            self.assertEqual(resolve_phase_end_sha(phases, 2, non_git), "fedcba9")


class TestGitDiffStatusAndCleanliness(unittest.TestCase):
    """Verify path normalization, working tree cleanliness, diff queries, and commit helper."""

    def test_normalize_repo_path(self) -> None:
        self.assertEqual(normalize_repo_path("  ./src\\app.py  "), "src/app.py")
        self.assertEqual(normalize_repo_path('"docs/my file.md"'), "docs/my file.md")
        self.assertEqual(
            normalize_repo_path("src/old_name.py -> src/new_name.py"),
            "src/new_name.py",
        )
        self.assertEqual(
            normalize_repo_path('"old path.py" -> "./sub\\new path.py"'),
            "sub/new path.py",
        )

    def test_ephemeral_and_log_path_matching_default_and_custom_rules(self) -> None:
        self.assertTrue(
            is_ephemeral_supervisor_path("conductor/tracks/demo/phase-1-task-2-plan.md")
        )
        self.assertTrue(
            is_ephemeral_supervisor_path("./conductor/archive/demo/phase-2-review.md")
        )
        self.assertTrue(is_ephemeral_supervisor_path("conductor/tracks/demo/logs"))
        self.assertTrue(is_ephemeral_supervisor_path("conductor/tracks/demo/logs/turn.log"))
        self.assertFalse(is_ephemeral_supervisor_path("conductor/tracks/demo/plan.md"))
        self.assertFalse(is_ephemeral_supervisor_path("conductor/tracks.md"))
        self.assertFalse(is_ephemeral_supervisor_path("src/app.py"))

        self.assertTrue(is_supervisor_log_path("conductor/tracks/demo/logs/turn.log"))
        self.assertTrue(is_supervisor_log_path("conductor/archive/demo/logs"))
        self.assertFalse(is_supervisor_log_path("conductor/tracks/demo/phase-1-review.md"))

        custom_rules = PathRules(
            ephemeral_patterns=(r"^planning/[^/]+/ephemeral\.md$",),
            log_patterns=(r"^planning/[^/]+/run\.log$",),
        )
        self.assertTrue(
            is_ephemeral_supervisor_path("planning/t1/ephemeral.md", path_rules=custom_rules)
        )
        self.assertFalse(
            is_ephemeral_supervisor_path(
                "conductor/tracks/demo/phase-1-task-2-plan.md",
                path_rules=custom_rules,
            )
        )
        self.assertTrue(
            is_supervisor_log_path("planning/t1/run.log", path_rules=custom_rules)
        )
        self.assertFalse(
            is_supervisor_log_path(
                "conductor/tracks/demo/logs/turn.log",
                path_rules=custom_rules,
            )
        )

    def test_check_working_tree_cleanliness_filtering_and_errors(self) -> None:
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = subprocess.CompletedProcess(
                args=["git", "status", "--porcelain"],
                returncode=0,
                stdout="",
                stderr="",
            )
            is_clean, dirty = check_working_tree_cleanliness(Path("."))
            self.assertTrue(is_clean)
            self.assertEqual(dirty, ())

            porcelain = (
                " M conductor/tracks/demo/phase-1-task-1-plan.md\n"
                "?? conductor/tracks/demo/phase-1-review.md\n"
                "?? conductor/tracks/demo/logs/turn.log\n"
                " M conductor/tracks/demo/plan.md\n"
                " M conductor/tracks.md\n"
                "R  src/old.py -> src/new.py\n"
                "?? tests/test_new.py\n"
            )
            mock_run.return_value = subprocess.CompletedProcess(
                args=["git", "status", "--porcelain"],
                returncode=0,
                stdout=porcelain,
                stderr="",
            )
            is_clean, dirty = check_working_tree_cleanliness(Path("."), ignore_ephemeral=True)
            self.assertFalse(is_clean)
            self.assertEqual(
                dirty,
                (
                    "conductor/tracks/demo/plan.md",
                    "conductor/tracks.md",
                    "src/new.py",
                    "tests/test_new.py",
                ),
            )

            is_clean_all, dirty_all = check_working_tree_cleanliness(
                Path("."), ignore_ephemeral=False
            )
            self.assertFalse(is_clean_all)
            self.assertEqual(len(dirty_all), 7)

            # Non-zero exit raises ProcessExecutionError
            mock_run.return_value = subprocess.CompletedProcess(
                args=["git", "status", "--porcelain"],
                returncode=128,
                stdout="",
                stderr="not a git repository",
            )
            with self.assertRaises(ProcessExecutionError):
                check_working_tree_cleanliness(Path("."))

    def test_check_working_tree_cleanliness_real_git_repo(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            repo = _init_git_repo(Path(tmpdir) / "repo")
            _commit_file(repo, "app.py", "print(1)\n", "chore: init")

            # Only ephemeral files untracked -> clean when ignore_ephemeral=True
            ephemeral = repo / "conductor" / "tracks" / "t1" / "phase-1-task-1-plan.md"
            ephemeral.parent.mkdir(parents=True)
            ephemeral.write_text("# Task plan\n", encoding="utf-8")
            log_file = repo / "conductor" / "tracks" / "t1" / "logs" / "turn.log"
            log_file.parent.mkdir(parents=True)
            log_file.write_text("log\n", encoding="utf-8")

            is_clean, dirty = check_working_tree_cleanliness(repo, ignore_ephemeral=True)
            self.assertTrue(is_clean)
            self.assertEqual(dirty, ())

            is_clean_strict, dirty_strict = check_working_tree_cleanliness(
                repo, ignore_ephemeral=False
            )
            self.assertFalse(is_clean_strict)
            self.assertIn("conductor/tracks/t1/phase-1-task-1-plan.md", dirty_strict)

    def test_get_diff_name_only_and_errors(self) -> None:
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = subprocess.CompletedProcess(
                args=["git", "diff"],
                returncode=0,
                stdout="./src/a.py\nsrc\\b.py\n\"src/c d.py\"\n",
                stderr="",
            )
            files = get_diff_name_only("abc1234", "HEAD", cwd=Path("/repo"))
            self.assertEqual(files, ("src/a.py", "src/b.py", "src/c d.py"))
            self.assertEqual(
                mock_run.call_args.args[0],
                ["git", "diff", "--name-only", "abc1234", "HEAD"],
            )

            get_diff_name_only("abc1234", None, cwd=Path("/repo"))
            self.assertEqual(
                mock_run.call_args.args[0],
                ["git", "diff", "--name-only", "abc1234"],
            )

            mock_run.return_value = subprocess.CompletedProcess(
                args=["git", "diff"],
                returncode=1,
                stdout="",
                stderr="bad revision",
            )
            with self.assertRaises(ProcessExecutionError):
                get_diff_name_only("badrev", "HEAD", cwd=Path("/repo"))

    def test_get_phase_changed_files_active_historical_and_custom_metadata(self) -> None:
        # None or unverified baseline -> returns ()
        with patch("conductor_tools.git_scope.verify_git_commit", return_value=None):
            self.assertEqual(
                get_phase_changed_files(None, "HEAD", cwd=Path(".")),
                (),
            )
            self.assertEqual(
                get_phase_changed_files("deadbee", "HEAD", cwd=Path(".")),
                (),
            )

        # Active phase (end_sha == "HEAD"): queries (baseline, "HEAD") and ("HEAD", None),
        # deduplicates, and filters metadata prefixes.
        def fake_verify_active(rev: str, cwd: Path) -> str | None:
            return {"abc1234": "abc1234"}.get(rev)

        def fake_diff_active(cmd, *args, **kwargs):
            if cmd == ["git", "diff", "--name-only", "abc1234", "HEAD"]:
                return subprocess.CompletedProcess(
                    args=cmd,
                    returncode=0,
                    stdout="conductor/tracks/t/plan.md\nsrc/app.py\n.agents/rule.md\n",
                    stderr="",
                )
            if cmd == ["git", "diff", "--name-only", "HEAD"]:
                return subprocess.CompletedProcess(
                    args=cmd,
                    returncode=0,
                    stdout="src/app.py\ntests/test_app.py\n",
                    stderr="",
                )
            raise AssertionError(f"Unexpected command: {cmd}")

        with (
            patch("conductor_tools.git_scope.verify_git_commit", side_effect=fake_verify_active),
            patch("subprocess.run", side_effect=fake_diff_active),
        ):
            changed = get_phase_changed_files("abc1234", "HEAD", cwd=Path("."))
            self.assertEqual(changed, ("src/app.py", "tests/test_app.py"))

            custom_rules = PathRules(metadata_prefixes=("meta/",))
            changed_custom = get_phase_changed_files(
                "abc1234",
                "HEAD",
                cwd=Path("."),
                path_rules=custom_rules,
            )
            self.assertEqual(
                changed_custom,
                (
                    "conductor/tracks/t/plan.md",
                    "src/app.py",
                    ".agents/rule.md",
                    "tests/test_app.py",
                ),
            )

        # Historical phase (end_sha != "HEAD" and verified): queries only (baseline, end_sha)
        def fake_verify_hist(rev: str, cwd: Path) -> str | None:
            return {"abc1234": "abc1234", "def5678": "def5678"}.get(rev)

        with (
            patch("conductor_tools.git_scope.verify_git_commit", side_effect=fake_verify_hist),
            patch("subprocess.run") as mock_run,
        ):
            mock_run.return_value = subprocess.CompletedProcess(
                args=["git", "diff"],
                returncode=0,
                stdout="src/hist.py\nconductor/tracks/t/plan.md\n",
                stderr="",
            )
            hist_changed = get_phase_changed_files("abc1234", "def5678", cwd=Path("."))
            self.assertEqual(hist_changed, ("src/hist.py",))
            mock_run.assert_called_once()
            self.assertEqual(
                mock_run.call_args.args[0],
                ["git", "diff", "--name-only", "abc1234", "def5678"],
            )

    def test_git_add_and_commit_success_and_error(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            repo = _init_git_repo(Path(tmpdir) / "repo")
            (repo / "a.txt").write_text("alpha\n", encoding="utf-8")
            (repo / "sub").mkdir()
            (repo / "sub" / "b.txt").write_text("beta\n", encoding="utf-8")

            git_add_and_commit(
                ["a.txt", Path("sub/b.txt")],
                "feat(core): add initial files",
                cwd=repo,
            )
            self.assertEqual(_git(repo, "log", "-1", "--pretty=%s"), "feat(core): add initial files")
            committed = set(_git(repo, "show", "--name-only", "--pretty=", "HEAD").splitlines())
            self.assertEqual(committed, {"a.txt", "sub/b.txt"})

        with patch(
            "subprocess.run",
            return_value=subprocess.CompletedProcess(
                args=["git", "add"],
                returncode=1,
                stdout="",
                stderr="pathspec did not match",
            ),
        ):
            with self.assertRaises(ProcessExecutionError):
                git_add_and_commit(["missing.txt"], "chore: fail", cwd=Path("."))


class TestCommitAndCheckpointAuditing(unittest.TestCase):
    """Verify task commit/git-notes auditing and checkpoint verification."""

    def test_audit_git_commit_and_notes_valid_default_and_custom_profile(self) -> None:
        task = TaskInfo(
            task_num=1,
            description="Implement git scope",
            status="complete",
            status_char="x",
            is_checkpoint=False,
            commit_sha="1122334",
        )
        with tempfile.TemporaryDirectory() as tmpdir:
            plan_path = Path(tmpdir) / "plan.md"
            plan_path.write_text(
                "- [x] Task: Implement git scope [commit: 1122334]\n",
                encoding="utf-8",
            )

            def run_side_effect(cmd, *args, **kwargs):
                cmd_str = " ".join(cmd)
                if cmd[:3] == ["git", "rev-parse", "--verify"]:
                    return subprocess.CompletedProcess(
                        args=cmd, returncode=0, stdout="1122334abcdef\n", stderr=""
                    )
                if "log -1 --format=%B" in cmd_str:
                    return subprocess.CompletedProcess(
                        args=cmd,
                        returncode=0,
                        stdout="feat(scope): implement git scope module\n",
                        stderr="",
                    )
                if "notes show" in cmd_str:
                    return subprocess.CompletedProcess(
                        args=cmd,
                        returncode=0,
                        stdout=(
                            "Task: Implement git scope\n"
                            "Summary: Added git_scope module.\n"
                            "Files: scripts/conductor-tools/conductor_tools/git_scope.py\n"
                            "Rationale: Phase 2 Task 4.\n"
                        ),
                        stderr="",
                    )
                if "log -1" in cmd_str and "plan.md" in cmd_str:
                    return subprocess.CompletedProcess(
                        args=cmd,
                        returncode=0,
                        stdout="conductor(plan): Mark Phase 2 Task 4 complete\n",
                        stderr="",
                    )
                return subprocess.CompletedProcess(args=cmd, returncode=0, stdout="", stderr="")

            with patch("subprocess.run", side_effect=run_side_effect):
                self.assertTrue(
                    audit_git_commit_and_notes(task, "1122334", plan_path, cwd=Path(tmpdir))
                )

            # Custom SupervisorProfile commit types and note fields
            custom_sup = SupervisorProfile(
                conventional_commit_types=("custom",),
                required_note_fields=("Task:", "Ticket:"),
            )

            def custom_side_effect(cmd, *args, **kwargs):
                cmd_str = " ".join(cmd)
                if cmd[:3] == ["git", "rev-parse", "--verify"]:
                    return subprocess.CompletedProcess(
                        args=cmd, returncode=0, stdout="1122334abcdef\n", stderr=""
                    )
                if "log -1 --format=%B" in cmd_str:
                    return subprocess.CompletedProcess(
                        args=cmd, returncode=0, stdout="custom(core): valid custom type\n", stderr=""
                    )
                if "notes show" in cmd_str:
                    return subprocess.CompletedProcess(
                        args=cmd, returncode=0, stdout="Task: T1\nTicket: #110\n", stderr=""
                    )
                if "log -1" in cmd_str and "plan.md" in cmd_str:
                    return subprocess.CompletedProcess(
                        args=cmd, returncode=0, stdout="conductor(plan): update\n", stderr=""
                    )
                return subprocess.CompletedProcess(args=cmd, returncode=0, stdout="", stderr="")

            with patch("subprocess.run", side_effect=custom_side_effect):
                self.assertTrue(
                    audit_git_commit_and_notes(
                        task,
                        "1122334",
                        plan_path,
                        cwd=Path(tmpdir),
                        supervisor=custom_sup,
                    )
                )

            # Standard "feat:" is rejected when omitted from custom SupervisorProfile
            with patch("subprocess.run", side_effect=run_side_effect):
                with self.assertRaises(SupervisorInvariantError):
                    audit_git_commit_and_notes(
                        task,
                        "1122334",
                        plan_path,
                        cwd=Path(tmpdir),
                        supervisor=custom_sup,
                    )

    def test_audit_git_commit_and_notes_failure_modes(self) -> None:
        complete_task = TaskInfo(
            task_num=1,
            description="Test task",
            status="complete",
            status_char="x",
            is_checkpoint=False,
            commit_sha="1122334",
        )

        # 1. Commit SHA matches base_sha -> fails fast without invoking subprocess.run
        with patch("subprocess.run") as mock_run:
            with self.assertRaises(SupervisorInvariantError):
                audit_git_commit_and_notes(
                    complete_task,
                    "1122334",
                    Path("plan.md"),
                    base_sha="1122334abcdef",
                )
            mock_run.assert_not_called()

        # 2. Invalid/unresolvable commit SHA
        with patch(
            "subprocess.run",
            return_value=subprocess.CompletedProcess(
                args=["git"], returncode=128, stdout="", stderr="Needed a single revision"
            ),
        ):
            with self.assertRaises(SupervisorInvariantError):
                audit_git_commit_and_notes(complete_task, "badsha1", Path("plan.md"))

        # 3. Not a descendant of base_sha
        def not_descendant(cmd, *args, **kwargs):
            if cmd[:3] == ["git", "rev-parse", "--verify"]:
                return subprocess.CompletedProcess(
                    args=cmd, returncode=0, stdout="0001111222333\n", stderr=""
                )
            if cmd[:3] == ["git", "merge-base", "--is-ancestor"] and cmd[3] == "abc1234":
                return subprocess.CompletedProcess(args=cmd, returncode=1, stdout="", stderr="")
            return subprocess.CompletedProcess(args=cmd, returncode=0, stdout="", stderr="")

        with patch("subprocess.run", side_effect=not_descendant):
            with self.assertRaises(SupervisorInvariantError):
                audit_git_commit_and_notes(
                    complete_task, "0001111", Path("plan.md"), base_sha="abc1234"
                )

        # 4. Not an ancestor of HEAD
        def not_head_ancestor(cmd, *args, **kwargs):
            if cmd[:3] == ["git", "rev-parse", "--verify"]:
                return subprocess.CompletedProcess(
                    args=cmd, returncode=0, stdout="0001111222333\n", stderr=""
                )
            if cmd[:3] == ["git", "merge-base", "--is-ancestor"] and cmd[4] == "HEAD":
                return subprocess.CompletedProcess(args=cmd, returncode=1, stdout="", stderr="")
            return subprocess.CompletedProcess(args=cmd, returncode=0, stdout="", stderr="")

        with patch("subprocess.run", side_effect=not_head_ancestor):
            with self.assertRaises(SupervisorInvariantError):
                audit_git_commit_and_notes(complete_task, "0001111", Path("plan.md"))

        # 5. Non-conventional commit message
        def bad_commit_msg(cmd, *args, **kwargs):
            if "log -1 --format=%B" in " ".join(cmd):
                return subprocess.CompletedProcess(
                    args=cmd, returncode=0, stdout="WIP fixed stuff\n", stderr=""
                )
            return subprocess.CompletedProcess(args=cmd, returncode=0, stdout="", stderr="")

        with patch("subprocess.run", side_effect=bad_commit_msg):
            with self.assertRaises(SupervisorInvariantError):
                audit_git_commit_and_notes(complete_task, "1122334", Path("plan.md"))

        # 6. git log failure raises ProcessExecutionError
        def git_log_fails(cmd, *args, **kwargs):
            if "log -1 --format=%B" in " ".join(cmd):
                return subprocess.CompletedProcess(
                    args=cmd, returncode=128, stdout="", stderr="bad object"
                )
            return subprocess.CompletedProcess(args=cmd, returncode=0, stdout="", stderr="")

        with patch("subprocess.run", side_effect=git_log_fails):
            with self.assertRaises(ProcessExecutionError):
                audit_git_commit_and_notes(complete_task, "1122334", Path("plan.md"))

        # 7. Missing git notes & missing required note field
        def missing_notes(cmd, *args, **kwargs):
            cmd_str = " ".join(cmd)
            if "log -1 --format=%B" in cmd_str:
                return subprocess.CompletedProcess(
                    args=cmd, returncode=0, stdout="feat(core): valid msg\n", stderr=""
                )
            if "notes show" in cmd_str:
                return subprocess.CompletedProcess(
                    args=cmd, returncode=1, stdout="", stderr="No note found"
                )
            return subprocess.CompletedProcess(args=cmd, returncode=0, stdout="", stderr="")

        with patch("subprocess.run", side_effect=missing_notes):
            with self.assertRaises(SupervisorInvariantError):
                audit_git_commit_and_notes(complete_task, "1122334", Path("plan.md"))

        def incomplete_notes(cmd, *args, **kwargs):
            cmd_str = " ".join(cmd)
            if "log -1 --format=%B" in cmd_str:
                return subprocess.CompletedProcess(
                    args=cmd, returncode=0, stdout="feat(core): valid msg\n", stderr=""
                )
            if "notes show" in cmd_str:
                return subprocess.CompletedProcess(
                    args=cmd,
                    returncode=0,
                    stdout="Task: T1\nSummary: S\nFiles: F\n",
                    stderr="",
                )
            return subprocess.CompletedProcess(args=cmd, returncode=0, stdout="", stderr="")

        with patch("subprocess.run", side_effect=incomplete_notes):
            with self.assertRaises(SupervisorInvariantError) as ctx:
                audit_git_commit_and_notes(complete_task, "1122334", Path("plan.md"))
            self.assertIn("Rationale", str(ctx.exception))

        # 8. Missing plan.md, incomplete task status, missing [x]+SHA line, missing/failing plan log
        def valid_commit_and_notes(cmd, *args, **kwargs):
            cmd_str = " ".join(cmd)
            if "log -1 --format=%B" in cmd_str:
                return subprocess.CompletedProcess(
                    args=cmd, returncode=0, stdout="feat(core): valid msg\n", stderr=""
                )
            if "notes show" in cmd_str:
                return subprocess.CompletedProcess(
                    args=cmd,
                    returncode=0,
                    stdout="Task: T\nSummary: S\nFiles: F\nRationale: R\n",
                    stderr="",
                )
            if "log -1" in cmd_str and "plan.md" in cmd_str:
                return subprocess.CompletedProcess(
                    args=cmd, returncode=0, stdout="chore: unrelated plan edit\n", stderr=""
                )
            return subprocess.CompletedProcess(args=cmd, returncode=0, stdout="", stderr="")

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            missing_plan = tmp / "missing-plan.md"
            with patch("subprocess.run", side_effect=valid_commit_and_notes):
                with self.assertRaises(SupervisorInvariantError):
                    audit_git_commit_and_notes(complete_task, "1122334", missing_plan)

                plan_path = tmp / "plan.md"
                plan_path.write_text(
                    "- [x] Task: Other [commit: 1122334]\n- [ ] Task: Second\n",
                    encoding="utf-8",
                )
                pending_task = TaskInfo(2, "Second", "pending", " ", False)
                with self.assertRaises(SupervisorInvariantError):
                    audit_git_commit_and_notes(pending_task, "1122334", plan_path)

                plan_path.write_text("- [x] Task: Test task\n", encoding="utf-8")
                with self.assertRaises(SupervisorInvariantError):
                    audit_git_commit_and_notes(complete_task, "1122334", plan_path)

                plan_path.write_text("- [x] Task: Test task [commit: 1122334]\n", encoding="utf-8")
                with self.assertRaises(SupervisorInvariantError):
                    audit_git_commit_and_notes(complete_task, "1122334", plan_path)

            # git log on plan.md non-zero raises ProcessExecutionError
            def plan_log_fails(cmd, *args, **kwargs):
                cmd_str = " ".join(cmd)
                if "log -1" in cmd_str and "plan.md" in cmd_str:
                    return subprocess.CompletedProcess(
                        args=cmd, returncode=1, stdout="", stderr="log error"
                    )
                return valid_commit_and_notes(cmd, *args, **kwargs)

            with patch("subprocess.run", side_effect=plan_log_fails):
                with self.assertRaises(ProcessExecutionError):
                    audit_git_commit_and_notes(complete_task, "1122334", plan_path)

        # 9. Symbolic ref resolving to base_sha and OSError wrapping
        def head_resolves_to_base(cmd, *args, **kwargs):
            if cmd[:3] == ["git", "rev-parse", "--verify"]:
                return subprocess.CompletedProcess(
                    args=cmd, returncode=0, stdout="1122334abcdef\n", stderr=""
                )
            return subprocess.CompletedProcess(args=cmd, returncode=0, stdout="", stderr="")

        with patch("subprocess.run", side_effect=head_resolves_to_base):
            with self.assertRaises(SupervisorInvariantError):
                audit_git_commit_and_notes(
                    complete_task, "HEAD", Path("plan.md"), base_sha="1122334"
                )

        with patch("subprocess.run", side_effect=FileNotFoundError("git missing")):
            with self.assertRaises(ProcessExecutionError):
                audit_git_commit_and_notes(complete_task, "1122334", Path("plan.md"))

    def test_verify_checkpoint_commit_and_notes_valid_and_failures(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            plan_path = root / "plan.md"

            # Missing plan.md
            with self.assertRaises(SupervisorInvariantError):
                verify_checkpoint_commit_and_notes(5, plan_path, cwd=root)

            # Missing [checkpoint: <sha>] tag
            plan_path.write_text("## Phase 5: Boundaries\n- [x] Done [commit: 1122334]\n", encoding="utf-8")
            with self.assertRaises(SupervisorInvariantError):
                verify_checkpoint_commit_and_notes(5, plan_path, cwd=root, base_sha="0001112")

            plan_path.write_text(
                "## Phase 5: Boundaries [checkpoint: abc1234]\n- [x] Done [commit: 1122334]\n",
                encoding="utf-8",
            )

            # Checkpoint SHA matches base_sha
            with patch("subprocess.run") as mock_run:
                with self.assertRaises(SupervisorInvariantError):
                    verify_checkpoint_commit_and_notes(5, plan_path, cwd=root, base_sha="abc1234999")
                mock_run.assert_not_called()

            # Valid pass
            def valid_side_effect(cmd, *args, **kwargs):
                cmd_str = " ".join(cmd)
                if "log -1" in cmd_str and "plan.md" in cmd_str:
                    return subprocess.CompletedProcess(
                        args=cmd,
                        returncode=0,
                        stdout="conductor(plan): Mark Phase 5 complete\n",
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
                        stdout="Phase: Phase 5: Boundaries\nAutomated Tests:\nOK\n",
                        stderr="",
                    )
                return subprocess.CompletedProcess(args=cmd, returncode=0, stdout="", stderr="")

            with patch("subprocess.run", side_effect=valid_side_effect):
                self.assertEqual(
                    verify_checkpoint_commit_and_notes(5, plan_path, cwd=root, base_sha="0001112"),
                    "abc1234",
                )

            # Wrong checkpoint commit message
            with patch(
                "subprocess.run",
                return_value=subprocess.CompletedProcess(
                    args=["git"], returncode=0, stdout="chore: random\n", stderr=""
                ),
            ):
                with self.assertRaises(SupervisorInvariantError):
                    verify_checkpoint_commit_and_notes(5, plan_path, cwd=root, base_sha="0001112")

            # Empty/whitespace git notes
            def empty_notes(cmd, *args, **kwargs):
                if "notes show" in " ".join(cmd):
                    return subprocess.CompletedProcess(args=cmd, returncode=0, stdout="   \n", stderr="")
                return valid_side_effect(cmd, *args, **kwargs)

            with patch("subprocess.run", side_effect=empty_notes):
                with self.assertRaises(SupervisorInvariantError):
                    verify_checkpoint_commit_and_notes(5, plan_path, cwd=root, base_sha="0001112")

            # Missing conductor(plan) commit on plan.md
            def missing_plan_commit(cmd, *args, **kwargs):
                cmd_str = " ".join(cmd)
                if "log -1" in cmd_str and "plan.md" in cmd_str:
                    return subprocess.CompletedProcess(
                        args=cmd, returncode=0, stdout="chore: manual edit\n", stderr=""
                    )
                return valid_side_effect(cmd, *args, **kwargs)

            with patch("subprocess.run", side_effect=missing_plan_commit):
                with self.assertRaises(SupervisorInvariantError):
                    verify_checkpoint_commit_and_notes(5, plan_path, cwd=root, base_sha="0001112")

            # OSError during checkpoint git inspection wraps into SupervisorInvariantError
            with patch("subprocess.run", side_effect=FileNotFoundError("git missing")):
                with self.assertRaises(SupervisorInvariantError):
                    verify_checkpoint_commit_and_notes(5, plan_path, cwd=root, base_sha="0001112")


class TestCopyToClipboard(unittest.TestCase):
    """Verify clipboard export uses stdout=DEVNULL, finite timeouts, and OSC 52 fallback."""

    def test_copy_to_clipboard_uses_devnull_stdout_and_timeout(self) -> None:
        proc = MagicMock()
        proc.returncode = 0
        proc.communicate.return_value = (None, None)

        with patch("subprocess.Popen", return_value=proc) as mock_popen:
            self.assertTrue(copy_to_clipboard("hello world", timeout=2.5))

        mock_popen.assert_called_once_with(
            ["xclip", "-selection", "clipboard"],
            stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        proc.communicate.assert_called_once_with(input=b"hello world", timeout=2.5)

    def test_copy_to_clipboard_timeout_kills_and_drains_then_continues(self) -> None:
        timed_out_proc = MagicMock()
        timed_out_proc.communicate.side_effect = [
            subprocess.TimeoutExpired(cmd=["xclip"], timeout=1.5),
            (None, None),
        ]
        ok_proc = MagicMock()
        ok_proc.returncode = 0
        ok_proc.communicate.return_value = (None, None)

        with patch("subprocess.Popen", side_effect=[timed_out_proc, ok_proc]) as mock_popen:
            self.assertTrue(copy_to_clipboard("clip", timeout=1.5))

        self.assertEqual(mock_popen.call_count, 2)
        timed_out_proc.kill.assert_called_once()
        self.assertEqual(timed_out_proc.communicate.call_count, 2)
        ok_proc.communicate.assert_called_once_with(input=b"clip", timeout=1.5)

    def test_copy_to_clipboard_osc52_fallbacks_and_failure(self) -> None:
        expected_b64 = base64.b64encode(b"osc-text").decode("ascii")
        expected_osc52 = f"\033]52;c;{expected_b64}\a"

        # /dev/tty fallback when GUI tools are missing
        tty_mock = mock_open()
        with (
            patch("subprocess.Popen", side_effect=FileNotFoundError("no binary")),
            patch("builtins.open", tty_mock),
        ):
            self.assertTrue(copy_to_clipboard("osc-text"))
        tty_mock().write.assert_called_once_with(expected_osc52)
        tty_mock().flush.assert_called_once()

        # sys.stderr.isatty() fallback when /dev/tty cannot be opened
        fake_stderr = io.StringIO()
        fake_stderr.isatty = lambda: True  # type: ignore[method-assign]
        fail_proc = MagicMock()
        fail_proc.returncode = 1
        fail_proc.communicate.return_value = (None, None)
        with (
            patch("subprocess.Popen", return_value=fail_proc),
            patch("builtins.open", side_effect=OSError("no tty")),
            patch("sys.stderr", fake_stderr),
        ):
            self.assertTrue(copy_to_clipboard("osc-text"))
        self.assertEqual(fake_stderr.getvalue(), expected_osc52)

        # Returns False when all GUI tools and OSC 52 fallbacks fail
        non_tty_stderr = io.StringIO()
        non_tty_stderr.isatty = lambda: False  # type: ignore[method-assign]
        with (
            patch("subprocess.Popen", side_effect=OSError("unavailable")),
            patch("builtins.open", side_effect=OSError("no tty")),
            patch("sys.stderr", non_tty_stderr),
        ):
            self.assertFalse(copy_to_clipboard("osc-text"))


if __name__ == "__main__":
    unittest.main()
