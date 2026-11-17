"""Unit tests for `conductor_tools.strategy` verification engine and shell command parser."""

from __future__ import annotations

from dataclasses import FrozenInstanceError
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
    PathRules,
    RepoProfile,
    SafetyProfile,
    SuiteConfig,
    SupervisorProfile,
    TypeCheckProfile,
)
from conductor_tools.strategy import (
    BLOCKED_ENV_VARS,
    ENV_ASSIGNMENT_RE,
    ParsedCommand,
    classify_phase_domain,
    classify_task_mode,
    collect_phase_checkpoint_context,
    filter_idempotent_verification_cmd,
    has_leading_env_assignment,
    infer_verification_strategy,
    is_cd_segment,
    is_executable_subtask_cmd,
    is_static_analysis_cmd,
    is_type_check_cmd,
    parse_verification_commands,
    split_unquoted_and_chains,
    strip_leading_env_assignments,
    strip_static_analysis_segments,
    strip_trailing_cd_segments,
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
    """Initialize an isolated git repo with local author metadata."""
    root.mkdir(parents=True, exist_ok=True)
    _git(root, "init")
    _git(root, "checkout", "-B", branch)
    _git(root, "config", "user.name", "Test User")
    _git(root, "config", "user.email", "test@example.com")
    return root


def _commit_file(root: Path, rel_path: str, content: str, message: str) -> str:
    """Create or update a file and commit it, returning its 7-char short SHA."""
    target = root / rel_path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    _git(root, "add", rel_path)
    _git(root, "commit", "-m", message)
    return _git(root, "rev-parse", "--short=7", "HEAD")


def _make_profile() -> RepoProfile:
    """Build a synthetic multi-suite RepoProfile without Finger Lakes references."""
    return RepoProfile(
        type_check=TypeCheckProfile(
            cmd="npm run type-check",
            extensions=(".ts", ".tsx"),
            check_tokens=("type-check", "check-types"),
        ),
        suites=(
            SuiteConfig(
                name="integration",
                full_cmd="npm run test:integration",
                targeted_cmd="npm run test:integration -- {files}",
                path_suffixes=(".integration.test.ts", ".integration.test.tsx"),
                keywords=("integration test", "integration"),
                include_in_full_suite=False,
            ),
            SuiteConfig(
                name="unit",
                full_cmd="npm test",
                targeted_cmd="npm test -- {files}",
                path_suffixes=(".test.ts", ".test.tsx"),
                exclude_suffixes=(".integration.test.ts", ".integration.test.tsx"),
                keywords=("unit test", ".test."),
                include_in_full_suite=True,
            ),
            SuiteConfig(
                name="e2e",
                full_cmd="npx playwright test",
                targeted_cmd="npx playwright test {files}",
                path_prefixes=("e2e/",),
                path_suffixes=(".spec.ts",),
                keywords=("e2e", "playwright"),
                include_in_full_suite=False,
            ),
            SuiteConfig(
                name="edge",
                full_cmd="deno test",
                targeted_cmd="deno test",
                path_prefixes=("edge/",),
                keywords=("edge function", "deno"),
                include_in_full_suite=False,
            ),
            SuiteConfig(
                name="py",
                full_cmd="pytest",
                targeted_cmd="pytest {files}",
                path_prefixes=("py_pkg/", "tests/"),
                path_suffixes=(".py",),
                keywords=("python", "pytest"),
                include_in_full_suite=False,
                is_python=True,
            ),
        ),
        domains={
            "ui": DomainRule(
                priority=30,
                path_prefixes=("web/", "e2e/"),
                keywords=("web/", "e2e/", "modal", "ui "),
                fallback_cmds=("npm test", "npm run type-check"),
            ),
            "database": DomainRule(
                priority=20,
                path_prefixes=("db/",),
                exact_paths=("src/db_types.ts",),
                path_substrings=("rpc-client",),
                keywords=("migration", "schema", "rls"),
                fallback_cmds=("npm run db:check",),
            ),
            "backend_tooling": DomainRule(
                priority=10,
                path_prefixes=("src/", "tools/"),
                keywords=("tools/", "backend"),
                fallback_cmds=("pytest",),
            ),
        },
        exempt={
            "ui": ExemptRule(
                commands=("npm run build",),
                commit_prefix="style",
                instruction="- Verify UI build cleanly with npm run build (UI exempt task).",
            ),
            "infra": ExemptRule(
                commands=("npm run lint",),
                commit_prefix="chore",
                instruction="- Verify infra lint checks pass (Infra exempt task).",
            ),
            "docs": ExemptRule(
                commands=("git diff --name-only",),
                commit_prefix="docs",
                instruction="- Verify docs diff with git diff --name-only (Docs exempt task).",
                diff_extensions=(".md",),
                require_non_empty_diff=True,
            ),
        },
        supervisor=SupervisorProfile(
            static_analysis_prefixes=(
                "eslint",
                "tsc",
                "ruff",
                "mypy",
                "npm run lint",
                "npm run type-check",
                "npm run build",
            ),
            default_test_cmd="pytest",
        ),
        safety=SafetyProfile(
            command_prefixes=("npm ", "npx ", "pytest ", "python3", "deno ", "cargo "),
            allowed_verification_tokens=(
                "pytest",
                "python3 -m unittest",
                "python3 -c",
                "npm test",
                "npm run test",
                "npm run lint",
                "npm run type-check",
                "npm run build",
                "npx playwright",
                "deno test",
                "db:check",
            ),
            mutating_cmd_patterns=(r"\b(db:reset|db:seed|db:populate)\b",),
            mutating_git_prefixes=("git add", "git commit", "git notes", "git push", "git reset", "rm "),
        ),
    )


def _make_task(
    task_num: int,
    description: str,
    *,
    status: str = "pending",
    is_checkpoint: bool = False,
    commit_sha: str | None = None,
    exempt: str | None = None,
    subtasks: tuple[str, ...] = (),
) -> TaskInfo:
    """Create a synthetic frozen TaskInfo."""
    status_char = {"complete": "x", "in_progress": "~", "skipped": "-", "pending": " "}[status]
    return TaskInfo(
        task_num=task_num,
        description=description,
        status=status,
        status_char=status_char,
        is_checkpoint=is_checkpoint,
        commit_sha=commit_sha,
        exempt=exempt,
        subtasks=subtasks,
        raw_line=f"- [{status_char}] Task: {description}",
    )


def _make_track_plan(
    root: Path,
    phases: dict[int, PhaseInfo],
    *,
    track_name: str = "sample-feature_20261117",
) -> TrackPlan:
    """Create a synthetic TrackPlan rooted at `root`."""
    track_dir = root / "conductor" / "tracks" / track_name
    track_dir.mkdir(parents=True, exist_ok=True)
    plan_path = track_dir / "plan.md"
    if not plan_path.exists():
        plan_path.write_text("# Plan\n", encoding="utf-8")
    return TrackPlan(
        track_name=track_name,
        track_dir=track_dir,
        plan_path=plan_path,
        phases=phases,
    )


class TestShellCommandSplittingAndParsing(unittest.TestCase):
    """Verify quote-aware splitting, env extraction, repo-bounded cd, and shell op rejection."""

    def test_parsed_command_is_frozen_with_slots(self) -> None:
        cmd = ParsedCommand(argv=("pytest", "-q"), env_overrides={"FOO": "bar"}, cwd=Path("/tmp"))
        self.assertFalse(hasattr(cmd, "__dict__"))
        self.assertEqual(cmd.argv, ("pytest", "-q"))
        with self.assertRaises(FrozenInstanceError):
            cmd.cwd = Path("/var")  # type: ignore[misc]

    def test_env_and_cd_helpers(self) -> None:
        self.assertIsNotNone(ENV_ASSIGNMENT_RE.match("PYTHONPATH=src"))
        self.assertIn("LD_PRELOAD", BLOCKED_ENV_VARS)
        self.assertIn("PYTHONINSPECT", BLOCKED_ENV_VARS)

        self.assertTrue(has_leading_env_assignment("FOO=1 BAR=2 pytest -q"))
        self.assertFalse(has_leading_env_assignment("pytest -q"))
        self.assertEqual(strip_leading_env_assignments("FOO=1 BAR=2 pytest -q"), "pytest -q")

        self.assertTrue(is_cd_segment("cd sub"))
        self.assertTrue(is_cd_segment("FOO=1 cd sub"))
        self.assertFalse(is_cd_segment("pytest -k cd"))
        self.assertEqual(strip_trailing_cd_segments(["pytest", "cd sub", "cd other"]), ["pytest"])

    def test_split_unquoted_and_chains_preserves_quotes_escapes_and_comments(self) -> None:
        quoted = 'python3.12 -c "x = \'a && b\'; print(x)" && pytest -k "foo#bar" # trailing comment'
        self.assertEqual(
            split_unquoted_and_chains(quoted),
            [
                'python3.12 -c "x = \'a && b\'; print(x)"',
                'pytest -k "foo#bar"',
            ],
        )

        escaped = r"echo a\ \&\&\ b && python3 -c 'print(\"#keep\")'"
        self.assertEqual(
            split_unquoted_and_chains(escaped),
            [r"echo a\ \&\&\ b", r'''python3 -c 'print(\"#keep\")\''''.replace("\\'", "'")],
        )

        # Single quotes protect subshell syntax from rejection
        self.assertEqual(
            split_unquoted_and_chains("python3 -c 'print(\"$(ok) `safe`\")'"),
            ["python3 -c 'print(\"$(ok) `safe`\")'"],
        )

    def test_split_unquoted_and_chains_rejects_shell_ops_and_empty_segments(self) -> None:
        invalid_cmds = [
            "pytest\nrm -rf /",
            "pytest\rwhoami",
            "pytest; whoami",
            "pytest | cat",
            "pytest || echo fail",
            "pytest > out.log",
            "pytest < in.txt",
            "pytest &",
            "echo `whoami`",
            "echo $(whoami)",
            'echo "$(whoami)"',
            'echo "`whoami`"',
            "&& pytest",
            "pytest && && echo ok",
            "pytest &&",
        ]
        for cmd in invalid_cmds:
            with self.subTest(cmd=cmd):
                with self.assertRaises(ValueError):
                    split_unquoted_and_chains(cmd, reject_shell_ops=True)
                # Pre-filter mode tolerates shell ops without raising
                self.assertIsInstance(split_unquoted_and_chains(cmd, reject_shell_ops=False), list)

    def test_parse_verification_commands_extracts_env_and_blocks_dangerous_vars(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            work_dir = Path(tmpdir).resolve()
            parsed = parse_verification_commands(
                'PYTHONPATH=src NODE_ENV=test pytest -k "a && b"',
                work_dir,
            )
            self.assertEqual(len(parsed), 1)
            self.assertEqual(parsed[0].argv, ("pytest", "-k", "a && b"))
            self.assertEqual(parsed[0].env_overrides, {"PYTHONPATH": "src", "NODE_ENV": "test"})
            self.assertEqual(parsed[0].cwd, work_dir)

            blocked_cases = [*(f"{var}=/tmp/x pytest" for var in sorted(BLOCKED_ENV_VARS)), "LD_CUSTOM=1 pytest", "DYLD_CUSTOM=1 pytest"]
            for bad in blocked_cases:
                with self.subTest(bad=bad):
                    with self.assertRaises(ValueError):
                        parse_verification_commands(bad, work_dir)

    def test_parse_verification_commands_rejects_builtins_and_malformed_syntax(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            work_dir = Path(tmpdir)
            (work_dir / "sub").mkdir()
            malformed = [
                "",
                "   ",
                "# only a comment",
                [],
                "export FOO=1",
                "BAR=2 export FOO=1",
                "FOO=1 BAR=2",
                'pytest "unbalanced',
                "cd sub",
                "cd sub && cd ..",
            ]
            for bad in malformed:
                with self.subTest(bad=bad):
                    with self.assertRaises(ValueError):
                        parse_verification_commands(bad, work_dir)  # type: ignore[arg-type]

    def test_parse_verification_commands_repo_bounded_cd_semantics(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            work_dir = Path(tmpdir).resolve()
            sub_a = work_dir / "pkg_a"
            sub_b = sub_a / "nested"
            sub_b.mkdir(parents=True)

            parsed = parse_verification_commands(
                "cd pkg_a && pytest && cd nested && ruff check .",
                work_dir,
            )
            self.assertEqual(
                parsed,
                [
                    ParsedCommand(argv=("pytest",), env_overrides={}, cwd=sub_a),
                    ParsedCommand(argv=("ruff", "check", "."), env_overrides={}, cwd=sub_b),
                ],
            )

            # Separate call does not leak cd state from previous call
            fresh = parse_verification_commands("pytest", work_dir)
            self.assertEqual(fresh[0].cwd, work_dir)

            # Invalid cd forms
            invalid_cds = [
                "FOO=1 cd pkg_a && pytest",
                "cd && pytest",
                "cd pkg_a extra && pytest",
                "cd - && pytest",
                "cd ~ && pytest",
                "cd .. && pytest",
                "cd pkg_a/../../outside && pytest",
            ]
            for bad in invalid_cds:
                with self.subTest(bad=bad):
                    with self.assertRaises(ValueError):
                        parse_verification_commands(bad, work_dir)

            # Nonexistent directory rejected when check_cd_exists=True, allowed when False
            with self.assertRaises(ValueError):
                parse_verification_commands("cd planned_dir && pytest", work_dir, check_cd_exists=True)
            planned = parse_verification_commands("cd planned_dir && pytest", work_dir, check_cd_exists=False)
            self.assertEqual(planned[0].cwd, (work_dir / "planned_dir").resolve())

    def test_parse_verification_commands_direct_sequence_input(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            work_dir = Path(tmpdir)
            self.assertEqual(
                parse_verification_commands(["pytest", "-q"], work_dir),
                [ParsedCommand(argv=("pytest", "-q"), env_overrides={}, cwd=work_dir)],
            )


class TestCommandSafetyAndStaticAnalysisFiltering(unittest.TestCase):
    """Verify subtask prefix checks, idempotency filtering, and static-analysis predicates."""

    def test_is_executable_subtask_cmd_handles_cd_env_and_blocks_bad_forms(self) -> None:
        safety = _make_profile().safety
        self.assertTrue(is_executable_subtask_cmd("PYTHONPATH=src pytest -q", safety))
        self.assertTrue(is_executable_subtask_cmd("cd app && NODE_ENV=test npm test", safety))

        self.assertFalse(is_executable_subtask_cmd("FOO=1 cd app && pytest -q", safety))
        self.assertFalse(is_executable_subtask_cmd("pytest -q && FOO=1 cd app", safety))
        self.assertFalse(is_executable_subtask_cmd("cd app", safety))
        self.assertFalse(is_executable_subtask_cmd("Implement user authentication service", safety))
        self.assertTrue(is_executable_subtask_cmd("cargo test", SafetyProfile(command_prefixes=("cargo ",))))

    def test_filter_idempotent_verification_cmd_safety_and_cd_trimming(self) -> None:
        safety = _make_profile().safety
        self.assertEqual(
            filter_idempotent_verification_cmd(
                'cd app && PYTHONPATH=src python3 -c "x = \'a && b\'" && ! pytest -q # ok',
                safety,
            ),
            'cd app && PYTHONPATH=src python3 -c "x = \'a && b\'" && pytest -q',
        )
        # Drops mutating commands even when env-prefixed, and strips dangling trailing cd
        self.assertEqual(
            filter_idempotent_verification_cmd(
                "pytest -q && cd sub && NODE_ENV=test npm run db:reset && PYTHONPATH=src git add .",
                safety,
            ),
            "pytest -q",
        )
        self.assertIsNone(filter_idempotent_verification_cmd("FOO=1 cd sub && pytest -q", safety))
        self.assertIsNone(filter_idempotent_verification_cmd("git commit -m 'msg' && rm -rf dist", safety))
        self.assertIsNone(filter_idempotent_verification_cmd("echo 'not an allowed gate'", safety))

    def test_static_analysis_and_type_check_predicates(self) -> None:
        supervisor = _make_profile().supervisor
        type_check = _make_profile().type_check

        self.assertTrue(is_static_analysis_cmd("NODE_ENV=test npm run lint", supervisor))
        self.assertTrue(is_static_analysis_cmd("RUFF_CACHE_DIR=/tmp ruff check .", supervisor))
        self.assertFalse(is_static_analysis_cmd("pytest -k lint", supervisor))
        self.assertFalse(is_static_analysis_cmd("eslint-custom --help", supervisor))

        self.assertEqual(
            strip_static_analysis_segments(
                "NODE_ENV=test npm run lint && PYTHONPATH=src pytest -q",
                supervisor,
            ),
            "PYTHONPATH=src pytest -q",
        )
        self.assertIsNone(strip_static_analysis_segments("cd app && npm run lint", supervisor))
        self.assertEqual(
            strip_static_analysis_segments("pytest -q && cd app && ruff check .", supervisor),
            "pytest -q",
        )

        self.assertTrue(is_type_check_cmd("CI=1 npm run type-check -- --noEmit", type_check))
        self.assertFalse(is_type_check_cmd('pytest -k "type-check"', type_check))
        self.assertFalse(is_type_check_cmd("npm run type-check", TypeCheckProfile(cmd=None)))


class TestTaskAndDomainClassification(unittest.TestCase):
    """Verify unified task mode classification, exempt validation, overrides, and domain priority."""

    def test_classify_task_mode_red_green_and_checkpoint(self) -> None:
        profile = _make_profile()
        red_cases = (
            "test(auth): add failing login test",
            "Write failing unit tests for parser",
            "Add tests (Red phase)",
            "Verify cache eviction (Red)",
            "Add failing unit test for scoring",
            "Write failing test for endpoint",
            "Add failing integration test for sync",
        )
        for desc in red_cases:
            with self.subTest(desc=desc):
                self.assertEqual(classify_task_mode(desc, profile=profile), PromptMode.RED)

        self.assertEqual(
            classify_task_mode("Conductor - User Manual Verification 'Phase 1'", profile=profile),
            PromptMode.CHECKPOINT,
        )
        self.assertEqual(
            classify_task_mode("Final Verification", is_checkpoint=True, profile=profile),
            PromptMode.CHECKPOINT,
        )
        self.assertEqual(
            classify_task_mode("Implement auth service (Green phase)", profile=profile),
            PromptMode.GREEN,
        )

    def test_classify_task_mode_exempt_and_fail_fast_on_undeclared(self) -> None:
        custom_profile = _make_profile()
        self.assertEqual(
            classify_task_mode("Update README [exempt: DOCS]", profile=custom_profile),
            PromptMode.EXEMPT,
        )
        self.assertEqual(
            classify_task_mode("Polish button CSS", exempt="UI", profile=custom_profile),
            PromptMode.EXEMPT,
        )

        # Undeclared exempt raises ConductorError immediately
        with self.assertRaises(ConductorError):
            classify_task_mode("Add types [exempt: unknown]", profile=custom_profile)
        with self.assertRaises(ConductorError):
            classify_task_mode("Some task", exempt="unknown", profile=custom_profile)

        # Generic RepoProfile() only declares docs/infra/scripts
        generic = RepoProfile()
        for undeclared in ("ui", "types"):
            with self.subTest(undeclared=undeclared):
                with self.assertRaises(ConductorError):
                    classify_task_mode(f"Task [exempt: {undeclared}]", profile=generic)

    def test_classify_task_mode_overrides(self) -> None:
        profile = _make_profile()
        self.assertEqual(
            classify_task_mode("Update docs [exempt: docs]", mode_override=PromptMode.RED, profile=profile),
            PromptMode.RED,
        )
        self.assertEqual(
            classify_task_mode("Update docs [exempt: docs]", mode_override=PromptMode.GREEN, profile=profile),
            PromptMode.GREEN,
        )
        with self.assertRaises(ConductorError):
            classify_task_mode(
                "Conductor - User Manual Verification 'Phase 1'",
                mode_override=PromptMode.RED,
                profile=profile,
            )
        with self.assertRaises(ConductorError):
            classify_task_mode(
                "Phase 2 Checkpoint",
                is_checkpoint=True,
                mode_override=PromptMode.GREEN,
                profile=profile,
            )

    def test_classify_phase_domain_priority_keywords_and_fallback(self) -> None:
        domains = _make_profile().domains
        # Priority 30 (ui) beats priority 20 (database) when both match changed_files
        self.assertEqual(
            classify_phase_domain(["db/001.sql", "web/App.tsx"], (), domains),
            "ui",
        )
        # Exact path and substring matching
        self.assertEqual(classify_phase_domain(["src/db_types.ts"], (), domains), "database")
        self.assertEqual(classify_phase_domain(["src/rpc-client.ts"], (), domains), "database")

        # Empty changed_files falls back to keywords across tasks + subtasks
        db_task = _make_task(1, "Apply migration", subtasks=("Configure RLS policies",))
        self.assertEqual(classify_phase_domain([], [db_task], domains), "database")

        # Unmatched or empty domains falls back to backend_tooling
        self.assertEqual(classify_phase_domain(["README.txt"], [], domains), "backend_tooling")
        self.assertEqual(classify_phase_domain(["web/App.tsx"], [], {}), "backend_tooling")


class TestVerificationStrategyInference(unittest.TestCase):
    """Verify single-pass VerificationStrategy inference driven by RepoProfile."""

    def test_ordered_all_matching_suites_with_shlex_quote_and_exclude_suffixes(self) -> None:
        profile = _make_profile()
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            task = _make_task(1, "Implement multi-layer feature")
            plan = _make_track_plan(root, {1: PhaseInfo(1, "Core", tasks=(task,))})
            blueprint = TaskBlueprint(
                plan_path=plan.track_dir / "phase-1-task-1-plan.md",
                target_files=("src/service.ts", "edge/handler.ts"),
                referenced_test_files=(
                    "tests/my file.test.ts",
                    "tests/sync.integration.test.ts",
                    "e2e/flow.spec.ts",
                    "py_pkg/test_helper.py",
                ),
            )

            strategy = infer_verification_strategy(
                plan,
                1,
                1,
                task=task,
                task_desc=task.description,
                blueprint=blueprint,
                profile=profile,
                cwd=root,
            )

            self.assertIsInstance(strategy, VerificationStrategy)
            self.assertEqual(strategy.mode, PromptMode.GREEN)
            self.assertFalse(strategy.is_red)
            self.assertFalse(strategy.is_python_only)
            self.assertEqual(
                strategy.commands,
                (
                    "npm run test:integration -- tests/sync.integration.test.ts",
                    "npm test -- 'tests/my file.test.ts'",
                    "npx playwright test e2e/flow.spec.ts",
                    "deno test",
                    "pytest py_pkg/test_helper.py",
                    "npm run type-check",
                ),
            )

    def test_type_check_extension_gating_and_deduplication(self) -> None:
        profile = _make_profile()
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            task = _make_task(1, "Implement python helper")
            plan = _make_track_plan(root, {1: PhaseInfo(1, "Python", tasks=(task,))})

            # Non-empty Python-only targets skip TS type-check
            py_bp = TaskBlueprint(
                plan_path=plan.track_dir / "phase-1-task-1-plan.md",
                target_files=("py_pkg/mod.py", "pyproject.toml"),
                referenced_test_files=("tests/test_mod.py",),
            )
            py_strategy = infer_verification_strategy(
                plan, 1, 1, task=task, task_desc=task.description, blueprint=py_bp, profile=profile, cwd=root
            )
            self.assertTrue(py_strategy.is_python_only)
            self.assertEqual(py_strategy.commands, ("pytest py_pkg/mod.py tests/test_mod.py",))

            # Empty targets still fall back to appending type-check in Green mode
            empty_bp = TaskBlueprint(plan_path=plan.track_dir / "phase-1-task-1-plan.md")
            empty_strategy = infer_verification_strategy(
                plan, 1, 1, task=task, task_desc=task.description, blueprint=empty_bp, profile=profile, cwd=root
            )
            self.assertIn("npm run type-check", empty_strategy.commands)

            # Deduplicates type_check.cmd when an existing command contains check_tokens
            dedup_bp = TaskBlueprint(
                plan_path=plan.track_dir / "phase-1-task-1-plan.md",
                target_files=("src/app.ts",),
                verification_commands=("npm run check-types",),
            )
            dedup_strategy = infer_verification_strategy(
                plan, 1, 1, task=task, task_desc=task.description, blueprint=dedup_bp, profile=profile, cwd=root
            )
            self.assertEqual(dedup_strategy.commands, ("npm run check-types",))

            # Detects embedded type-check segments in && chains even when check_tokens=()
            custom_tc_profile = RepoProfile(
                type_check=TypeCheckProfile(cmd="mypy src", extensions=(".py",), check_tokens=()),
                suites=profile.suites,
                safety=profile.safety,
                supervisor=profile.supervisor,
            )
            for chained_cmd in ("cd sub && mypy src", "pytest -q && MYPYPATH=src mypy src --strict"):
                with self.subTest(chained_cmd=chained_cmd):
                    chained_bp = TaskBlueprint(
                        plan_path=plan.track_dir / "phase-1-task-1-plan.md",
                        target_files=("py_pkg/mod.py",),
                        verification_commands=(chained_cmd,),
                    )
                    chained_strategy = infer_verification_strategy(
                        plan,
                        1,
                        1,
                        task=task,
                        task_desc=task.description,
                        blueprint=chained_bp,
                        profile=custom_tc_profile,
                        cwd=root,
                    )
                    self.assertEqual(chained_strategy.commands, (chained_cmd,))

    def test_full_suite_keywords_routing_and_commit_verb(self) -> None:
        profile = _make_profile()
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            task = _make_task(1, "Execute full test suite verification")
            plan = _make_track_plan(root, {1: PhaseInfo(1, "Verify", tasks=(task,))})
            bp = TaskBlueprint(plan_path=plan.track_dir / "phase-1-task-1-plan.md")

            strategy = infer_verification_strategy(
                plan, 1, 1, task=task, task_desc=task.description, blueprint=bp, profile=profile, cwd=root
            )
            self.assertEqual(strategy.mode, PromptMode.GREEN)
            self.assertEqual(strategy.commands, ("npm test", "npm run type-check"))
            self.assertTrue(strategy.commit_msg.startswith("test(sample): "))

    def test_red_mode_strips_static_analysis_and_subtasks(self) -> None:
        profile = _make_profile()
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            task = _make_task(
                1,
                "test(auth): add failing login test",
                subtasks=(
                    "Run `NODE_ENV=test npm run lint` before commit",
                    "Run `cd app && npm run lint` in app",
                    "Run `pytest tests/test_extra.py`",
                    "Run `pytest tests/test_trailing.py && npm run lint`",
                    "Run `NODE_ENV=test npm run lint && pytest tests/test_leading.py`",
                ),
            )
            plan = _make_track_plan(root, {1: PhaseInfo(1, "Auth", tasks=(task,))})
            bp = TaskBlueprint(
                plan_path=plan.track_dir / "phase-1-task-1-plan.md",
                target_files=("py_pkg/auth.py",),
                referenced_test_files=("tests/test_auth.py",),
                verification_commands=(
                    "NODE_ENV=test npm run lint && pytest tests/test_auth.py",
                    "npm run type-check",
                ),
            )

            strategy = infer_verification_strategy(
                plan,
                1,
                1,
                task=task,
                task_desc=task.description,
                subtasks=task.subtasks,
                blueprint=bp,
                profile=profile,
                cwd=root,
            )
            self.assertEqual(strategy.mode, PromptMode.RED)
            self.assertTrue(strategy.is_red)
            self.assertEqual(
                strategy.commands,
                (
                    "pytest tests/test_auth.py",
                    "pytest tests/test_extra.py",
                    "pytest tests/test_trailing.py",
                    "pytest tests/test_leading.py",
                ),
            )
            self.assertTrue(strategy.commit_msg.startswith("test(sample): "))
            self.assertIn("Red phase", strategy.instruction)

    def test_exempt_mode_and_out_of_bounds_task_num(self) -> None:
        profile = _make_profile()
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            task1 = _make_task(1, "Implement core")
            task2 = _make_task(2, "Polish `Button` layout [exempt: ui]", exempt="ui")
            plan = _make_track_plan(root, {1: PhaseInfo(1, "UI", tasks=(task1, task2))})

            exempt_strategy = infer_verification_strategy(
                plan,
                1,
                2,
                task=task2,
                task_desc=task2.description,
                profile=profile,
                cwd=root,
            )
            self.assertEqual(exempt_strategy.mode, PromptMode.EXEMPT)
            self.assertFalse(exempt_strategy.is_red)
            self.assertFalse(exempt_strategy.is_checkpoint)
            self.assertEqual(exempt_strategy.exempt, "ui")
            self.assertEqual(exempt_strategy.commands, ("npm run build",))
            self.assertEqual(exempt_strategy.commit_msg, "style(sample): Polish Button layout")

            with self.assertRaises(ConductorError):
                infer_verification_strategy(
                    plan,
                    1,
                    1,
                    task_desc="Unknown [exempt: mystery]",
                    profile=profile,
                    cwd=root,
                )

            # Out-of-bounds task_num (0 or 999) must not read task[-1]'s exempt tag
            for bad_num in (0, 999):
                with self.subTest(task_num=bad_num):
                    oob = infer_verification_strategy(
                        plan,
                        1,
                        bad_num,
                        task_desc="Implement fallback",
                        blueprint=TaskBlueprint(plan_path=plan.track_dir / "missing.md"),
                        profile=profile,
                        cwd=root,
                    )
                    self.assertEqual(oob.mode, PromptMode.GREEN)
                    self.assertIsNone(oob.exempt)

    def test_mode_override_on_exempt_task_strips_exempt_and_sha_from_commit_msg(self) -> None:
        profile = _make_profile()
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            task = _make_task(1, "Polish `Button` layout [exempt: ui] [commit: a1b2c3d]")
            plan = _make_track_plan(root, {1: PhaseInfo(1, "UI", tasks=(task,))})
            bp = TaskBlueprint(
                plan_path=plan.track_dir / "phase-1-task-1-plan.md",
                target_files=("web/Button.tsx",),
            )

            green_strategy = infer_verification_strategy(
                plan,
                1,
                1,
                task=task,
                task_desc="Polish `Button` layout [exempt: ui] [commit: a1b2c3d]",
                blueprint=bp,
                mode_override=PromptMode.GREEN,
                profile=profile,
                cwd=root,
            )
            self.assertEqual(green_strategy.mode, PromptMode.GREEN)
            self.assertEqual(green_strategy.commit_msg, "feat(sample): Polish Button layout")

            red_fallback_strategy = infer_verification_strategy(
                plan,
                1,
                1,
                task_desc="[exempt: docs]",
                blueprint=bp,
                mode_override=PromptMode.RED,
                profile=profile,
                cwd=root,
            )
            self.assertEqual(red_fallback_strategy.mode, PromptMode.RED)
            self.assertEqual(
                red_fallback_strategy.commit_msg,
                "test(sample): Add failing tests for Phase 1 Task 1",
            )

    def test_single_pass_reuses_blueprint_and_track_plan_without_disk_or_git(self) -> None:
        profile = _make_profile()
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            task = _make_task(1, "Implement feature")
            plan = _make_track_plan(root, {1: PhaseInfo(1, "Core", tasks=(task,))})
            bp_path = plan.track_dir / "phase-1-task-1-plan.md"
            bp_path.write_text("UNREADABLE SENTINEL", encoding="utf-8")
            blueprint = TaskBlueprint(
                plan_path=bp_path,
                target_files=("py_pkg/core.py",),
                referenced_test_files=("tests/test_core.py",),
                verification_commands=("pytest tests/test_core.py",),
            )

            with (
                patch("pathlib.Path.read_text", side_effect=AssertionError("Unexpected disk read")),
                patch("subprocess.run", side_effect=AssertionError("Unexpected git subprocess")),
            ):
                strategy = infer_verification_strategy(
                    plan,
                    1,
                    1,
                    task=task,
                    task_desc=task.description,
                    blueprint=blueprint,
                    profile=profile,
                    cwd=root,
                )
            self.assertEqual(strategy.commands, ("pytest tests/test_core.py",))


class TestPhaseCheckpointContextCollection(unittest.TestCase):
    """Verify checkpoint context aggregation, safety filtering, fallbacks, and git diff gating."""

    def test_excludes_referenced_test_files_from_changed_files_and_aggregates_siblings(self) -> None:
        profile = _make_profile()
        with tempfile.TemporaryDirectory() as tmpdir:
            root = _init_git_repo(Path(tmpdir))
            _commit_file(root, "README.md", "init\n", "chore: init")

            t1 = _make_task(
                1,
                "Implement service",
                status="complete",
                subtasks=("Verify via `cd tools && PYTHONPATH=. pytest -q` and `git add .`",),
            )
            t2 = _make_task(2, "Conductor - User Manual Verification 'Phase 1'", is_checkpoint=True)
            plan = _make_track_plan(root, {1: PhaseInfo(1, "Service", tasks=(t1, t2))})

            # Sibling plan defines target_files, referenced_test_files, and verification commands
            (plan.track_dir / "phase-1-task-1-plan.md").write_text(
                (
                    "# Plan\n"
                    "- **Path:** `src/service.py`\n"
                    "- **Path:** `conductor/ignored.md`\n"
                    "## Execution Verification Protocol\n"
                    "```bash\n"
                    "pytest tests/test_service.py && npm run db:reset\n"
                    "```\n"
                ),
                encoding="utf-8",
            )
            (plan.track_dir / "phase-1-task-10-plan.md").write_text(
                "- **Path:** `src/extra.py`\n",
                encoding="utf-8",
            )

            ctx = collect_phase_checkpoint_context(plan, 1, 2, profile=profile, cwd=root)
            self.assertIsInstance(ctx, PhaseCheckpointContext)
            self.assertIn("src/service.py", ctx.changed_files)
            self.assertIn("src/extra.py", ctx.changed_files)
            self.assertNotIn("tests/test_service.py", ctx.changed_files)
            self.assertNotIn("conductor/ignored.md", ctx.changed_files)
            self.assertEqual(
                ctx.sibling_plans,
                (
                    f"conductor/tracks/{plan.track_name}/phase-1-task-1-plan.md",
                    f"conductor/tracks/{plan.track_name}/phase-1-task-10-plan.md",
                ),
            )
            self.assertEqual(
                ctx.commands,
                ("pytest tests/test_service.py", "cd tools && PYTHONPATH=. pytest -q"),
            )

            # Checkpoint plan commands take priority when present
            (plan.track_dir / "phase-1-task-2-plan.md").write_text(
                "## Execution Verification Protocol\n```bash\nnpm run build\n```\n",
                encoding="utf-8",
            )
            cp_ctx = collect_phase_checkpoint_context(plan, 1, 2, profile=profile, cwd=root)
            self.assertTrue(cp_ctx.has_checkpoint_plan)
            self.assertEqual(cp_ctx.commands, ("npm run build",))

    def test_diff_derived_docs_exempt_and_domain_fallbacks(self) -> None:
        profile = _make_profile()
        with tempfile.TemporaryDirectory() as tmpdir:
            root = _init_git_repo(Path(tmpdir))
            base_sha = _commit_file(root, "README.md", "v1\n", "chore: init")
            end_sha = _commit_file(root, "web/Panel.tsx", "export const x = 1;\n", "feat: add panel")

            # 1. Diff-derived commands from changed_files
            t1 = _make_task(1, "Add panel", status="complete", commit_sha=end_sha)
            t_cp = _make_task(2, "Phase 1 Checkpoint", is_checkpoint=True)
            plan = _make_track_plan(root, {1: PhaseInfo(1, "UI", tasks=(t1, t_cp))})

            with patch("conductor_tools.git_scope.resolve_phase_baseline_sha", return_value=base_sha):
                diff_ctx = collect_phase_checkpoint_context(plan, 1, 2, profile=profile, cwd=root)
            self.assertEqual(diff_ctx.changed_files, ("web/Panel.tsx",))
            self.assertEqual(diff_ctx.domain, "ui")
            self.assertEqual(diff_ctx.commands, ("npm run type-check",))

            # 2. Empty changed_files + all docs-exempt tasks -> docs exempt commands
            docs_t1 = _make_task(1, "Write guide [exempt: docs]", status="pending", exempt="docs")
            docs_plan = _make_track_plan(
                root,
                {1: PhaseInfo(1, "Docs", tasks=(docs_t1, t_cp))},
                track_name="docs-only_20261117",
            )
            docs_ctx = collect_phase_checkpoint_context(docs_plan, 1, 2, profile=profile, cwd=root)
            self.assertEqual(docs_ctx.commands, ("git diff --name-only",))

            # 3. Domain fallback when no commands and not docs-exempt
            db_t1 = _make_task(1, "Configure schema migration", status="pending")
            db_plan = _make_track_plan(
                root,
                {1: PhaseInfo(1, "DB", tasks=(db_t1, t_cp))},
                track_name="db-only_20261117",
            )
            db_ctx = collect_phase_checkpoint_context(db_plan, 1, 2, profile=profile, cwd=root)
            self.assertEqual(db_ctx.domain, "database")
            self.assertEqual(db_ctx.commands, ("npm run db:check",))

            # Empty domains falls back to supervisor.default_test_cmd
            generic_profile = RepoProfile(supervisor=SupervisorProfile(default_test_cmd="cargo test"))
            generic_ctx = collect_phase_checkpoint_context(
                db_plan, 1, 2, profile=generic_profile, cwd=root
            )
            self.assertEqual(generic_ctx.commands, ("cargo test",))

    def test_historical_vs_unstarted_git_diff_gating_and_strategy_checkpoint(self) -> None:
        profile = _make_profile()
        with tempfile.TemporaryDirectory() as tmpdir:
            root = _init_git_repo(Path(tmpdir))
            base_sha = _commit_file(root, "README.md", "v1\n", "chore: base")
            p1_sha = _commit_file(root, "db/001.sql", "SELECT 1;\n", "feat: db")
            _commit_file(root, "web/Later.tsx", "export const y = 2;\n", "feat: later phase")

            # Unstarted phase does not invoke get_phase_changed_files
            unstarted_t1 = _make_task(1, "Pending task", status="pending")
            unstarted_cp = _make_task(2, "Phase 1 Checkpoint", is_checkpoint=True)
            unstarted_plan = _make_track_plan(
                root,
                {1: PhaseInfo(1, "Future", tasks=(unstarted_t1, unstarted_cp))},
                track_name="unstarted_20261117",
            )
            with (
                patch("conductor_tools.git_scope.resolve_phase_baseline_sha", return_value=base_sha),
                patch(
                    "conductor_tools.git_scope.get_phase_changed_files",
                    side_effect=AssertionError("Should not diff unstarted phase"),
                ),
            ):
                unstarted_ctx = collect_phase_checkpoint_context(
                    unstarted_plan, 1, 2, profile=profile, cwd=root
                )
            self.assertEqual(unstarted_ctx.changed_files, ())

            # Historical phase diffs strictly baseline..end_sha without leaking later commits
            done_t1 = _make_task(1, "Done DB task", status="complete", commit_sha=p1_sha)
            done_cp = _make_task(2, "Phase 1 Checkpoint", status="complete", is_checkpoint=True, commit_sha=p1_sha)
            done_plan = _make_track_plan(
                root,
                {1: PhaseInfo(1, "DB", checkpoint_sha=p1_sha, tasks=(done_t1, done_cp), is_complete=True)},
                track_name="done_20261117",
            )
            with patch("conductor_tools.git_scope.resolve_phase_baseline_sha", return_value=base_sha):
                strategy = infer_verification_strategy(
                    done_plan,
                    1,
                    2,
                    task=done_cp,
                    task_desc=done_cp.description,
                    profile=profile,
                    cwd=root,
                )
            self.assertEqual(strategy.mode, PromptMode.CHECKPOINT)
            self.assertTrue(strategy.is_checkpoint)
            self.assertEqual(strategy.commit_msg, "conductor(checkpoint): Checkpoint end of Phase 1")
            assert strategy.checkpoint_context is not None
            self.assertEqual(strategy.checkpoint_context.changed_files, ("db/001.sql",))
            self.assertEqual(strategy.checkpoint_context.domain, "database")

    def test_checkpoint_context_cwd_none_infers_repo_root_for_sibling_plans(self) -> None:
        profile = _make_profile()
        with tempfile.TemporaryDirectory() as tmpdir:
            root = _init_git_repo(Path(tmpdir))
            _commit_file(root, "README.md", "v1\n", "chore: init")

            # 1. Standard conductor/ tracks layout with cwd omitted
            t1 = _make_task(1, "Implement module", status="pending")
            t_cp = _make_task(2, "Phase 1 Checkpoint", is_checkpoint=True)
            plan = _make_track_plan(root, {1: PhaseInfo(1, "Core", tasks=(t1, t_cp))})
            (plan.track_dir / "phase-1-task-1-plan.md").write_text(
                "- **Path:** `src/mod.py`\n",
                encoding="utf-8",
            )

            ctx = collect_phase_checkpoint_context(plan, 1, 2, profile=profile)
            self.assertEqual(
                ctx.sibling_plans,
                (f"conductor/tracks/{plan.track_name}/phase-1-task-1-plan.md",),
            )

            # 2. Custom tracks dir inside a .git repo (no conductor/ marker)
            git_only_root = _init_git_repo(Path(tmpdir) / "git_only")
            _commit_file(git_only_root, "README.md", "v1\n", "chore: init")
            custom_track_dir = git_only_root / "custom_tracks" / "demo_20261117"
            custom_track_dir.mkdir(parents=True)
            custom_plan_path = custom_track_dir / "plan.md"
            custom_plan_path.write_text("# Plan\n", encoding="utf-8")
            (custom_track_dir / "phase-1-task-1-plan.md").write_text(
                "- **Path:** `src/custom.py`\n",
                encoding="utf-8",
            )
            custom_plan = TrackPlan(
                track_name="demo_20261117",
                track_dir=custom_track_dir,
                plan_path=custom_plan_path,
                phases={1: PhaseInfo(1, "Core", tasks=(t1, t_cp))},
            )
            custom_ctx = collect_phase_checkpoint_context(custom_plan, 1, 2, profile=profile)
            self.assertEqual(
                custom_ctx.sibling_plans,
                ("custom_tracks/demo_20261117/phase-1-task-1-plan.md",),
            )


if __name__ == "__main__":
    unittest.main()
