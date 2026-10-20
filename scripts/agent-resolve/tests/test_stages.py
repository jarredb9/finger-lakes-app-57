"""
Unit tests for `agent_resolve.stages` (TDD Red Phase).
"""

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import MagicMock, call, patch

import agent_resolve
from agent_resolve import config
from agent_resolve.exceptions import Stage2CompilationError
from agent_resolve.models import (
    BlueprintPlan,
    DiagnosticAction,
    DiagnosticResult,
    PatchChunk,
    PatchManifest,
    SourceStubEntry,
    TestFileEntry,
    TestFileManifest,
)
from agent_resolve.tracker import TokenTracker

# Modular imports under test (TDD Red Phase: raises ModuleNotFoundError until Phase 5 Task 2)
from agent_resolve.stages import (
    stage_0_diagnose,
    stage_1_plan,
    stage_2_red,
    stage_3_green,
)


class TestStage0Diagnose(unittest.TestCase):
    def setUp(self) -> None:
        self.orig_root = config.get_project_root()
        self.temp_dir = TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        config.set_project_root(self.root)
        self.client = MagicMock()
        self.tracker = TokenTracker()

    def tearDown(self) -> None:
        config.set_project_root(self.orig_root)
        self.temp_dir.cleanup()

    def test_verifies_explicit_files_on_disk_without_llm_calls(self) -> None:
        geo_path = self.root / "lib" / "utils" / "geo.ts"
        geo_path.parent.mkdir(parents=True, exist_ok=True)
        geo_path.write_text("export const clamp = () => {};\n", encoding="utf-8")

        issue_body = (
            "### Target Files & Suspected Components\n"
            "- `lib/utils/geo.ts`\n\n"
            "### Root Cause\n"
            "Clamp coordinates."
        )

        with patch.object(agent_resolve, "call_gemini_with_fallback") as mock_gemini:
            res = stage_0_diagnose(self.client, "Fix geo clamping", issue_body, self.tracker)
            mock_gemini.assert_not_called()

        self.assertEqual(res.target_files, ["lib/utils/geo.ts"])
        self.assertIn("lib/utils/geo.ts", res.code_snippets)
        self.assertIn("=== File: lib/utils/geo.ts", res.code_snippets["lib/utils/geo.ts"])
        self.assertIn("Clamp coordinates.", res.root_cause)

    def test_falls_back_to_find_files_when_explicit_file_missing_on_disk(self) -> None:
        marker_path = self.root / "components" / "map" / "WineryMarker.tsx"
        marker_path.parent.mkdir(parents=True, exist_ok=True)
        marker_path.write_text("export const WineryMarker = () => null;\n", encoding="utf-8")

        issue_body = (
            "### Target Files\n"
            "- `legacy/WineryMarker.tsx`\n"
        )

        with patch.object(
            agent_resolve, "find_files", return_value="components/map/WineryMarker.tsx\n"
        ) as mock_find, patch.object(
            agent_resolve, "call_gemini_with_fallback"
        ) as mock_gemini:
            res = stage_0_diagnose(self.client, "Fix marker", issue_body, self.tracker)
            mock_find.assert_called_with("WineryMarker.tsx")
            mock_gemini.assert_not_called()

        self.assertIn("components/map/WineryMarker.tsx", res.target_files)
        self.assertIn("components/map/WineryMarker.tsx", res.code_snippets)

    def test_logs_error_and_falls_back_to_loop_when_explicit_path_protected(self) -> None:
        issue_body = (
            "### Target Files\n"
            "- `supabase/migrations/001.sql`\n"
        )

        conclude_action = DiagnosticAction(
            action="conclude",
            reasoning="Protected file bypassed and investigation complete",
            discovered_target_files=[],
        )

        with patch.object(
            agent_resolve, "call_gemini_with_fallback", return_value=conclude_action
        ) as mock_gemini:
            res = stage_0_diagnose(self.client, "DB fix", issue_body, self.tracker)
            self.assertEqual(mock_gemini.call_count, 1)

        self.assertIn(
            "Could not resolve explicit file 'supabase/migrations/001.sql'",
            res.investigation_summary,
        )
        self.assertIn(
            "Concluded diagnosis at step 1: Protected file bypassed and investigation complete",
            res.investigation_summary,
        )

    def test_iterative_loop_executes_tools_and_concludes(self) -> None:
        winery_path = self.root / "lib" / "winery.ts"
        winery_path.parent.mkdir(parents=True, exist_ok=True)
        winery_path.write_text("export function standardizeWineryData() {}\n", encoding="utf-8")

        actions = [
            DiagnosticAction(
                action="grep_search",
                query="standardizeWineryData",
                path_prefix="lib/",
                reasoning="Search standardizer",
            ),
            DiagnosticAction(
                action="find_files",
                pattern="*winery*",
                reasoning="Find winery modules",
            ),
            DiagnosticAction(
                action="read_file_snippet",
                file_path="lib/winery.ts",
                start_line=1,
                end_line=20,
                reasoning="Read winery module",
            ),
            DiagnosticAction(
                action="conclude",
                reasoning="Root cause identified",
                discovered_target_files=["lib/winery.ts"],
            ),
        ]

        with patch.object(
            agent_resolve, "call_gemini_with_fallback", side_effect=actions
        ) as mock_gemini, patch.object(
            agent_resolve,
            "grep_search",
            return_value="lib/winery.ts:1:export function standardizeWineryData()",
        ) as mock_grep, patch.object(
            agent_resolve, "find_files", return_value="lib/winery.ts\n"
        ) as mock_find:
            res = stage_0_diagnose(self.client, "Refactor winery", "No files specified", self.tracker)
            mock_grep.assert_called_once_with("standardizeWineryData", "lib/")
            mock_find.assert_called_once_with("*winery*")
            self.assertEqual(mock_gemini.call_count, 4)

        self.assertIn("lib/winery.ts", res.target_files)
        self.assertIn("lib/winery.ts", res.code_snippets)
        self.assertIn("Concluded diagnosis at step 4: Root cause identified", res.investigation_summary)

    def test_iterative_loop_stops_at_max_5_tool_calls(self) -> None:
        always_grep = DiagnosticAction(
            action="grep_search",
            query="missing",
            reasoning="Still exploring",
        )

        with patch.object(
            agent_resolve, "call_gemini_with_fallback", return_value=always_grep
        ) as mock_gemini, patch.object(
            agent_resolve, "grep_search", return_value="No matches found"
        ):
            res = stage_0_diagnose(self.client, "Unresolvable issue", "No context", self.tracker)
            self.assertEqual(mock_gemini.call_count, 5)

        self.assertEqual(res.target_files, [])


class TestStage1Plan(unittest.TestCase):
    def setUp(self) -> None:
        self.orig_root = config.get_project_root()
        self.temp_dir = TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        config.set_project_root(self.root)
        self.client = MagicMock()
        self.tracker = TokenTracker()

    def tearDown(self) -> None:
        config.set_project_root(self.orig_root)
        self.temp_dir.cleanup()

    def test_generates_blueprint_writes_task_plan_and_discovers_blast_radius(self) -> None:
        primary_src = self.root / "components" / "Primary.tsx"
        primary_src.parent.mkdir(parents=True, exist_ok=True)
        primary_src.write_text("export const Primary = () => null;\n", encoding="utf-8")

        mock_blueprint = BlueprintPlan(
            scope="winery",
            target_test_files=["components/__tests__/Primary.test.tsx"],
            target_src_files=["components/Primary.tsx"],
            plan_markdown="# Blueprint Plan\nDetailed architectural plan.",
        )

        with patch.object(
            agent_resolve, "get_project_context", return_value="PROJECT_CONTEXT"
        ), patch.object(
            agent_resolve,
            "find_related_test_files",
            return_value=[
                "components/__tests__/Dependent.test.tsx",
                "components/__tests__/Primary.test.tsx",
            ],
        ) as mock_blast, patch.object(
            agent_resolve, "call_gemini_with_fallback", return_value=mock_blueprint
        ) as mock_gemini:
            blueprint = stage_1_plan(self.client, 42, "Refactor Primary", "Body", self.tracker)
            mock_blast.assert_called_once_with(["components/Primary.tsx"])
            mock_gemini.assert_called_once()

        self.assertEqual(
            blueprint.target_test_files,
            [
                "components/__tests__/Primary.test.tsx",
            ],
        )
        self.assertEqual(
            blueprint.blast_radius_test_files,
            [
                "components/__tests__/Dependent.test.tsx",
            ],
        )
        task_plan_file = self.root / "task-plan.md"
        self.assertTrue(task_plan_file.exists())
        self.assertEqual(
            task_plan_file.read_text(encoding="utf-8"),
            "# Blueprint Plan\nDetailed architectural plan.",
        )

    def test_includes_negative_feedback_and_diagnostic_findings_in_prompt(self) -> None:
        dummy_blueprint = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/__tests__/a.test.ts"],
            target_src_files=["lib/a.ts"],
            plan_markdown="# Plan",
        )

        diagnostic = DiagnosticResult(
            target_files=["lib/a.ts"],
            root_cause="Missing null guard on item",
            code_snippets={"lib/a.ts": "1: const x = 1;\n"},
            investigation_summary="Step 1 read file",
        )

        with patch.object(
            agent_resolve, "get_project_context", return_value="CONTEXT"
        ), patch.object(
            agent_resolve, "find_related_test_files", return_value=[]
        ), patch.object(
            agent_resolve, "call_gemini_with_fallback", return_value=dummy_blueprint
        ) as mock_gemini:
            stage_1_plan(
                self.client,
                42,
                "Fix item crash",
                "Body",
                self.tracker,
                negative_feedback="TS2322 type mismatch",
                diagnostic_result=diagnostic,
            )

        prompt_text = mock_gemini.call_args[0][1]
        self.assertIn("### PREVIOUS ARCHITECTURAL ATTEMPT FAILED WITH COMPILER/RED-PHASE ERRORS:", prompt_text)
        self.assertIn("TS2322 type mismatch", prompt_text)
        self.assertIn("### STAGE 0 DIAGNOSTIC INVESTIGATION FINDINGS:", prompt_text)
        self.assertIn("Missing null guard on item", prompt_text)
        self.assertIn("// lib/a.ts", prompt_text)

    def test_rejects_protected_paths_in_blueprint_files(self) -> None:
        bad_blueprint = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/__tests__/a.test.ts"],
            target_src_files=["supabase/migrations/2026_bad.sql"],
            plan_markdown="# Plan",
        )

        with patch.object(
            agent_resolve, "get_project_context", return_value="CONTEXT"
        ), patch.object(
            agent_resolve, "find_related_test_files", return_value=[]
        ), patch.object(
            agent_resolve, "call_gemini_with_fallback", return_value=bad_blueprint
        ):
            with self.assertRaises(ValueError) as ctx:
                stage_1_plan(self.client, 42, "Bad migration", "Body", self.tracker)

        self.assertIn("Modification of protected file blocked", str(ctx.exception))

    def test_stage_1_populates_blast_radius_without_mutating_target_test_files(self) -> None:
        src = self.root / "lib" / "utils" / "format.ts"
        src.parent.mkdir(parents=True, exist_ok=True)
        src.write_text("export const format = () => '';\n", encoding="utf-8")

        mock_blueprint = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/utils/__tests__/format.test.ts"],
            target_src_files=["lib/utils/format.ts"],
            plan_markdown="# Plan",
        )

        with patch.object(
            agent_resolve, "get_project_context", return_value="CONTEXT"
        ), patch.object(
            agent_resolve,
            "find_related_test_files",
            return_value=[
                "lib/utils/__tests__/format.test.ts",
                "components/__tests__/Dependent.test.tsx",
            ],
        ), patch.object(
            agent_resolve, "call_gemini_with_fallback", return_value=mock_blueprint
        ):
            blueprint = stage_1_plan(self.client, 42, "Format issue", "Body", self.tracker)

        self.assertEqual(blueprint.target_test_files, ["lib/utils/__tests__/format.test.ts"])
        self.assertEqual(blueprint.blast_radius_test_files, ["components/__tests__/Dependent.test.tsx"])


class TestStage2Red(unittest.TestCase):
    def setUp(self) -> None:
        self.orig_root = config.get_project_root()
        self.temp_dir = TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        config.set_project_root(self.root)
        self.client = MagicMock()
        self.tracker = TokenTracker()

    def tearDown(self) -> None:
        config.set_project_root(self.orig_root)
        self.temp_dir.cleanup()

    def test_raises_runtime_error_when_target_test_files_empty(self) -> None:
        bp = BlueprintPlan(
            scope="winery",
            target_test_files=[],
            target_src_files=["lib/a.ts"],
            plan_markdown="# Plan",
        )
        with self.assertRaises(RuntimeError) as ctx:
            stage_2_red(self.client, 42, "Empty tests", bp, self.tracker)

        self.assertIn("No target test files specified in architectural blueprint", str(ctx.exception))

    def test_writes_tests_scaffolds_stubs_passes_gates_and_commits(self) -> None:
        (self.root / "task-plan.md").write_text("# Plan", encoding="utf-8")

        bp = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/__tests__/new.test.ts"],
            target_src_files=["lib/stubbed.ts", "lib/unstubbed.ts"],
            plan_markdown="# Plan",
        )

        manifest = TestFileManifest(
            files=[
                TestFileEntry(
                    file_path="lib/__tests__/new.test.ts",
                    content="describe('new', () => { it('fails', () => { expect(true).toBe(false); }); });",
                )
            ],
            source_stubs=[
                SourceStubEntry(
                    file_path="lib/stubbed.ts",
                    content="export const fn = () => { throw new Error('Not implemented'); };",
                )
            ],
        )

        with patch.object(
            agent_resolve, "get_project_context", return_value="CONTEXT"
        ), patch.object(
            agent_resolve, "call_gemini_with_fallback", return_value=manifest
        ), patch.object(
            agent_resolve,
            "run_isolated_test",
            side_effect=[(0, "", ""), (1, '{"numFailedTests": 1}', "")],
        ), patch.object(
            agent_resolve, "validate_jest_red_phase", return_value=(True, "Valid assertion failure")
        ), patch.object(
            agent_resolve, "run_cmd", return_value=(0, "", "")
        ) as mock_cmd:
            stage_2_red(self.client, 42, "New feature", bp, self.tracker)

        self.assertTrue((self.root / "lib" / "stubbed.ts").exists())
        self.assertIn("Not implemented", (self.root / "lib" / "stubbed.ts").read_text())
        self.assertTrue((self.root / "lib" / "unstubbed.ts").exists())
        self.assertEqual((self.root / "lib" / "unstubbed.ts").read_text(), "export {};\n")
        self.assertTrue((self.root / "lib" / "__tests__" / "new.test.ts").exists())

        mock_cmd.assert_has_calls([
            call(
                ["git", "add", "lib/__tests__/new.test.ts", "lib/stubbed.ts", "lib/unstubbed.ts"],
                check=True,
            ),
            call(
                ["git", "commit", "-m", "test(winery): Add failing tests for Issue #42"],
                check=True,
            ),
        ])

    def test_retries_when_pre_existing_describe_suite_dropped(self) -> None:
        (self.root / "task-plan.md").write_text("# Plan", encoding="utf-8")
        test_file = self.root / "lib" / "__tests__" / "existing.test.ts"
        test_file.parent.mkdir(parents=True, exist_ok=True)
        test_file.write_text("describe('SuiteA', () => {});\ndescribe('SuiteB', () => {});\n", encoding="utf-8")

        bp = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/__tests__/existing.test.ts"],
            target_src_files=["lib/existing.ts"],
            plan_markdown="# Plan",
        )

        manifest_dropped = TestFileManifest(
            files=[
                TestFileEntry(
                    file_path="lib/__tests__/existing.test.ts",
                    content="describe('SuiteA', () => {});",
                )
            ]
        )
        manifest_fixed = TestFileManifest(
            files=[
                TestFileEntry(
                    file_path="lib/__tests__/existing.test.ts",
                    content="describe('SuiteA', () => {});\ndescribe('SuiteB', () => {});",
                )
            ]
        )

        with patch.object(
            agent_resolve, "get_project_context", return_value="CONTEXT"
        ), patch.object(
            agent_resolve, "call_gemini_with_fallback", side_effect=[manifest_dropped, manifest_fixed]
        ) as mock_gemini, patch.object(
            agent_resolve,
            "run_isolated_test",
            side_effect=[(0, "", ""), (1, '{"numFailedTests": 1}', "")],
        ), patch.object(
            agent_resolve, "validate_jest_red_phase", return_value=(True, "Clean failure")
        ), patch.object(
            agent_resolve, "run_cmd", return_value=(0, "", "")
        ):
            stage_2_red(self.client, 42, "Update test", bp, self.tracker)
            self.assertEqual(mock_gemini.call_count, 2)

        prompt_2 = mock_gemini.call_args_list[1][0][1]
        self.assertIn("PREVIOUS ATTEMPT DROPPED PRE-EXISTING TEST SUITES", prompt_2)
        self.assertIn("SuiteB", prompt_2)

    def test_self_corrects_on_compiler_failure_then_succeeds(self) -> None:
        (self.root / "task-plan.md").write_text("# Plan", encoding="utf-8")
        bp = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/__tests__/comp.test.ts"],
            target_src_files=["lib/comp.ts"],
            plan_markdown="# Plan",
        )

        manifest = TestFileManifest(
            files=[TestFileEntry(file_path="lib/__tests__/comp.test.ts", content="describe('comp', () => {});")]
        )

        with patch.object(
            agent_resolve, "get_project_context", return_value="CONTEXT"
        ), patch.object(
            agent_resolve, "call_gemini_with_fallback", return_value=manifest
        ) as mock_gemini, patch.object(
            agent_resolve,
            "run_isolated_test",
            side_effect=[
                (2, "TS6133 unused import", ""),
                (0, "", ""),
                (1, '{"numFailedTests": 1}', ""),
            ],
        ), patch.object(
            agent_resolve, "validate_jest_red_phase", return_value=(True, "Assertion failed")
        ), patch.object(
            agent_resolve, "run_cmd", return_value=(0, "", "")
        ):
            stage_2_red(self.client, 42, "Compiler fix", bp, self.tracker)
            self.assertEqual(mock_gemini.call_count, 2)

        prompt_2 = mock_gemini.call_args_list[1][0][1]
        self.assertIn("PREVIOUS COMPILATION FAILED:", prompt_2)
        self.assertIn("TS6133 unused import", prompt_2)

    def test_raises_stage2_compilation_error_after_max_compiler_retries(self) -> None:
        (self.root / "task-plan.md").write_text("# Plan", encoding="utf-8")
        bp = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/__tests__/bad.test.ts"],
            target_src_files=["lib/bad.ts"],
            plan_markdown="# Plan",
        )

        manifest = TestFileManifest(
            files=[TestFileEntry(file_path="lib/__tests__/bad.test.ts", content="describe('bad', () => {});")]
        )

        with patch.object(
            agent_resolve, "get_project_context", return_value="CONTEXT"
        ), patch.object(
            agent_resolve, "call_gemini_with_fallback", return_value=manifest
        ), patch.object(
            agent_resolve,
            "run_isolated_test",
            side_effect=[
                (2, "TS2304 Cannot find name", ""),
                (2, "TS2304 Cannot find name", ""),
            ],
        ):
            with self.assertRaises(Stage2CompilationError) as ctx:
                stage_2_red(self.client, 42, "Failing compilation", bp, self.tracker)

        self.assertIn("failed TypeScript compilation after 2 attempts", str(ctx.exception))

    def test_retries_and_raises_runtime_error_on_invalid_red_phase(self) -> None:
        (self.root / "task-plan.md").write_text("# Plan", encoding="utf-8")
        bp = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/__tests__/zero.test.ts"],
            target_src_files=["lib/zero.ts"],
            plan_markdown="# Plan",
        )

        manifest = TestFileManifest(
            files=[TestFileEntry(file_path="lib/__tests__/zero.test.ts", content="describe('zero', () => {});")]
        )

        with patch.object(
            agent_resolve, "get_project_context", return_value="CONTEXT"
        ), patch.object(
            agent_resolve, "call_gemini_with_fallback", return_value=manifest
        ), patch.object(
            agent_resolve,
            "run_isolated_test",
            side_effect=[(0, "", ""), (0, "", ""), (0, "", ""), (0, "", "")],
        ), patch.object(
            agent_resolve, "validate_jest_red_phase", return_value=(False, "Tests exited 0")
        ):
            with self.assertRaises(RuntimeError) as ctx:
                stage_2_red(self.client, 42, "Passing red phase", bp, self.tracker)

        self.assertIn("Red phase failed verification after 2 attempts", str(ctx.exception))

    def test_stage_2_ignores_blast_radius_test_files(self) -> None:
        (self.root / "task-plan.md").write_text("# Plan", encoding="utf-8")

        bp = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/__tests__/target.test.ts"],
            target_src_files=["lib/target.ts"],
            plan_markdown="# Plan",
            blast_radius_test_files=["components/__tests__/blast.test.tsx"],
        )

        manifest = TestFileManifest(
            files=[
                TestFileEntry(
                    file_path="lib/__tests__/target.test.ts",
                    content="describe('target', () => { it('fails', () => { expect(true).toBe(false); }); });",
                )
            ]
        )

        with patch.object(
            agent_resolve, "get_project_context", return_value="CONTEXT"
        ), patch.object(
            agent_resolve, "call_gemini_with_fallback", return_value=manifest
        ) as mock_gemini, patch.object(
            agent_resolve,
            "run_isolated_test",
            side_effect=[(0, "", ""), (1, '{"numFailedTests": 1}', "")],
        ) as mock_test, patch.object(
            agent_resolve, "validate_jest_red_phase", return_value=(True, "Valid assertion failure")
        ), patch.object(
            agent_resolve, "run_cmd", return_value=(0, "", "")
        ):
            stage_2_red(self.client, 42, "Target only", bp, self.tracker)

        prompt_text = mock_gemini.call_args[0][1]
        self.assertIn("lib/__tests__/target.test.ts", prompt_text)
        self.assertNotIn("components/__tests__/blast.test.tsx", prompt_text)

        mock_test.assert_any_call(["npx", "jest", "--json", "lib/__tests__/target.test.ts"])
        for call_args in mock_test.call_args_list:
            self.assertNotIn("components/__tests__/blast.test.tsx", call_args[0][0])
        self.assertEqual(bp.blast_radius_test_files, ["components/__tests__/blast.test.tsx"])


class TestStage3Green(unittest.TestCase):
    def setUp(self) -> None:
        self.orig_root = config.get_project_root()
        self.temp_dir = TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        config.set_project_root(self.root)
        self.client = MagicMock()
        self.tracker = TokenTracker()

    def tearDown(self) -> None:
        config.set_project_root(self.orig_root)
        self.temp_dir.cleanup()

    def test_raises_runtime_error_when_target_src_files_empty(self) -> None:
        bp = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/__tests__/foo.test.ts"],
            target_src_files=[],
            plan_markdown="# Plan",
        )
        with self.assertRaises(RuntimeError) as ctx:
            stage_3_green(self.client, 42, "No sources", bp, self.tracker)

        self.assertIn("No target source files specified in architectural blueprint", str(ctx.exception))

    def test_applies_patches_runs_targeted_and_full_regression_gates_and_commits(self) -> None:
        (self.root / "task-plan.md").write_text("# Plan", encoding="utf-8")
        test_file = self.root / "lib" / "__tests__" / "foo.test.ts"
        test_file.parent.mkdir(parents=True, exist_ok=True)
        test_file.write_text("describe('foo', () => {});", encoding="utf-8")
        src_file = self.root / "lib" / "foo.ts"
        src_file.parent.mkdir(parents=True, exist_ok=True)
        src_file.write_text("export const foo = () => false;", encoding="utf-8")

        bp = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/__tests__/foo.test.ts"],
            target_src_files=["lib/foo.ts"],
            plan_markdown="# Plan",
        )

        manifest = PatchManifest(
            patches=[
                PatchChunk(
                    file_path="lib/foo.ts",
                    search_block="export const foo = () => false;",
                    replace_block="export const foo = () => true;",
                )
            ]
        )

        with patch.object(
            agent_resolve, "get_project_context", return_value="CONTEXT"
        ), patch.object(
            agent_resolve, "reset_target_sources"
        ) as mock_reset, patch.object(
            agent_resolve, "call_gemini_with_fallback", return_value=manifest
        ), patch.object(
            agent_resolve, "apply_patch_manifest", return_value=(True, [])
        ), patch.object(
            agent_resolve,
            "run_isolated_test",
            side_effect=[
                (0, "", ""),  # targeted type-check
                (0, "", ""),  # targeted jest
                (0, "", ""),  # full regression type-check
                (0, "", ""),  # full regression jest
            ],
        ) as mock_test, patch.object(
            agent_resolve, "run_cmd", return_value=(0, "", "")
        ) as mock_cmd:
            stage_3_green(self.client, 42, "Satisfy tests", bp, self.tracker)

        mock_reset.assert_called_once_with(["lib/foo.ts"], baseline_ref="HEAD")
        self.assertEqual(mock_test.call_count, 4)
        mock_cmd.assert_has_calls([
            call(["git", "add", "lib/foo.ts"], check=True),
            call(["git", "commit", "-m", "feat(winery): Implement changes to satisfy Issue #42"], check=True),
        ])

    def test_retries_on_patch_application_failure_and_resets_baseline(self) -> None:
        (self.root / "task-plan.md").write_text("# Plan", encoding="utf-8")
        src_file = self.root / "lib" / "foo.ts"
        src_file.parent.mkdir(parents=True, exist_ok=True)
        src_file.write_text("export const foo = () => false;", encoding="utf-8")

        bp = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/__tests__/foo.test.ts"],
            target_src_files=["lib/foo.ts"],
            plan_markdown="# Plan",
        )

        manifest = PatchManifest(patches=[])

        with patch.object(
            agent_resolve, "get_project_context", return_value="CONTEXT"
        ), patch.object(
            agent_resolve, "reset_target_sources"
        ) as mock_reset, patch.object(
            agent_resolve, "call_gemini_with_fallback", return_value=manifest
        ) as mock_gemini, patch.object(
            agent_resolve,
            "apply_patch_manifest",
            side_effect=[(False, ["Search block not found in lib/foo.ts"]), (True, [])],
        ), patch.object(
            agent_resolve,
            "run_isolated_test",
            side_effect=[(0, "", ""), (0, "", ""), (0, "", ""), (0, "", "")],
        ), patch.object(
            agent_resolve, "run_cmd", return_value=(0, "", "")
        ):
            stage_3_green(self.client, 42, "Fix patch error", bp, self.tracker)
            self.assertEqual(mock_gemini.call_count, 2)
            self.assertEqual(mock_reset.call_count, 2)

        prompt_2 = mock_gemini.call_args_list[1][0][1]
        self.assertIn("PREVIOUS ATTEMPT FAILED TO APPLY PATCHES:", prompt_2)
        self.assertIn("Search block not found in lib/foo.ts", prompt_2)

    def test_retries_on_targeted_or_regression_gate_failure_and_raises_after_3_attempts(self) -> None:
        (self.root / "task-plan.md").write_text("# Plan", encoding="utf-8")
        src_file = self.root / "lib" / "foo.ts"
        src_file.parent.mkdir(parents=True, exist_ok=True)
        src_file.write_text("export const foo = () => false;", encoding="utf-8")

        bp = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/__tests__/foo.test.ts"],
            target_src_files=["lib/foo.ts"],
            plan_markdown="# Plan",
        )

        manifest = PatchManifest(patches=[])

        with patch.object(
            agent_resolve, "get_project_context", return_value="CONTEXT"
        ), patch.object(
            agent_resolve, "reset_target_sources"
        ), patch.object(
            agent_resolve, "call_gemini_with_fallback", return_value=manifest
        ) as mock_gemini, patch.object(
            agent_resolve, "apply_patch_manifest", return_value=(True, [])
        ), patch.object(
            agent_resolve,
            "run_isolated_test",
            side_effect=[
                # Attempt 1: targeted type-check exits 0, targeted jest exits 1
                (0, "", ""),
                (1, "Targeted jest failed", ""),
                # Attempt 2: targeted type-check exits 0, targeted jest exits 0, full reg type-check exits 0, full reg jest exits 1
                (0, "", ""),
                (0, "", ""),
                (0, "", ""),
                (1, "Full regression jest failed", ""),
                # Attempt 3: targeted type-check exits 2 (fails fast, skips jest)
                (2, "Type error", ""),
            ],
        ):
            with self.assertRaises(RuntimeError) as ctx:
                stage_3_green(self.client, 42, "Flaky green", bp, self.tracker)

        self.assertIn("Green phase implementation failed to pass tests after 3 attempts", str(ctx.exception))
        prompt_2 = mock_gemini.call_args_list[1][0][1]
        self.assertIn("PREVIOUS ATTEMPT FAILED TARGETED VERIFICATION:", prompt_2)
        prompt_3 = mock_gemini.call_args_list[2][0][1]
        self.assertIn("TARGETED TESTS PASSED BUT MANDATORY FULL REGRESSION GATE FAILED:", prompt_3)

    def test_resumption_mode_soft_resets_to_baseline_and_removes_checkpoint_files(self) -> None:
        (self.root / "task-plan.md").write_text("# Plan", encoding="utf-8")
        state_file = self.root / ".agent-state.json"
        state_file.write_text('{"state": 1}', encoding="utf-8")
        handoff_file = self.root / "AGENT_HANDOFF.md"
        handoff_file.write_text("# Handoff", encoding="utf-8")

        bp = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/__tests__/foo.test.ts"],
            target_src_files=["lib/foo.ts"],
            plan_markdown="# Plan",
        )
        manifest = PatchManifest(patches=[])

        with patch.object(
            agent_resolve, "get_project_context", return_value="CONTEXT"
        ), patch.object(
            agent_resolve, "reset_target_sources"
        ), patch.object(
            agent_resolve, "call_gemini_with_fallback", return_value=manifest
        ) as mock_gemini, patch.object(
            agent_resolve, "apply_patch_manifest", return_value=(True, [])
        ), patch.object(
            agent_resolve,
            "run_isolated_test",
            side_effect=[(0, "", ""), (0, "", ""), (0, "", ""), (0, "", "")],
        ), patch.object(
            agent_resolve, "run_cmd", return_value=(0, "", "")
        ) as mock_cmd:
            stage_3_green(
                self.client,
                42,
                "Resume green",
                bp,
                self.tracker,
                baseline_ref="deadbeef12345678",
                resumption_context="Maintainer hint: use Number() conversion",
            )

        prompt_text = mock_gemini.call_args[0][1]
        self.assertIn("### RESUMPTION CONTEXT & MAINTAINER GUIDANCE:", prompt_text)
        self.assertIn("Maintainer hint: use Number() conversion", prompt_text)

        mock_cmd.assert_has_calls([
            call(["git", "reset", "--soft", "deadbeef12345678"], check=True),
            call(["git", "add", "lib/foo.ts"], check=True),
            call(["git", "commit", "-m", "feat(winery): Implement changes to satisfy Issue #42"], check=True),
        ])
        self.assertFalse(state_file.exists())
        self.assertFalse(handoff_file.exists())

    def test_stage_3_isolates_prompt_and_executes_target_plus_blast_radius_silently(self) -> None:
        (self.root / "task-plan.md").write_text("# Plan", encoding="utf-8")
        target_test = self.root / "lib" / "__tests__" / "target.test.ts"
        target_test.parent.mkdir(parents=True, exist_ok=True)
        target_test.write_text("describe('target', () => {});", encoding="utf-8")

        blast_test = self.root / "components" / "__tests__" / "blast.test.tsx"
        blast_test.parent.mkdir(parents=True, exist_ok=True)
        blast_test.write_text("describe('blast', () => {});", encoding="utf-8")

        src_file = self.root / "lib" / "target.ts"
        src_file.parent.mkdir(parents=True, exist_ok=True)
        src_file.write_text("export const val = 0;", encoding="utf-8")

        bp = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/__tests__/target.test.ts"],
            target_src_files=["lib/target.ts"],
            plan_markdown="# Plan",
            blast_radius_test_files=["components/__tests__/blast.test.tsx"],
        )

        manifest = PatchManifest(
            patches=[
                PatchChunk(
                    file_path="lib/target.ts",
                    search_block="export const val = 0;",
                    replace_block="export const val = 1;",
                )
            ]
        )

        with patch.object(
            agent_resolve, "get_project_context", return_value="CONTEXT"
        ), patch.object(
            agent_resolve, "reset_target_sources"
        ), patch.object(
            agent_resolve, "call_gemini_with_fallback", return_value=manifest
        ) as mock_gemini, patch.object(
            agent_resolve, "apply_patch_manifest", return_value=(True, [])
        ), patch.object(
            agent_resolve,
            "run_isolated_test",
            side_effect=[
                (0, "", ""),  # targeted type-check
                (0, "", ""),  # targeted jest
                (0, "", ""),  # full regression type-check
                (0, "", ""),  # full regression jest
            ],
        ) as mock_test, patch.object(
            agent_resolve, "run_cmd", return_value=(0, "", "")
        ):
            stage_3_green(self.client, 42, "Satisfy tests", bp, self.tracker)

        # TESTS TO PASS prompt section must only contain target test files
        prompt_text = mock_gemini.call_args[0][1]
        self.assertIn("lib/__tests__/target.test.ts", prompt_text)
        self.assertNotIn("components/__tests__/blast.test.tsx", prompt_text)

        # Targeted Jest verification must run with --no-color, --silent and include target + blast radius
        mock_test.assert_any_call([
            "npx",
            "jest",
            "--no-color",
            "--silent",
            "lib/__tests__/target.test.ts",
            "components/__tests__/blast.test.tsx",
        ])

    def test_stage_3_skips_jest_when_targeted_type_check_fails_and_populates_compiler_errors(self) -> None:
        (self.root / "task-plan.md").write_text("# Plan", encoding="utf-8")
        src_file = self.root / "lib" / "foo.ts"
        src_file.parent.mkdir(parents=True, exist_ok=True)
        src_file.write_text("export const foo = () => false;", encoding="utf-8")
        test_file = self.root / "lib" / "__tests__" / "foo.test.ts"
        test_file.parent.mkdir(parents=True, exist_ok=True)
        test_file.write_text("describe('foo', () => {});", encoding="utf-8")

        bp = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/__tests__/foo.test.ts"],
            target_src_files=["lib/foo.ts"],
            plan_markdown="# Plan",
        )
        manifest = PatchManifest(patches=[])

        test_calls = []
        def fake_run_isolated_test(cmd: list) -> tuple:
            test_calls.append(list(cmd))
            # On attempt 1, targeted type-check fails with compiler error
            if len(test_calls) == 1 and cmd == ["npm", "run", "type-check"]:
                return (2, "TS2322 Type mismatch: Type 'number' is not assignable to type 'string'.", "")
            # If Jest is called during attempt 1 (current unadapted behavior) or subsequent calls
            return (0, "", "")

        with patch.object(
            agent_resolve, "get_project_context", return_value="CONTEXT"
        ), patch.object(
            agent_resolve, "reset_target_sources"
        ), patch.object(
            agent_resolve, "call_gemini_with_fallback", return_value=manifest
        ) as mock_gemini, patch.object(
            agent_resolve, "apply_patch_manifest", return_value=(True, [])
        ), patch.object(
            agent_resolve, "run_isolated_test", side_effect=fake_run_isolated_test
        ), patch.object(
            agent_resolve, "run_cmd", return_value=(0, "", "")
        ):
            stage_3_green(self.client, 42, "Satisfy tests", bp, self.tracker)

        # Assert that on attempt 1, when targeted type-check failed, npx jest was NEVER called
        self.assertEqual(test_calls[0], ["npm", "run", "type-check"])
        self.assertEqual(test_calls[1], ["npm", "run", "type-check"], "Jest should be skipped on attempt 1 when type-check fails")

        # Assert attempt 2 prompt contains compiler error and does not contain Jest execution or exit codes
        prompt_2 = mock_gemini.call_args_list[1][0][1]
        self.assertIn("TS2322 Type mismatch", prompt_2)
        self.assertNotIn("Jest Test Exit Code", prompt_2)
        self.assertNotIn("Jest Errors", prompt_2)

    def test_stage_3_regression_gate_runs_type_check_before_jest_and_skips_jest_on_compilation_failure(self) -> None:
        (self.root / "task-plan.md").write_text("# Plan", encoding="utf-8")
        src_file = self.root / "lib" / "foo.ts"
        src_file.parent.mkdir(parents=True, exist_ok=True)
        src_file.write_text("export const foo = () => false;", encoding="utf-8")
        test_file = self.root / "lib" / "__tests__" / "foo.test.ts"
        test_file.parent.mkdir(parents=True, exist_ok=True)
        test_file.write_text("describe('foo', () => {});", encoding="utf-8")

        bp = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/__tests__/foo.test.ts"],
            target_src_files=["lib/foo.ts"],
            plan_markdown="# Plan",
        )
        manifest = PatchManifest(patches=[])

        test_calls = []
        def fake_run_isolated_test(cmd: list) -> tuple:
            test_calls.append(list(cmd))
            # Attempt 1: targeted type-check passes, targeted jest passes
            if len(test_calls) == 1 and cmd == ["npm", "run", "type-check"]:
                return (0, "", "")
            if len(test_calls) == 2 and cmd[:2] == ["npx", "jest"]:
                return (0, "", "")
            # Attempt 1 regression gate: type-check fails with TS2345
            if cmd == ["npm", "run", "type-check"] and len(test_calls) == 3:
                return (2, "TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.", "")
            # If npm test is called in attempt 1 (current unadapted behavior) or subsequent calls
            return (0, "", "")

        with patch.object(
            agent_resolve, "get_project_context", return_value="CONTEXT"
        ), patch.object(
            agent_resolve, "reset_target_sources"
        ), patch.object(
            agent_resolve, "call_gemini_with_fallback", return_value=manifest
        ) as mock_gemini, patch.object(
            agent_resolve, "apply_patch_manifest", return_value=(True, [])
        ), patch.object(
            agent_resolve, "run_isolated_test", side_effect=fake_run_isolated_test
        ), patch.object(
            agent_resolve, "run_cmd", return_value=(0, "", "")
        ):
            stage_3_green(self.client, 42, "Satisfy tests", bp, self.tracker)

        # In attempt 1:
        # Call 1: targeted type-check
        # Call 2: targeted jest
        # Call 3: regression type-check MUST run before regression jest
        self.assertEqual(test_calls[0], ["npm", "run", "type-check"])
        self.assertEqual(test_calls[1][:2], ["npx", "jest"])
        self.assertEqual(test_calls[2], ["npm", "run", "type-check"], "Regression type-check must run before full Jest suite")

        # Regression jest must NOT be invoked when regression type-check fails on attempt 1
        # Therefore, call 4 must be the start of attempt 2 (targeted type-check), not npm test
        self.assertEqual(test_calls[3], ["npm", "run", "type-check"], "Full Jest suite must be skipped on regression compilation failure")

        # Prompt for attempt 2 must reflect regression TypeScript failure
        prompt_2 = mock_gemini.call_args_list[1][0][1]
        self.assertIn("TS2345: Argument of type", prompt_2)
        self.assertNotIn("Full Jest Suite Errors", prompt_2)

    def test_stage_3_sanitizes_and_truncates_large_compiler_error_output_in_last_error_context(self) -> None:
        (self.root / "task-plan.md").write_text("# Plan", encoding="utf-8")
        src_file = self.root / "lib" / "foo.ts"
        src_file.parent.mkdir(parents=True, exist_ok=True)
        src_file.write_text("export const foo = () => false;", encoding="utf-8")
        test_file = self.root / "lib" / "__tests__" / "foo.test.ts"
        test_file.parent.mkdir(parents=True, exist_ok=True)
        test_file.write_text("describe('foo', () => {});", encoding="utf-8")

        bp = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/__tests__/foo.test.ts"],
            target_src_files=["lib/foo.ts"],
            plan_markdown="# Plan",
        )
        manifest = PatchManifest(patches=[])

        # 12,000 characters of clean compiler errors with ANSI escape sequences
        head_clean = "HEAD_COMPILER_ERROR_" + ("A" * 3980)  # 4,000 chars
        middle_clean = "MIDDLE_COMPILER_ERROR_" + ("M" * 3978) # 4,000 chars
        tail_clean = "TAIL_COMPILER_ERROR_" + ("Z" * 3980)  # 4,000 chars
        # Total clean = 12,000 chars
        ansi_error_output = f"\x1b[31;1m{head_clean}\x1b[0m\x1b[33m{middle_clean}\x1b[0m\x1b[34m{tail_clean}\x1b[0m"

        attempt_count = 0
        def fake_run_isolated_test(cmd: list) -> tuple:
            nonlocal attempt_count
            if cmd == ["npm", "run", "type-check"]:
                attempt_count += 1
                if attempt_count == 1:
                    return (2, ansi_error_output, "")
                return (0, "", "")
            return (0, "", "")

        with patch.object(
            agent_resolve, "get_project_context", return_value="CONTEXT"
        ), patch.object(
            agent_resolve, "reset_target_sources"
        ), patch.object(
            agent_resolve, "call_gemini_with_fallback", return_value=manifest
        ) as mock_gemini, patch.object(
            agent_resolve, "apply_patch_manifest", return_value=(True, [])
        ), patch.object(
            agent_resolve, "run_isolated_test", side_effect=fake_run_isolated_test
        ), patch.object(
            agent_resolve, "run_cmd", return_value=(0, "", "")
        ):
            stage_3_green(self.client, 42, "Satisfy tests", bp, self.tracker)

        prompt_2 = mock_gemini.call_args_list[1][0][1]
        # Must strip all ANSI escape sequences
        self.assertNotIn("\x1b[", prompt_2)
        # Must truncate to head (4k) and tail (4k) with exact marker
        expected_marker = "\n\n... [TRUNCATED 4000 CHARS OF VERIFICATION OUTPUT] ...\n\n"
        self.assertIn(expected_marker, prompt_2)
        self.assertIn("HEAD_COMPILER_ERROR_", prompt_2)
        self.assertIn("TAIL_COMPILER_ERROR_", prompt_2)
        self.assertNotIn("MIDDLE_COMPILER_ERROR_", prompt_2)

    def test_stage_3_sanitizes_and_truncates_large_regression_gate_error_output_in_last_error_context(self) -> None:
        (self.root / "task-plan.md").write_text("# Plan", encoding="utf-8")
        src_file = self.root / "lib" / "foo.ts"
        src_file.parent.mkdir(parents=True, exist_ok=True)
        src_file.write_text("export const foo = () => false;", encoding="utf-8")
        test_file = self.root / "lib" / "__tests__" / "foo.test.ts"
        test_file.parent.mkdir(parents=True, exist_ok=True)
        test_file.write_text("describe('foo', () => {});", encoding="utf-8")

        bp = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/__tests__/foo.test.ts"],
            target_src_files=["lib/foo.ts"],
            plan_markdown="# Plan",
        )
        manifest = PatchManifest(patches=[])

        # 15,000 characters of clean error output with ANSI escape sequences
        head_clean = "REG_HEAD_ERROR_" + ("H" * 3985)   # 4,000 chars
        middle_clean = "REG_MID_ERROR_" + ("M" * 6986)   # 7,000 chars
        tail_clean = "REG_TAIL_ERROR_" + ("T" * 3985)   # 4,000 chars
        # Total clean = 15,000 chars. Truncated count = 15000 - 8000 = 7000.
        ansi_error_output = f"\x1b[35m{head_clean}\x1b[0m\x1b[36m{middle_clean}\x1b[0m\x1b[31m{tail_clean}\x1b[0m"

        attempt_count = 0
        def fake_run_isolated_test(cmd: list) -> tuple:
            nonlocal attempt_count
            if cmd == ["npm", "run", "type-check"]:
                attempt_count += 1
                if attempt_count == 1:
                    return (0, "", "")  # attempt 1 targeted type-check passes
                if attempt_count == 2:
                    return (2, ansi_error_output, "") # attempt 1 regression type-check fails
                return (0, "", "")  # attempt 2 passes
            if cmd == ["npm", "test"] and attempt_count < 3:
                # If current unadapted code runs npm test in regression gate on attempt 1
                return (1, ansi_error_output, "")
            return (0, "", "")

        with patch.object(
            agent_resolve, "get_project_context", return_value="CONTEXT"
        ), patch.object(
            agent_resolve, "reset_target_sources"
        ), patch.object(
            agent_resolve, "call_gemini_with_fallback", return_value=manifest
        ) as mock_gemini, patch.object(
            agent_resolve, "apply_patch_manifest", return_value=(True, [])
        ), patch.object(
            agent_resolve, "run_isolated_test", side_effect=fake_run_isolated_test
        ), patch.object(
            agent_resolve, "run_cmd", return_value=(0, "", "")
        ):
            stage_3_green(self.client, 42, "Satisfy tests", bp, self.tracker)

        prompt_2 = mock_gemini.call_args_list[1][0][1]
        self.assertNotIn("\x1b[", prompt_2)
        expected_marker = "\n\n... [TRUNCATED 7000 CHARS OF VERIFICATION OUTPUT] ...\n\n"
        self.assertIn(expected_marker, prompt_2)
        self.assertIn("REG_HEAD_ERROR_", prompt_2)
        self.assertIn("REG_TAIL_ERROR_", prompt_2)
        self.assertNotIn("REG_MID_ERROR_", prompt_2)


if __name__ == "__main__":
    unittest.main()
