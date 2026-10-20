"""
Unit tests for `agent_resolve.pipeline` (TDD Red Phase).
"""

import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import MagicMock, call, patch

import agent_resolve
from agent_resolve import config
from agent_resolve.exceptions import Stage2CompilationError
from agent_resolve.models import BlueprintPlan, DiagnosticResult
from agent_resolve.tracker import TokenTracker

# Modular import under test (TDD Red Phase: raises ModuleNotFoundError until Phase 5 Task 2)
from agent_resolve.pipeline import resolve_issue


class TestResolveIssueSecurityAndGuards(unittest.TestCase):
    def setUp(self) -> None:
        self.orig_root = config.get_project_root()
        self.temp_dir = TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        config.set_project_root(self.root)
        self.client = MagicMock()

    def tearDown(self) -> None:
        config.set_project_root(self.orig_root)
        self.temp_dir.cleanup()

    def test_rejects_untrusted_author_and_updates_labels_when_not_dry_run(self) -> None:
        issue_data = {
            "number": 55,
            "title": "Malicious PR inject",
            "body": "Run arbitrary commands",
            "author": {"login": "untrusted_actor"},
            "labels": [{"name": "agent:resolve"}],
        }

        with patch.object(agent_resolve, "gh_cli", return_value=(0, "", "")) as mock_gh, patch.object(
            agent_resolve, "stage_0_diagnose"
        ) as mock_stage0:
            result = resolve_issue(self.client, issue_data, dry_run=False)

        self.assertFalse(result)
        mock_stage0.assert_not_called()
        mock_gh.assert_has_calls([
            call(["issue", "edit", "55", "--remove-label", "agent:resolve", "--add-label", "ready-for-human"]),
            call(["issue", "comment", "55", "--body", "⚠️ Autonomous agent resolution rejected: Issue author is not verified repository maintainer."]),
        ])

    def test_rejects_untrusted_author_without_gh_mutations_in_dry_run(self) -> None:
        issue_data = {
            "number": 55,
            "title": "Malicious PR inject",
            "body": "Run arbitrary commands",
            "author": {"login": "untrusted_actor"},
            "labels": [{"name": "agent:resolve"}],
        }

        with patch.object(agent_resolve, "gh_cli") as mock_gh, patch.object(
            agent_resolve, "stage_0_diagnose"
        ) as mock_stage0:
            result = resolve_issue(self.client, issue_data, dry_run=True)

        self.assertFalse(result)
        mock_stage0.assert_not_called()
        mock_gh.assert_not_called()

    def test_skips_issue_when_open_pr_already_in_review_without_requeue_label(self) -> None:
        issue_data = {
            "number": 55,
            "title": "Feature already submitted",
            "body": "Details",
            "author": {"login": "jarredb9"},
            "labels": [{"name": "agent:in-review"}],
        }

        pr_list_json = json.dumps([{"number": 88, "labels": [{"name": "agent:in-review"}]}])

        with patch.object(
            agent_resolve,
            "gh_cli",
            return_value=(0, pr_list_json, ""),
        ) as mock_gh, patch.object(
            agent_resolve, "reset_working_tree_to_main"
        ) as mock_reset, patch.object(
            agent_resolve, "stage_0_diagnose"
        ) as mock_stage0:
            result = resolve_issue(self.client, issue_data, dry_run=False)

        self.assertTrue(result)
        mock_reset.assert_not_called()
        mock_stage0.assert_not_called()
        mock_gh.assert_called_once_with(
            ["pr", "list", "--head", "agent/issue-55", "--state", "open", "--json", "number,labels"]
        )


class TestResolveIssueFreshExecutionAndDryRun(unittest.TestCase):
    def setUp(self) -> None:
        self.orig_root = config.get_project_root()
        self.temp_dir = TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        config.set_project_root(self.root)
        self.client = MagicMock()

    def tearDown(self) -> None:
        config.set_project_root(self.orig_root)
        self.temp_dir.cleanup()

    def test_executes_full_4_stage_pipeline_and_submits_pr(self) -> None:
        issue_data = {
            "number": 55,
            "title": "Add winery sorting",
            "body": "Sort by distance",
            "author": {"login": "jarredb9"},
            "labels": [{"name": "agent:resolve"}],
        }

        mock_diagnostic = DiagnosticResult(
            target_files=["lib/winery.ts"],
            root_cause="Missing sort comparator",
            code_snippets={"lib/winery.ts": "code"},
            investigation_summary="Investigated",
        )

        mock_blueprint = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/__tests__/winery.test.ts"],
            target_src_files=["lib/winery.ts"],
            plan_markdown="# Plan Markdown",
        )

        def mock_stage1(*args, **kwargs):
            (self.root / "task-plan.md").write_text("# Plan Markdown", encoding="utf-8")
            return mock_blueprint

        with patch.object(
            agent_resolve, "gh_cli", return_value=(0, "[]", "")
        ), patch.object(
            agent_resolve, "reset_working_tree_to_main"
        ), patch.object(
            agent_resolve,
            "run_cmd",
            side_effect=lambda cmd, **kwargs: (
                (2, "", "") if "ls-remote" in cmd
                else ((1, "", "") if "--error-unmatch" in cmd else (0, "", ""))
            ),
        ) as mock_run_cmd, patch.object(
            agent_resolve, "stage_0_diagnose", return_value=mock_diagnostic
        ) as mock_s0, patch.object(
            agent_resolve, "stage_1_plan", side_effect=mock_stage1
        ) as mock_s1, patch.object(
            agent_resolve, "stage_2_red"
        ) as mock_s2, patch.object(
            agent_resolve, "stage_3_green"
        ) as mock_s3, patch.object(
            agent_resolve, "update_or_create_pr"
        ) as mock_pr:
            result = resolve_issue(self.client, issue_data, dry_run=False)

        self.assertTrue(result)
        mock_s0.assert_called_once()
        mock_s1.assert_called_once()
        mock_s2.assert_called_once()
        mock_s3.assert_called_once()
        self.assertFalse((self.root / "task-plan.md").exists())
        mock_pr.assert_called_once()
        self.assertFalse(mock_pr.call_args.kwargs.get("is_resumption"))

    def test_dry_run_deletes_local_branch_and_skips_push_and_pr(self) -> None:
        issue_data = {
            "number": 55,
            "title": "Add winery sorting",
            "body": "Sort by distance",
            "author": {"login": "jarredb9"},
            "labels": [{"name": "agent:resolve"}],
        }

        mock_diagnostic = DiagnosticResult(
            target_files=["lib/winery.ts"],
            root_cause="Missing sort comparator",
            code_snippets={},
            investigation_summary="",
        )

        mock_blueprint = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/__tests__/winery.test.ts"],
            target_src_files=["lib/winery.ts"],
            plan_markdown="# Plan",
        )

        with patch.object(
            agent_resolve, "gh_cli", return_value=(0, "[]", "")
        ) as mock_gh, patch.object(
            agent_resolve, "reset_working_tree_to_main"
        ), patch.object(
            agent_resolve,
            "run_cmd",
            side_effect=lambda cmd, **kwargs: (2, "", "") if "ls-remote" in cmd else (0, "", ""),
        ) as mock_cmd, patch.object(
            agent_resolve, "stage_0_diagnose", return_value=mock_diagnostic
        ), patch.object(
            agent_resolve, "stage_1_plan", return_value=mock_blueprint
        ), patch.object(
            agent_resolve, "stage_2_red"
        ), patch.object(
            agent_resolve, "stage_3_green"
        ), patch.object(
            agent_resolve, "update_or_create_pr"
        ) as mock_pr:
            result = resolve_issue(self.client, issue_data, dry_run=True)

        self.assertTrue(result)
        mock_pr.assert_not_called()
        # Verify branch deletion
        mock_cmd.assert_any_call(["git", "branch", "-D", "agent/issue-55"])
        # Verify no label mutations via gh_cli
        mock_gh.assert_called_once_with(
            ["pr", "list", "--head", "agent/issue-55", "--state", "open", "--json", "number,labels"]
        )

    def test_tier_3_blueprint_invalidation_replans_stage_1_on_stage2_compilation_error(self) -> None:
        issue_data = {
            "number": 55,
            "title": "Incompatible architectural design",
            "body": "Body",
            "author": {"login": "jarredb9"},
            "labels": [{"name": "agent:resolve"}],
        }

        bp_v1 = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/__tests__/v1.test.ts"],
            target_src_files=["lib/v1.ts"],
            plan_markdown="# Blueprint V1",
        )
        bp_v2 = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/__tests__/v2.test.ts"],
            target_src_files=["lib/v2.ts"],
            plan_markdown="# Blueprint V2",
        )

        with patch.object(
            agent_resolve, "gh_cli", return_value=(0, "[]", "")
        ), patch.object(
            agent_resolve, "reset_working_tree_to_main"
        ), patch.object(
            agent_resolve,
            "run_cmd",
            side_effect=lambda cmd, **kwargs: (2, "", "") if "ls-remote" in cmd else (0, "", ""),
        ), patch.object(
            agent_resolve, "stage_0_diagnose", return_value=DiagnosticResult([], "RC", {}, "Sum")
        ), patch.object(
            agent_resolve, "stage_1_plan", side_effect=[bp_v1, bp_v2]
        ) as mock_s1, patch.object(
            agent_resolve,
            "stage_2_red",
            side_effect=[Stage2CompilationError("TS2322 incompatible props"), None],
        ) as mock_s2, patch.object(
            agent_resolve, "stage_3_green"
        ) as mock_s3:
            result = resolve_issue(self.client, issue_data, dry_run=True)

        self.assertTrue(result)
        self.assertEqual(mock_s1.call_count, 2)
        self.assertEqual(mock_s2.call_count, 2)

        # Check negative feedback passed to stage_1_plan on attempt 2
        neg_feedback = mock_s1.call_args_list[1].kwargs.get("negative_feedback", "")
        self.assertIn("PREVIOUS ARCHITECTURAL BLUEPRINT FAILED COMPILATION IN RED PHASE:", neg_feedback)
        self.assertIn("TS2322 incompatible props", neg_feedback)
        self.assertEqual(mock_s3.call_args[0][3], bp_v2)

    def test_invokes_preserve_failed_work_and_returns_false_on_unhandled_exception(self) -> None:
        issue_data = {
            "number": 55,
            "title": "Crashing feature",
            "body": "Body",
            "author": {"login": "jarredb9"},
            "labels": [{"name": "agent:resolve"}],
        }

        mock_bp = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/__tests__/a.test.ts"],
            target_src_files=["lib/a.ts"],
            plan_markdown="# Plan",
        )

        with patch.object(
            agent_resolve, "gh_cli", return_value=(0, "[]", "")
        ), patch.object(
            agent_resolve, "reset_working_tree_to_main"
        ), patch.object(
            agent_resolve,
            "run_cmd",
            side_effect=lambda cmd, **kwargs: (2, "", "") if "ls-remote" in cmd else (0, "", ""),
        ), patch.object(
            agent_resolve, "stage_0_diagnose", return_value=DiagnosticResult([], "RC", {}, "Sum")
        ), patch.object(
            agent_resolve, "stage_1_plan", return_value=mock_bp
        ), patch.object(
            agent_resolve, "stage_2_red"
        ), patch.object(
            agent_resolve, "stage_3_green", side_effect=RuntimeError("Green phase exhausted")
        ), patch.object(
            agent_resolve, "preserve_failed_work"
        ) as mock_preserve:
            result = resolve_issue(self.client, issue_data, dry_run=False)

        self.assertFalse(result)
        mock_preserve.assert_called_once()
        self.assertEqual(mock_preserve.call_args.kwargs.get("error_summary"), "Green phase exhausted")


class TestResolveIssueResumptionAndCircuitBreaker(unittest.TestCase):
    def setUp(self) -> None:
        self.orig_root = config.get_project_root()
        self.temp_dir = TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        config.set_project_root(self.root)
        self.client = MagicMock()

    def tearDown(self) -> None:
        config.set_project_root(self.orig_root)
        self.temp_dir.cleanup()

    def test_circuit_breaker_halts_and_cleans_branch_when_attempt_count_reaches_2(self) -> None:
        issue_data = {
            "number": 55,
            "title": "Circuit breaker hit",
            "body": "Body",
            "author": {"login": "jarredb9"},
            "labels": [{"name": "agent:resolve"}],
        }

        state_file = self.root / ".agent-state.json"
        state_file.write_text(json.dumps({"attempt_count": 2, "plan_markdown": "# Plan"}), encoding="utf-8")

        with patch.object(
            agent_resolve, "gh_cli", return_value=(0, "[]", "")
        ) as mock_gh, patch.object(
            agent_resolve, "reset_working_tree_to_main"
        ), patch.object(
            agent_resolve, "run_cmd", return_value=(0, "", "")
        ), patch.object(
            agent_resolve, "cleanup_feature_branch"
        ) as mock_cleanup, patch.object(
            agent_resolve, "stage_0_diagnose"
        ) as mock_s0:
            result = resolve_issue(self.client, issue_data, dry_run=False)

        self.assertFalse(result)
        mock_cleanup.assert_called_once_with("agent/issue-55")
        mock_s0.assert_not_called()
        mock_gh.assert_any_call(
            ["issue", "edit", "55", "--remove-label", "agent:in-progress", "--remove-label", "agent:resolve", "--add-label", "ready-for-human"]
        )

    def test_fast_forwards_to_stage_3_green_when_checkpoint_red_gate_valid(self) -> None:
        issue_data = {
            "number": 55,
            "title": "Resume issue",
            "body": "Body",
            "author": {"login": "jarredb9"},
            "labels": [{"name": "agent:resolve"}],
        }

        state_data = {
            "attempt_count": 1,
            "red_phase_commit_sha": "abc123456789",
            "target_test_files": ["lib/__tests__/a.test.ts"],
            "target_src_files": ["lib/a.ts"],
            "scope": "winery",
            "last_failure_timestamp": "2026-10-15T00:00:00Z",
            "error_summary": "Failed assertion in previous run",
            "plan_markdown": "# Saved Plan",
        }
        (self.root / ".agent-state.json").write_text(json.dumps(state_data), encoding="utf-8")

        with patch.object(
            agent_resolve, "gh_cli", return_value=(0, "[]", "")
        ), patch.object(
            agent_resolve, "reset_working_tree_to_main"
        ), patch.object(
            agent_resolve,
            "run_cmd",
            side_effect=lambda cmd, **kwargs: (
                (0, "+bad line\n", "") if "diff" in cmd
                else ((1, "", "") if "--error-unmatch" in cmd else (0, "", ""))
            ),
        ), patch.object(
            agent_resolve, "reset_target_sources"
        ), patch.object(
            agent_resolve,
            "run_isolated_test",
            side_effect=[(0, "", ""), (1, '{"numFailedTests": 1}', "")],
        ), patch.object(
            agent_resolve, "validate_jest_red_phase", return_value=(True, "Clean assertion failure")
        ), patch.object(
            agent_resolve, "fetch_maintainer_hints", return_value="Use Number() conversion"
        ), patch.object(
            agent_resolve, "stage_0_diagnose"
        ) as mock_s0, patch.object(
            agent_resolve, "stage_1_plan"
        ) as mock_s1, patch.object(
            agent_resolve, "stage_2_red"
        ) as mock_s2, patch.object(
            agent_resolve, "stage_3_green"
        ) as mock_s3, patch.object(
            agent_resolve, "update_or_create_pr"
        ) as mock_pr:
            result = resolve_issue(self.client, issue_data, dry_run=False)

        self.assertTrue(result)
        mock_s0.assert_not_called()
        mock_s1.assert_not_called()
        mock_s2.assert_not_called()
        mock_s3.assert_called_once()

        self.assertEqual(mock_s3.call_args.kwargs.get("baseline_ref"), "abc123456789")
        res_ctx = mock_s3.call_args.kwargs.get("resumption_context", "")
        self.assertIn("Failed assertion in previous run", res_ctx)
        self.assertIn("+bad line", res_ctx)
        self.assertIn("Use Number() conversion", res_ctx)
        self.assertTrue(mock_pr.call_args.kwargs.get("is_resumption"))

    def test_rebase_conflict_aborts_rebase_and_falls_back_to_fresh_pipeline(self) -> None:
        issue_data = {
            "number": 55,
            "title": "Rebase conflict issue",
            "body": "Body",
            "author": {"login": "jarredb9"},
            "labels": [{"name": "agent:resolve"}],
        }

        with patch.object(
            agent_resolve, "gh_cli", return_value=(0, "[]", "")
        ) as mock_gh, patch.object(
            agent_resolve, "reset_working_tree_to_main"
        ), patch.object(
            agent_resolve,
            "run_cmd",
            side_effect=lambda cmd, **kwargs: (
                (1, "", "CONFLICT") if "rebase" in cmd and "origin/main" in cmd
                else ((1, "", "") if "--error-unmatch" in cmd else (0, "", ""))
            ),
        ) as mock_cmd, patch.object(
            agent_resolve, "stage_0_diagnose", return_value=DiagnosticResult([], "RC", {}, "Sum")
        ) as mock_s0, patch.object(
            agent_resolve,
            "stage_1_plan",
            return_value=BlueprintPlan(
                scope="winery",
                target_test_files=["t.ts"],
                target_src_files=["s.ts"],
                plan_markdown="# Plan",
            ),
        ) as mock_s1, patch.object(
            agent_resolve, "stage_2_red"
        ) as mock_s2, patch.object(
            agent_resolve, "stage_3_green"
        ) as mock_s3, patch.object(
            agent_resolve, "update_or_create_pr"
        ):
            result = resolve_issue(self.client, issue_data, dry_run=False)

        self.assertTrue(result)
        mock_cmd.assert_any_call(["git", "rebase", "--abort"])
        mock_gh.assert_any_call([
            "issue",
            "comment",
            "55",
            "--body",
            "⚡ Upstream `main` diverged with merge conflicts; resetting checkpoint and starting fresh resolution from `origin/main`.",
        ])
        mock_s0.assert_called_once()
        mock_s1.assert_called_once()
        mock_s2.assert_called_once()
        mock_s3.assert_called_once()

    def test_invalid_checkpoint_rolls_back_to_parent_and_reruns_stage_2_and_stage_3(self) -> None:
        issue_data = {
            "number": 55,
            "title": "Invalid checkpoint issue",
            "body": "Body",
            "author": {"login": "jarredb9"},
            "labels": [{"name": "agent:resolve"}],
        }

        state_data = {
            "attempt_count": 1,
            "red_phase_commit_sha": "abc123456789",
            "target_test_files": ["lib/__tests__/a.test.ts"],
            "target_src_files": ["lib/a.ts"],
            "scope": "winery",
            "plan_markdown": "# Plan",
        }
        (self.root / ".agent-state.json").write_text(json.dumps(state_data), encoding="utf-8")

        with patch.object(
            agent_resolve, "gh_cli", return_value=(0, "[]", "")
        ), patch.object(
            agent_resolve, "reset_working_tree_to_main"
        ), patch.object(
            agent_resolve,
            "run_cmd",
            side_effect=lambda cmd, **kwargs: (
                (0, "parentsha\n", "") if "rev-parse" in cmd
                else ((1, "", "") if "--error-unmatch" in cmd else (0, "", ""))
            ),
        ) as mock_cmd, patch.object(
            agent_resolve, "reset_target_sources"
        ), patch.object(
            agent_resolve,
            "run_isolated_test",
            side_effect=[(0, "", ""), (0, "", "")],
        ), patch.object(
            agent_resolve, "validate_jest_red_phase", return_value=(False, "Runtime crash in beforeEach")
        ), patch.object(
            agent_resolve, "stage_2_red"
        ) as mock_s2, patch.object(
            agent_resolve, "stage_3_green"
        ) as mock_s3, patch.object(
            agent_resolve, "update_or_create_pr"
        ) as mock_pr:
            result = resolve_issue(self.client, issue_data, dry_run=False)

        self.assertTrue(result)
        mock_cmd.assert_any_call(["git", "reset", "--hard", "abc123456789~1"])
        mock_s2.assert_called_once()
        self.assertIn(
            "PREVIOUS CHECKPOINT TESTS CRASHED AT RUNTIME:\nRuntime crash in beforeEach",
            mock_s2.call_args.kwargs.get("initial_error_context", ""),
        )
        mock_s3.assert_called_once()
        self.assertEqual(mock_s3.call_args.kwargs.get("baseline_ref"), "HEAD")
        self.assertTrue(mock_pr.call_args.kwargs.get("is_resumption"))


class TestResolveIssueResumptionSelfHealing(unittest.TestCase):
    def setUp(self) -> None:
        self.orig_root = config.get_project_root()
        self.temp_dir = TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        config.set_project_root(self.root)
        self.client = MagicMock()

    def tearDown(self) -> None:
        config.set_project_root(self.orig_root)
        self.temp_dir.cleanup()

    def _extract_blueprint(self, mock_stage: MagicMock) -> BlueprintPlan:
        if len(mock_stage.call_args.args) > 3:
            return mock_stage.call_args.args[3]
        return mock_stage.call_args.kwargs["blueprint"]

    def test_resumption_self_heals_target_test_files_via_git_diff_tree_and_merges_blast_radius(self) -> None:
        issue_data = {
            "number": 55,
            "title": "Polluted target tests issue",
            "body": "Body",
            "author": {"login": "jarredb9"},
            "labels": [{"name": "agent:resolve"}],
        }

        state_data = {
            "attempt_count": 1,
            "red_phase_commit_sha": "redsha123456",
            "target_test_files": [
                "lib/__tests__/winery-red1.test.ts",
                "lib/__tests__/winery-red2.test.ts",
                "components/__tests__/modal.test.ts",
                "components/__tests__/card.test.ts",
                "components/__tests__/drawer.test.ts",
                "components/__tests__/search.test.ts",
                "components/__tests__/filter.test.ts",
                "components/__tests__/banner.test.ts",
                "components/__tests__/nav.test.ts",
                "scripts/agent-resolve/tests/test_pipeline.py",
                "supabase/functions/places.test.ts",
                "e2e/visit-flow.spec.ts",
                "lib/utils/helper.ts",
            ],
            "blast_radius_test_files": [
                "components/__tests__/existing.test.ts",
                "components/__tests__/modal.test.ts",
                "scripts/agent-resolve/tests/test_tracker.py",
                "e2e/app.spec.ts",
            ],
            "target_src_files": ["lib/winery.ts"],
            "scope": "winery",
            "plan_markdown": "# Plan",
        }
        (self.root / ".agent-state.json").write_text(json.dumps(state_data), encoding="utf-8")

        def run_cmd_mock(cmd, **kwargs):
            cmd_list = list(cmd)
            if len(cmd_list) >= 2 and cmd_list[0] == "git" and cmd_list[1] == "diff-tree":
                return (0, "lib/__tests__/winery-red1.test.ts\nlib/__tests__/winery-red2.test.ts\nlib/winery.ts\n", "")
            if "diff" in cmd_list:
                return (0, "", "")
            if "--error-unmatch" in cmd_list:
                return (1, "", "")
            if "rev-parse" in cmd_list:
                return (0, "redsha123456\n", "")
            return (0, "", "")

        with patch.object(
            agent_resolve, "gh_cli", return_value=(0, "[]", "")
        ), patch.object(
            agent_resolve, "fetch_maintainer_hints", return_value=""
        ), patch.object(
            agent_resolve, "reset_working_tree_to_main"
        ), patch.object(
            agent_resolve, "run_cmd", side_effect=run_cmd_mock
        ) as mock_cmd, patch.object(
            agent_resolve, "reset_target_sources"
        ), patch.object(
            agent_resolve,
            "run_isolated_test",
            side_effect=[(0, "", ""), (1, '{"numFailedTests": 2}', "")],
        ) as mock_test, patch.object(
            agent_resolve, "validate_jest_red_phase", return_value=(True, "Clean assertion failure")
        ), patch.object(
            agent_resolve, "stage_3_green"
        ) as mock_s3, patch.object(
            agent_resolve, "update_or_create_pr"
        ):
            result = resolve_issue(self.client, issue_data, dry_run=False)

        self.assertTrue(result)
        mock_cmd.assert_any_call(["git", "diff-tree", "--no-commit-id", "--name-only", "-r", "redsha123456"])
        mock_test.assert_any_call(["npx", "jest", "--json", "lib/__tests__/winery-red1.test.ts", "lib/__tests__/winery-red2.test.ts"])
        mock_s3.assert_called_once()
        bp = self._extract_blueprint(mock_s3)
        self.assertEqual(
            bp.target_test_files,
            ["lib/__tests__/winery-red1.test.ts", "lib/__tests__/winery-red2.test.ts"],
        )
        self.assertEqual(len(bp.blast_radius_test_files), 8)
        self.assertEqual(
            bp.blast_radius_test_files,
            [
                "components/__tests__/modal.test.ts",
                "components/__tests__/card.test.ts",
                "components/__tests__/drawer.test.ts",
                "components/__tests__/search.test.ts",
                "components/__tests__/filter.test.ts",
                "components/__tests__/banner.test.ts",
                "components/__tests__/nav.test.ts",
                "components/__tests__/existing.test.ts",
            ],
        )
        for path in bp.blast_radius_test_files:
            self.assertTrue(path.endswith((".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx")))
            self.assertFalse(path.startswith(("supabase/", "e2e/")))
            self.assertFalse(path.endswith(".py"))

    def test_resumption_falls_back_to_first_3_valid_jest_files_when_diff_tree_fails_or_empty(self) -> None:
        issue_data = {
            "number": 55,
            "title": "Fallback diff-tree failure issue",
            "body": "Body",
            "author": {"login": "jarredb9"},
            "labels": [{"name": "agent:resolve"}],
        }

        state_data = {
            "attempt_count": 1,
            "red_phase_commit_sha": "redsha123456",
            "target_test_files": [
                "scripts/test.py",
                "lib/__tests__/t1.test.ts",
                "lib/__tests__/t2.test.ts",
                "lib/__tests__/t3.test.ts",
                "lib/__tests__/t4.test.ts",
                "lib/__tests__/t5.test.ts",
            ],
            "target_src_files": ["lib/winery.ts"],
            "scope": "winery",
            "plan_markdown": "# Plan",
        }
        (self.root / ".agent-state.json").write_text(json.dumps(state_data), encoding="utf-8")

        def run_cmd_mock(cmd, **kwargs):
            cmd_list = list(cmd)
            if len(cmd_list) >= 2 and cmd_list[0] == "git" and cmd_list[1] == "diff-tree":
                return (1, "", "fatal: ambiguous argument")
            if "diff" in cmd_list:
                return (0, "", "")
            if "--error-unmatch" in cmd_list:
                return (1, "", "")
            if "rev-parse" in cmd_list:
                return (0, "redsha123456\n", "")
            return (0, "", "")

        with patch.object(
            agent_resolve, "gh_cli", return_value=(0, "[]", "")
        ), patch.object(
            agent_resolve, "fetch_maintainer_hints", return_value=""
        ), patch.object(
            agent_resolve, "reset_working_tree_to_main"
        ), patch.object(
            agent_resolve, "run_cmd", side_effect=run_cmd_mock
        ), patch.object(
            agent_resolve, "reset_target_sources"
        ), patch.object(
            agent_resolve,
            "run_isolated_test",
            side_effect=[(0, "", ""), (1, '{"numFailedTests": 3}', "")],
        ), patch.object(
            agent_resolve, "validate_jest_red_phase", return_value=(True, "Clean assertion failure")
        ), patch.object(
            agent_resolve, "stage_3_green"
        ) as mock_s3, patch.object(
            agent_resolve, "update_or_create_pr"
        ):
            result = resolve_issue(self.client, issue_data, dry_run=False)

        self.assertTrue(result)
        mock_s3.assert_called_once()
        bp = self._extract_blueprint(mock_s3)
        self.assertEqual(
            bp.target_test_files,
            ["lib/__tests__/t1.test.ts", "lib/__tests__/t2.test.ts", "lib/__tests__/t3.test.ts"],
        )
        self.assertEqual(
            bp.blast_radius_test_files,
            ["lib/__tests__/t4.test.ts", "lib/__tests__/t5.test.ts"],
        )

    def test_resumption_falls_back_to_first_3_when_diff_tree_matches_none_of_target_tests(self) -> None:
        issue_data = {
            "number": 55,
            "title": "Fallback diff-tree 0 matches issue",
            "body": "Body",
            "author": {"login": "jarredb9"},
            "labels": [{"name": "agent:resolve"}],
        }

        state_data = {
            "attempt_count": 1,
            "red_phase_commit_sha": "redsha123456",
            "target_test_files": [
                "supabase/functions/places.test.ts",
                "lib/__tests__/t1.test.ts",
                "lib/__tests__/t2.test.ts",
                "lib/__tests__/t3.test.ts",
                "lib/__tests__/t4.test.ts",
            ],
            "target_src_files": ["lib/winery.ts"],
            "scope": "winery",
            "plan_markdown": "# Plan",
        }
        (self.root / ".agent-state.json").write_text(json.dumps(state_data), encoding="utf-8")

        def run_cmd_mock(cmd, **kwargs):
            cmd_list = list(cmd)
            if len(cmd_list) >= 2 and cmd_list[0] == "git" and cmd_list[1] == "diff-tree":
                return (0, "lib/winery.ts\ncomponents/__tests__/unrelated.test.ts\n", "")
            if "diff" in cmd_list:
                return (0, "", "")
            if "--error-unmatch" in cmd_list:
                return (1, "", "")
            if "rev-parse" in cmd_list:
                return (0, "redsha123456\n", "")
            return (0, "", "")

        with patch.object(
            agent_resolve, "gh_cli", return_value=(0, "[]", "")
        ), patch.object(
            agent_resolve, "fetch_maintainer_hints", return_value=""
        ), patch.object(
            agent_resolve, "reset_working_tree_to_main"
        ), patch.object(
            agent_resolve, "run_cmd", side_effect=run_cmd_mock
        ), patch.object(
            agent_resolve, "reset_target_sources"
        ), patch.object(
            agent_resolve,
            "run_isolated_test",
            side_effect=[(0, "", ""), (1, '{"numFailedTests": 3}', "")],
        ), patch.object(
            agent_resolve, "validate_jest_red_phase", return_value=(True, "Clean assertion failure")
        ), patch.object(
            agent_resolve, "stage_3_green"
        ) as mock_s3, patch.object(
            agent_resolve, "update_or_create_pr"
        ):
            result = resolve_issue(self.client, issue_data, dry_run=False)

        self.assertTrue(result)
        mock_s3.assert_called_once()
        bp = self._extract_blueprint(mock_s3)
        self.assertEqual(
            bp.target_test_files,
            ["lib/__tests__/t1.test.ts", "lib/__tests__/t2.test.ts", "lib/__tests__/t3.test.ts"],
        )
        self.assertEqual(
            bp.blast_radius_test_files,
            ["lib/__tests__/t4.test.ts"],
        )

    def test_clean_resumption_instantiates_blueprint_with_sanitized_blast_radius(self) -> None:
        issue_data = {
            "number": 55,
            "title": "Clean resumption blast radius issue",
            "body": "Body",
            "author": {"login": "jarredb9"},
            "labels": [{"name": "agent:resolve"}],
        }

        state_data = {
            "attempt_count": 1,
            "red_phase_commit_sha": "redsha123456",
            "target_test_files": [
                "lib/__tests__/t1.test.ts",
                "lib/__tests__/demoted.test.ts",
                "e2e/invalid.spec.ts",
            ],
            "blast_radius_test_files": [
                "lib/__tests__/existing.test.ts",
                "scripts/agent-resolve/tests/test_tracker.py",
            ],
            "target_src_files": ["lib/winery.ts"],
            "scope": "winery",
            "plan_markdown": "# Plan",
        }
        (self.root / ".agent-state.json").write_text(json.dumps(state_data), encoding="utf-8")

        def run_cmd_mock(cmd, **kwargs):
            cmd_list = list(cmd)
            if len(cmd_list) >= 2 and cmd_list[0] == "git" and cmd_list[1] == "diff-tree":
                return (0, "lib/__tests__/t1.test.ts\nlib/winery.ts\n", "")
            if "diff" in cmd_list:
                return (0, "", "")
            if "--error-unmatch" in cmd_list:
                return (1, "", "")
            if "rev-parse" in cmd_list:
                return (0, "redsha123456\n", "")
            return (0, "", "")

        with patch.object(
            agent_resolve, "gh_cli", return_value=(0, "[]", "")
        ), patch.object(
            agent_resolve, "fetch_maintainer_hints", return_value=""
        ), patch.object(
            agent_resolve, "reset_working_tree_to_main"
        ), patch.object(
            agent_resolve, "run_cmd", side_effect=run_cmd_mock
        ), patch.object(
            agent_resolve, "reset_target_sources"
        ), patch.object(
            agent_resolve,
            "run_isolated_test",
            side_effect=[(0, "", ""), (1, '{"numFailedTests": 1}', "")],
        ), patch.object(
            agent_resolve, "validate_jest_red_phase", return_value=(True, "Clean assertion failure")
        ), patch.object(
            agent_resolve, "stage_3_green"
        ) as mock_s3, patch.object(
            agent_resolve, "update_or_create_pr"
        ):
            result = resolve_issue(self.client, issue_data, dry_run=False)

        self.assertTrue(result)
        mock_s3.assert_called_once()
        bp = self._extract_blueprint(mock_s3)
        self.assertEqual(bp.target_test_files, ["lib/__tests__/t1.test.ts"])
        self.assertEqual(
            bp.blast_radius_test_files,
            ["lib/__tests__/demoted.test.ts", "lib/__tests__/existing.test.ts"],
        )

    def test_checkpoint_invalidation_rollback_instantiates_blueprint_with_blast_radius(self) -> None:
        issue_data = {
            "number": 55,
            "title": "Invalid checkpoint rollback blast radius issue",
            "body": "Body",
            "author": {"login": "jarredb9"},
            "labels": [{"name": "agent:resolve"}],
        }

        state_data = {
            "attempt_count": 1,
            "red_phase_commit_sha": "redsha123456",
            "target_test_files": [
                "lib/__tests__/t1.test.ts",
                "lib/__tests__/demoted.test.ts",
                "e2e/invalid.spec.ts",
            ],
            "blast_radius_test_files": [
                "lib/__tests__/existing.test.ts",
                "scripts/agent-resolve/tests/test_tracker.py",
            ],
            "target_src_files": ["lib/winery.ts"],
            "scope": "winery",
            "plan_markdown": "# Plan",
        }
        (self.root / ".agent-state.json").write_text(json.dumps(state_data), encoding="utf-8")

        def run_cmd_mock(cmd, **kwargs):
            cmd_list = list(cmd)
            if len(cmd_list) >= 2 and cmd_list[0] == "git" and cmd_list[1] == "diff-tree":
                return (0, "lib/__tests__/t1.test.ts\nlib/winery.ts\n", "")
            if "diff" in cmd_list:
                return (0, "", "")
            if "--error-unmatch" in cmd_list:
                return (1, "", "")
            if "rev-parse" in cmd_list:
                return (0, "parentsha\n", "")
            return (0, "", "")

        with patch.object(
            agent_resolve, "gh_cli", return_value=(0, "[]", "")
        ), patch.object(
            agent_resolve, "reset_working_tree_to_main"
        ), patch.object(
            agent_resolve, "run_cmd", side_effect=run_cmd_mock
        ) as mock_cmd, patch.object(
            agent_resolve, "reset_target_sources"
        ), patch.object(
            agent_resolve,
            "run_isolated_test",
            side_effect=[(0, "", ""), (0, "", "")],
        ), patch.object(
            agent_resolve, "validate_jest_red_phase", return_value=(False, "Runtime crash in beforeEach")
        ), patch.object(
            agent_resolve, "stage_2_red"
        ) as mock_s2, patch.object(
            agent_resolve, "stage_3_green"
        ) as mock_s3, patch.object(
            agent_resolve, "update_or_create_pr"
        ):
            result = resolve_issue(self.client, issue_data, dry_run=False)

        self.assertTrue(result)
        mock_cmd.assert_any_call(["git", "reset", "--hard", "redsha123456~1"])
        mock_s2.assert_called_once()
        s2_bp = self._extract_blueprint(mock_s2)
        self.assertEqual(s2_bp.target_test_files, ["lib/__tests__/t1.test.ts"])
        self.assertEqual(
            s2_bp.blast_radius_test_files,
            ["lib/__tests__/demoted.test.ts", "lib/__tests__/existing.test.ts"],
        )
        mock_s3.assert_called_once()
        s3_bp = self._extract_blueprint(mock_s3)
        self.assertEqual(s3_bp.target_test_files, ["lib/__tests__/t1.test.ts"])
        self.assertEqual(
            s3_bp.blast_radius_test_files,
            ["lib/__tests__/demoted.test.ts", "lib/__tests__/existing.test.ts"],
        )


if __name__ == "__main__":
    unittest.main()
