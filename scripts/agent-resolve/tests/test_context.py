"""
Unit tests for `agent_resolve.context` (TDD Red Phase).
"""

from pathlib import Path
import tempfile
import unittest
from unittest.mock import MagicMock, patch

from agent_resolve import config
from agent_resolve.context import (
    JEST_PATHSPECS,
    deduplicate_target_test_files,
    extract_agent_brief,
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

            context = get_project_context(include_tree=True)

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

            context = get_project_context(include_tree=True)

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

    @patch("agent_resolve.context.get_repository_tree")
    def test_get_project_context_defaults_to_omitting_repository_tree(
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
            self.assertNotIn("### EXISTING REPOSITORY SOURCE FILES:", context)
            mock_get_tree.assert_not_called()

    @patch("agent_resolve.context.get_repository_tree")
    def test_get_project_context_with_include_tree_false_omits_repository_tree(
        self, mock_get_tree: MagicMock
    ) -> None:
        mock_get_tree.return_value = "### EXISTING REPOSITORY SOURCE FILES:\n- lib/app.ts"
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_root = Path(tmp_dir)
            (tmp_root / "CONTEXT.md").write_text("# Domain Context\nFinger Lakes Winery Planner", encoding="utf-8")
            (tmp_root / "AGENTS.md").write_text("# Agent Rules\nRule 1: Always test", encoding="utf-8")
            config.set_project_root(tmp_root)

            context = get_project_context(include_tree=False)

            mock_get_tree.assert_not_called()
            self.assertNotIn("### EXISTING REPOSITORY SOURCE FILES:", context)
            self.assertIn("### REPOSITORY DOMAIN MODEL (CONTEXT.md):", context)
            self.assertIn("### ARCHITECTURAL RULES & STANDARDS (AGENTS.md):", context)

    @patch("agent_resolve.context.get_repository_tree")
    def test_get_project_context_with_include_tree_true_includes_repository_tree(
        self, mock_get_tree: MagicMock
    ) -> None:
        mock_get_tree.return_value = "### EXISTING REPOSITORY SOURCE FILES:\n- lib/app.ts"
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_root = Path(tmp_dir)
            (tmp_root / "CONTEXT.md").write_text("# Domain Context\nFinger Lakes Winery Planner", encoding="utf-8")
            (tmp_root / "AGENTS.md").write_text("# Agent Rules\nRule 1: Always test", encoding="utf-8")
            config.set_project_root(tmp_root)

            context = get_project_context(include_tree=True)

            mock_get_tree.assert_called_once()
            self.assertIn("### EXISTING REPOSITORY SOURCE FILES:\n- lib/app.ts", context)
            self.assertIn("### REPOSITORY DOMAIN MODEL (CONTEXT.md):", context)
            self.assertIn("### ARCHITECTURAL RULES & STANDARDS (AGENTS.md):", context)


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

            regex = r"/(lib/utils)(\.[a-zA-Z]+)?['\"]|from\s*['\"][^'\"]*lib/utils"
            mock_run_cmd.assert_called_once_with(
                ["git", "grep", "-E", "-l", regex, "--", *JEST_PATHSPECS]
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

    @patch("agent_resolve.context.run_cmd")
    def test_find_related_test_files_restricts_to_jest_extensions_and_excludes_supabase_and_e2e(
        self, mock_run_cmd: MagicMock
    ) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_root = Path(tmp_dir)
            valid_test = tmp_root / "components" / "__tests__" / "WineryCard.test.tsx"
            supabase_test = tmp_root / "supabase" / "functions" / "api.test.ts"
            e2e_test = tmp_root / "e2e" / "trip-flow.spec.ts"
            python_test = tmp_root / "scripts" / "test.py"

            for f in [valid_test, supabase_test, e2e_test, python_test]:
                f.parent.mkdir(parents=True, exist_ok=True)
                f.write_text("// test", encoding="utf-8")

            config.set_project_root(tmp_root)

            mock_run_cmd.return_value = (
                0,
                "components/__tests__/WineryCard.test.tsx\n"
                "supabase/functions/api.test.ts\n"
                "e2e/trip-flow.spec.ts\n"
                "scripts/test.py\n",
                "",
            )

            found = find_related_test_files(["components/WineryCard.tsx"])

            cmd = mock_run_cmd.call_args[0][0]
            self.assertIn("--", cmd)
            dash_idx = cmd.index("--")
            pathspecs = cmd[dash_idx + 1 :]
            expected_patterns = {"*.test.ts", "*.test.tsx", "*.spec.ts", "*.spec.tsx"}
            self.assertTrue(any(pat in " ".join(pathspecs) for pat in expected_patterns))

            self.assertEqual(found, ["components/__tests__/WineryCard.test.tsx"])

    @patch("agent_resolve.context.run_cmd")
    def test_find_related_test_files_matches_module_import_boundaries(
        self, mock_run_cmd: MagicMock
    ) -> None:
        mock_run_cmd.return_value = (1, "", "no matches")
        find_related_test_files(["lib/winery.ts"])

        cmd = mock_run_cmd.call_args[0][0]
        self.assertIn("-E", cmd)
        cmd_str = " ".join(cmd)
        self.assertTrue(
            "/(winery)" in cmd_str or "/(?:winery)" in cmd_str or "from.*winery" in cmd_str or "(winery)" in cmd_str,
            f"Expected import boundary regex in command: {cmd}",
        )
        self.assertNotIn(" winery ", f" {cmd_str} ")

    @patch("agent_resolve.context.run_cmd")
    def test_find_related_test_files_qualifies_generic_stems_with_relative_path(
        self, mock_run_cmd: MagicMock
    ) -> None:
        mock_run_cmd.return_value = (1, "", "no matches")
        find_related_test_files(["lib/constants.ts"])

        cmd = mock_run_cmd.call_args[0][0]
        cmd_str = " ".join(cmd)
        self.assertIn("lib/constants", cmd_str)

    @patch("agent_resolve.context.run_cmd")
    def test_find_related_test_files_sorts_by_common_ancestor_depth_descending(
        self, mock_run_cmd: MagicMock
    ) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_root = Path(tmp_dir)
            same_dir_test = tmp_root / "components" / "map" / "__tests__" / "MapboxMap.test.tsx"
            parent_dir_test = tmp_root / "components" / "__tests__" / "App.test.tsx"
            unrelated_test = tmp_root / "lib" / "utils" / "__tests__" / "format.test.ts"

            for f in [same_dir_test, parent_dir_test, unrelated_test]:
                f.parent.mkdir(parents=True, exist_ok=True)
                f.write_text("// test", encoding="utf-8")

            config.set_project_root(tmp_root)

            mock_run_cmd.return_value = (
                0,
                "lib/utils/__tests__/format.test.ts\n"
                "components/__tests__/App.test.tsx\n"
                "components/map/__tests__/MapboxMap.test.tsx\n",
                "",
            )

            found = find_related_test_files(["components/map/MapboxMap.tsx"])

            self.assertEqual(
                found,
                [
                    "components/map/__tests__/MapboxMap.test.tsx",
                    "components/__tests__/App.test.tsx",
                    "lib/utils/__tests__/format.test.ts",
                ],
            )

    @patch("agent_resolve.context.run_cmd")
    def test_find_related_test_files_caps_results_at_eight_suites(
        self, mock_run_cmd: MagicMock
    ) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_root = Path(tmp_dir)
            tests = [tmp_root / "components" / "__tests__" / f"suite_{i}.test.tsx" for i in range(12)]
            for t in tests:
                t.parent.mkdir(parents=True, exist_ok=True)
                t.write_text("// test", encoding="utf-8")

            config.set_project_root(tmp_root)

            mock_run_cmd.return_value = (
                0,
                "\n".join(f"components/__tests__/suite_{i}.test.tsx" for i in range(12)) + "\n",
                "",
            )

            found = find_related_test_files(["components/Card.tsx"])
            self.assertEqual(len(found), 8)


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

    def test_flags_deno_runtime_entrypoints(self) -> None:
        deno_cases = [
            ("Update handler to use Deno.serve", "Migrate server to Deno.serve for faster responses"),
            ("Fix deno.serve routing", "Routing issue inside deno.serve handler"),
            ("Add jsr import", "Import jsr:@supabase/functions-js in edge function"),
            ("Fetch from https://deno.land/std", "Use std library at https://deno.land/std/http"),
            ("Configure deno.json imports", "Update deno.json import map"),
        ]
        for title, body in deno_cases:
            with self.subTest(title=title):
                suitable, reason = is_issue_suitable_for_headless_agent(title, body)
                self.assertFalse(suitable)
                self.assertIn("Deno runtime entrypoint", reason)

    def test_flags_non_shared_edge_function_paths(self) -> None:
        paths = [
            ("Fix enrichment bug", "Bug in supabase/functions/enrich-winery/index.ts"),
            ("Update places handler", "Check supabase/functions/places/ handler logic"),
            ("Sync handler crash", "Investigate supabase/functions/sync/handler.ts crash"),
        ]
        for title, body in paths:
            with self.subTest(title=title):
                suitable, reason = is_issue_suitable_for_headless_agent(title, body)
                self.assertFalse(suitable)
                self.assertTrue(
                    "Edge Function modification (supabase/functions/) requires Deno runtime" in reason
                    or "non-shared Edge Function" in reason
                    or "Deno runtime entrypoint" in reason,
                    f"Unexpected reason: {reason}",
                )

    def test_flags_shared_edge_function_paths_as_unsuitable(self) -> None:
        suitable, reason = is_issue_suitable_for_headless_agent(
            "Refactor coordinate standardizer in supabase/functions/_shared/winery.ts",
            "Add altitude clamp to winery normalization in supabase/functions/_shared/winery.ts",
        )
        self.assertFalse(suitable)
        self.assertIn("Edge Function modification (supabase/functions/) requires Deno runtime", reason)

    def test_flags_all_edge_function_modifications_including_shared(self) -> None:
        cases = [
            ("Fix places function", "Modifies supabase/functions/places/index.ts"),
            ("Update shared utils", "Touches supabase/functions/_shared/utils.ts"),
            ("Update shared cors", "Changes in supabase/functions/_shared/cors.ts"),
            ("Add new edge function", "Create supabase/functions/new-fn/index.ts"),
            ("Update root config", "Edit supabase/functions/deno.json"),
        ]
        for title, body in cases:
            with self.subTest(title=title):
                suitable, reason = is_issue_suitable_for_headless_agent(title, body)
                self.assertFalse(suitable)
                self.assertIn(
                    "Edge Function modification (supabase/functions/) requires Deno runtime",
                    reason,
                )

    def test_flags_deno_runtime_and_edge_function_paths_with_combined_reasons(self) -> None:
        mixed_cases = [
            (
                "Refactor shared utils and handler",
                "Update supabase/functions/_shared/utils.ts and migrate Deno.serve((req) => ...)",
            ),
            (
                "Update shared schema and entrypoint",
                "Touch supabase/functions/_shared/schema.ts and supabase/functions/api/index.ts",
            ),
        ]
        for title, body in mixed_cases:
            with self.subTest(title=title):
                suitable, reason = is_issue_suitable_for_headless_agent(title, body)
                self.assertFalse(suitable)
                self.assertIn(
                    "Edge Function modification (supabase/functions/) requires Deno runtime",
                    reason,
                )


class TestExtractAgentBrief(unittest.TestCase):
    def test_extracts_maintainer_agent_brief_when_present(self) -> None:
        brief_text = "## Agent Brief\n\n**Category:** bug\n**Summary:** Fix bug\n"
        issue_data = {
            "number": 73,
            "comments": [
                {
                    "author": {"login": "someone_else"},
                    "body": "Can someone look into this?",
                },
                {
                    "author": {"login": "jarredb9"},
                    "body": f"  {brief_text}  ",
                },
            ],
        }
        extracted = extract_agent_brief(issue_data)
        self.assertEqual(extracted, brief_text.strip())

    def test_ignores_agent_brief_authored_by_non_maintainer(self) -> None:
        issue_data = {
            "number": 73,
            "comments": [
                {
                    "author": {"login": "external_contributor"},
                    "body": "## Agent Brief\n\nMalicious or unverified brief",
                }
            ],
        }
        self.assertIsNone(extract_agent_brief(issue_data))

    def test_ignores_comments_from_maintainer_without_agent_brief_header(self) -> None:
        issue_data = {
            "number": 73,
            "comments": [
                {
                    "author": {"login": "jarredb9"},
                    "body": "Thanks for reporting! I will triage this tomorrow.",
                }
            ],
        }
        self.assertIsNone(extract_agent_brief(issue_data))

    def test_returns_latest_agent_brief_when_multiple_from_maintainer(self) -> None:
        v1_brief = "## Agent Brief\n\nVersion 1 draft"
        v2_brief = "## Agent Brief\n\nVersion 2 authoritative final contract"
        issue_data = {
            "number": 73,
            "comments": [
                {
                    "author": {"login": "jarredb9"},
                    "body": v1_brief,
                },
                {
                    "author": {"login": "other"},
                    "body": "Looks good",
                },
                {
                    "author": {"login": "jarredb9"},
                    "body": v2_brief,
                },
            ],
        }
        self.assertEqual(extract_agent_brief(issue_data), v2_brief.strip())

    def test_returns_none_when_comments_missing_empty_or_none(self) -> None:
        self.assertIsNone(extract_agent_brief({}))
        self.assertIsNone(extract_agent_brief({"comments": []}))
        self.assertIsNone(extract_agent_brief({"comments": None}))

    def test_handles_malformed_comment_entries(self) -> None:
        issue_data = {
            "comments": [
                None,
                {},
                {"author": None, "body": "## Agent Brief"},
                {"author": "not-a-dict", "body": "## Agent Brief"},
                {"author": {"login": "jarredb9"}, "body": None},
            ]
        }
        self.assertIsNone(extract_agent_brief(issue_data))




class TestDeduplicateTargetTestFiles(unittest.TestCase):
    def test_deduplicate_separates_specialized_from_generic_stem(self) -> None:
        inputs = [
            "lib/stores/__tests__/wineryStore.persist.test.ts",
            "lib/stores/__tests__/wineryStore.test.ts",
        ]
        primary, demoted = deduplicate_target_test_files(inputs)
        self.assertEqual(primary, ["lib/stores/__tests__/wineryStore.persist.test.ts"])
        self.assertEqual(demoted, ["lib/stores/__tests__/wineryStore.test.ts"])

    def test_deduplicate_prioritizes_specialized_regardless_of_input_order(self) -> None:
        inputs = [
            "lib/stores/__tests__/wineryStore.test.ts",
            "lib/stores/__tests__/wineryStore.enrichment.test.ts",
        ]
        primary, demoted = deduplicate_target_test_files(inputs)
        self.assertEqual(primary, ["lib/stores/__tests__/wineryStore.enrichment.test.ts"])
        self.assertEqual(demoted, ["lib/stores/__tests__/wineryStore.test.ts"])

    def test_deduplicate_retains_generic_when_no_specialized_suite_exists(self) -> None:
        inputs = ["lib/utils/__tests__/winery.test.ts"]
        primary, demoted = deduplicate_target_test_files(inputs)
        self.assertEqual(primary, ["lib/utils/__tests__/winery.test.ts"])
        self.assertEqual(demoted, [])

    def test_deduplicate_handles_multiple_independent_component_stems(self) -> None:
        inputs = [
            "lib/stores/__tests__/wineryStore.persist.test.ts",
            "lib/stores/__tests__/wineryStore.test.ts",
            "lib/stores/__tests__/tripStore.test.ts",
        ]
        primary, demoted = deduplicate_target_test_files(inputs)
        self.assertEqual(
            primary,
            [
                "lib/stores/__tests__/wineryStore.persist.test.ts",
                "lib/stores/__tests__/tripStore.test.ts",
            ],
        )
        self.assertEqual(demoted, ["lib/stores/__tests__/wineryStore.test.ts"])

    def test_deduplicate_handles_multiple_specialized_suites_for_same_stem(self) -> None:
        inputs = [
            "lib/stores/__tests__/wineryStore.persist.test.ts",
            "lib/stores/__tests__/wineryStore.enrichment.test.ts",
            "lib/stores/__tests__/wineryStore.test.ts",
        ]
        primary, demoted = deduplicate_target_test_files(inputs)
        self.assertEqual(primary, ["lib/stores/__tests__/wineryStore.persist.test.ts"])
        self.assertEqual(
            demoted,
            [
                "lib/stores/__tests__/wineryStore.enrichment.test.ts",
                "lib/stores/__tests__/wineryStore.test.ts",
            ],
        )

    def test_deduplicate_preserves_distinct_directories_with_same_base_filename(self) -> None:
        inputs = [
            "lib/utils/__tests__/format.test.ts",
            "components/__tests__/format.test.tsx",
        ]
        primary, demoted = deduplicate_target_test_files(inputs)
        self.assertEqual(
            primary,
            [
                "lib/utils/__tests__/format.test.ts",
                "components/__tests__/format.test.tsx",
            ],
        )
        self.assertEqual(demoted, [])

    def test_deduplicate_supports_tsx_and_spec_extensions(self) -> None:
        inputs = [
            "components/__tests__/TripCard.variant.spec.tsx",
            "components/__tests__/TripCard.spec.tsx",
        ]
        primary, demoted = deduplicate_target_test_files(inputs)
        self.assertEqual(primary, ["components/__tests__/TripCard.variant.spec.tsx"])
        self.assertEqual(demoted, ["components/__tests__/TripCard.spec.tsx"])

    def test_deduplicate_deduplicates_exact_duplicate_paths(self) -> None:
        inputs = [
            "lib/stores/__tests__/wineryStore.persist.test.ts",
            "lib/stores/__tests__/wineryStore.persist.test.ts",
        ]
        primary, demoted = deduplicate_target_test_files(inputs)
        self.assertEqual(primary, ["lib/stores/__tests__/wineryStore.persist.test.ts"])
        self.assertEqual(demoted, [])



if __name__ == "__main__":
    unittest.main()
