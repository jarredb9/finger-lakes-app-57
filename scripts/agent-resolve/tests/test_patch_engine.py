"""
Unit tests for `agent_resolve.patch_engine` (TDD Red Phase).
"""

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import MagicMock, call, patch

import agent_resolve
from agent_resolve import config
from agent_resolve.models import PatchChunk, PatchManifest
from agent_resolve.patch_engine import (
    apply_patch_manifest,
    reset_target_sources,
    safe_resolve_repo_path,
)


class TestSafeResolveRepoPath(unittest.TestCase):
    def setUp(self) -> None:
        self._orig_root = config.get_project_root()
        self.tmp_dir = TemporaryDirectory()
        self.root = Path(self.tmp_dir.name).resolve()
        config.set_project_root(self.root)

    def tearDown(self) -> None:
        config.set_project_root(self._orig_root)
        self.tmp_dir.cleanup()

    def test_resolves_valid_relative_path_within_repo(self) -> None:
        resolved = safe_resolve_repo_path("lib/utils.ts")
        self.assertEqual(resolved, (self.root / "lib/utils.ts").resolve())

    def test_normalizes_leading_dot_slash(self) -> None:
        resolved = safe_resolve_repo_path("./components/Widget.tsx")
        self.assertEqual(resolved, (self.root / "components/Widget.tsx").resolve())

    def test_blocks_path_traversal_attempts(self) -> None:
        traversals = [
            "../../etc/passwd",
            "../outside.txt",
            "lib/../../outside.txt",
            "/etc/passwd",
        ]
        for bad_path in traversals:
            with self.subTest(path=bad_path):
                with self.assertRaises(ValueError) as ctx:
                    safe_resolve_repo_path(bad_path)
                self.assertIn("Path traversal attempt blocked", str(ctx.exception))

    def test_blocks_supabase_migrations_sec04(self) -> None:
        blocked_paths = [
            "supabase/migrations",
            "supabase/migrations/20261014_init.sql",
            "./supabase/migrations/20261015_patch.sql",
        ]
        for p in blocked_paths:
            with self.subTest(path=p):
                with self.assertRaises(ValueError) as ctx:
                    safe_resolve_repo_path(p)
                self.assertIn("Modification of protected file blocked", str(ctx.exception))

    def test_blocks_git_directory(self) -> None:
        blocked_paths = [
            ".git",
            ".git/config",
            ".git/HEAD",
            "./.git/refs/heads/main",
        ]
        for p in blocked_paths:
            with self.subTest(path=p):
                with self.assertRaises(ValueError) as ctx:
                    safe_resolve_repo_path(p)
                self.assertIn("Modification of protected file blocked", str(ctx.exception))

    def test_blocks_github_workflows(self) -> None:
        blocked_paths = [
            ".github/workflows",
            ".github/workflows/ci.yml",
            "./.github/workflows/deploy.yml",
        ]
        for p in blocked_paths:
            with self.subTest(path=p):
                with self.assertRaises(ValueError) as ctx:
                    safe_resolve_repo_path(p)
                self.assertIn("Modification of protected file blocked", str(ctx.exception))

    def test_blocks_agent_resolve_scripts(self) -> None:
        blocked_paths = [
            "scripts/agent-resolve.py",
            "scripts/agent-resolve",
            "scripts/agent-resolve/patch_engine.py",
            "./scripts/agent-resolve.py",
            "./scripts/agent-resolve/config.py",
        ]
        for p in blocked_paths:
            with self.subTest(path=p):
                with self.assertRaises(ValueError) as ctx:
                    safe_resolve_repo_path(p)
                self.assertIn("Modification of protected file blocked", str(ctx.exception))

    def test_respects_dynamically_configured_project_root(self) -> None:
        with TemporaryDirectory() as custom_dir:
            custom_root = Path(custom_dir).resolve()
            config.set_project_root(custom_root)

            resolved = safe_resolve_repo_path("src/index.ts")
            self.assertEqual(resolved, (custom_root / "src/index.ts").resolve())

            # Paths resolving to the previous root must now be blocked as traversals
            prev_root_file = str(self.root / "src/index.ts")
            with self.assertRaises(ValueError) as ctx:
                safe_resolve_repo_path(prev_root_file)
            self.assertIn("Path traversal attempt blocked", str(ctx.exception))


class TestResetTargetSources(unittest.TestCase):
    def setUp(self) -> None:
        self._orig_root = config.get_project_root()
        self.tmp_dir = TemporaryDirectory()
        self.root = Path(self.tmp_dir.name).resolve()
        config.set_project_root(self.root)

    def tearDown(self) -> None:
        config.set_project_root(self._orig_root)
        self.tmp_dir.cleanup()

    @patch("agent_resolve.patch_engine.run_cmd")
    def test_resets_tracked_modified_files_via_git_checkout(self, mock_run_cmd: MagicMock) -> None:
        target_file = self.root / "lib" / "tracked.ts"
        target_file.parent.mkdir(parents=True, exist_ok=True)
        target_file.write_text("// modified content\n", encoding="utf-8")

        mock_run_cmd.return_value = (0, "", "")

        reset_target_sources(["lib/tracked.ts"], baseline_ref="HEAD")

        mock_run_cmd.assert_has_calls([
            call(["git", "cat-file", "-e", "HEAD:lib/tracked.ts"]),
            call(["git", "checkout", "HEAD", "--", "lib/tracked.ts"]),
        ])
        self.assertTrue(target_file.exists())

    @patch("agent_resolve.patch_engine.run_cmd")
    def test_unlinks_newly_created_untracked_files(self, mock_run_cmd: MagicMock) -> None:
        target_file = self.root / "lib" / "untracked.ts"
        target_file.parent.mkdir(parents=True, exist_ok=True)
        target_file.write_text("// untracked content\n", encoding="utf-8")

        # git cat-file fails (exit code 1) because file does not exist in baseline_ref
        mock_run_cmd.return_value = (1, "", "fatal: Not a valid object name")

        reset_target_sources(["lib/untracked.ts"], baseline_ref="HEAD")

        mock_run_cmd.assert_called_once_with(["git", "cat-file", "-e", "HEAD:lib/untracked.ts"])
        self.assertFalse(target_file.exists())

    @patch("agent_resolve.patch_engine.run_cmd")
    def test_handles_mixed_tracked_and_untracked_files(self, mock_run_cmd: MagicMock) -> None:
        tracked_file = self.root / "lib" / "tracked.ts"
        untracked_file = self.root / "lib" / "untracked.ts"
        tracked_file.parent.mkdir(parents=True, exist_ok=True)
        tracked_file.write_text("// tracked content\n", encoding="utf-8")
        untracked_file.write_text("// untracked content\n", encoding="utf-8")

        def side_effect(cmd: list[str], **kwargs) -> tuple[int, str, str]:
            if cmd[:3] == ["git", "cat-file", "-e"]:
                if cmd[3].endswith("lib/tracked.ts"):
                    return (0, "", "")
                return (1, "", "fatal: not in ref")
            if cmd[:3] == ["git", "checkout", "origin/main"]:
                return (0, "", "")
            return (0, "", "")

        mock_run_cmd.side_effect = side_effect

        reset_target_sources(["lib/tracked.ts", "lib/untracked.ts"], baseline_ref="origin/main")

        self.assertFalse(untracked_file.exists())
        self.assertTrue(tracked_file.exists())
        mock_run_cmd.assert_has_calls([
            call(["git", "cat-file", "-e", "origin/main:lib/tracked.ts"]),
            call(["git", "cat-file", "-e", "origin/main:lib/untracked.ts"]),
            call(["git", "checkout", "origin/main", "--", "lib/tracked.ts"]),
        ])

    @patch("agent_resolve.patch_engine.run_cmd")
    def test_gracefully_skips_invalid_paths(self, mock_run_cmd: MagicMock) -> None:
        invalid_sources = [
            "../../outside.txt",
            "supabase/migrations/20261014_init.sql",
        ]
        reset_target_sources(invalid_sources, baseline_ref="HEAD")
        mock_run_cmd.assert_not_called()

    @patch("agent_resolve.patch_engine.run_cmd")
    def test_no_op_for_empty_target_list(self, mock_run_cmd: MagicMock) -> None:
        reset_target_sources([], baseline_ref="HEAD")
        mock_run_cmd.assert_not_called()


class TestApplyPatchManifest(unittest.TestCase):
    def setUp(self) -> None:
        self._orig_root = config.get_project_root()
        self.tmp_dir = TemporaryDirectory()
        self.root = Path(self.tmp_dir.name).resolve()
        config.set_project_root(self.root)

    def tearDown(self) -> None:
        config.set_project_root(self._orig_root)
        self.tmp_dir.cleanup()

    def test_tier1_exact_match_success(self) -> None:
        target = self.root / "components" / "Widget.tsx"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("export function Widget() {\n  return <div>Original</div>;\n}\n", encoding="utf-8")

        manifest = PatchManifest(
            patches=[
                PatchChunk(
                    file_path="components/Widget.tsx",
                    search_block="  return <div>Original</div>;",
                    replace_block="  return <div>Updated</div>;",
                )
            ]
        )

        success, errors = apply_patch_manifest(manifest)
        self.assertTrue(success, f"Expected success but got errors: {errors}")
        self.assertEqual(len(errors), 0)
        self.assertIn("<div>Updated</div>", target.read_text(encoding="utf-8"))

    def test_tier2_whitespace_trimmed_fallback(self) -> None:
        target = self.root / "lib" / "service.ts"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(
            "export const compute = () => {\n"
            "    const a = 1;\n"
            "    const b = 2;\n"
            "    return a + b;\n"
            "};\n",
            encoding="utf-8",
        )

        # Search block with 2-space indentation instead of 4-space
        manifest = PatchManifest(
            patches=[
                PatchChunk(
                    file_path="lib/service.ts",
                    search_block="  const a = 1;\n  const b = 2;\n  return a + b;",
                    replace_block="    const a = 10;\n    const b = 20;\n    return a * b;",
                )
            ]
        )

        success, errors = apply_patch_manifest(manifest)
        self.assertTrue(success, f"Expected Tier 2 success but got errors: {errors}")
        content = target.read_text(encoding="utf-8")
        self.assertIn("return a * b;", content)
        self.assertIn("const a = 10;", content)

    def test_crlf_normalization(self) -> None:
        target = self.root / "lib" / "windows.ts"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("function test() {\r\n  return true;\r\n}\r\n", encoding="utf-8")

        manifest = PatchManifest(
            patches=[
                PatchChunk(
                    file_path="lib/windows.ts",
                    search_block="function test() {\n  return true;\n}",
                    replace_block="function test() {\n  return false;\n}",
                )
            ]
        )

        success, errors = apply_patch_manifest(manifest)
        self.assertTrue(success, f"Expected CRLF normalization success: {errors}")
        self.assertIn("return false;", target.read_text(encoding="utf-8"))

    def test_clean_error_formatting_without_line_number_pollution(self) -> None:
        target = self.root / "lib" / "file.ts"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("line 1\nline 2\nline 3\n", encoding="utf-8")

        manifest = PatchManifest(
            patches=[
                PatchChunk(
                    file_path="lib/file.ts",
                    search_block="nonexistent content",
                    replace_block="replacement",
                )
            ]
        )

        success, errors = apply_patch_manifest(manifest)
        self.assertFalse(success)
        self.assertGreater(len(errors), 0)
        # Ensure no '  L1:' line number pollution in error feedback
        for err in errors:
            self.assertNotIn("  L1: ", err)
            self.assertNotIn("  L2: ", err)
            self.assertIn("search_block NOT FOUND", err)
            self.assertIn("nonexistent content", err)

    def test_ambiguous_exact_matches_rejected(self) -> None:
        target = self.root / "lib" / "repeat.ts"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("item();\nitem();\n", encoding="utf-8")

        manifest = PatchManifest(
            patches=[
                PatchChunk(
                    file_path="lib/repeat.ts",
                    search_block="item();",
                    replace_block="replacement();",
                )
            ]
        )

        success, errors = apply_patch_manifest(manifest)
        self.assertFalse(success)
        self.assertTrue(any("matched 2 exact locations" in e or "matched 2" in e for e in errors))

    def test_ambiguous_whitespace_trimmed_matches_rejected(self) -> None:
        target = self.root / "lib" / "repeat_space.ts"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("  const x = 1;\n    const x = 1;\n", encoding="utf-8")

        # 5 spaces indentation (exact count == 0, stripped count == 2)
        manifest = PatchManifest(
            patches=[
                PatchChunk(
                    file_path="lib/repeat_space.ts",
                    search_block="     const x = 1;",
                    replace_block="     const x = 2;",
                )
            ]
        )

        success, errors = apply_patch_manifest(manifest)
        self.assertFalse(success)
        self.assertTrue(
            any("matched 2 locations using whitespace-insensitive matching" in e for e in errors)
        )

    def test_new_file_creation_empty_search_block(self) -> None:
        manifest = PatchManifest(
            patches=[
                PatchChunk(
                    file_path="lib/brand_new.ts",
                    search_block="",
                    replace_block="export const BRAND_NEW = true;\n",
                )
            ]
        )

        success, errors = apply_patch_manifest(manifest, new_src_files=["lib/brand_new.ts"])
        self.assertTrue(success, f"Failed to create new file: {errors}")
        created = self.root / "lib" / "brand_new.ts"
        self.assertTrue(created.exists())
        self.assertEqual(created.read_text(encoding="utf-8"), "export const BRAND_NEW = true;\n")

    def test_rejects_empty_search_block_on_existing_file_not_in_new_src(self) -> None:
        target = self.root / "lib" / "existing.ts"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("initial content\n", encoding="utf-8")

        manifest = PatchManifest(
            patches=[
                PatchChunk(
                    file_path="lib/existing.ts",
                    search_block="",
                    replace_block="overwritten content\n",
                )
            ]
        )

        success, errors = apply_patch_manifest(manifest, new_src_files=None)
        self.assertFalse(success)
        self.assertTrue(
            any("Empty search_block is only allowed when creating brand new files" in e for e in errors)
        )
        self.assertEqual(target.read_text(encoding="utf-8"), "initial content\n")

    def test_rejects_non_empty_search_block_on_missing_file(self) -> None:
        manifest = PatchManifest(
            patches=[
                PatchChunk(
                    file_path="lib/missing.ts",
                    search_block="some content",
                    replace_block="replaced content",
                )
            ]
        )

        success, errors = apply_patch_manifest(manifest)
        self.assertFalse(success)
        self.assertTrue(
            any("does not exist on disk" in e for e in errors)
        )

    def test_atomicity_no_files_written_when_any_patch_fails(self) -> None:
        file_a = self.root / "lib" / "file_a.ts"
        file_a.parent.mkdir(parents=True, exist_ok=True)
        file_a.write_text("original a\n", encoding="utf-8")

        # Patch 1 is valid, Patch 2 targets a missing file with a search block
        manifest = PatchManifest(
            patches=[
                PatchChunk(
                    file_path="lib/file_a.ts",
                    search_block="original a",
                    replace_block="updated a",
                ),
                PatchChunk(
                    file_path="lib/nonexistent.ts",
                    search_block="missing",
                    replace_block="replacement",
                ),
            ]
        )

        success, errors = apply_patch_manifest(manifest)
        self.assertFalse(success)
        self.assertGreater(len(errors), 0)
        # file_a must NOT have been updated on disk
        self.assertEqual(file_a.read_text(encoding="utf-8"), "original a\n")

    def test_sequential_patches_to_same_file(self) -> None:
        target = self.root / "lib" / "sequential.ts"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("alpha\nbeta\ngamma\n", encoding="utf-8")

        manifest = PatchManifest(
            patches=[
                PatchChunk(
                    file_path="lib/sequential.ts",
                    search_block="alpha",
                    replace_block="ALPHA",
                ),
                PatchChunk(
                    file_path="lib/sequential.ts",
                    search_block="beta",
                    replace_block="BETA",
                ),
            ]
        )

        success, errors = apply_patch_manifest(manifest)
        self.assertTrue(success, f"Sequential patch failed: {errors}")
        self.assertEqual(target.read_text(encoding="utf-8"), "ALPHA\nBETA\ngamma\n")

    def test_invalid_path_in_patch_rejected(self) -> None:
        manifest = PatchManifest(
            patches=[
                PatchChunk(
                    file_path="supabase/migrations/20261014_init.sql",
                    search_block="foo",
                    replace_block="bar",
                )
            ]
        )

        success, errors = apply_patch_manifest(manifest)
        self.assertFalse(success)
        self.assertTrue(any("invalid file path" in e or "blocked" in e for e in errors))

    def test_allowed_files_rejects_unallowed_file(self) -> None:
        target = self.root / "lib" / "unallowed.ts"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("initial content\n", encoding="utf-8")

        manifest = PatchManifest(
            patches=[
                PatchChunk(
                    file_path="lib/unallowed.ts",
                    search_block="initial content",
                    replace_block="changed content",
                )
            ]
        )

        allowed_files = ["lib/allowed.ts"]
        success, errors = apply_patch_manifest(manifest, allowed_files=allowed_files)
        self.assertFalse(success)
        self.assertTrue(
            any("rejected: file is not in allowed target files ['lib/allowed.ts']" in e for e in errors),
            f"Unexpected errors: {errors}",
        )
        self.assertEqual(target.read_text(encoding="utf-8"), "initial content\n")

    def test_allowed_files_permits_whitelisted_file(self) -> None:
        target = self.root / "lib" / "allowed.ts"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("initial content\n", encoding="utf-8")

        manifest = PatchManifest(
            patches=[
                PatchChunk(
                    file_path="lib/allowed.ts",
                    search_block="initial content",
                    replace_block="changed content",
                )
            ]
        )

        allowed_files = ["lib/allowed.ts"]
        success, errors = apply_patch_manifest(manifest, allowed_files=allowed_files)
        self.assertTrue(success, f"Failed with errors: {errors}")
        self.assertEqual(target.read_text(encoding="utf-8"), "changed content\n")

    def test_allowed_files_normalizes_relative_dot_slash_paths(self) -> None:
        target = self.root / "lib" / "allowed.ts"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("initial content\n", encoding="utf-8")

        # Case 1: allowed_files has leading ./ but patch does not
        manifest1 = PatchManifest(
            patches=[
                PatchChunk(
                    file_path="lib/allowed.ts",
                    search_block="initial content\n",
                    replace_block="v1\n",
                )
            ]
        )
        success1, errors1 = apply_patch_manifest(manifest1, allowed_files=["./lib/allowed.ts"])
        self.assertTrue(success1, f"Failed case 1 with errors: {errors1}")
        self.assertEqual(target.read_text(encoding="utf-8"), "v1\n")

        # Case 2: patch has leading ./ but allowed_files does not
        manifest2 = PatchManifest(
            patches=[
                PatchChunk(
                    file_path="./lib/allowed.ts",
                    search_block="v1\n",
                    replace_block="v2\n",
                )
            ]
        )
        success2, errors2 = apply_patch_manifest(manifest2, allowed_files=["lib/allowed.ts"])
        self.assertTrue(success2, f"Failed case 2 with errors: {errors2}")
        self.assertEqual(target.read_text(encoding="utf-8"), "v2\n")

    def test_allowed_files_none_permits_any_valid_repo_file(self) -> None:
        target = self.root / "lib" / "file.ts"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("initial content\n", encoding="utf-8")

        manifest = PatchManifest(
            patches=[
                PatchChunk(
                    file_path="lib/file.ts",
                    search_block="initial content",
                    replace_block="changed content",
                )
            ]
        )

        success, errors = apply_patch_manifest(manifest, allowed_files=None)
        self.assertTrue(success, f"Failed with errors: {errors}")
        self.assertEqual(target.read_text(encoding="utf-8"), "changed content\n")
