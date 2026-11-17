"""Unit tests for `conductor_tools.parser` unified Markdown and blueprint parsing."""

from __future__ import annotations

from dataclasses import FrozenInstanceError
from pathlib import Path
import tempfile
import unittest

from conductor_tools.models import PhaseInfo, TaskBlueprint, TaskInfo, TrackPlan
from conductor_tools.parser import (
    extract_backtick_spans,
    extract_post_execution_info,
    find_next_pending_task,
    get_active_phase,
    get_active_track,
    get_pending_tasks,
    is_checkpoint_task,
    is_metadata_path,
    is_test_file,
    parse_plan_file,
    parse_plan_markdown,
    parse_review_severity,
    parse_task_blueprint,
    parse_task_blueprint_markdown,
    parse_track_plan,
    parse_tracks_registry,
)
from conductor_tools.profile import PathRules, PlanningProfile


class TestTracksRegistryParsing(unittest.TestCase):
    """Verify tracks.md registry parsing and directory fallback via PlanningProfile."""

    def test_in_progress_takes_priority_over_preceding_pending_row(self) -> None:
        cases = (
            "[~]",
            "[~] In Progress",
            "[ ] In Progress",
            "[ ] in progress",
        )
        for marker in cases:
            with self.subTest(marker=marker):
                content = (
                    "# Project Tracks\n\n"
                    "| Track | Status |\n"
                    "| --- | --- |\n"
                    "| **alpha-done_20260101** | [x] Complete |\n"
                    "| **beta-pending_20260102** | [ ] |\n"
                    f"| **gamma-active_20260103** | {marker} |\n"
                )
                self.assertEqual(parse_tracks_registry(content), "gamma-active_20260103")

    def test_pending_selected_when_no_in_progress_row_exists(self) -> None:
        content = (
            "# Project Tracks\n\n"
            "| Track | Status |\n"
            "| --- | --- |\n"
            "| **alpha-done_20260101** | [x] Complete |\n"
            "| **beta-pending_20260102** | [ ] |\n"
            "| **gamma-later_20260103** | [ ] |\n"
        )
        self.assertEqual(parse_tracks_registry(content), "beta-pending_20260102")

    def test_returns_none_when_only_complete_or_empty(self) -> None:
        completed_only = (
            "| Track | Status |\n"
            "| --- | --- |\n"
            "| **alpha-done_20260101** | [x] Complete |\n"
        )
        self.assertIsNone(parse_tracks_registry(completed_only))
        self.assertIsNone(parse_tracks_registry(""))

    def test_get_active_track_falls_back_to_sorted_tracks_dir_and_honors_profile(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            custom_planning = PlanningProfile(
                tracks_dir="planning/work",
                tracks_registry="planning/registry.md",
            )

            # Empty/missing registry and tracks dir -> None
            self.assertIsNone(get_active_track(root, custom_planning))

            # Registry with only completed rows -> falls back to tracks_dir
            registry_path = root / "planning" / "registry.md"
            registry_path.parent.mkdir(parents=True, exist_ok=True)
            registry_path.write_text(
                "| Track | Status |\n| --- | --- |\n| **done-track** | [x] Complete |\n",
                encoding="utf-8",
            )

            tracks_dir = root / "planning" / "work"
            tracks_dir.mkdir(parents=True, exist_ok=True)
            (tracks_dir / ".hidden-track").mkdir()
            (tracks_dir / "README.md").write_text("ignore file", encoding="utf-8")
            (tracks_dir / "zebra-track").mkdir()
            (tracks_dir / "alpha-track").mkdir()

            self.assertEqual(get_active_track(root, custom_planning), "alpha-track")

            # Missing registry altogether still scans tracks_dir
            registry_path.unlink()
            self.assertEqual(get_active_track(root, custom_planning), "alpha-track")

            # Default PlanningProfile uses conductor/tracks.md and conductor/tracks
            (root / "conductor").mkdir()
            (root / "conductor" / "tracks.md").write_text(
                "| **default-track** | [~] In Progress |\n",
                encoding="utf-8",
            )
            self.assertEqual(get_active_track(root), "default-track")


class TestPlanMarkdownParsing(unittest.TestCase):
    """Verify plan.md parsing into frozen PhaseInfo, TaskInfo, and TrackPlan models."""

    def test_phase_headers_checkpoints_and_incomplete_without_checkpoint_sha(self) -> None:
        content = (
            "# Track Plan\n\n"
            "## Phase 1: Foundation `[checkpoint: 7293ad8b]`\n"
            "- [x] Task: Setup workspace (`1122334`)\n\n"
            "### Phase 2: Implementation [abc1234]\n"
            "- [x] Task: Build engine [commit: 2233445]\n\n"
            "## Phase 3: All Tasks Done Without Checkpoint\n"
            "- [x] Task: First item (3344556)\n"
            "- [x] Task: Second item (4455667)\n"
        )
        phases = parse_plan_markdown(content)
        self.assertEqual(sorted(phases.keys()), [1, 2, 3])

        p1 = phases[1]
        self.assertIsInstance(p1, PhaseInfo)
        self.assertEqual(p1.phase_num, 1)
        self.assertEqual(p1.name, "Foundation")
        self.assertEqual(p1.checkpoint_sha, "7293ad8b")
        self.assertEqual(p1.raw_heading, "## Phase 1: Foundation")
        self.assertTrue(p1.is_complete)

        p2 = phases[2]
        self.assertEqual(p2.phase_num, 2)
        self.assertEqual(p2.name, "Implementation")
        self.assertEqual(p2.checkpoint_sha, "abc1234")
        self.assertEqual(p2.raw_heading, "### Phase 2: Implementation")
        self.assertTrue(p2.is_complete)

        p3 = phases[3]
        self.assertEqual(p3.phase_num, 3)
        self.assertEqual(p3.name, "All Tasks Done Without Checkpoint")
        self.assertIsNone(p3.checkpoint_sha)
        self.assertFalse(p3.is_complete)

    def test_task_statuses_prefixes_subtasks_and_exempt_categories(self) -> None:
        content = (
            "## Phase 1: Multi-Status\n"
            "- [X] Task 1: Uppercase complete with ui exempt [exempt: UI] (1111111)\n"
            "- [~] Task: Active work [exempt: docs]\n"
            "  - [ ] Two-space indented subtask\n"
            "\t- [x] Tab-indented subtask\n"
            "- [ ] Plain task without prefix [exempt: styling]\n"
            "- [-] Task 4: Skipped scripts task [exempt: scripts]\n"
            "- [ ] Task 5: Infra [exempt: infra] and types [exempt: types] check\n"
        )
        phases = parse_plan_markdown(content)
        tasks = phases[1].tasks
        self.assertEqual(len(tasks), 5)

        self.assertEqual(tasks[0].task_num, 1)
        self.assertEqual(tasks[0].status, "complete")
        self.assertEqual(tasks[0].status_char, "x")
        self.assertEqual(tasks[0].exempt, "ui")
        self.assertEqual(tasks[0].commit_sha, "1111111")
        self.assertEqual(tasks[0].description, "Uppercase complete with ui exempt")
        self.assertIn("- [X] Task 1:", tasks[0].raw_line)

        self.assertEqual(tasks[1].task_num, 2)
        self.assertEqual(tasks[1].status, "in_progress")
        self.assertEqual(tasks[1].status_char, "~")
        self.assertEqual(tasks[1].exempt, "docs")
        self.assertEqual(tasks[1].description, "Active work")
        self.assertIsInstance(tasks[1].subtasks, tuple)
        self.assertEqual(
            tasks[1].subtasks,
            ("Two-space indented subtask", "Tab-indented subtask"),
        )

        self.assertEqual(tasks[2].task_num, 3)
        self.assertEqual(tasks[2].status, "pending")
        self.assertEqual(tasks[2].status_char, " ")
        self.assertEqual(tasks[2].exempt, "styling")
        self.assertEqual(tasks[2].description, "Plain task without prefix")

        self.assertEqual(tasks[3].task_num, 4)
        self.assertEqual(tasks[3].status, "skipped")
        self.assertEqual(tasks[3].status_char, "-")
        self.assertEqual(tasks[3].exempt, "scripts")
        self.assertEqual(tasks[3].description, "Skipped scripts task")

        self.assertEqual(tasks[4].exempt, "infra")
        self.assertNotIn("[exempt:", tasks[4].description)

    def test_sha_variants_and_pending_hex_word_preservation(self) -> None:
        content = (
            "## Phase 1: SHAs\n"
            "- [x] Task: Paren SHA (1234567)\n"
            "- [x] Task: Backtick paren SHA (`abcdef0`)\n"
            "- [x] Task: Commit bracket `[commit: 89abcdef]`\n"
            "- [x] Task: Checkpoint bracket [checkpoint: 0123456789abcdef]\n"
            "- [x] Task: Plain bracket [deadbeef]\n"
            "- [x] Task: Bare completed SHA feedface\n"
            "- [-] Task: Bare skipped SHA cafe123\n"
            "- [ ] Task: Pending task ending in deadbeef\n"
            "- [~] Task: In progress ending in cafe123\n"
        )
        tasks = parse_plan_markdown(content)[1].tasks
        self.assertEqual(tasks[0].commit_sha, "1234567")
        self.assertEqual(tasks[0].description, "Paren SHA")
        self.assertEqual(tasks[1].commit_sha, "abcdef0")
        self.assertEqual(tasks[1].description, "Backtick paren SHA")
        self.assertEqual(tasks[2].commit_sha, "89abcdef")
        self.assertEqual(tasks[2].description, "Commit bracket")
        self.assertEqual(tasks[3].commit_sha, "0123456789abcdef")
        self.assertEqual(tasks[3].description, "Checkpoint bracket")
        self.assertEqual(tasks[4].commit_sha, "deadbeef")
        self.assertEqual(tasks[4].description, "Plain bracket")
        self.assertEqual(tasks[5].commit_sha, "feedface")
        self.assertEqual(tasks[5].description, "Bare completed SHA")
        self.assertEqual(tasks[6].commit_sha, "cafe123")
        self.assertEqual(tasks[6].description, "Bare skipped SHA")

        # Pending / in-progress tasks must preserve trailing hex words
        self.assertIsNone(tasks[7].commit_sha)
        self.assertEqual(tasks[7].description, "Pending task ending in deadbeef")
        self.assertIsNone(tasks[8].commit_sha)
        self.assertEqual(tasks[8].description, "In progress ending in cafe123")

    def test_review_fixes_attached_to_preceding_phase(self) -> None:
        content = (
            "## Phase 1: Parser [checkpoint: abc1234]\n"
            "- [x] Task: Implement parser (1111111)\n\n"
            "## Phase: Review Fixes\n"
            "- [x] Task: Fix edge case f7e9119\n"
            "    - [x] Tighten regex anchor\n\n"
            "## Phase 2: Git Adapter\n"
            "- [ ] Task: Implement git scope\n"
        )
        phases = parse_plan_markdown(content)
        self.assertEqual(sorted(phases.keys()), [1, 2])
        self.assertEqual(len(phases[1].tasks), 1)
        self.assertEqual(len(phases[1].review_fixes), 1)
        rf = phases[1].review_fixes[0]
        self.assertEqual(rf.description, "Fix edge case")
        self.assertEqual(rf.commit_sha, "f7e9119")
        self.assertEqual(rf.subtasks, ("Tighten regex anchor",))
        self.assertEqual(phases[2].name, "Git Adapter")
        self.assertEqual(len(phases[2].tasks), 1)

    def test_is_checkpoint_task_classification(self) -> None:
        positive_cases = (
            "Conductor - User Manual Verification 'Phase 3' (Protocol in workflow.md)",
            "Checkpoint end of Phase 3",
            "Final checkpoint",
            "checkpoint: abc1234",
            "User manual verification",
        )
        for desc in positive_cases:
            with self.subTest(expected=True, desc=desc):
                self.assertTrue(is_checkpoint_task(desc))

        negative_cases = (
            "Write failing unit tests for Gate 1 checkpoint",
            "Implement Gate 1 checkpoint and Gate 2 review dispatch",
            "Verify checkpoint_sha serialization",
        )
        for desc in negative_cases:
            with self.subTest(expected=False, desc=desc):
                self.assertFalse(is_checkpoint_task(desc))

    def test_immutability_no_to_dict_parse_plan_file_and_parse_track_plan(self) -> None:
        self.assertEqual(parse_plan_file(None), {})

        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            self.assertEqual(parse_plan_file(root / "missing.md"), {})
            self.assertEqual(parse_plan_file(root), {})

            track_dir = root / "conductor" / "tracks" / "demo_20261117"
            track_dir.mkdir(parents=True)
            plan_file = track_dir / "plan.md"
            plan_file.write_text(
                "## Phase 1: Demo [checkpoint: abc1234]\n"
                "- [x] Task: First task (1111111)\n"
                "    - [x] Subtask 1\n",
                encoding="utf-8",
            )

            # Parse from explicit plan.md path and from track directory
            from_dir = parse_track_plan(track_dir)
            from_file = parse_track_plan(plan_file, track_name="custom-name")

            self.assertIsInstance(from_dir, TrackPlan)
            self.assertEqual(from_dir.track_name, "demo_20261117")
            self.assertEqual(from_dir.track_dir, track_dir)
            self.assertEqual(from_dir.plan_path, plan_file)

            self.assertEqual(from_file.track_name, "custom-name")
            self.assertEqual(from_file.track_dir, track_dir)
            self.assertEqual(from_file.plan_path, plan_file)

            phase = from_dir.phases[1]
            task = phase.tasks[0]
            self.assertIsInstance(phase.tasks, tuple)
            self.assertIsInstance(phase.review_fixes, tuple)
            self.assertIsInstance(task.subtasks, tuple)
            self.assertFalse(hasattr(task, "to_dict"))
            self.assertFalse(hasattr(phase, "to_dict"))
            self.assertFalse(hasattr(from_dir, "to_dict"))

            with self.assertRaises(FrozenInstanceError):
                setattr(task, "status", "pending")
            with self.assertRaises(FrozenInstanceError):
                setattr(phase, "is_complete", False)
            with self.assertRaises(FrozenInstanceError):
                setattr(from_dir, "track_name", "mutated")

    def test_phase_and_task_query_helpers(self) -> None:
        content = (
            "## Phase 1: Done [checkpoint: abc1234]\n"
            "- [x] Task: Complete (1111111)\n\n"
            "## Phase 2: Active\n"
            "- [x] Task: Done task (2222222)\n"
            "- [-] Task: Skipped task\n"
            "- [~] Task: Working task\n"
            "- [ ] Task: Pending task\n"
        )
        phases = parse_plan_markdown(content)

        active = get_active_phase(phases)
        self.assertIsNotNone(active)
        assert active is not None
        self.assertEqual(active.phase_num, 2)
        self.assertEqual(get_active_phase(phases, target_phase=1), phases[1])
        self.assertIsNone(get_active_phase(phases, target_phase=99))

        pending = get_pending_tasks(active)
        self.assertIsInstance(pending, tuple)
        self.assertEqual([t.task_num for t in pending], [3, 4])
        self.assertEqual([t.status for t in pending], ["in_progress", "pending"])

        nxt = find_next_pending_task(phases)
        self.assertIsNotNone(nxt)
        assert nxt is not None
        self.assertEqual(nxt[0], 2)
        self.assertEqual(nxt[1].task_num, 3)

        all_done = parse_plan_markdown(
            "## Phase 1: Done [checkpoint: abc1234]\n- [x] Task: Done (1111111)\n"
        )
        self.assertIsNone(get_active_phase(all_done))
        self.assertIsNone(find_next_pending_task(all_done))


class TestTaskBlueprintAndPathRules(unittest.TestCase):
    """Verify TaskBlueprint separation of target_files vs referenced_test_files via PathRules."""

    def test_target_files_separated_from_referenced_test_files(self) -> None:
        blueprint_md = (
            "# Plan: Phase 2 Task 2\n\n"
            "## Target Files & Blueprint\n"
            "- **Path:** `src/service.py`\n"
            "### File 1: `src/helpers.py`\n"
            "#### [MODIFY] lib/utils.ts\n"
            "- **Path:** `conductor/tracks/demo/plan.md`\n\n"
            "## Execution Verification Protocol\n"
            "```bash\n"
            "pytest tests/test_service.py && npm run type-check\n"
            "```\n"
        )
        bp = parse_task_blueprint_markdown(
            blueprint_md,
            Path("conductor/tracks/demo/phase-2-task-2-plan.md"),
        )
        self.assertIsInstance(bp, TaskBlueprint)
        self.assertEqual(bp.target_files, ("src/service.py", "src/helpers.py", "lib/utils.ts"))
        self.assertEqual(bp.referenced_test_files, ("tests/test_service.py",))
        self.assertEqual(
            bp.verification_commands,
            ("pytest tests/test_service.py && npm run type-check",),
        )
        self.assertFalse(bp.is_empty)

    def test_explicit_red_target_test_appears_in_both_targets_and_referenced_tests(self) -> None:
        blueprint_md = (
            "# Plan: Phase 2 Task 1\n\n"
            "## Target Files\n"
            "- **Path:** `tests/test_service.py`\n\n"
            "## Execution Verification Protocol\n"
            "```bash\n"
            "pytest tests/test_service.py\n"
            "```\n"
        )
        bp = parse_task_blueprint_markdown(
            blueprint_md,
            Path("conductor/tracks/demo/phase-2-task-1-plan.md"),
        )
        self.assertEqual(bp.target_files, ("tests/test_service.py",))
        self.assertEqual(bp.referenced_test_files, ("tests/test_service.py",))

    def test_metadata_exclusion_and_path_rules_classification(self) -> None:
        self.assertTrue(is_metadata_path("conductor/tracks/demo/plan.md"))
        self.assertTrue(is_metadata_path(".gemini/notes.md"))
        self.assertFalse(is_metadata_path("src/service.py"))

        custom_rules = PathRules(metadata_prefixes=("meta/",))
        self.assertTrue(is_metadata_path("meta/notes.md", custom_rules))
        self.assertFalse(is_metadata_path("conductor/tracks/demo/plan.md", custom_rules))

        # Default PathRules test file classification
        for test_path in (
            "pkg/service_test.py",
            "pkg/handler_test.go",
            "src/button.test.ts",
            "e2e/checkout.spec.tsx",
            "tests/test_parser.py",
            "tests/helpers.py",
            "test/unit.js",
            "__tests__/app.jsx",
            "test_standalone.py",
        ):
            with self.subTest(expected=True, path=test_path):
                self.assertTrue(is_test_file(test_path))

        for non_test in (
            "scripts/conductor-tools/tests",
            "src/service.py",
            "lib/utils.ts",
            "tests",
        ):
            with self.subTest(expected=False, path=non_test):
                self.assertFalse(is_test_file(non_test))

        # Custom PathRules for Ruby/RSpec without JS/TS assumptions
        ruby_rules = PathRules(
            test_dirs=("spec",),
            test_suffixes=("_spec.rb",),
            test_prefixes=("spec_",),
            code_extensions=(".rb",),
        )
        ruby_bp = parse_task_blueprint_markdown(
            "## Target Files\n"
            "- **Path:** `app/models/user.rb`\n\n"
            "## Execution Verification Protocol\n"
            "```bash\n"
            "bundle exec rspec spec/models/user_spec.rb spec_helper.rb\n"
            "```\n",
            Path("conductor/tracks/demo/phase-1-task-1-plan.md"),
            path_rules=ruby_rules,
        )
        self.assertEqual(ruby_bp.target_files, ("app/models/user.rb",))
        self.assertEqual(
            ruby_bp.referenced_test_files,
            ("spec/models/user_spec.rb", "spec_helper.rb"),
        )

    def test_basename_deduplication_and_subtask_fallback(self) -> None:
        blueprint_md = (
            "## Target Files\n"
            "- **Path:** `src/service.py`\n\n"
            "## Execution Verification Protocol\n"
            "```bash\n"
            "pytest tests/test_service.py test_service.py\n"
            "```\n"
        )
        bp = parse_task_blueprint_markdown(
            blueprint_md,
            Path("conductor/tracks/demo/phase-1-task-1-plan.md"),
        )
        self.assertEqual(bp.referenced_test_files, ("tests/test_service.py",))

        # Fallback to subtasks when bash verification blocks yield no test files
        fallback_md = (
            "## Target Files\n"
            "- **Path:** `src/service.py`\n\n"
            "## Execution Verification Protocol\n"
            "```bash\n"
            "pytest\n"
            "```\n"
        )
        bp_fallback = parse_task_blueprint_markdown(
            fallback_md,
            Path("conductor/tracks/demo/phase-1-task-2-plan.md"),
            subtasks=(
                "Add coverage in `tests/test_fallback.py`",
                "Run `pytest tests/test_cmd.py` and `npx jest src/app.test.ts`",
                "Ignore `.gemini/cache.md`",
            ),
        )
        self.assertEqual(bp_fallback.target_files, ("src/service.py",))
        self.assertEqual(
            bp_fallback.referenced_test_files,
            ("tests/test_fallback.py", "tests/test_cmd.py", "src/app.test.ts"),
        )

    def test_empty_missing_whitespace_and_command_flattening(self) -> None:
        empty_none = parse_task_blueprint(None)
        self.assertTrue(empty_none.is_empty)

        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            missing = root / "missing.md"
            self.assertTrue(parse_task_blueprint(missing).is_empty)

            whitespace = root / "phase-1-task-1-plan.md"
            whitespace.write_text("   \n\t\n", encoding="utf-8")
            self.assertTrue(parse_task_blueprint(whitespace).is_empty)

            multiline = root / "phase-1-task-2-plan.md"
            multiline.write_text(
                "## Execution Verification Protocol\n"
                "```bash\n"
                "# Comment line should be skipped\n"
                "python3.12 -m unittest \\\n"
                "  discover -s tests\n"
                "python3.12 -m unittest discover -s tests\n"
                "pytest tests/test_one.py\n"
                "```\n",
                encoding="utf-8",
            )
            bp = parse_task_blueprint(multiline)
            self.assertEqual(
                bp.verification_commands,
                (
                    "python3.12 -m unittest discover -s tests",
                    "pytest tests/test_one.py",
                ),
            )


class TestBacktickAndPostExecExtraction(unittest.TestCase):
    """Verify full backtick span extraction and post-execution commit parsing."""

    def test_extract_backtick_spans_preserves_full_commands_and_deduplicates(self) -> None:
        line1 = (
            "Run `TEST_TYPE=unit npm run test:integration -- --watchAll=false && npm run type-check` "
            "and `` twice: `TEST_TYPE=unit npm run test:integration -- --watchAll=false && npm run type-check`."
        )
        line2 = (
            'Then run `PYTHONPATH=scripts/conductor-tools python3.12 -m unittest discover '
            '-s scripts/conductor-tools/tests -p "test_parser.py"`.'
        )
        spans_from_seq = extract_backtick_spans([line1, line2])
        spans_from_str = extract_backtick_spans(f"{line1}\n{line2}")
        expected = (
            "TEST_TYPE=unit npm run test:integration -- --watchAll=false && npm run type-check",
            'PYTHONPATH=scripts/conductor-tools python3.12 -m unittest discover -s scripts/conductor-tools/tests -p "test_parser.py"',
        )
        self.assertEqual(spans_from_seq, expected)
        self.assertEqual(spans_from_str, expected)

    def test_verification_commands_preserve_env_flags_and_cd(self) -> None:
        blueprint_md = (
            "## Execution Verification Protocol\n"
            "```bash\n"
            "cd packages/core && ENV_VAR=1 pytest --maxfail=1 tests/test_core.py\n"
            "```\n"
        )
        bp = parse_task_blueprint_markdown(
            blueprint_md,
            Path("conductor/tracks/demo/phase-1-task-1-plan.md"),
        )
        self.assertEqual(
            bp.verification_commands,
            ("cd packages/core && ENV_VAR=1 pytest --maxfail=1 tests/test_core.py",),
        )

    def test_extract_post_execution_info_variants_and_task_matching(self) -> None:
        content_numbered = (
            "# Plan: Phase 2 Task 1\n"
            "**Task:** Implement `parser.py` engine\n\n"
            "## 4. Post-Execution Protocol\n"
            "```bash\n"
            'git commit -m "conductor(plan): ignore tracking commit"\n'
            'git commit --no-verify -m "feat(parser): implement unified parser"\n'
            "```\n"
        )
        section, commit_msg = extract_post_execution_info(
            content_numbered,
            task_desc="Implement `parser.py` engine [exempt: scripts] (1234567)",
        )
        self.assertEqual(section, "Section 4 (Post-Execution Protocol)")
        self.assertEqual(commit_msg, "feat(parser): implement unified parser")

        content_unnumbered = (
            "# Plan\n"
            "Task: Add review severity parser\n\n"
            "## Commit Protocol\n"
            "```bash\n"
            "git commit -m 'conductor/plan: ignore slash prefix'\n"
            "git commit -m 'test(parser): add severity tests'\n"
            "```\n"
        )
        with tempfile.TemporaryDirectory() as tmpdir:
            plan_path = Path(tmpdir) / "phase-2-task-2-plan.md"
            plan_path.write_text(content_unnumbered, encoding="utf-8")

            section2, commit2 = extract_post_execution_info(
                plan_path,
                task_desc="Add review severity parser",
            )
            self.assertEqual(section2, "the 'Commit Protocol' section")
            self.assertEqual(commit2, "test(parser): add severity tests")

            bp = parse_task_blueprint(plan_path, task_desc="Add review severity parser")
            self.assertEqual(bp.post_exec_section, "the 'Commit Protocol' section")
            self.assertEqual(bp.post_exec_commit_msg, "test(parser): add severity tests")

            # Mismatched task_desc returns (None, None)
            self.assertEqual(
                extract_post_execution_info(plan_path, task_desc="Completely different task"),
                (None, None),
            )
            self.assertEqual(
                extract_post_execution_info(Path(tmpdir) / "missing.md", task_desc="Any"),
                (None, None),
            )


class TestReviewSeverityParsing(unittest.TestCase):
    """Verify Gate 2 phase-N-review.md severity heading matching."""

    def test_matches_strict_h3_critical_and_high_headings(self) -> None:
        report = (
            "# Phase 2 Review\n\n"
            "### Critical: SQL Injection\nDetails\n\n"
            "### [High] Missing auth guard\nDetails\n\n"
            "### [Critical] Data loss\nDetails\n\n"
            "### Critical\nDetails\n\n"
            "### high: timeout handling\nDetails\n"
        )
        has_findings, findings = parse_review_severity(report)
        self.assertTrue(has_findings)
        self.assertIsInstance(findings, tuple)
        self.assertEqual(
            findings,
            (
                "### Critical: SQL Injection",
                "### [High] Missing auth guard",
                "### [Critical] Data loss",
                "### Critical",
                "### high: timeout handling",
            ),
        )

    def test_ignores_non_matching_headings_and_prose(self) -> None:
        report = (
            "## Critical Summary\n\n"
            "No Critical or High issues detected in High-traffic path.\n\n"
            "### High-Level Overview\nDetails\n\n"
            "### Highlights\nDetails\n\n"
            "### Criticality Assessment\nDetails\n\n"
            "### Medium: Minor cleanup\nDetails\n\n"
            "### Low: Typo\nDetails\n"
        )
        has_findings, findings = parse_review_severity(report)
        self.assertFalse(has_findings)
        self.assertEqual(findings, ())

    def test_honors_custom_severity_pattern(self) -> None:
        report = (
            "### Critical: Ignored by custom pattern\n"
            "## BLOCKER: Custom severity match\n"
        )
        has_findings, findings = parse_review_severity(
            report,
            severity_pattern=r"^##\s+BLOCKER:",
        )
        self.assertTrue(has_findings)
        self.assertEqual(findings, ("## BLOCKER: Custom severity match",))


if __name__ == "__main__":
    unittest.main()
