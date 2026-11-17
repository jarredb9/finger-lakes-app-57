"""Unit tests for `conductor_tools.templates` prompt builders and in-process dispatcher."""

from __future__ import annotations

import importlib
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from conductor_tools.models import (
    ConductorError,
    PhaseCheckpointContext,
    PhaseInfo,
    PromptMode,
    TaskBlueprint,
    TaskInfo,
    TrackPlan,
    VerificationStrategy,
)
from conductor_tools.profile import (
    DomainRule,
    ExemptRule,
    PlanningProfile,
    RepoProfile,
    SuiteConfig,
    SupervisorProfile,
    TypeCheckProfile,
)
from conductor_tools.templates import (
    build_checkpoint_prompt,
    build_exec_prompt,
    build_plan_prompt,
    build_recovery_prompt,
    build_review_prompt,
    generate_turn_prompt,
    get_preceding_context,
    has_guardrail_targets,
)


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
    """Initialize an isolated temporary git repository."""
    root.mkdir(parents=True, exist_ok=True)
    _git(root, "init")
    _git(root, "checkout", "-B", branch)
    _git(root, "config", "user.name", "Test User")
    _git(root, "config", "user.email", "test@example.com")
    return root


def _commit_file(root: Path, rel_path: str, content: str, message: str) -> str:
    """Write a file and commit it, returning the 7-char short SHA."""
    target = root / rel_path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    _git(root, "add", rel_path)
    _git(root, "commit", "-m", message)
    return _git(root, "rev-parse", "--short=7", "HEAD")


def _make_synthetic_track(
    root: Path,
    track_name: str = "demo-track_20261117",
    plan_text: str | None = None,
    spec_text: str = "# Demo Spec\n\nSynthetic specification.\n",
) -> TrackPlan:
    """Create a synthetic track directory with `plan.md` and `spec.md`."""
    (root / "conductor").mkdir(parents=True, exist_ok=True)
    track_dir = root / "conductor" / "tracks" / track_name
    track_dir.mkdir(parents=True, exist_ok=True)
    (track_dir / "spec.md").write_text(spec_text, encoding="utf-8")
    plan_path = track_dir / "plan.md"
    if plan_text is None:
        plan_text = (
            "# Implementation Plan: Demo Track\n\n"
            "## Phase 1: Core Engine\n"
            "- [ ] Task: Write failing unit tests for widget (Red phase)\n"
            "    - [ ] Add assertions in `tests/test_widget.py`\n"
            "- [ ] Task: Implement widget module (Green phase)\n"
            "    - [ ] Create `src/widget.py`\n"
            "- [ ] Task: Update README documentation [exempt: docs]\n"
            "- [ ] Task: Conductor - User Manual Verification 'Phase 1: Core Engine'\n"
        )
    plan_path.write_text(plan_text, encoding="utf-8")

    # Build a matching TrackPlan directly or via parser
    from conductor_tools.parser import parse_track_plan

    return parse_track_plan(track_dir, track_name=track_name)


def _make_custom_profile() -> RepoProfile:
    """Return a synthetic custom RepoProfile with suites, domains, exempts, and guardrails."""
    return RepoProfile(
        planning=PlanningProfile(
            style_guide_guardrail=(
                "TypeScript Style Guardrails (docs/style-ts.md): "
                "prefer strict narrowing and explicit return types."
            ),
            guardrail_extensions=(".ts", ".tsx"),
        ),
        type_check=TypeCheckProfile(
            cmd="npm run typecheck",
            extensions=(".ts", ".tsx"),
            check_tokens=("typecheck", "type-check"),
        ),
        suites=(
            SuiteConfig(
                name="python",
                full_cmd="pytest",
                targeted_cmd="pytest {files}",
                path_prefixes=("src/", "tests/"),
                path_suffixes=(".py",),
                keywords=("python", "pytest"),
                include_in_full_suite=True,
                is_python=True,
            ),
            SuiteConfig(
                name="web",
                full_cmd="npm test",
                targeted_cmd="npx vitest run {files}",
                path_prefixes=("web/",),
                path_suffixes=(".ts", ".tsx"),
                keywords=("vitest", "typescript"),
                include_in_full_suite=True,
                is_python=False,
            ),
        ),
        domains={
            "ui": DomainRule(
                path_prefixes=("web/components/",),
                keywords=("component", "ui"),
                fallback_cmds=("npm test",),
                manual_verification_prompt=(
                    "UI Domain Check: Launch local preview at http://127.0.0.1:4173 "
                    "and confirm layout responsiveness."
                ),
                priority=10,
            ),
            "database": DomainRule(
                path_prefixes=("db/migrations/",),
                keywords=("migration", "schema"),
                fallback_cmds=("pytest tests/test_schema.py",),
                manual_verification_prompt=(
                    "Schema Domain Check: Run schema validator CLI and inspect migration diff."
                ),
                priority=20,
            ),
        },
        exempt={
            "docs": ExemptRule(
                commands=("git diff --name-only",),
                commit_prefix="docs",
                instruction="- Verify markdown changes.",
                diff_extensions=(".md",),
                require_non_empty_diff=True,
            ),
            "infra": ExemptRule(
                commands=(),
                commit_prefix="chore",
                instruction="- Verify infra config cleanly.",
            ),
            "scripts": ExemptRule(
                commands=(),
                commit_prefix="chore",
                instruction="- Verify script updates cleanly.",
            ),
            "db-seed": ExemptRule(
                commands=("python3 scripts/validate_seed.py",),
                commit_prefix="chore",
                instruction="- Validate seed fixtures cleanly.",
            ),
        },
        supervisor=SupervisorProfile(
            static_analysis_prefixes=("ruff", "eslint", "mypy"),
            default_test_cmd="pytest",
            required_note_fields=("Task:", "Summary:", "Files:", "Rationale:"),
        ),
    )


class TestPrecedingContextAndGuardrails(unittest.TestCase):
    """Verify backward task-plan context discovery and profile-driven guardrail matching."""

    def test_backward_walk_skips_planless_tasks(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            track_plan = _make_synthetic_track(root)
            (track_plan.track_dir / "phase-1-task-2-plan.md").write_text(
                "# Task 2 Plan\n",
                encoding="utf-8",
            )
            # phase-1-task-3-plan.md intentionally missing
            result = get_preceding_context(track_plan, 1, 4, repo_root=root)
            self.assertEqual(
                result,
                "Immediate Preceding Context: "
                "@[conductor/tracks/demo-track_20261117/phase-1-task-2-plan.md] "
                "(earlier completed in Phase 1: Task 1, Task 3)",
            )

    def test_preceding_context_immediate_task_2_and_empty_boundaries(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            track_plan = _make_synthetic_track(root)
            self.assertEqual(get_preceding_context(track_plan, 1, 1, repo_root=root), "")
            self.assertEqual(get_preceding_context(track_plan, 1, 0, repo_root=root), "")
            self.assertEqual(get_preceding_context(track_plan, 1, None, repo_root=root), "")
            self.assertEqual(get_preceding_context(track_plan, 1, 3, repo_root=root), "")

            (track_plan.track_dir / "phase-1-task-1-plan.md").write_text(
                "# Task 1 Plan\n",
                encoding="utf-8",
            )
            self.assertEqual(
                get_preceding_context(track_plan, 1, 2, repo_root=root),
                "Immediate Preceding Context: "
                "@[conductor/tracks/demo-track_20261117/phase-1-task-1-plan.md]",
            )

    def test_guardrail_targets_false_under_default_profile(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            track_plan = _make_synthetic_track(root)
            bp = TaskBlueprint(
                plan_path=track_plan.track_dir / "phase-1-task-1-plan.md",
                target_files=("src/component.tsx",),
            )
            self.assertFalse(
                has_guardrail_targets(
                    track_plan,
                    1,
                    1,
                    task_desc="Edit src/component.tsx",
                    blueprint=bp,
                    planning=PlanningProfile(),
                )
            )

    def test_guardrail_targets_matches_extensions_across_sources(self) -> None:
        planning = PlanningProfile(
            style_guide_guardrail="Follow TS style rules.",
            guardrail_extensions=(".ts", ".tsx"),
        )
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            track_plan = _make_synthetic_track(
                root,
                plan_text=(
                    "# Plan\n\n"
                    "## Phase 1: UI\n"
                    "- [ ] Task: Build button\n"
                    "    - [ ] Update `web/button.tsx`\n"
                ),
            )
            empty_bp = TaskBlueprint(plan_path=track_plan.track_dir / "missing.md")

            self.assertTrue(
                has_guardrail_targets(
                    track_plan,
                    1,
                    1,
                    blueprint=TaskBlueprint(
                        plan_path=empty_bp.plan_path,
                        target_files=("web/app.ts",),
                    ),
                    planning=planning,
                )
            )
            self.assertTrue(
                has_guardrail_targets(
                    track_plan,
                    1,
                    1,
                    blueprint=TaskBlueprint(
                        plan_path=empty_bp.plan_path,
                        referenced_test_files=("web/app.test.tsx",),
                    ),
                    planning=planning,
                )
            )
            self.assertTrue(
                has_guardrail_targets(
                    track_plan,
                    1,
                    1,
                    blueprint=TaskBlueprint(
                        plan_path=empty_bp.plan_path,
                        verification_commands=("npx vitest run web/app.ts",),
                    ),
                    planning=planning,
                )
            )
            self.assertTrue(
                has_guardrail_targets(
                    track_plan,
                    1,
                    1,
                    task_desc="Refactor src/client.ts",
                    blueprint=empty_bp,
                    planning=planning,
                )
            )
            self.assertTrue(
                has_guardrail_targets(
                    track_plan,
                    1,
                    1,
                    subtasks=("Add types to src/types.tsx",),
                    blueprint=empty_bp,
                    planning=planning,
                )
            )
            # Resolves from track_plan TaskInfo when task_desc/subtasks omitted
            self.assertTrue(
                has_guardrail_targets(
                    track_plan,
                    1,
                    1,
                    blueprint=empty_bp,
                    planning=planning,
                )
            )
            # Non-matching extensions return False
            self.assertFalse(
                has_guardrail_targets(
                    track_plan,
                    1,
                    1,
                    task_desc="Update Python module",
                    subtasks=("Edit src/engine.py",),
                    blueprint=TaskBlueprint(
                        plan_path=empty_bp.plan_path,
                        target_files=("src/engine.py",),
                        referenced_test_files=("tests/test_engine.py",),
                        verification_commands=("pytest tests/test_engine.py",),
                    ),
                    planning=planning,
                )
            )

    def test_guardrail_targets_universal_when_extensions_empty(self) -> None:
        planning = PlanningProfile(
            style_guide_guardrail="Universal repo style guardrail.",
            guardrail_extensions=(),
        )
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            track_plan = _make_synthetic_track(root)
            self.assertTrue(
                has_guardrail_targets(
                    track_plan,
                    1,
                    1,
                    task_desc="Edit src/engine.py",
                    blueprint=TaskBlueprint(
                        plan_path=track_plan.track_dir / "missing.md",
                        target_files=("src/engine.py",),
                    ),
                    planning=planning,
                )
            )


class TestBuildPlanPrompt(unittest.TestCase):
    """Verify Tier 1 planning prompt rendering, shell constraints, and RepoProfile injection."""

    def test_standard_task_plan_prompt_and_shell_constraints(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            track_plan = _make_synthetic_track(root)
            (track_plan.track_dir / "phase-1-task-1-plan.md").write_text(
                "# Prior plan\n",
                encoding="utf-8",
            )
            prompt = build_plan_prompt(
                track_plan,
                1,
                2,
                task_desc="Implement widget module",
                repo_root=root,
            )

            self.assertIn("Plan Phase 1 Task 2 only", prompt)
            self.assertIn("for 'Implement widget module'", prompt)
            self.assertIn("@[conductor/tracks/demo-track_20261117]", prompt)
            self.assertIn("@[conductor/tracks/demo-track_20261117/spec.md]", prompt)
            self.assertIn("@[conductor/tracks/demo-track_20261117/plan.md]", prompt)
            self.assertIn(
                "Immediate Preceding Context: @[conductor/tracks/demo-track_20261117/phase-1-task-1-plan.md]",
                prompt,
            )
            self.assertIn("conductor/tracks/demo-track_20261117/phase-1-task-2-plan.md", prompt)
            self.assertIn("- **Path:** `filepath`", prompt)
            self.assertIn("Execution Verification Protocol", prompt)

            # Tier 1 shell-syntax constraints
            self.assertIn("&&", prompt)
            self.assertIn("KEY=VALUE", prompt)
            self.assertIn("cd <repo-subdir>", prompt)
            for forbidden_token in ("'|'", "'>'", "'<'", "';'", "'||'", "'export'", "'$(...)'"):
                self.assertIn(forbidden_token, prompt)
            self.assertIn("backtick", prompt.lower())

            # Required git-note fields
            for note_field in ("Task", "Summary", "Files", "Rationale"):
                self.assertIn(note_field, prompt)

            self.assertIn("Headless --print mode", prompt)
            self.assertIn("ask_question", prompt)
            self.assertNotIn("/conductor:implement", prompt)
            self.assertNotIn("Halt for user approval via modal", prompt)

    def test_zero_hardcoded_finger_lakes_strings_under_default_profile(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            track_plan = _make_synthetic_track(root)
            prompt = build_plan_prompt(
                track_plan,
                1,
                1,
                task_desc="Write failing unit tests for widget (Red phase)",
                profile=RepoProfile(),
                repo_root=root,
            )
            for forbidden in (
                "run-jest-container.sh",
                "run-e2e-container.sh",
                "localhost:3000",
                "supabase",
                "typescript.md",
            ):
                self.assertNotIn(forbidden, prompt)

    def test_custom_profile_suites_and_selective_guardrail(self) -> None:
        profile = _make_custom_profile()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            track_plan = _make_synthetic_track(root)

            py_prompt = build_plan_prompt(
                track_plan,
                1,
                2,
                task_desc="Implement widget in src/widget.py",
                subtasks=("Write src/widget.py",),
                profile=profile,
                repo_root=root,
            )
            self.assertIn("pytest {files}", py_prompt)
            self.assertNotIn("TypeScript Style Guardrails (docs/style-ts.md)", py_prompt)

            ts_prompt = build_plan_prompt(
                track_plan,
                1,
                2,
                task_desc="Implement component in web/button.tsx",
                subtasks=("Write web/button.tsx",),
                profile=profile,
                repo_root=root,
            )
            self.assertIn("TypeScript Style Guardrails (docs/style-ts.md)", ts_prompt)
            self.assertIn("npx vitest run {files}", ts_prompt)

    def test_checkpoint_plan_prompt_uses_profile_and_has_zero_hardcoded_strings(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            track_plan = _make_synthetic_track(root)
            checkpoint_strategy = VerificationStrategy(
                mode=PromptMode.CHECKPOINT,
                commands=("pytest",),
                commit_msg="conductor(checkpoint): Checkpoint end of Phase 1",
                is_checkpoint=True,
                checkpoint_context=PhaseCheckpointContext(
                    baseline_sha="abc1234",
                    end_sha="def5678",
                    changed_files=("src/widget.py",),
                    commands=("pytest",),
                    domain="backend_tooling",
                    clean_phase_name="Core Engine",
                    raw_heading="## Phase 1: Core Engine",
                ),
            )
            default_prompt = build_plan_prompt(
                track_plan,
                1,
                4,
                task_desc="Conductor - User Manual Verification 'Phase 1: Core Engine'",
                strategy=checkpoint_strategy,
                profile=RepoProfile(),
                repo_root=root,
            )
            self.assertIn(
                "Gate & Planning Protocol (Phase Completion Verification & Checkpointing):",
                default_prompt,
            )
            self.assertIn("git diff --name-only", default_prompt)
            self.assertIn("Test Coverage Audit", default_prompt)
            self.assertIn("pytest", default_prompt)
            self.assertIn("conductor(checkpoint): Checkpoint end of Phase 1", default_prompt)
            self.assertIn("[checkpoint: <sha>]", default_prompt)
            self.assertIn("Headless --print mode", default_prompt)
            self.assertNotIn("/conductor:implement", default_prompt)
            self.assertNotIn("localhost:3000", default_prompt)
            self.assertNotIn("run-jest-container.sh", default_prompt)

            custom_prompt = build_plan_prompt(
                track_plan,
                1,
                4,
                task_desc="Conductor - User Manual Verification 'Phase 1: Core Engine'",
                strategy=checkpoint_strategy,
                profile=_make_custom_profile(),
                repo_root=root,
            )
            self.assertIn("UI Domain Check", custom_prompt)
            self.assertIn("Schema Domain Check", custom_prompt)

    def test_single_pass_strategy_reuse_avoids_recomputation(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            track_plan = _make_synthetic_track(root)
            precomputed = VerificationStrategy(
                mode=PromptMode.GREEN,
                commands=("pytest tests/test_widget.py",),
                commit_msg="feat(demo): Implement widget",
            )
            with patch(
                "conductor_tools.strategy.infer_verification_strategy",
                side_effect=AssertionError("infer_verification_strategy should not be called"),
            ):
                prompt = build_plan_prompt(
                    track_plan,
                    1,
                    2,
                    task_desc="Implement widget",
                    strategy=precomputed,
                    repo_root=root,
                )
            self.assertIn("Plan Phase 1 Task 2 only", prompt)


class TestBuildExecPrompt(unittest.TestCase):
    """Verify Tier 2 execution prompt rendering across Red, Green, Exempt, and Checkpoint modes."""

    def test_red_mode_prompt_strips_static_analysis_and_forbids_prod_code(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            track_plan = _make_synthetic_track(root)
            plan_file = track_plan.track_dir / "phase-1-task-1-plan.md"
            plan_file.write_text(
                "# Task 1 Plan\n\n"
                "- **Path:** `tests/test_widget.py`\n\n"
                "## Execution Verification Protocol\n"
                "```bash\n"
                "pytest tests/test_widget.py && ruff check tests/test_widget.py\n"
                "```\n",
                encoding="utf-8",
            )
            prompt = build_exec_prompt(
                track_plan,
                1,
                1,
                profile=_make_custom_profile(),
                repo_root=root,
            )
            self.assertIn("2. Targeted Verification (Red Phase):", prompt)
            self.assertIn("confirm new tests fail with expected assertions", prompt)
            self.assertIn("Do not implement production code in this task.", prompt)
            self.assertIn("pytest tests/test_widget.py", prompt)
            self.assertNotIn("ruff check", prompt)
            self.assertIn('commit changes with message "test(demo):', prompt)

    def test_green_mode_prompt_reuses_strategy_blueprint_and_strips_backticks(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            track_plan = _make_synthetic_track(root)
            plan_file = track_plan.track_dir / "phase-1-task-2-plan.md"
            plan_file.write_text("# Non-empty plan\n", encoding="utf-8")

            precomputed_bp = TaskBlueprint(
                plan_path=plan_file,
                target_files=("web/widget.ts",),
                referenced_test_files=("web/widget.test.ts",),
                verification_commands=("npx vitest run web/widget.test.ts",),
                post_exec_section="Section 4 (Post-Execution)",
                post_exec_commit_msg="feat(demo): implement `Widget` module",
            )
            precomputed_strategy = VerificationStrategy(
                mode=PromptMode.GREEN,
                commands=("npx vitest run web/widget.test.ts", "npm run typecheck"),
                commit_msg="feat(demo): fallback `msg`",
            )

            with patch(
                "conductor_tools.strategy.infer_verification_strategy",
                side_effect=AssertionError("infer_verification_strategy should not be called"),
            ):
                prompt = build_exec_prompt(
                    track_plan,
                    1,
                    2,
                    blueprint=precomputed_bp,
                    strategy=precomputed_strategy,
                    profile=_make_custom_profile(),
                    repo_root=root,
                )

            self.assertIn("2. Targeted Verification (Green Phase):", prompt)
            self.assertIn("npx vitest run web/widget.test.ts", prompt)
            self.assertIn("npm run typecheck", prompt)
            self.assertIn("diagnose within the target seam", prompt)
            self.assertIn("re-verify until green", prompt)
            self.assertIn("Follow Section 4 (Post-Execution) of @[", prompt)
            self.assertIn(
                'commit changes with message "feat(demo): implement Widget module"',
                prompt,
            )
            self.assertNotIn("`Widget`", prompt)
            self.assertIn("TypeScript Style Guardrails (docs/style-ts.md)", prompt)

    def test_exempt_mode_default_and_custom_categories(self) -> None:
        profile = _make_custom_profile()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            track_plan = _make_synthetic_track(
                root,
                plan_text=(
                    "# Plan\n\n"
                    "## Phase 1: Setup\n"
                    "- [ ] Task: Update docs [exempt: docs]\n"
                    "- [ ] Task: Configure CI [exempt: infra]\n"
                    "- [ ] Task: Validate seed data [exempt: db-seed]\n"
                    "- [ ] Task: Unknown [exempt: magic]\n"
                ),
            )

            docs_prompt = build_exec_prompt(
                track_plan,
                1,
                1,
                profile=profile,
                repo_root=root,
            )
            self.assertIn("2. Targeted Verification (Exempt: docs):", docs_prompt)
            self.assertIn("git diff --name-only", docs_prompt)
            self.assertIn('commit changes with message "docs(demo): Update docs"', docs_prompt)
            self.assertNotIn("(Red Phase)", docs_prompt)
            self.assertNotIn("pytest", docs_prompt)
            self.assertNotIn("--allow-empty", docs_prompt)

            infra_prompt = build_exec_prompt(
                track_plan,
                1,
                2,
                profile=profile,
                skip_plan=True,
                repo_root=root,
            )
            self.assertIn("2. Targeted Verification (Exempt: infra):", infra_prompt)
            self.assertIn("git commit --allow-empty", infra_prompt)
            self.assertIn('commit changes with message "chore(demo): Configure CI"', infra_prompt)

            seed_prompt = build_exec_prompt(
                track_plan,
                1,
                3,
                profile=profile,
                skip_plan=True,
                repo_root=root,
            )
            self.assertIn("2. Targeted Verification (Exempt: db-seed):", seed_prompt)
            self.assertIn("python3 scripts/validate_seed.py", seed_prompt)
            self.assertIn("git commit --allow-empty", seed_prompt)

            with self.assertRaises(ConductorError):
                build_exec_prompt(
                    track_plan,
                    1,
                    4,
                    profile=profile,
                    repo_root=root,
                )

    def test_docs_exempt_and_skip_plan_whitespace_plan_file_handling(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            track_plan = _make_synthetic_track(
                root,
                plan_text=(
                    "# Plan\n\n"
                    "## Phase 1: Docs & Scripts\n"
                    "- [ ] Task: Write guide [exempt: docs]\n"
                    "    - [ ] Document installation flags\n"
                    "- [ ] Task: Tidy helper script [exempt: scripts]\n"
                    "    - [ ] Check script permissions\n"
                ),
            )
            task1_plan = track_plan.track_dir / "phase-1-task-1-plan.md"

            # Case 1: missing plan file -> inline blueprint
            missing_prompt = build_exec_prompt(track_plan, 1, 1, repo_root=root)
            self.assertIn("Direct execution mode (Tier 1 task plan skipped)", missing_prompt)
            self.assertIn("@[conductor/tracks/demo-track_20261117/plan.md]", missing_prompt)
            self.assertIn("@[conductor/tracks/demo-track_20261117/spec.md]", missing_prompt)
            self.assertIn("Write guide", missing_prompt)
            self.assertIn("Document installation flags", missing_prompt)
            self.assertNotIn("phase-1-task-1-plan.md", missing_prompt)

            # Case 2: whitespace-only plan file -> treated as empty -> inline blueprint
            task1_plan.write_text("   \n\t\n  ", encoding="utf-8")
            ws_prompt = build_exec_prompt(track_plan, 1, 1, repo_root=root)
            self.assertIn("Direct execution mode (Tier 1 task plan skipped)", ws_prompt)
            self.assertIn("Document installation flags", ws_prompt)
            self.assertNotIn("phase-1-task-1-plan.md", ws_prompt)

            # Case 3: non-whitespace plan file -> references task plan file
            task1_plan.write_text("# Docs Plan\n\n- **Path:** `README.md`\n", encoding="utf-8")
            present_prompt = build_exec_prompt(track_plan, 1, 1, repo_root=root)
            self.assertIn("phase-1-task-1-plan.md", present_prompt)
            self.assertNotIn("Direct execution mode (Tier 1 task plan skipped)", present_prompt)

            # Case 4: skip_plan=True with whitespace-only plan file on non-docs exempt task
            task2_plan = track_plan.track_dir / "phase-1-task-2-plan.md"
            task2_plan.write_text("  \n\t ", encoding="utf-8")
            skip_prompt = build_exec_prompt(
                track_plan,
                1,
                2,
                skip_plan=True,
                repo_root=root,
            )
            self.assertIn("Direct execution mode (Tier 1 task plan skipped)", skip_prompt)
            self.assertIn("Tidy helper script", skip_prompt)
            self.assertIn("Check script permissions", skip_prompt)
            self.assertIn("git commit --allow-empty", skip_prompt)
            self.assertNotIn("phase-1-task-2-plan.md", skip_prompt)

    def test_checkpoint_delegation_and_no_composite_full_tdd_branch(self) -> None:
        self.assertFalse(hasattr(PromptMode, "FULL"))
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            track_plan = _make_synthetic_track(
                root,
                plan_text=(
                    "# Plan\n\n"
                    "## Phase 1: Core\n"
                    "- [ ] Task: Implement and test feature\n"
                    "- [ ] Task: Conductor - User Manual Verification 'Phase 1: Core'\n"
                ),
            )
            impl_prompt = build_exec_prompt(track_plan, 1, 1, repo_root=root)
            self.assertNotIn("Full TDD Cycle", impl_prompt)
            self.assertIn("2. Targeted Verification (Green Phase):", impl_prompt)

            ckpt_strategy = VerificationStrategy(
                mode=PromptMode.CHECKPOINT,
                commands=("pytest",),
                commit_msg="conductor(checkpoint): Checkpoint end of Phase 1",
                is_checkpoint=True,
                checkpoint_context=PhaseCheckpointContext(
                    baseline_sha="1111111",
                    end_sha="2222222",
                    changed_files=("src/a.py",),
                    commands=("pytest",),
                    domain="backend_tooling",
                    clean_phase_name="Core",
                    raw_heading="## Phase 1: Core",
                ),
            )
            ckpt_prompt = build_exec_prompt(
                track_plan,
                1,
                2,
                strategy=ckpt_strategy,
                unattended=True,
                repo_root=root,
            )
            self.assertIn("Execute Phase 1 Checkpoint (Task 2)", ckpt_prompt)
            self.assertIn("Unattended Execution Mode", ckpt_prompt)
            self.assertNotIn("ask_question", ckpt_prompt)


class TestBuildCheckpointPrompt(unittest.TestCase):
    """Verify Checkpoint prompt rendering for attended vs unattended modes and RepoProfile domains."""

    def _checkpoint_strategy(
        self,
        *,
        domain: str = "backend_tooling",
        baseline_sha: str | None = "abc1234",
        changed_files: tuple[str, ...] = ("src/widget.py",),
        has_checkpoint_plan: bool = True,
    ) -> VerificationStrategy:
        return VerificationStrategy(
            mode=PromptMode.CHECKPOINT,
            commands=("pytest tests/test_widget.py",),
            commit_msg="conductor(checkpoint): Checkpoint end of Phase 1",
            is_checkpoint=True,
            checkpoint_context=PhaseCheckpointContext(
                baseline_sha=baseline_sha,
                end_sha="def5678",
                changed_files=changed_files,
                commands=("pytest tests/test_widget.py",),
                domain=domain,
                has_checkpoint_plan=has_checkpoint_plan,
                clean_phase_name="Core Engine",
                raw_heading="## Phase 1: Core Engine",
            ),
        )

    def test_attended_default_vs_unattended_mode(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            track_plan = _make_synthetic_track(root)
            strat = self._checkpoint_strategy()

            attended = build_checkpoint_prompt(
                track_plan,
                1,
                4,
                strategy=strat,
                unattended=False,
                repo_root=root,
            )
            self.assertIn("ask_question", attended)
            self.assertIn("Pause via `ask_question` for explicit user approval", attended)
            self.assertIn(
                "4. Verbatim Phase Closure (Execute ONLY After Explicit Affirmative Approval):",
                attended,
            )
            self.assertIn("User Confirmation: Explicitly approved via interactive modal.", attended)
            self.assertNotIn("Unattended Execution Mode", attended)

            unattended = build_checkpoint_prompt(
                track_plan,
                1,
                4,
                strategy=strat,
                unattended=True,
                repo_root=root,
            )
            self.assertNotIn("ask_question", unattended)
            self.assertNotIn("Pause via `ask_question`", unattended)
            self.assertIn(
                "Automated test suites are authoritative for phase closure in unattended runs.",
                unattended,
            )
            self.assertIn("Unattended Execution Mode", unattended)
            self.assertIn("4. Verbatim Phase Closure (Unattended Mode):", unattended)
            self.assertIn(
                "User Confirmation: Unattended execution mode (deferred manual verification).",
                unattended,
            )

    def test_domain_driven_manual_verification_directive_and_generic_fallback(self) -> None:
        custom_profile = _make_custom_profile()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            track_plan = _make_synthetic_track(root)

            ui_prompt = build_checkpoint_prompt(
                track_plan,
                1,
                4,
                strategy=self._checkpoint_strategy(domain="ui"),
                profile=custom_profile,
                repo_root=root,
            )
            self.assertIn("UI Domain Check: Launch local preview at http://127.0.0.1:4173", ui_prompt)

            db_prompt = build_checkpoint_prompt(
                track_plan,
                1,
                4,
                strategy=self._checkpoint_strategy(domain="database"),
                profile=custom_profile,
                repo_root=root,
            )
            self.assertIn("Schema Domain Check: Run schema validator CLI", db_prompt)

            generic_prompt = build_checkpoint_prompt(
                track_plan,
                1,
                4,
                strategy=self._checkpoint_strategy(domain="ui"),
                profile=RepoProfile(),
                repo_root=root,
            )
            self.assertNotIn("localhost:3000", generic_prompt)
            self.assertNotIn("npm run db:lint", generic_prompt)

    def test_precomputed_context_rendering_ranges_files_and_fast_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            track_plan = _make_synthetic_track(root)

            many_files = tuple(f"src/file_{idx:02d}.py" for idx in range(25))
            prompt_many = build_checkpoint_prompt(
                track_plan,
                1,
                4,
                strategy=self._checkpoint_strategy(
                    baseline_sha="abc1234",
                    changed_files=many_files,
                    has_checkpoint_plan=True,
                ),
                repo_root=root,
            )
            self.assertIn("`abc1234..def5678`", prompt_many)
            self.assertIn("src/file_19.py", prompt_many)
            self.assertNotIn("src/file_20.py", prompt_many)
            self.assertIn(
                "and @[conductor/tracks/demo-track_20261117/phase-1-task-4-plan.md]",
                prompt_many,
            )
            self.assertIn("Warm-Session Fast Path", prompt_many)
            self.assertIn(
                "Do NOT read `conductor/workflow.md`, `product.md`, or `product-guidelines.md`",
                prompt_many,
            )
            self.assertIn("## Phase 1: Core Engine", prompt_many)
            self.assertIn("conductor(plan): Mark phase 'Phase 1: Core Engine' as complete", prompt_many)

            prompt_empty = build_checkpoint_prompt(
                track_plan,
                1,
                4,
                strategy=self._checkpoint_strategy(
                    baseline_sha=None,
                    changed_files=(),
                    has_checkpoint_plan=False,
                ),
                repo_root=root,
            )
            self.assertIn("git status --short", prompt_empty)
            self.assertNotIn("abc1234..def5678", prompt_empty)
            self.assertNotIn("phase-1-task-4-plan.md", prompt_empty)


class TestBuildRecoveryAndReviewPrompts(unittest.TestCase):
    """Verify Recovery and Gate 2 Review prompt builders."""

    def test_build_recovery_prompt_with_and_without_failure_context(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            track_plan = _make_synthetic_track(root)
            base_prompt = build_recovery_prompt(track_plan, 1, 2, repo_root=root)

            self.assertIn("@[conductor/tracks/demo-track_20261117]", base_prompt)
            self.assertIn("Phase 1", base_prompt)
            self.assertIn("Task 2", base_prompt)
            self.assertIn("Headless --print mode", base_prompt)
            self.assertIn("ask_question", base_prompt)
            self.assertIn("git status", base_prompt)
            self.assertIn("git diff", base_prompt)
            self.assertIn("Task, Summary, Files, Rationale", base_prompt)
            self.assertIn("plan.md", base_prompt)
            self.assertNotIn("/conductor:implement", base_prompt)
            self.assertNotIn("Post-Turn Verification / Audit Failure", base_prompt)

            repair_prompt = build_recovery_prompt(
                track_plan,
                1,
                2,
                repo_root=root,
                failure_context="AssertionError: expected exit 0, got 1 in test_widget.py",
            )
            self.assertIn("## Post-Turn Verification / Audit Failure (Bounded Repair)", repair_prompt)
            self.assertIn(
                "AssertionError: expected exit 0, got 1 in test_widget.py",
                repair_prompt,
            )

    def test_build_review_prompt_contract(self) -> None:
        report = Path("conductor/tracks/demo-track_20261117/phase-1-review.md")
        prompt = build_review_prompt("demo-track_20261117", 1, report)

        self.assertIn("/conductor:review demo-track_20261117", prompt)
        self.assertIn("UNATTENDED / NON-INTERACTIVE REVIEW OVERRIDES:", prompt)
        self.assertIn("Phase 1", prompt)
        self.assertIn("ask_question", prompt)
        self.assertIn("300", prompt)
        self.assertIn("Iterative Review Mode", prompt)
        self.assertIn(str(report), prompt)
        for heading in ("### [Critical]", "### [High]", "### [Medium]", "### [Low]"):
            self.assertIn(heading, prompt)
        self.assertIn("Do NOT auto-apply fixes", prompt)
        self.assertIn("Section 3.1", prompt)

        with tempfile.TemporaryDirectory() as tmp:
            track_plan = _make_synthetic_track(Path(tmp))
            from_plan = build_review_prompt(track_plan, 2, report)
            self.assertIn("/conductor:review demo-track_20261117", from_plan)
            self.assertIn("Phase 2", from_plan)


class TestGenerateTurnPrompt(unittest.TestCase):
    """Verify in-process generate_turn_prompt() dispatch, mode normalization, and errors."""

    def test_zero_subprocess_and_zero_importlib_across_all_modes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            track_plan = _make_synthetic_track(root)
            (track_plan.track_dir / "phase-1-task-2-plan.md").write_text(
                "# Task 2 Plan\n\n- **Path:** `src/widget.py`\n",
                encoding="utf-8",
            )
            ckpt_strategy = VerificationStrategy(
                mode=PromptMode.CHECKPOINT,
                commands=("pytest",),
                commit_msg="conductor(checkpoint): Checkpoint end of Phase 1",
                is_checkpoint=True,
                checkpoint_context=PhaseCheckpointContext(
                    baseline_sha="aaa1111",
                    end_sha="bbb2222",
                    changed_files=("src/widget.py",),
                    commands=("pytest",),
                    domain="backend_tooling",
                    clean_phase_name="Core Engine",
                    raw_heading="## Phase 1: Core Engine",
                ),
            )
            real_import = importlib.import_module
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
                _ = real_import  # silence unused lint if checked
                p_plan = generate_turn_prompt(
                    track_plan, 1, 1, PromptMode.PLAN, cwd=root
                )
                p_exec = generate_turn_prompt(
                    track_plan, 1, 3, "exec", cwd=root
                )
                p_red = generate_turn_prompt(
                    track_plan, 1, 1, PromptMode.RED, cwd=root
                )
                p_green = generate_turn_prompt(
                    track_plan, 1, 2, PromptMode.GREEN, cwd=root
                )
                p_exempt = generate_turn_prompt(
                    track_plan, 1, 3, PromptMode.EXEMPT, cwd=root
                )
                p_ckpt = generate_turn_prompt(
                    track_plan,
                    1,
                    None,
                    PromptMode.CHECKPOINT,
                    unattended=True,
                    strategy=ckpt_strategy,
                    cwd=root,
                )
                p_rec = generate_turn_prompt(
                    track_plan,
                    1,
                    2,
                    PromptMode.RECOVERY,
                    failure_context="exit 1",
                    cwd=root,
                )
                p_rev = generate_turn_prompt(
                    track_plan, 1, None, PromptMode.REVIEW, cwd=root
                )

            self.assertIn("Plan Phase 1 Task 1 only", p_plan)
            self.assertIn("2. Targeted Verification (Exempt: docs):", p_exempt)
            self.assertEqual(p_exec, p_exempt)
            self.assertIn("2. Targeted Verification (Red Phase):", p_red)
            self.assertIn("2. Targeted Verification (Green Phase):", p_green)
            self.assertIn("Execute Phase 1 Checkpoint (Task 4)", p_ckpt)
            self.assertIn("Unattended Execution Mode", p_ckpt)
            self.assertIn("exit 1", p_rec)
            self.assertIn("/conductor:review demo-track_20261117", p_rev)

    def test_synthetic_repo_without_profile_toml_and_default_review_report_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = _init_git_repo(Path(tmp))
            track_plan = _make_synthetic_track(root)
            _commit_file(
                root,
                "src/widget.py",
                "def widget() -> int:\n    return 1\n",
                "feat(demo): add widget",
            )
            self.assertFalse((root / "conductor" / "profile.toml").exists())

            plan_out = generate_turn_prompt(
                "demo-track_20261117", 1, 1, PromptMode.PLAN, cwd=root
            )
            self.assertIn("Plan Phase 1 Task 1 only", plan_out)

            exec_red_out = generate_turn_prompt(
                "demo-track_20261117", 1, 1, "exec", cwd=root
            )
            self.assertIn("2. Targeted Verification (Red Phase):", exec_red_out)

            exec_green_out = generate_turn_prompt(
                "demo-track_20261117", 1, 2, "exec", skip_plan=True, cwd=root
            )
            self.assertIn("2. Targeted Verification (Green Phase):", exec_green_out)

            ckpt_out = generate_turn_prompt(
                "demo-track_20261117",
                1,
                None,
                PromptMode.CHECKPOINT,
                unattended=True,
                cwd=root,
            )
            self.assertIn("Execute Phase 1 Checkpoint (Task 4)", ckpt_out)
            self.assertIn("Unattended Execution Mode", ckpt_out)

            review_out = generate_turn_prompt(
                "demo-track_20261117", 1, None, PromptMode.REVIEW, cwd=root
            )
            expected_report = str(track_plan.track_dir / "phase-1-review.md")
            self.assertIn(expected_report, review_out)

    def test_mode_normalization_profile_loading_and_validation_errors(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            track_plan = _make_synthetic_track(root)
            (root / "conductor" / "profile.toml").write_text(
                '[supervisor]\ndefault_test_cmd = "cargo test"\n',
                encoding="utf-8",
            )

            dash_plan = generate_turn_prompt(
                "demo-track_20261117", 1, 1, "--plan", cwd=root
            )
            self.assertIn("Plan Phase 1 Task 1 only", dash_plan)

            dash_exec = generate_turn_prompt(
                "demo-track_20261117", 1, 2, "--exec", skip_plan=True, cwd=root
            )
            self.assertIn("cargo test", dash_exec)

            override_profile = _make_custom_profile()
            override_exec = generate_turn_prompt(
                "demo-track_20261117",
                1,
                2,
                "exec",
                skip_plan=True,
                profile=override_profile,
                cwd=root,
            )
            self.assertIn("pytest", override_exec)
            self.assertNotIn("cargo test", override_exec)

            for bad_mode in ("full", "--full", "unknown-mode"):
                with self.subTest(bad_mode=bad_mode):
                    with self.assertRaises(ConductorError):
                        generate_turn_prompt(track_plan, 1, 1, bad_mode, cwd=root)

            # Missing phase
            with self.assertRaises(ConductorError):
                generate_turn_prompt(track_plan, 99, 1, PromptMode.PLAN, cwd=root)

            # Missing task
            with self.assertRaises(ConductorError):
                generate_turn_prompt(track_plan, 1, 99, PromptMode.PLAN, cwd=root)

            # Missing checkpoint task in a phase without one
            no_ckpt_track = _make_synthetic_track(
                root,
                track_name="no-ckpt_20261117",
                plan_text="# Plan\n\n## Phase 1: Only Tasks\n- [ ] Task: Do work\n",
            )
            with self.assertRaises(ConductorError):
                generate_turn_prompt(
                    no_ckpt_track, 1, None, PromptMode.CHECKPOINT, cwd=root
                )


if __name__ == "__main__":
    unittest.main()
