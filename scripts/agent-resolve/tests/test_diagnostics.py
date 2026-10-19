"""
Unit tests for `agent_resolve.diagnostics` (TDD Red Phase).
"""

from pathlib import Path
import tempfile
import unittest
from unittest.mock import MagicMock, patch

from agent_resolve import config
from agent_resolve.diagnostics import (
    find_files,
    grep_search,
    parse_issue_diagnostics,
    read_file_snippet,
)


class TestGrepSearch(unittest.TestCase):
    def test_returns_message_when_query_empty_or_whitespace(self) -> None:
        self.assertEqual(grep_search(""), "No search query provided.")
        self.assertEqual(grep_search("   \t\n "), "No search query provided.")

    @patch("agent_resolve.diagnostics.run_cmd")
    def test_executes_exact_case_git_grep_with_optional_path_prefix(
        self, mock_run_cmd: MagicMock
    ) -> None:
        mock_run_cmd.return_value = (0, "lib/utils.ts:10:export const format = () => {};\n", "")

        # Without path_prefix
        res1 = grep_search("export const format")
        mock_run_cmd.assert_called_with(
            ["git", "grep", "-n", "-I", "-F", "-e", "export const format"]
        )
        self.assertEqual(res1, "lib/utils.ts:10:export const format = () => {};")

        # With path_prefix containing ./ prefix
        res2 = grep_search("export const format", path_prefix="./lib/")
        mock_run_cmd.assert_called_with(
            ["git", "grep", "-n", "-I", "-F", "-e", "export const format", "--", "lib/"]
        )
        self.assertEqual(res2, "lib/utils.ts:10:export const format = () => {};")

    @patch("agent_resolve.diagnostics.run_cmd")
    def test_falls_back_to_case_insensitive_grep_when_exact_fails(
        self, mock_run_cmd: MagicMock
    ) -> None:
        # First call (exact case) fails with exit code 1
        # Second call (case-insensitive fallback) succeeds
        mock_run_cmd.side_effect = [
            (1, "", ""),
            (0, "lib/utils.ts:10:export const FORMAT = () => {};\n", ""),
        ]

        res = grep_search("format", path_prefix="lib/")
        self.assertEqual(res, "lib/utils.ts:10:export const FORMAT = () => {};")
        self.assertEqual(mock_run_cmd.call_count, 2)
        mock_run_cmd.assert_called_with(
            ["git", "grep", "-n", "-I", "-i", "-F", "-e", "format", "--", "lib/"]
        )

    @patch("agent_resolve.diagnostics.run_cmd")
    def test_returns_no_matches_message_when_both_searches_fail(
        self, mock_run_cmd: MagicMock
    ) -> None:
        mock_run_cmd.side_effect = [
            (1, "", ""),
            (1, "", ""),
        ]

        res = grep_search("nonexistent_symbol")
        self.assertEqual(res, "No matches found for query 'nonexistent_symbol'.")

    @patch("agent_resolve.diagnostics.run_cmd")
    def test_truncates_results_exceeding_60_lines(
        self, mock_run_cmd: MagicMock
    ) -> None:
        lines = [f"file_{i}.ts:1:match {i}" for i in range(1, 71)]
        mock_run_cmd.return_value = (0, "\n".join(lines) + "\n", "")

        res = grep_search("match")
        result_lines = res.splitlines()

        self.assertEqual(len(result_lines), 61)
        self.assertEqual(result_lines[0], "file_1.ts:1:match 1")
        self.assertEqual(result_lines[59], "file_60.ts:1:match 60")
        self.assertEqual(result_lines[60], "... (10 more matches truncated)")


class TestFindFiles(unittest.TestCase):
    def test_returns_message_when_pattern_empty_or_whitespace(self) -> None:
        self.assertEqual(find_files(""), "No pattern provided.")
        self.assertEqual(find_files("   "), "No pattern provided.")

    @patch("agent_resolve.diagnostics.run_cmd")
    def test_wraps_plain_keyword_in_glob_and_preserves_explicit_globs(
        self, mock_run_cmd: MagicMock
    ) -> None:
        mock_run_cmd.return_value = (0, "lib/utils.ts\n", "")

        # Plain keyword wraps in *...*
        find_files("utils")
        mock_run_cmd.assert_called_with(["git", "ls-files", "*utils*"])

        # Explicit glob characters *, ?, [ preserved
        find_files("*.ts")
        mock_run_cmd.assert_called_with(["git", "ls-files", "*.ts"])

        find_files("test?.py")
        mock_run_cmd.assert_called_with(["git", "ls-files", "test?.py"])

        find_files("[a-z].ts")
        mock_run_cmd.assert_called_with(["git", "ls-files", "[a-z].ts"])

    @patch("agent_resolve.diagnostics.run_cmd")
    def test_falls_back_to_full_ls_files_substring_match(
        self, mock_run_cmd: MagicMock
    ) -> None:
        mock_run_cmd.side_effect = [
            (0, "", ""),  # glob lookup returned empty stdout
            (0, "lib/Service.ts\ncomponents/Button.tsx\napp/Page.tsx\n", ""),  # full ls-files
        ]

        res = find_files("service")
        self.assertEqual(res, "lib/Service.ts")
        self.assertEqual(mock_run_cmd.call_count, 2)
        mock_run_cmd.assert_called_with(["git", "ls-files"])

    @patch("agent_resolve.diagnostics.run_cmd")
    def test_returns_no_files_found_when_all_attempts_fail(
        self, mock_run_cmd: MagicMock
    ) -> None:
        mock_run_cmd.side_effect = [
            (1, "", "git error"),
            (0, "lib/Service.ts\ncomponents/Button.tsx\n", ""),
        ]

        res = find_files("nonexistent")
        self.assertEqual(res, "No files found matching pattern 'nonexistent'.")

    @patch("agent_resolve.diagnostics.run_cmd")
    def test_truncates_matches_exceeding_60_lines(
        self, mock_run_cmd: MagicMock
    ) -> None:
        files = [f"lib/file_{i}.ts" for i in range(1, 76)]
        mock_run_cmd.return_value = (0, "\n".join(files) + "\n", "")

        res = find_files("file")
        lines = res.splitlines()

        self.assertEqual(len(lines), 61)
        self.assertEqual(lines[0], "lib/file_1.ts")
        self.assertEqual(lines[59], "lib/file_60.ts")
        self.assertEqual(lines[60], "... (15 more matches truncated)")


class TestReadFileSnippet(unittest.TestCase):
    def setUp(self) -> None:
        self._orig_root = config.get_project_root()

    def tearDown(self) -> None:
        config.set_project_root(self._orig_root)

    def test_reads_valid_line_range_with_1_indexed_numbering(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_root = Path(tmp_dir)
            target = tmp_root / "lib" / "sample.ts"
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text("\n".join(f"line {i}" for i in range(1, 11)), encoding="utf-8")
            config.set_project_root(tmp_root)

            snippet = read_file_snippet("lib/sample.ts", start_line=2, end_line=4)
            expected = (
                "=== File: lib/sample.ts (Lines 2-4 of 10) ===\n"
                "2: line 2\n"
                "3: line 3\n"
                "4: line 4"
            )
            self.assertEqual(snippet, expected)

    def test_clamps_line_bounds_and_enforces_150_line_span_limit(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_root = Path(tmp_dir)
            target = tmp_root / "lib" / "large.ts"
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text("\n".join(f"row {i}" for i in range(1, 201)), encoding="utf-8")
            config.set_project_root(tmp_root)

            snippet = read_file_snippet("lib/large.ts", start_line=-5, end_line=500)
            lines = snippet.splitlines()

            # Header must be clamped to start=1, end=151 (1 + 150 span limit) of 200 total lines
            self.assertEqual(lines[0], "=== File: lib/large.ts (Lines 1-151 of 200) ===")
            self.assertEqual(lines[1], "1: row 1")
            self.assertEqual(lines[151], "151: row 151")
            self.assertEqual(len(lines), 152)

    def test_returns_error_message_for_protected_or_outside_repo_path(self) -> None:
        # Path traversal
        err = read_file_snippet("../../etc/passwd")
        self.assertIn("Error resolving path '../../etc/passwd':", err)
        self.assertIn("Path traversal attempt blocked", err)

        # Protected file
        err_prot = read_file_snippet("supabase/migrations/20261014_init.sql")
        self.assertIn("Error resolving path 'supabase/migrations/20261014_init.sql':", err_prot)
        self.assertIn("Modification of protected file blocked", err_prot)

    def test_returns_not_found_message_when_file_missing_or_directory(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_root = Path(tmp_dir)
            (tmp_root / "lib").mkdir(parents=True, exist_ok=True)
            config.set_project_root(tmp_root)

            # File does not exist
            missing = read_file_snippet("lib/nonexistent.ts")
            self.assertEqual(missing, "File 'lib/nonexistent.ts' does not exist on disk.")

            # Path is a directory
            is_dir = read_file_snippet("lib")
            self.assertEqual(is_dir, "File 'lib' does not exist on disk.")

    def test_handles_file_read_exception_gracefully(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_root = Path(tmp_dir)
            target = tmp_root / "lib" / "error.ts"
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text("content", encoding="utf-8")
            config.set_project_root(tmp_root)

            with patch.object(Path, "read_text", side_effect=OSError("Disk read failure")):
                res = read_file_snippet("lib/error.ts")
                self.assertEqual(res, "Error reading file 'lib/error.ts': Disk read failure")


class TestParseIssueDiagnostics(unittest.TestCase):
    def test_extracts_target_files_and_root_cause_from_markdown_headings(self) -> None:
        body = """
        ### Problem Description
        Dates are formatted improperly on profile pages.

        ### Target Files
        - `lib/utils/format.ts`
        - components/UserProfile.tsx

        ### Root Cause
        The local timezone offset is not normalized before date display.
        """
        files, root_cause = parse_issue_diagnostics(body)

        self.assertEqual(files, ["lib/utils/format.ts", "components/UserProfile.tsx"])
        self.assertIn("### Root Cause", root_cause)
        self.assertIn("The local timezone offset is not normalized", root_cause)

    def test_supports_bold_section_headers_and_suspected_components_alias(self) -> None:
        body1 = """
        **Suspected Components**
        * `lib/service.ts`

        **Root Cause**
        Cache entry expiry missing.
        """
        files1, root_cause1 = parse_issue_diagnostics(body1)
        self.assertEqual(files1, ["lib/service.ts"])
        self.assertIn("**Root Cause", root_cause1)
        self.assertIn("Cache entry expiry missing.", root_cause1)

        body2 = """
        ### Target Files & Suspected Components
        - `app/api/route.ts`

        ### Root Cause
        Missing route handler return.
        """
        files2, _ = parse_issue_diagnostics(body2)
        self.assertEqual(files2, ["app/api/route.ts"])

    def test_falls_back_to_full_body_scan_when_target_section_absent(self) -> None:
        body = """
        We found a crash when calling `lib/auth/session.ts` from components/Navbar.tsx.
        Please check if the authentication token has expired.
        """
        files, root_cause = parse_issue_diagnostics(body)
        self.assertEqual(files, ["lib/auth/session.ts", "components/Navbar.tsx"])
        self.assertEqual(root_cause, "")

    def test_deduplicates_files_and_strips_quotes_and_commas(self) -> None:
        body = """
        ### Target Files
        - 'lib/utils.ts',
        - "lib/utils.ts"
        - `lib/utils.ts`
        - lib/service.ts
        """
        files, _ = parse_issue_diagnostics(body)
        self.assertEqual(files, ["lib/utils.ts", "lib/service.ts"])

    def test_returns_empty_defaults_when_no_files_or_root_cause_present(self) -> None:
        body = "A general bug report without any file mentions or structured sections."
        files, root_cause = parse_issue_diagnostics(body)
        self.assertEqual(files, [])
        self.assertEqual(root_cause, "")


if __name__ == "__main__":
    unittest.main()
