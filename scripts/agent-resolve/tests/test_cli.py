"""
Unit tests for `agent_resolve.cli` (TDD Red Phase).
"""

import json
import unittest
from unittest.mock import MagicMock, call, patch

import agent_resolve
from agent_resolve import config

# Modular imports under test (TDD Red Phase: raises ModuleNotFoundError until Phase 5 Task 4)
from agent_resolve.cli import main, parse_args


class TestCliArgumentParsing(unittest.TestCase):
    def test_default_arguments(self) -> None:
        args = parse_args([])
        self.assertIsNone(args.issue)
        self.assertEqual(args.max_issues, 3)
        self.assertFalse(args.dry_run)

    def test_custom_issue_flag(self) -> None:
        args_long = parse_args(["--issue", "42"])
        self.assertEqual(args_long.issue, 42)

        args_short = parse_args(["-i", "99"])
        self.assertEqual(args_short.issue, 99)

    def test_custom_max_issues_flag(self) -> None:
        args_long = parse_args(["--max-issues", "10"])
        self.assertEqual(args_long.max_issues, 10)

        args_short = parse_args(["-m", "1"])
        self.assertEqual(args_short.max_issues, 1)

    def test_dry_run_flag(self) -> None:
        args = parse_args(["--dry-run"])
        self.assertTrue(args.dry_run)

    def test_combined_arguments(self) -> None:
        args_long = parse_args(["--issue", "101", "--max-issues", "5", "--dry-run"])
        self.assertEqual(args_long.issue, 101)
        self.assertEqual(args_long.max_issues, 5)
        self.assertTrue(args_long.dry_run)

        args_short = parse_args(["-i", "101", "-m", "5", "--dry-run"])
        self.assertEqual(args_short.issue, 101)
        self.assertEqual(args_short.max_issues, 5)
        self.assertTrue(args_short.dry_run)

    def test_invalid_issue_argument_exits_two(self) -> None:
        with patch("sys.stderr"):
            with self.assertRaises(SystemExit) as cm:
                parse_args(["--issue", "not-a-number"])
        self.assertEqual(cm.exception.code, 2)

    def test_invalid_max_issues_argument_exits_two(self) -> None:
        with patch("sys.stderr"):
            with self.assertRaises(SystemExit) as cm:
                parse_args(["--max-issues", "abc"])
        self.assertEqual(cm.exception.code, 2)

    def test_help_flag_exits_zero(self) -> None:
        with patch("sys.stdout"):
            with self.assertRaises(SystemExit) as cm:
                parse_args(["--help"])
        self.assertEqual(cm.exception.code, 0)


class TestCliSingleIssueExecution(unittest.TestCase):
    def setUp(self) -> None:
        self.client = MagicMock()
        self.patcher_client = patch.object(agent_resolve, "get_genai_client", return_value=self.client)
        self.patcher_log = patch.object(agent_resolve, "log")
        self.mock_client = self.patcher_client.start()
        self.mock_log = self.patcher_log.start()

    def tearDown(self) -> None:
        self.patcher_client.stop()
        self.patcher_log.stop()

    def test_single_issue_success(self) -> None:
        sample_issue = {
            "number": 42,
            "title": "Fix coordinate clamp",
            "body": "...",
            "author": {"login": "jarredb9"},
            "labels": [],
        }

        with patch.object(
            agent_resolve, "gh_cli", return_value=(0, json.dumps(sample_issue), "")
        ) as mock_gh, patch.object(
            agent_resolve, "resolve_issue", return_value=True
        ) as mock_resolve:
            with self.assertRaises(SystemExit) as cm:
                main(["--issue", "42"])
            self.assertEqual(cm.exception.code, 0)
            mock_gh.assert_called_once_with(
                ["issue", "view", "42", "--json", "number,title,body,author,labels"]
            )
            mock_resolve.assert_called_once_with(self.client, sample_issue, dry_run=False)

    def test_single_issue_dry_run(self) -> None:
        sample_issue = {
            "number": 42,
            "title": "Fix coordinate clamp",
            "body": "...",
            "author": {"login": "jarredb9"},
            "labels": [],
        }

        with patch.object(
            agent_resolve, "gh_cli", return_value=(0, json.dumps(sample_issue), "")
        ) as mock_gh, patch.object(
            agent_resolve, "resolve_issue", return_value=True
        ) as mock_resolve:
            with self.assertRaises(SystemExit) as cm:
                main(["--issue", "42", "--dry-run"])
            self.assertEqual(cm.exception.code, 0)
            mock_gh.assert_called_once_with(
                ["issue", "view", "42", "--json", "number,title,body,author,labels"]
            )
            mock_resolve.assert_called_once_with(self.client, sample_issue, dry_run=True)

    def test_single_issue_failure(self) -> None:
        sample_issue = {
            "number": 42,
            "title": "Fix coordinate clamp",
            "body": "...",
            "author": {"login": "jarredb9"},
            "labels": [],
        }

        with patch.object(
            agent_resolve, "gh_cli", return_value=(0, json.dumps(sample_issue), "")
        ), patch.object(
            agent_resolve, "resolve_issue", return_value=False
        ) as mock_resolve:
            with self.assertRaises(SystemExit) as cm:
                main(["-i", "42"])
            self.assertEqual(cm.exception.code, 1)
            mock_resolve.assert_called_once_with(self.client, sample_issue, dry_run=False)

    def test_single_issue_gh_view_error(self) -> None:
        with patch.object(
            agent_resolve,
            "gh_cli",
            return_value=(1, "", "Could not resolve to an issue with the number 42"),
        ), patch.object(
            agent_resolve, "resolve_issue"
        ) as mock_resolve:
            with self.assertRaises(SystemExit) as cm:
                main(["--issue", "42"])
            self.assertEqual(cm.exception.code, 1)
            mock_resolve.assert_not_called()

    def test_single_issue_uses_sys_argv_when_argv_none(self) -> None:
        sample_issue = {
            "number": 42,
            "title": "Fix coordinate clamp",
            "body": "...",
            "author": {"login": "jarredb9"},
            "labels": [],
        }

        with patch("sys.argv", ["agent-resolve", "--issue", "42"]), patch.object(
            agent_resolve, "gh_cli", return_value=(0, json.dumps(sample_issue), "")
        ), patch.object(
            agent_resolve, "resolve_issue", return_value=True
        ) as mock_resolve:
            with self.assertRaises(SystemExit) as cm:
                main()
            self.assertEqual(cm.exception.code, 0)
            mock_resolve.assert_called_once_with(self.client, sample_issue, dry_run=False)


class TestCliBatchExecution(unittest.TestCase):
    def setUp(self) -> None:
        self.client = MagicMock()
        self.patcher_client = patch.object(agent_resolve, "get_genai_client", return_value=self.client)
        self.patcher_log = patch.object(agent_resolve, "log")
        self.mock_client = self.patcher_client.start()
        self.mock_log = self.patcher_log.start()

    def tearDown(self) -> None:
        self.patcher_client.stop()
        self.patcher_log.stop()

    def test_batch_query_uses_max_issues_limit(self) -> None:
        with patch.object(
            agent_resolve, "gh_cli", return_value=(0, "[]", "")
        ) as mock_gh, patch.object(
            agent_resolve, "resolve_issue"
        ) as mock_resolve:
            with self.assertRaises(SystemExit) as cm:
                main(["--max-issues", "7"])
            self.assertEqual(cm.exception.code, 0)
            mock_gh.assert_called_once_with([
                "issue", "list",
                "--state", "open",
                "--label", "agent:resolve",
                "--limit", "7",
                "--json", "number,title,body,author,labels",
            ])
            mock_resolve.assert_not_called()

    def test_batch_no_open_issues_exits_zero(self) -> None:
        with patch.object(
            agent_resolve, "gh_cli", return_value=(0, "[]", "")
        ) as mock_gh, patch.object(
            agent_resolve, "resolve_issue"
        ) as mock_resolve:
            with self.assertRaises(SystemExit) as cm:
                main([])
            self.assertEqual(cm.exception.code, 0)
            mock_gh.assert_called_once_with([
                "issue", "list",
                "--state", "open",
                "--label", "agent:resolve",
                "--limit", "3",
                "--json", "number,title,body,author,labels",
            ])
            mock_resolve.assert_not_called()

    def test_batch_gh_list_error(self) -> None:
        with patch.object(
            agent_resolve, "gh_cli", return_value=(1, "", "API rate limit exceeded")
        ), patch.object(
            agent_resolve, "resolve_issue"
        ) as mock_resolve:
            with self.assertRaises(SystemExit) as cm:
                main([])
            self.assertEqual(cm.exception.code, 1)
            mock_resolve.assert_not_called()

    def test_batch_all_issues_succeed(self) -> None:
        issues = [
            {"number": 10, "title": "Issue 1"},
            {"number": 20, "title": "Issue 2"},
        ]

        with patch.object(
            agent_resolve, "gh_cli", return_value=(0, json.dumps(issues), "")
        ), patch.object(
            agent_resolve, "resolve_issue", return_value=True
        ) as mock_resolve:
            with self.assertRaises(SystemExit) as cm:
                main([])
            self.assertEqual(cm.exception.code, 0)
            self.assertEqual(mock_resolve.call_count, 2)
            mock_resolve.assert_has_calls([
                call(self.client, issues[0], dry_run=False),
                call(self.client, issues[1], dry_run=False),
            ])

    def test_batch_partial_issue_failure_exits_one(self) -> None:
        issues = [
            {"number": 10, "title": "Issue 1"},
            {"number": 20, "title": "Issue 2"},
        ]

        with patch.object(
            agent_resolve, "gh_cli", return_value=(0, json.dumps(issues), "")
        ), patch.object(
            agent_resolve, "resolve_issue", side_effect=[True, False]
        ) as mock_resolve:
            with self.assertRaises(SystemExit) as cm:
                main([])
            self.assertEqual(cm.exception.code, 1)
            self.assertEqual(mock_resolve.call_count, 2)
            mock_resolve.assert_has_calls([
                call(self.client, issues[0], dry_run=False),
                call(self.client, issues[1], dry_run=False),
            ])

    def test_batch_dry_run_propagated_to_all_issues(self) -> None:
        issues = [
            {"number": 10, "title": "Issue 1"},
            {"number": 20, "title": "Issue 2"},
        ]

        with patch.object(
            agent_resolve, "gh_cli", return_value=(0, json.dumps(issues), "")
        ), patch.object(
            agent_resolve, "resolve_issue", return_value=True
        ) as mock_resolve:
            with self.assertRaises(SystemExit) as cm:
                main(["--dry-run"])
            self.assertEqual(cm.exception.code, 0)
            self.assertEqual(mock_resolve.call_count, 2)
            mock_resolve.assert_has_calls([
                call(self.client, issues[0], dry_run=True),
                call(self.client, issues[1], dry_run=True),
            ])


class TestCliBatchPacing(unittest.TestCase):
    def setUp(self) -> None:
        self.client = MagicMock()
        self.patcher_client = patch.object(agent_resolve, "get_genai_client", return_value=self.client)
        self.patcher_log = patch.object(agent_resolve, "log")
        self.mock_client = self.patcher_client.start()
        self.mock_log = self.patcher_log.start()

    def tearDown(self) -> None:
        self.patcher_client.stop()
        self.patcher_log.stop()

    def test_batch_pacing_sleeps_between_issues_when_delay_positive(self) -> None:
        issues = [{"number": 1}, {"number": 2}, {"number": 3}]

        with patch.object(
            agent_resolve, "gh_cli", return_value=(0, json.dumps(issues), "")
        ), patch.object(
            agent_resolve, "resolve_issue", return_value=True
        ), patch.object(
            config, "BATCH_PACING_SECONDS", 5
        ), patch.object(
            agent_resolve, "BATCH_PACING_SECONDS", 5
        ), patch(
            "time.sleep"
        ) as mock_sleep:
            with self.assertRaises(SystemExit) as cm:
                main([])
            self.assertEqual(cm.exception.code, 0)
            self.assertEqual(mock_sleep.call_count, 2)
            mock_sleep.assert_has_calls([call(5), call(5)])

    def test_batch_pacing_does_not_sleep_when_single_issue_in_batch(self) -> None:
        issues = [{"number": 1}]

        with patch.object(
            agent_resolve, "gh_cli", return_value=(0, json.dumps(issues), "")
        ), patch.object(
            agent_resolve, "resolve_issue", return_value=True
        ), patch.object(
            config, "BATCH_PACING_SECONDS", 5
        ), patch.object(
            agent_resolve, "BATCH_PACING_SECONDS", 5
        ), patch(
            "time.sleep"
        ) as mock_sleep:
            with self.assertRaises(SystemExit) as cm:
                main([])
            self.assertEqual(cm.exception.code, 0)
            mock_sleep.assert_not_called()

    def test_batch_pacing_does_not_sleep_when_delay_is_zero(self) -> None:
        issues = [{"number": 1}, {"number": 2}, {"number": 3}]

        with patch.object(
            agent_resolve, "gh_cli", return_value=(0, json.dumps(issues), "")
        ), patch.object(
            agent_resolve, "resolve_issue", return_value=True
        ), patch.object(
            config, "BATCH_PACING_SECONDS", 0
        ), patch.object(
            agent_resolve, "BATCH_PACING_SECONDS", 0
        ), patch(
            "time.sleep"
        ) as mock_sleep:
            with self.assertRaises(SystemExit) as cm:
                main([])
            self.assertEqual(cm.exception.code, 0)
            mock_sleep.assert_not_called()


if __name__ == "__main__":
    unittest.main()
