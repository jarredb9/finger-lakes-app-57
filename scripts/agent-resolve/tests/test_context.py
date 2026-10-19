"""
Unit tests for `agent_resolve.context` (TDD Red Phase).
"""

from pathlib import Path
import tempfile
import unittest
from unittest.mock import MagicMock, patch

from agent_resolve import config
from agent_resolve.context import (
    extract_test_suite_names,
    find_related_test_files,
    get_project_context,
    get_repository_tree,
    is_issue_suitable_for_headless_agent,
)


class TestGetRepositoryTree(unittest.TestCase):
    @patch("agent_resolve.context.run_cmd")
    def test_returns_formatted_source_files_with_valid_extensions(
        self, mock_run_cmd: MagicMock
    ) -> None:
        mock_run_cmd.return_value = (
            0,
            "lib/utils.ts\ncomponents/button.tsx\napp/page.js\nsupabase/functions/api.jsx\nlib/db.sql\nlib/config.json\n",
            "",
        )

        tree = get_repository_tree()

        mock_run_cmd.assert_called_once_with(
            ["git", "ls-files", "lib/", "components/", "app/", "supabase/functions/"]
        )
        expected = (
            "### EXISTING REPOSITORY SOURCE FILES:\n"
            "- lib/utils.ts\n"
            "- components/button.tsx\n"
            "- app/page.js\n"
            "- supabase/functions/api.jsx\n"
            "- lib/db.sql\n"
            "- lib/config.json"
        )
        self.assertEqual(tree, expected)

    @patch("agent_resolve.context.run_cmd")
    def test_returns_empty_string_when_git_ls_files_fails_or_empty(
        self, mock_run_cmd: MagicMock
    ) -> None:
        mock_run_cmd.return_value = (1, "", "git error")
        self.assertEqual(get_repository_tree(), "")

        mock_run_cmd.return_value = (0, "", "")
        self.assertEqual(get_repository_tree(), "")

    @patch("agent_resolve.context.run_cmd")
    def test_filters_out_non_matching_extensions(
        self, mock_run_cmd: MagicMock
    ) -> None:
        mock_run_cmd.return_value = (
            0,
            "lib/README.md\ncomponents/logo.png\napp/global.css\nlib/notes.txt\nlib/service.ts\n",
            "",
        )

        tree = get_repository_tree()
        expected = "### EXISTING REPOSITORY SOURCE FILES:\n- lib/service.ts"
        self.assertEqual(tree, expected)


class TestGetProjectContext(unittest.TestCase):
    def setUp(self) -> None:
        self._orig_root = config.get_project_root()

    def tearDown(self) -> None:
        config.set_project_root(self._orig_root)

    @patch("agent_resolve.context.get_repository_tree")
    def test_combines_context_md_agents_md_and_repository_tree(
        self, mock_get_tree: MagicMock
    ) -> None:
        mock_get_tree.return_value = "### EXISTING REPOSITORY SOURCE FILES:\n- lib/app.ts"
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_root = Path(tmp_dir)
            (tmp_root / "CONTEXT.md").write_text("# Domain Context\nFinger Lakes Winery Planner", encoding="utf-8")
            (tmp_root / "AGENTS.md").write_text("# Agent Rules\nRule 1: Always test", encoding="utf-8")
            config.set_project_root(tmp_root)

            context = get_project_context()

            self.assertIn("### REPOSITORY DOMAIN MODEL (CONTEXT.md):", context)
            self.assertIn("# Domain Context\nFinger Lakes Winery Planner", context)
            self.assertIn("### ARCHITECTURAL RULES & STANDARDS (AGENTS.md):", context)
            self.assertIn("# Agent Rules\nRule 1: Always test", context)
            self.assertIn("### EXISTING REPOSITORY SOURCE FILES:\n- lib/app.ts", context)

    @patch("agent_resolve.context.get_repository_tree")
    def test_handles_missing_context_and_agents_files_gracefully(
        self, mock_get_tree: MagicMock
    ) -> None:
        mock_get_tree.return_value = "### EXISTING REPOSITORY SOURCE FILES:\n- lib/app.ts"
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_root = Path(tmp_dir)
            config.set_project_root(tmp_root)

            context = get_project_context()

            self.assertIn("### REPOSITORY DOMAIN MODEL (CONTEXT.md):\n\n", context)
            self.assertIn("### ARCHITECTURAL RULES & STANDARDS (AGENTS.md):\n\n", context)
            self.assertIn("### EXISTING REPOSITORY SOURCE FILES:\n- lib/app.ts", context)

    @patch("agent_resolve.context.get_repository_tree")
    def test_respects_dynamic_project_root_updates(
        self, mock_get_tree: MagicMock
    ) -> None:
        mock_get_tree.return_value = ""
        with tempfile.TemporaryDirectory() as tmp_dir_1, tempfile.TemporaryDirectory() as tmp_dir_2:
            root1 = Path(tmp_dir_1)
            root2 = Path(tmp_dir_2)
            (root1 / "CONTEXT.md").write_text("Context Root 1", encoding="utf-8")
            (root2 / "CONTEXT.md").write_text("Context Root 2", encoding="utf-8")

            config.set_project_root(root1)
            self.assertIn("Context Root 1", get_project_context())

            config.set_project_root(root2)
            self.assertIn("Context Root 2", get_project_context())


class TestFindRelatedTestFiles(unittest.TestCase):
    def setUp(self) -> None:
        self._orig_root = config.get_project_root()

    def tearDown(self) -> None:
        config.set_project_root(self._orig_root)

    @patch("agent_resolve.context.run_cmd")
    def test_discovers_existing_test_files_referencing_source_stem(
        self, mock_run_cmd: MagicMock
    ) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_root = Path(tmp_dir)
            test_file = tmp_root / "lib" / "__tests__" / "utils.test.ts"
            test_file.parent.mkdir(parents=True, exist_ok=True)
            test_file.write_text("// test", encoding="utf-8")
            config.set_project_root(tmp_root)

            mock_run_cmd.return_value = (0, "lib/__tests__/utils.test.ts\n", "")

            found = find_related_test_files(["lib/utils.ts"])

            mock_run_cmd.assert_called_once_with(
                ["git", "grep", "-l", "utils", "--", "**/__tests__/*"]
            )
            self.assertEqual(found, ["lib/__tests__/utils.test.ts"])

    @patch("agent_resolve.context.run_cmd")
    def test_skips_short_or_empty_stems(self, mock_run_cmd: MagicMock) -> None:
        found = find_related_test_files(["lib/ab.ts", "lib/.ts", ""])
        self.assertEqual(found, [])
        mock_run_cmd.assert_not_called()

    @patch("agent_resolve.context.run_cmd")
    def test_deduplicates_and_excludes_nonexistent_files(
        self, mock_run_cmd: MagicMock
    ) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_root = Path(tmp_dir)
            existing_test = tmp_root / "lib" / "__tests__" / "service.test.ts"
            existing_test.parent.mkdir(parents=True, exist_ok=True)
            existing_test.write_text("// test", encoding="utf-8")
            config.set_project_root(tmp_root)

            # mock_run_cmd returns both an existing file and a nonexistent file, with duplicates
            mock_run_cmd.side_effect = [
                (0, "lib/__tests__/service.test.ts\nnonexistent.test.ts\n", ""),
                (0, "lib/__tests__/service.test.ts\n", ""),
            ]

            found = find_related_test_files(["lib/service.ts", "lib/service_helper.ts"])

            self.assertEqual(found, ["lib/__tests__/service.test.ts"])

    @patch("agent_resolve.context.run_cmd")
    def test_handles_git_grep_failure_gracefully(
        self, mock_run_cmd: MagicMock
    ) -> None:
        mock_run_cmd.return_value = (1, "", "no matches")
        found = find_related_test_files(["lib/service.ts"])
        self.assertEqual(found, [])


class TestExtractTestSuiteNames(unittest.TestCase):
    def test_extracts_single_double_and_backtick_quoted_describe_titles(self) -> None:
        content = """
        describe('Single Quote Suite', () => {
            it('should pass', () => {});
        });
        describe("Double Quote Suite", () => {});
        describe(`Backtick Suite`, () => {});
        """
        titles = extract_test_suite_names(content)
        self.assertEqual(
            titles,
            ["Single Quote Suite", "Double Quote Suite", "Backtick Suite"],
        )

    def test_handles_whitespace_variations_and_empty_content(self) -> None:
        content = """
        describe  (  'Spaced Suite'  , () => {});
        describe('NoSpace', () => {});
        """
        titles = extract_test_suite_names(content)
        self.assertEqual(titles, ["Spaced Suite", "NoSpace"])

        self.assertEqual(extract_test_suite_names(""), [])
        self.assertEqual(extract_test_suite_names("// no describe blocks"), [])


class TestIsIssueSuitableForHeadlessAgent(unittest.TestCase):
    def test_flags_radix_and_composite_ui_keywords(self) -> None:
        for kw in ["dropdownmenu", "dialog", "popover", "accordion", "sheet", "radix"]:
            suitable, reason = is_issue_suitable_for_headless_agent(
                f"Fix bug in {kw}", "Component needs fix"
            )
            self.assertFalse(suitable, f"Expected {kw} to be marked unsuitable")
            self.assertIn("composite Radix UI / dropdown component redesign", reason)

    def test_flags_mobile_webkit_and_pwa_gesture_keywords(self) -> None:
        for kw in ["ios pwa", "standalone pwa", "webkit", "gesture", "safari popup"]:
            suitable, reason = is_issue_suitable_for_headless_agent(
                "Touch bug", f"Encountered on {kw} runtime"
            )
            self.assertFalse(suitable, f"Expected {kw} to be marked unsuitable")
            self.assertIn("mobile WebKit / PWA runtime gesture semantics", reason)

    def test_flags_external_deep_linking_schemes(self) -> None:
        for kw in ["maps://", "waze://", "https://maps.apple.com", "deep link"]:
            suitable, reason = is_issue_suitable_for_headless_agent(
                f"Support {kw} integration", "Open directions using custom URL"
            )
            self.assertFalse(suitable, f"Expected {kw} to be marked unsuitable")
            self.assertIn("external vendor deep-linking scheme", reason)

    def test_combines_multiple_unsuitable_reasons(self) -> None:
        suitable, reason = is_issue_suitable_for_headless_agent(
            "Fix Radix Dialog iOS PWA gesture and waze:// url",
            "Multiple problems encountered on mobile safari popup",
        )
        self.assertFalse(suitable)
        self.assertIn("composite Radix UI / dropdown component redesign", reason)
        self.assertIn("mobile WebKit / PWA runtime gesture semantics", reason)
        self.assertIn("external vendor deep-linking scheme", reason)
        self.assertEqual(
            reason,
            "composite Radix UI / dropdown component redesign; "
            "mobile WebKit / PWA runtime gesture semantics; "
            "external vendor deep-linking scheme",
        )

    def test_approves_standard_headless_suitable_issues(self) -> None:
        suitable, reason = is_issue_suitable_for_headless_agent(
            "Fix off-by-one error in date calculation",
            "The date formatting in lib/utils.ts is incorrect for leap years.",
        )
        self.assertTrue(suitable)
        self.assertEqual(reason, "")


if __name__ == "__main__":
    unittest.main()
