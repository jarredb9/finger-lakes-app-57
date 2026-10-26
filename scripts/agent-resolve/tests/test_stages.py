"""
Unit tests for `agent_resolve.stages` (TDD Red Phase).
"""

from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any
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

try:
    from agent_resolve.models import TestPatchManifest
except ImportError:
    from pydantic import BaseModel

    class TestPatchManifest(BaseModel):  # type: ignore[no-redef]
        patches: list[PatchChunk] = []
        source_stubs: list[SourceStubEntry] = []
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

        self.assertTrue(
            "Modification of protected file blocked" in str(ctx.exception)
            or "No valid target source files specified in architectural blueprint" in str(ctx.exception),
            f"Unexpected error: {ctx.exception}",
        )

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

    def test_stage_1_sanitizes_invalid_paths_from_target_test_files(self) -> None:
        mock_blueprint = BlueprintPlan(
            scope="winery",
            target_test_files=[
                "supabase/functions/_shared/__tests__/geo.test.ts",
                "e2e/winery-flow.spec.ts",
                "lib/utils/helper.ts",
                "lib/utils/__tests__/geo.test.ts",
            ],
            target_src_files=["lib/utils/geo.ts"],
            plan_markdown="# Plan",
        )

        with patch.object(
            agent_resolve, "get_project_context", return_value="CONTEXT"
        ), patch.object(
            agent_resolve, "find_related_test_files", return_value=[]
        ), patch.object(
            agent_resolve, "call_gemini_with_fallback", return_value=mock_blueprint
        ) as mock_gemini:
            blueprint = stage_1_plan(self.client, 42, "Refactor geo", "Body", self.tracker)

        self.assertEqual(blueprint.target_test_files, ["lib/utils/__tests__/geo.test.ts"])
        self.assertEqual(mock_gemini.call_count, 1)

    def test_stage_1_sanitizes_invalid_paths_from_target_src_files(self) -> None:
        mock_blueprint = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/utils/__tests__/geo.test.ts"],
            target_src_files=[
                ".husky/pre-commit",
                "package.json",
                "scripts/agent-resolve.py",
                "supabase/migrations/20261026_init.sql",
                "src/index.ts",
                "lib/utils/geo.ts",
                "components/WineryMap.tsx",
            ],
            plan_markdown="# Plan",
        )

        with patch.object(
            agent_resolve, "get_project_context", return_value="CONTEXT"
        ), patch.object(
            agent_resolve, "find_related_test_files", return_value=[]
        ), patch.object(
            agent_resolve, "call_gemini_with_fallback", return_value=mock_blueprint
        ) as mock_gemini:
            blueprint = stage_1_plan(self.client, 42, "Refactor geo", "Body", self.tracker)

        self.assertEqual(blueprint.target_src_files, ["lib/utils/geo.ts", "components/WineryMap.tsx"])
        self.assertEqual(mock_gemini.call_count, 1)

    def test_stage_1_triggers_self_correction_when_target_src_files_filtered_empty(self) -> None:
        bp_invalid = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/utils/__tests__/places.test.ts"],
            target_src_files=["package.json", ".husky/pre-commit"],
            plan_markdown="# Plan 1",
        )
        bp_valid = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/utils/__tests__/places.test.ts"],
            target_src_files=["lib/utils/places.ts"],
            plan_markdown="# Plan 2",
        )

        with patch.object(
            agent_resolve, "get_project_context", return_value="CONTEXT"
        ), patch.object(
            agent_resolve, "find_related_test_files", return_value=[]
        ), patch.object(
            agent_resolve, "call_gemini_with_fallback", side_effect=[bp_invalid, bp_valid]
        ) as mock_gemini:
            blueprint = stage_1_plan(self.client, 42, "Places fix", "Body", self.tracker)

        self.assertEqual(mock_gemini.call_count, 2)
        prompt_attempt_2 = mock_gemini.call_args_list[1][0][1]
        self.assertIn("target source file", prompt_attempt_2.lower())
        self.assertEqual(blueprint.target_src_files, ["lib/utils/places.ts"])

    def test_stage_1_triggers_self_correction_when_target_test_files_filtered_empty(self) -> None:
        bp_invalid = BlueprintPlan(
            scope="winery",
            target_test_files=["supabase/functions/places.test.ts"],
            target_src_files=["supabase/functions/_shared/places.ts"],
            plan_markdown="# Plan 1",
        )
        bp_valid = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/utils/__tests__/places.test.ts"],
            target_src_files=["lib/utils/places.ts"],
            plan_markdown="# Plan 2",
        )

        with patch.object(
            agent_resolve, "get_project_context", return_value="CONTEXT"
        ), patch.object(
            agent_resolve, "find_related_test_files", return_value=[]
        ), patch.object(
            agent_resolve, "call_gemini_with_fallback", side_effect=[bp_invalid, bp_valid]
        ) as mock_gemini:
            blueprint = stage_1_plan(self.client, 42, "Places fix", "Body", self.tracker)

        self.assertEqual(mock_gemini.call_count, 2)
        prompt_attempt_2 = mock_gemini.call_args_list[1][0][1]
        self.assertIn(
            "Target test files must be Jest test files under lib/ or components/ and outside supabase/ and e2e/.",
            prompt_attempt_2,
        )
        self.assertEqual(blueprint.target_test_files, ["lib/utils/__tests__/places.test.ts"])

    def test_stage_1_raises_validation_error_when_self_correction_attempts_exhausted(self) -> None:
        bp_invalid = BlueprintPlan(
            scope="winery",
            target_test_files=["supabase/functions/test.ts"],
            target_src_files=["supabase/functions/_shared/test.ts"],
            plan_markdown="# Plan Invalid",
        )

        with patch.object(
            agent_resolve, "get_project_context", return_value="CONTEXT"
        ), patch.object(
            agent_resolve, "find_related_test_files", return_value=[]
        ), patch.object(
            agent_resolve, "call_gemini_with_fallback", side_effect=[bp_invalid, bp_invalid]
        ) as mock_gemini:
            with self.assertRaises(ValueError) as ctx:
                stage_1_plan(self.client, 42, "Invalid test paths", "Body", self.tracker)

        self.assertEqual(mock_gemini.call_count, 2)
        self.assertTrue(
            "supabase/" in str(ctx.exception) or "e2e/" in str(ctx.exception),
            f"Expected error message mentioning supabase/ or e2e/, got: {ctx.exception}",
        )

    def test_stage_1_prompt_omits_deprecated_edge_function_directives(self) -> None:
        mock_blueprint = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/utils/__tests__/geo.test.ts"],
            target_src_files=["lib/utils/geo.ts"],
            plan_markdown="# Plan",
        )

        with patch.object(
            agent_resolve, "get_project_context", return_value="CONTEXT"
        ), patch.object(
            agent_resolve, "find_related_test_files", return_value=[]
        ), patch.object(
            agent_resolve, "call_gemini_with_fallback", return_value=mock_blueprint
        ) as mock_gemini:
            stage_1_plan(self.client, 42, "Refactor geo", "Body", self.tracker)

        prompt_text = mock_gemini.call_args[0][1]
        self.assertNotIn("EDGE FUNCTION SHARED MODULE TESTING INVARIANT", prompt_text)

    def test_stage_1_prompt_contains_schema_and_contract_evolution_invariant(self) -> None:
        bp = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/__tests__/foo.test.ts"],
            target_src_files=["lib/foo.ts"],
            plan_markdown="# Plan",
        )
        with patch.object(
            agent_resolve, "get_project_context", return_value="CONTEXT"
        ), patch.object(
            agent_resolve, "find_related_test_files", return_value=[]
        ), patch.object(
            agent_resolve, "call_gemini_with_fallback", return_value=bp
        ) as mock_gemini:
            stage_1_plan(self.client, 42, "Store migration", "Bump store version", self.tracker)

        prompt_text = mock_gemini.call_args[0][1]
        self.assertIn(
            "SCHEMA & CONTRACT EVOLUTION INVARIANT: When modifying existing stores, schemas, or APIs with breaking changes "
            "(e.g., bumping Zustand persist store version, modifying DB schema, changing API signatures), "
            "inspect existing test suites and explicitly include all tests with affected assertions in target_test_files. "
            "Never leave contract-invalidated tests in blast radius, as blast radius suites are immutable regression guards.",
            prompt_text,
        )

    def test_stage_1_blast_radius_merging_sanitizing_deduplicating_and_capping_at_8(self) -> None:
        bp = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/__tests__/target.test.ts"],
            target_src_files=["lib/foo.ts"],
            blast_radius_test_files=[
                "lib/__tests__/target.test.ts",  # Must be excluded (already in target_test_files)
                "supabase/functions/_shared/__tests__/bad.test.ts",  # Must be excluded (invalid path)
                "e2e/flow.spec.ts",  # Must be excluded (invalid path)
                "lib/__tests__/valid1.test.ts",  # Valid candidate 1
                "lib/__tests__/valid2.test.ts",  # Valid candidate 2
                "lib/__tests__/valid1.test.ts",  # Duplicate of 1 (must be deduplicated)
                "lib/__tests__/valid3.test.ts",  # Valid candidate 3
            ],
            plan_markdown="# Plan",
        )

        discovered_related = [
            "lib/__tests__/valid2.test.ts",  # Duplicate of candidate 2
            "lib/__tests__/valid4.test.ts",  # Valid candidate 4
            "lib/__tests__/valid5.test.ts",  # Valid candidate 5
            "lib/__tests__/valid6.test.ts",  # Valid candidate 6
            "lib/__tests__/valid7.test.ts",  # Valid candidate 7
            "lib/__tests__/valid8.test.ts",  # Valid candidate 8
            "lib/__tests__/valid9.test.ts",  # Valid candidate 9 (should exceed max 8)
            "lib/__tests__/valid10.test.ts",  # Valid candidate 10 (should exceed max 8)
        ]

        with patch.object(
            agent_resolve, "get_project_context", return_value="CONTEXT"
        ), patch.object(
            agent_resolve, "find_related_test_files", return_value=discovered_related
        ), patch.object(
            agent_resolve, "call_gemini_with_fallback", return_value=bp
        ):
            result_bp = stage_1_plan(self.client, 42, "Blast radius test", "Body", self.tracker)

        expected_blast_radius = [
            "lib/__tests__/valid1.test.ts",
            "lib/__tests__/valid2.test.ts",
            "lib/__tests__/valid3.test.ts",
            "lib/__tests__/valid4.test.ts",
            "lib/__tests__/valid5.test.ts",
            "lib/__tests__/valid6.test.ts",
            "lib/__tests__/valid7.test.ts",
            "lib/__tests__/valid8.test.ts",
        ]
        self.assertEqual(len(result_bp.blast_radius_test_files), 8)
        self.assertEqual(result_bp.blast_radius_test_files, expected_blast_radius)
        self.assertNotIn("lib/__tests__/target.test.ts", result_bp.blast_radius_test_files)
        self.assertNotIn("supabase/functions/_shared/__tests__/bad.test.ts", result_bp.blast_radius_test_files)
        self.assertNotIn("e2e/flow.spec.ts", result_bp.blast_radius_test_files)

    def test_stage_1_deduplicates_target_tests_and_routes_demoted_to_blast_radius(self) -> None:
        bp = BlueprintPlan(
            scope="winery",
            target_test_files=[
                "lib/stores/__tests__/wineryStore.persist.test.ts",
                "lib/stores/__tests__/wineryStore.test.ts",
            ],
            target_src_files=["lib/stores/wineryStore.ts"],
            plan_markdown="# Plan",
        )

        with patch.object(
            agent_resolve, "get_project_context", return_value="CONTEXT"
        ), patch.object(
            agent_resolve, "find_related_test_files", return_value=[]
        ), patch.object(
            agent_resolve, "call_gemini_with_fallback", return_value=bp
        ):
            result_bp = stage_1_plan(self.client, 42, "Deduplicate tests", "Body", self.tracker)

        self.assertEqual(
            result_bp.target_test_files,
            ["lib/stores/__tests__/wineryStore.persist.test.ts"],
        )
        self.assertIn(
            "lib/stores/__tests__/wineryStore.test.ts",
            result_bp.blast_radius_test_files,
        )

    def test_stage_1_demoted_test_files_deduplicated_and_capped_at_max_blast_radius(self) -> None:
        bp = BlueprintPlan(
            scope="winery",
            target_test_files=[
                "lib/stores/__tests__/wineryStore.persist.test.ts",
                "lib/stores/__tests__/wineryStore.test.ts",
            ],
            target_src_files=["lib/stores/wineryStore.ts"],
            blast_radius_test_files=[
                "lib/stores/__tests__/wineryStore.test.ts",
                "lib/__tests__/extra1.test.ts",
                "lib/__tests__/extra2.test.ts",
                "lib/__tests__/extra3.test.ts",
                "lib/__tests__/extra4.test.ts",
            ],
            plan_markdown="# Plan",
        )

        discovered_related = [
            "lib/__tests__/extra5.test.ts",
            "lib/__tests__/extra6.test.ts",
            "lib/__tests__/extra7.test.ts",
            "lib/__tests__/extra8.test.ts",
            "lib/__tests__/extra9.test.ts",
        ]

        with patch.object(
            agent_resolve, "get_project_context", return_value="CONTEXT"
        ), patch.object(
            agent_resolve, "find_related_test_files", return_value=discovered_related
        ), patch.object(
            agent_resolve, "call_gemini_with_fallback", return_value=bp
        ):
            result_bp = stage_1_plan(self.client, 42, "Capping test", "Body", self.tracker)

        self.assertEqual(
            result_bp.target_test_files,
            ["lib/stores/__tests__/wineryStore.persist.test.ts"],
        )
        self.assertEqual(len(result_bp.blast_radius_test_files), 8)
        self.assertNotIn(
            "lib/stores/__tests__/wineryStore.persist.test.ts",
            result_bp.blast_radius_test_files,
        )
        self.assertIn(
            "lib/stores/__tests__/wineryStore.test.ts",
            result_bp.blast_radius_test_files,
        )

    def test_stage_1_prompt_contains_target_test_cohesion_and_deduplication_directive(self) -> None:
        bp = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/__tests__/target.test.ts"],
            target_src_files=["lib/foo.ts"],
            plan_markdown="# Plan",
        )

        with patch.object(
            agent_resolve, "get_project_context", return_value="CONTEXT"
        ), patch.object(
            agent_resolve, "find_related_test_files", return_value=[]
        ), patch.object(
            agent_resolve, "call_gemini_with_fallback", return_value=bp
        ) as mock_gemini:
            stage_1_plan(self.client, 42, "Prompt test", "Body", self.tracker)

        prompt_text = mock_gemini.call_args[0][1]
        self.assertIn(
            "Select only the single most cohesive test file for each modified source file. "
            "Do not duplicate identical unit tests across multiple test files.",
            prompt_text,
        )

    def test_stage_1_prompt_places_static_guidelines_and_role_header_at_prefix(self) -> None:
        bp = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/__tests__/target.test.ts"],
            target_src_files=["lib/foo.ts"],
            plan_markdown="# Plan",
        )
        fake_context = (
            "### REPOSITORY DOMAIN MODEL (CONTEXT.md):\nDomain Model Rules\n\n"
            "### ARCHITECTURAL RULES & STANDARDS (AGENTS.md):\nAgent Standards"
        )
        with patch.object(
            agent_resolve, "get_project_context", return_value=fake_context
        ), patch.object(
            agent_resolve, "find_related_test_files", return_value=[]
        ), patch.object(
            agent_resolve, "call_gemini_with_fallback", return_value=bp
        ) as mock_gemini:
            stage_1_plan(self.client, 42, "Prompt Caching Optimization", "Body", self.tracker)

        prompt = mock_gemini.call_args[0][1]
        first_line = prompt.splitlines()[0] if prompt.splitlines() else ""

        self.assertTrue(
            prompt.startswith("You are the Staff Principal Architect generating an authoritative implementation blueprint.")
        )
        self.assertNotIn("42", first_line)
        self.assertNotIn("Prompt Caching Optimization", first_line)

        pos_context = prompt.find("### REPOSITORY DOMAIN MODEL (CONTEXT.md):")
        pos_agents = prompt.find("### ARCHITECTURAL RULES & STANDARDS (AGENTS.md):")
        pos_issue = prompt.find("Issue #42")

        self.assertNotEqual(pos_context, -1)
        self.assertNotEqual(pos_agents, -1)
        self.assertNotEqual(pos_issue, -1)
        self.assertLess(pos_context, pos_issue)
        self.assertLess(pos_agents, pos_issue)



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

        manifest = TestPatchManifest(
            patches=[
                PatchChunk(
                    file_path="lib/__tests__/new.test.ts",
                    search_block="",
                    replace_block="describe('new', () => { it('fails', () => { expect(true).toBe(false); }); });\n",
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
                ["git", "add", "--", "lib/__tests__/new.test.ts", "lib/stubbed.ts", "lib/unstubbed.ts"],
                check=True,
            ),
            call(
                ["git", "commit", "--no-verify", "-m", "test(winery): Add failing tests for Issue #42"],
                check=True,
            ),
        ])

    def test_stage_2_preserves_unmodified_suites_without_extract_test_suite_names_check(self) -> None:
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

        manifest = TestPatchManifest(
            patches=[
                PatchChunk(
                    file_path="lib/__tests__/existing.test.ts",
                    search_block="describe('SuiteA', () => {});",
                    replace_block="describe('SuiteA', () => { it('fails', () => { expect(1).toBe(2); }); });",
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
        ), patch.object(
            agent_resolve, "validate_jest_red_phase", return_value=(True, "Clean failure")
        ), patch.object(
            agent_resolve, "run_cmd", return_value=(0, "", "")
        ):
            stage_2_red(self.client, 42, "Update test", bp, self.tracker)
            self.assertEqual(mock_gemini.call_count, 1)

        updated_content = test_file.read_text(encoding="utf-8")
        self.assertIn("SuiteB", updated_content)
        self.assertIn("expect(1).toBe(2)", updated_content)

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

        mock_test.assert_any_call(["npx", "jest", "--json", "--", "lib/__tests__/target.test.ts"])
        for call_args in mock_test.call_args_list:
            self.assertNotIn("components/__tests__/blast.test.tsx", call_args[0][0])
        self.assertEqual(bp.blast_radius_test_files, ["components/__tests__/blast.test.tsx"])

    def test_stage_2_prompt_omits_deprecated_edge_function_directives(self) -> None:
        (self.root / "task-plan.md").write_text("# Plan", encoding="utf-8")

        bp = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/utils/__tests__/winery.test.ts"],
            target_src_files=["lib/utils/winery.ts"],
            plan_markdown="# Plan",
        )

        manifest = TestFileManifest(
            files=[
                TestFileEntry(
                    file_path="lib/utils/__tests__/winery.test.ts",
                    content="describe('winery', () => { it('fails', () => { expect(true).toBe(false); }); });",
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
        ), patch.object(
            agent_resolve, "validate_jest_red_phase", return_value=(True, "Valid assertion failure")
        ), patch.object(
            agent_resolve, "run_cmd", return_value=(0, "", "")
        ):
            stage_2_red(self.client, 42, "Shared winery test", bp, self.tracker)

        prompt_text = mock_gemini.call_args[0][1]
        self.assertNotIn("EDGE FUNCTION SHARED MODULE TESTING INVARIANT", prompt_text)

    def test_stage_2_requests_test_patch_manifest_and_applies_via_patch_engine(self) -> None:
        (self.root / "task-plan.md").write_text("# Plan", encoding="utf-8")
        bp = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/__tests__/feature.test.ts"],
            target_src_files=["lib/feature.ts"],
            plan_markdown="# Plan",
        )

        manifest = TestPatchManifest(
            patches=[
                PatchChunk(
                    file_path="lib/__tests__/feature.test.ts",
                    search_block="",
                    replace_block="describe('feature', () => { it('fails', () => { expect(true).toBe(false); }); });\n",
                )
            ],
            source_stubs=[
                SourceStubEntry(
                    file_path="lib/feature.ts",
                    content="export const feature = () => { throw new Error('Not implemented'); };",
                )
            ],
        )

        with patch.object(
            agent_resolve, "get_project_context", return_value="CONTEXT"
        ), patch.object(
            agent_resolve, "call_gemini_with_fallback", return_value=manifest
        ) as mock_gemini, patch.object(
            agent_resolve,
            "run_isolated_test",
            side_effect=[(0, "", ""), (1, '{"numFailedTests": 1}', "")],
        ), patch.object(
            agent_resolve, "validate_jest_red_phase", return_value=(True, "Valid assertion failure")
        ), patch.object(
            agent_resolve, "run_cmd", return_value=(0, "", "")
        ) as mock_cmd:
            stage_2_red(self.client, 42, "Feature test", bp, self.tracker)

        self.assertIn("schema_cls", mock_gemini.call_args[1])
        self.assertTrue(
            hasattr(agent_resolve.models, "TestPatchManifest")
            and mock_gemini.call_args[1]["schema_cls"] is getattr(agent_resolve.models, "TestPatchManifest", None),
            f"Expected schema_cls to be TestPatchManifest from agent_resolve.models, got {mock_gemini.call_args[1].get('schema_cls')}",
        )

        self.assertTrue((self.root / "lib" / "feature.ts").exists())
        self.assertTrue((self.root / "lib" / "__tests__" / "feature.test.ts").exists())
        mock_cmd.assert_has_calls([
            call(
                ["git", "add", "--", "lib/__tests__/feature.test.ts", "lib/feature.ts"],
                check=True,
            ),
            call(
                ["git", "commit", "--no-verify", "-m", "test(winery): Add failing tests for Issue #42"],
                check=True,
            ),
        ])

    def test_stage_2_passes_allowed_files_to_prevent_source_tampering(self) -> None:
        (self.root / "task-plan.md").write_text("# Plan", encoding="utf-8")
        src_file = self.root / "lib" / "utils" / "winery.ts"
        src_file.parent.mkdir(parents=True, exist_ok=True)
        src_file.write_text("export const keepMe = true;\n", encoding="utf-8")

        bp = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/__tests__/tamper.test.ts"],
            target_src_files=["lib/utils/winery.ts"],
            plan_markdown="# Plan",
        )

        tampering_manifest = TestPatchManifest(
            patches=[
                PatchChunk(
                    file_path="lib/utils/winery.ts",
                    search_block="export const keepMe = true;\n",
                    replace_block="export const keepMe = false;\n",
                ),
                PatchChunk(
                    file_path="lib/__tests__/tamper.test.ts",
                    search_block="",
                    replace_block="describe('tamper', () => {});\n",
                ),
            ]
        )
        valid_manifest = TestPatchManifest(
            patches=[
                PatchChunk(
                    file_path="lib/__tests__/tamper.test.ts",
                    search_block="",
                    replace_block="describe('tamper', () => { it('fails', () => { expect(1).toBe(2); }); });\n",
                )
            ]
        )

        with patch.object(
            agent_resolve, "get_project_context", return_value="CONTEXT"
        ), patch.object(
            agent_resolve, "call_gemini_with_fallback", side_effect=[tampering_manifest, valid_manifest]
        ) as mock_gemini, patch.object(
            agent_resolve,
            "run_isolated_test",
            side_effect=[(0, "", ""), (1, '{"numFailedTests": 1}', "")],
        ), patch.object(
            agent_resolve, "validate_jest_red_phase", return_value=(True, "Valid assertion failure")
        ), patch.object(
            agent_resolve, "run_cmd", return_value=(0, "", "")
        ):
            stage_2_red(self.client, 42, "Tamper test", bp, self.tracker)
            self.assertEqual(mock_gemini.call_count, 2)

        prompt_2 = mock_gemini.call_args_list[1][0][1]
        self.assertIn("rejected", prompt_2)
        self.assertIn("lib/utils/winery.ts", prompt_2)
        self.assertEqual(src_file.read_text(encoding="utf-8"), "export const keepMe = true;\n")

    def test_stage_2_reverts_target_tests_and_cleans_staged_stubs_before_retry(self) -> None:
        (self.root / "task-plan.md").write_text("# Plan", encoding="utf-8")
        test_file = self.root / "lib" / "__tests__" / "revert.test.ts"
        test_file.parent.mkdir(parents=True, exist_ok=True)
        test_file.write_text("describe('baseline', () => {});\n", encoding="utf-8")

        bp = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/__tests__/revert.test.ts"],
            target_src_files=["lib/new_stub.ts"],
            plan_markdown="# Plan",
        )

        bad_manifest = TestPatchManifest(
            patches=[
                PatchChunk(
                    file_path="lib/__tests__/revert.test.ts",
                    search_block="describe('baseline', () => {});\n",
                    replace_block="describe('corrupt', () => { syntax error here\n",
                )
            ],
            source_stubs=[
                SourceStubEntry(
                    file_path="lib/new_stub.ts",
                    content="export const bad = 1;",
                )
            ],
        )
        good_manifest = TestPatchManifest(
            patches=[
                PatchChunk(
                    file_path="lib/__tests__/revert.test.ts",
                    search_block="describe('baseline', () => {});\n",
                    replace_block="describe('baseline', () => { it('fails', () => { expect(1).toBe(2); }); });\n",
                )
            ]
        )

        cmd_calls: list[list[str]] = []

        def fake_run_cmd(cmd: list[str], **kwargs: Any) -> tuple[int, str, str]:
            cmd_calls.append(cmd)
            if len(cmd) >= 4 and cmd[:3] == ["git", "checkout", "HEAD"]:
                for target_file in cmd[4:]:
                    p = self.root / target_file
                    if p.name == "revert.test.ts":
                        p.write_text("describe('baseline', () => {});\n", encoding="utf-8")
            return (0, "", "")

        with patch.object(
            agent_resolve, "get_project_context", return_value="CONTEXT"
        ), patch.object(
            agent_resolve, "call_gemini_with_fallback", side_effect=[bad_manifest, good_manifest]
        ), patch.object(
            agent_resolve,
            "run_isolated_test",
            side_effect=[(1, "TypeScript compilation error", ""), (0, "", ""), (1, '{"numFailedTests": 1}', "")],
        ), patch.object(
            agent_resolve, "validate_jest_red_phase", return_value=(True, "Clean failure")
        ), patch.object(
            agent_resolve, "run_cmd", side_effect=fake_run_cmd
        ):
            stage_2_red(self.client, 42, "Revert test", bp, self.tracker)

        checkout_calls = [c for c in cmd_calls if len(c) >= 3 and c[:3] == ["git", "checkout", "HEAD"]]
        self.assertTrue(len(checkout_calls) >= 1, f"Expected git checkout HEAD call, got: {cmd_calls}")

    def test_stage_2_supports_empty_search_blocks_for_new_test_files(self) -> None:
        (self.root / "task-plan.md").write_text("# Plan", encoding="utf-8")
        bp = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/__tests__/brand_new_authored.test.ts"],
            target_src_files=["lib/brand_new.ts"],
            plan_markdown="# Plan",
        )

        manifest = TestPatchManifest(
            patches=[
                PatchChunk(
                    file_path="lib/__tests__/brand_new_authored.test.ts",
                    search_block="",
                    replace_block="describe('brand new', () => { it('fails', () => { expect(1).toBe(2); }); });\n",
                )
            ]
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
            agent_resolve, "validate_jest_red_phase", return_value=(True, "Clean failure")
        ), patch.object(
            agent_resolve, "run_cmd", return_value=(0, "", "")
        ):
            stage_2_red(self.client, 42, "Brand new test authoring", bp, self.tracker)

        created = self.root / "lib" / "__tests__" / "brand_new_authored.test.ts"
        self.assertTrue(created.exists())
        self.assertIn("describe('brand new'", created.read_text(encoding="utf-8"))

    def test_stage_2_prompt_omits_repository_tree(self) -> None:
        (self.root / "task-plan.md").write_text("# Plan", encoding="utf-8")
        bp = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/__tests__/sample.test.ts"],
            target_src_files=["lib/sample.ts"],
            plan_markdown="# Plan",
        )
        manifest = TestPatchManifest(
            patches=[
                PatchChunk(
                    file_path="lib/__tests__/sample.test.ts",
                    search_block="",
                    replace_block="describe('sample', () => { it('fails', () => { expect(1).toBe(2); }); });\n",
                )
            ],
            source_stubs=[],
        )
        with patch(
            "agent_resolve.context.get_repository_tree",
            return_value="### EXISTING REPOSITORY SOURCE FILES:\n- lib/unrelated.ts",
        ), patch.object(
            agent_resolve, "call_gemini_with_fallback", return_value=manifest
        ) as mock_gemini, patch.object(
            agent_resolve,
            "run_isolated_test",
            side_effect=[(0, "", ""), (1, '{"numFailedTests": 1}', "")],
        ), patch.object(
            agent_resolve, "validate_jest_red_phase", return_value=(True, "Clean failure")
        ), patch.object(
            agent_resolve, "run_cmd", return_value=(0, "", "")
        ):
            stage_2_red(self.client, 42, "Context tree omission", bp, self.tracker)

        prompt = mock_gemini.call_args[0][1]
        self.assertNotIn("### EXISTING REPOSITORY SOURCE FILES:", prompt)

    def test_stage_2_prompt_places_static_guidelines_and_role_header_at_prefix(self) -> None:
        (self.root / "task-plan.md").write_text("# Plan", encoding="utf-8")
        (self.root / "CONTEXT.md").write_text("# Domain Context\nFinger Lakes Winery Planner", encoding="utf-8")
        (self.root / "AGENTS.md").write_text("# Agent Rules\nRule 1: Always test", encoding="utf-8")
        bp = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/__tests__/sample.test.ts"],
            target_src_files=["lib/sample.ts"],
            plan_markdown="# Plan",
        )
        manifest = TestPatchManifest(
            patches=[
                PatchChunk(
                    file_path="lib/__tests__/sample.test.ts",
                    search_block="",
                    replace_block="describe('sample', () => { it('fails', () => { expect(1).toBe(2); }); });\n",
                )
            ],
            source_stubs=[],
        )
        with patch.object(
            agent_resolve, "call_gemini_with_fallback", return_value=manifest
        ) as mock_gemini, patch.object(
            agent_resolve,
            "run_isolated_test",
            side_effect=[(0, "", ""), (1, '{"numFailedTests": 1}', "")],
        ), patch.object(
            agent_resolve, "validate_jest_red_phase", return_value=(True, "Clean failure")
        ), patch.object(
            agent_resolve, "run_cmd", return_value=(0, "", "")
        ):
            stage_2_red(self.client, 42, "Prompt caching prefix", bp, self.tracker)

        prompt = mock_gemini.call_args[0][1]
        first_line = prompt.splitlines()[0] if prompt.splitlines() else ""

        self.assertTrue(
            prompt.startswith("You are the Red Phase Executor Agent authoring failing tests.")
        )
        self.assertNotIn("42", first_line)
        self.assertNotIn("Prompt caching prefix", first_line)

        pos_context = prompt.find("### REPOSITORY DOMAIN MODEL (CONTEXT.md):")
        pos_agents = prompt.find("### ARCHITECTURAL RULES & STANDARDS (AGENTS.md):")
        pos_issue = prompt.find("Issue #42")
        pos_blueprint = prompt.find("ARCHITECTURAL BLUEPRINT")

        self.assertNotEqual(pos_context, -1)
        self.assertNotEqual(pos_agents, -1)
        self.assertNotEqual(pos_issue, -1)
        self.assertNotEqual(pos_blueprint, -1)

        self.assertLess(pos_context, pos_issue)
        self.assertLess(pos_context, pos_blueprint)
        self.assertLess(pos_agents, pos_issue)
        self.assertLess(pos_agents, pos_blueprint)



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
                (0, "", ""),  # targeted eslint
                (0, "", ""),  # targeted jest
                (0, "", ""),  # full regression type-check
                (0, "", ""),  # full regression jest
            ],
        ) as mock_test, patch.object(
            agent_resolve, "run_cmd", return_value=(0, "", "")
        ) as mock_cmd:
            stage_3_green(self.client, 42, "Satisfy tests", bp, self.tracker)

        mock_reset.assert_called_once_with(["lib/foo.ts"], baseline_ref="HEAD")
        self.assertEqual(mock_test.call_count, 5)
        mock_test.assert_has_calls([
            call(["npm", "run", "type-check"]),
            call(["npx", "eslint", "--no-warn-ignored", "--", "lib/foo.ts"]),
            call(["npx", "jest", "--no-color", "--silent", "--", "lib/__tests__/foo.test.ts"]),
            call(["npm", "run", "type-check"]),
            call(["npx", "jest", "--no-color", "--silent"]),
        ])
        mock_cmd.assert_has_calls([
            call(["git", "add", "--", "lib/foo.ts"], check=True),
            call(["git", "commit", "--no-verify", "-m", "feat(winery): Implement changes to satisfy Issue #42"], check=True),
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
            side_effect=[(0, "", ""), (0, "", ""), (0, "", ""), (0, "", ""), (0, "", "")],
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
                # Attempt 1: targeted type-check exits 0, targeted eslint exits 0, targeted jest exits 1
                (0, "", ""),
                (0, "", ""),
                (1, "Targeted jest failed", ""),
                # Attempt 2: targeted type-check exits 0, targeted eslint exits 0, targeted jest exits 0, full reg type-check exits 0, full reg jest exits 1
                (0, "", ""),
                (0, "", ""),
                (0, "", ""),
                (0, "", ""),
                (1, "Full regression jest failed", ""),
                # Attempt 3: targeted type-check exits 2 (fails fast, skips jest)
                (2, "Type error", ""),
            ],
        ), patch.object(
            agent_resolve, "run_cmd", return_value=(0, "", "")
        ):
            with self.assertRaises(RuntimeError) as ctx:
                stage_3_green(self.client, 42, "Flaky green", bp, self.tracker)

        self.assertIn("Green phase implementation failed to pass tests after 3 attempts", str(ctx.exception))
        prompt_2 = mock_gemini.call_args_list[1][0][1]
        self.assertIn("PREVIOUS ATTEMPT FAILED TARGETED VERIFICATION:", prompt_2)
        prompt_3 = mock_gemini.call_args_list[2][0][1]
        self.assertIn("TARGETED TESTS PASSED BUT MANDATORY FULL REGRESSION GATE FAILED:", prompt_3)

    def test_stage_3_resets_working_tree_and_cleans_before_each_attempt(self) -> None:
        (self.root / "task-plan.md").write_text("# Plan", encoding="utf-8")
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
        ), patch.object(
            agent_resolve, "apply_patch_manifest", return_value=(True, [])
        ), patch.object(
            agent_resolve,
            "run_isolated_test",
            side_effect=[(0, "", ""), (0, "", ""), (0, "", ""), (0, "", ""), (0, "", "")],
        ), patch.object(
            agent_resolve, "run_cmd", return_value=(0, "", "")
        ) as mock_cmd:
            stage_3_green(self.client, 42, "Satisfy tests", bp, self.tracker, baseline_ref="custom_base")

        mock_cmd.assert_has_calls([
            call(["git", "checkout", "custom_base", "--", "."]),
            call(["git", "clean", "-fd"]),
        ])

    def test_stage_3_passes_allowed_files_to_apply_patch_manifest(self) -> None:
        (self.root / "task-plan.md").write_text("# Plan", encoding="utf-8")
        bp = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/__tests__/foo.test.ts"],
            target_src_files=["lib/foo.ts", "lib/bar.ts"],
            plan_markdown="# Plan",
        )
        manifest = PatchManifest(patches=[])

        with patch.object(
            agent_resolve, "get_project_context", return_value="CONTEXT"
        ), patch.object(
            agent_resolve, "reset_target_sources"
        ), patch.object(
            agent_resolve, "call_gemini_with_fallback", return_value=manifest
        ), patch.object(
            agent_resolve, "apply_patch_manifest", return_value=(True, [])
        ) as mock_apply, patch.object(
            agent_resolve,
            "run_isolated_test",
            side_effect=[(0, "", ""), (0, "", ""), (0, "", ""), (0, "", ""), (0, "", "")],
        ), patch.object(
            agent_resolve, "run_cmd", return_value=(0, "", "")
        ):
            stage_3_green(self.client, 42, "Satisfy tests", bp, self.tracker, new_src_files=["lib/bar.ts"])

        mock_apply.assert_called_once_with(
            manifest,
            new_src_files=["lib/bar.ts"],
            allowed_files=["lib/foo.ts", "lib/bar.ts"],
        )

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

        def fake_run_cmd(cmd, **kwargs):
            if len(cmd) >= 2 and cmd[:2] == ["git", "rm"]:
                for fname in cmd[4:]:
                    p = self.root / fname
                    if p.exists():
                        p.unlink()
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
            agent_resolve,
            "run_isolated_test",
            side_effect=[(0, "", ""), (0, "", ""), (0, "", ""), (0, "", ""), (0, "", "")],
        ), patch.object(
            agent_resolve, "run_cmd", side_effect=fake_run_cmd
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
            call(["git", "rm", "-f", "--ignore-unmatch", ".agent-state.json", "AGENT_HANDOFF.md"]),
            call(["git", "reset", "HEAD"]),
            call(["git", "add", "--", "lib/foo.ts"], check=True),
            call(["git", "commit", "--no-verify", "-m", "feat(winery): Implement changes to satisfy Issue #42"], check=True),
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
                (0, "", ""),  # targeted eslint
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
            "--",
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
            # Attempt 1: targeted type-check passes, targeted eslint passes, targeted jest passes
            if len(test_calls) == 1 and cmd == ["npm", "run", "type-check"]:
                return (0, "", "")
            if len(test_calls) == 2 and len(cmd) >= 3 and cmd[:3] == ["npx", "eslint", "--no-warn-ignored"]:
                return (0, "", "")
            if len(test_calls) == 3 and cmd[:2] == ["npx", "jest"]:
                return (0, "", "")
            # Attempt 1 regression gate: type-check fails with TS2345
            if cmd == ["npm", "run", "type-check"] and len(test_calls) == 4:
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
        # Call 2: targeted eslint
        # Call 3: targeted jest
        # Call 4: regression type-check MUST run before regression jest
        self.assertEqual(test_calls[0], ["npm", "run", "type-check"])
        self.assertEqual(test_calls[1][:3], ["npx", "eslint", "--no-warn-ignored"])
        self.assertEqual(test_calls[2][:2], ["npx", "jest"])
        self.assertEqual(test_calls[3], ["npm", "run", "type-check"], "Regression type-check must run before full Jest suite")

        # Regression jest must NOT be invoked when regression type-check fails on attempt 1
        # Therefore, call 5 must be the start of attempt 2 (targeted type-check), not npm test
        self.assertEqual(test_calls[4], ["npm", "run", "type-check"], "Full Jest suite must be skipped on regression compilation failure")

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

        # 6,000 characters of clean compiler errors with ANSI escape sequences
        head_clean = "HEAD_COMPILER_ERROR_" + ("A" * 1980)  # 2,000 chars
        middle_clean = "MIDDLE_COMPILER_ERROR_" + ("M" * 1978) # 2,000 chars
        tail_clean = ("Z" * 1980) + "TAIL_COMPILER_ERROR_"  # 2,000 chars
        # Total clean = 6,000 chars (truncated = 6,000 - 4,000 = 2,000 chars)
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
        # Must truncate to head (2k) and tail (2k) with exact marker
        expected_marker = "\n\n... [TRUNCATED 2000 CHARS OF VERIFICATION OUTPUT] ...\n\n"
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

        # 6,000 characters of clean error output with ANSI escape sequences
        head_clean = "REG_HEAD_ERROR_" + ("H" * 1985)   # 2,000 chars
        middle_clean = "REG_MID_ERROR_" + ("M" * 1986)   # 2,000 chars
        tail_clean = ("T" * 1985) + "REG_TAIL_ERROR_"   # 2,000 chars
        # Total clean = 6,000 chars. Truncated count = 6000 - 4000 = 2000.
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
            if cmd == ["npx", "jest", "--no-color", "--silent"] and attempt_count < 3:
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
        expected_marker = "\n\n... [TRUNCATED 2000 CHARS OF VERIFICATION OUTPUT] ...\n\n"
        self.assertIn(expected_marker, prompt_2)
        self.assertIn("REG_HEAD_ERROR_", prompt_2)
        self.assertIn("REG_TAIL_ERROR_", prompt_2)
        self.assertNotIn("REG_MID_ERROR_", prompt_2)

    def test_stage_3_combines_stdout_and_stderr_across_verification_failures(self) -> None:
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

        # Test Case 1: Targeted type-check failure combines stdout and stderr
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
                (2, "STDOUT_TC_ERR_MSG", "STDERR_TC_WARN_NOTICE"),
                (0, "", ""),
                (0, "", ""),
                (0, "", ""),
                (0, "", ""),
                (0, "", ""),
            ],
        ), patch.object(
            agent_resolve, "run_cmd", return_value=(0, "", "")
        ):
            stage_3_green(self.client, 42, "Targeted TC failure", bp, self.tracker)
            prompt_2 = mock_gemini.call_args_list[1][0][1]
            self.assertIn("STDOUT_TC_ERR_MSG", prompt_2)
            self.assertIn("STDERR_TC_WARN_NOTICE", prompt_2)

        # Test Case 2: Targeted Jest failure combines stdout and stderr
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
                (0, "", ""),  # targeted tc passes
                (0, "", ""),  # targeted eslint passes
                (1, "STDOUT_JEST_ERR_MSG", "STDERR_JEST_WARN_NOTICE"),  # targeted jest fails
                (0, "", ""),
                (0, "", ""),
                (0, "", ""),
                (0, "", ""),
                (0, "", ""),
            ],
        ), patch.object(
            agent_resolve, "run_cmd", return_value=(0, "", "")
        ):
            stage_3_green(self.client, 42, "Targeted Jest failure", bp, self.tracker)
            prompt_2 = mock_gemini.call_args_list[1][0][1]
            self.assertIn("STDOUT_JEST_ERR_MSG", prompt_2)
            self.assertIn("STDERR_JEST_WARN_NOTICE", prompt_2)

        # Test Case 3: Regression type-check failure combines stdout and stderr
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
                (0, "", ""),  # targeted tc passes
                (0, "", ""),  # targeted eslint passes
                (0, "", ""),  # targeted jest passes
                (2, "STDOUT_REG_TC_ERR_MSG", "STDERR_REG_TC_WARN_NOTICE"),  # reg tc fails
                (0, "", ""),
                (0, "", ""),
                (0, "", ""),
                (0, "", ""),
                (0, "", ""),
            ],
        ), patch.object(
            agent_resolve, "run_cmd", return_value=(0, "", "")
        ):
            stage_3_green(self.client, 42, "Reg TC failure", bp, self.tracker)
            prompt_2 = mock_gemini.call_args_list[1][0][1]
            self.assertIn("STDOUT_REG_TC_ERR_MSG", prompt_2)
            self.assertIn("STDERR_REG_TC_WARN_NOTICE", prompt_2)

        # Test Case 4: Regression Jest failure combines stdout and stderr and runs ["npx", "jest", "--no-color", "--silent"]
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
                (0, "", ""),  # targeted tc passes
                (0, "", ""),  # targeted eslint passes
                (0, "", ""),  # targeted jest passes
                (0, "", ""),  # reg tc passes
                (1, "STDOUT_REG_JEST_ERR_MSG", "STDERR_REG_JEST_WARN_NOTICE"),  # reg jest fails
                (0, "", ""),
                (0, "", ""),
                (0, "", ""),
                (0, "", ""),
                (0, "", ""),
            ],
        ) as mock_test, patch.object(
            agent_resolve, "run_cmd", return_value=(0, "", "")
        ):
            stage_3_green(self.client, 42, "Reg Jest failure", bp, self.tracker)
            prompt_2 = mock_gemini.call_args_list[1][0][1]
            self.assertIn("STDOUT_REG_JEST_ERR_MSG", prompt_2)
            self.assertIn("STDERR_REG_JEST_WARN_NOTICE", prompt_2)
            self.assertIn(call(["npx", "jest", "--no-color", "--silent"]), mock_test.call_args_list)

    def test_stage_3_executes_targeted_eslint_after_type_check_and_proceeds_to_jest_on_success(self) -> None:
        (self.root / "task-plan.md").write_text("# Plan", encoding="utf-8")
        src1 = self.root / "lib" / "foo.ts"
        src1.parent.mkdir(parents=True, exist_ok=True)
        src1.write_text("export const foo = () => true;", encoding="utf-8")
        src2 = self.root / "lib" / "bar.ts"
        src2.write_text("export const bar = () => true;", encoding="utf-8")
        test_file = self.root / "lib" / "__tests__" / "foo.test.ts"
        test_file.parent.mkdir(parents=True, exist_ok=True)
        test_file.write_text("describe('foo', () => {});", encoding="utf-8")

        bp = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/__tests__/foo.test.ts"],
            target_src_files=["lib/foo.ts", "lib/bar.ts"],
            plan_markdown="# Plan",
        )
        manifest = PatchManifest(patches=[])

        with patch.object(
            agent_resolve, "get_project_context", return_value="CONTEXT"
        ), patch.object(
            agent_resolve, "reset_target_sources"
        ), patch.object(
            agent_resolve, "call_gemini_with_fallback", return_value=manifest
        ), patch.object(
            agent_resolve, "apply_patch_manifest", return_value=(True, [])
        ), patch.object(
            agent_resolve,
            "run_isolated_test",
            side_effect=[
                (0, "", ""),  # targeted type-check
                (0, "", ""),  # targeted eslint
                (0, "", ""),  # targeted jest
                (0, "", ""),  # full regression type-check
                (0, "", ""),  # full regression jest
            ],
        ) as mock_test, patch.object(
            agent_resolve, "run_cmd", return_value=(0, "", "")
        ):
            stage_3_green(self.client, 42, "Satisfy tests", bp, self.tracker)

        eslint_cmd = ["npx", "eslint", "--no-warn-ignored", "--", "lib/foo.ts", "lib/bar.ts"]
        self.assertIn(call(eslint_cmd), mock_test.call_args_list)

        calls = [c[0][0] for c in mock_test.call_args_list]
        tc_idx = calls.index(["npm", "run", "type-check"])
        eslint_idx = calls.index(eslint_cmd)
        jest_idx = calls.index(["npx", "jest", "--no-color", "--silent", "--", "lib/__tests__/foo.test.ts"])
        self.assertLess(tc_idx, eslint_idx)
        self.assertLess(eslint_idx, jest_idx)

    def test_stage_3_skips_jest_when_targeted_eslint_fails_and_triggers_retry_loop(self) -> None:
        (self.root / "task-plan.md").write_text("# Plan", encoding="utf-8")
        src_file = self.root / "lib" / "foo.ts"
        src_file.parent.mkdir(parents=True, exist_ok=True)
        src_file.write_text("export const foo = () => true;", encoding="utf-8")
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
            # Attempt 1: targeted type-check passes, targeted eslint fails
            if len(test_calls) == 1 and cmd == ["npm", "run", "type-check"]:
                return (0, "", "")
            if len(test_calls) == 2 and len(cmd) >= 3 and cmd[:3] == ["npx", "eslint", "--no-warn-ignored"]:
                return (1, "lib/foo.ts:10:5: error: Do not nest ternary expressions no-nested-ternary", "")
            # Subsequent verification calls pass
            return (0, "", "")

        with patch.object(
            agent_resolve, "get_project_context", return_value="CONTEXT"
        ), patch.object(
            agent_resolve, "reset_target_sources"
        ) as mock_reset, patch.object(
            agent_resolve, "call_gemini_with_fallback", return_value=manifest
        ) as mock_gemini, patch.object(
            agent_resolve, "apply_patch_manifest", return_value=(True, [])
        ), patch.object(
            agent_resolve, "run_isolated_test", side_effect=fake_run_isolated_test
        ), patch.object(
            agent_resolve, "run_cmd", return_value=(0, "", "")
        ):
            stage_3_green(self.client, 42, "Satisfy tests", bp, self.tracker)

        # In Attempt 1, Jest must NEVER be called
        attempt_1_calls = test_calls[:2]
        self.assertFalse(any("jest" in arg for c in attempt_1_calls for arg in c))

        # Reset should be called twice (before Attempt 1 and Attempt 2)
        self.assertEqual(mock_reset.call_count, 2)

        prompt_2 = mock_gemini.call_args_list[1][0][1]
        self.assertIn("TypeScript Check Exit Code: 0", prompt_2)
        self.assertIn("ESLint Exit Code: 1", prompt_2)
        self.assertIn("Do not nest ternary expressions no-nested-ternary", prompt_2)
        self.assertNotIn("Jest Test Exit Code", prompt_2)
        self.assertNotIn("Jest Errors", prompt_2)

    def test_stage_3_sanitizes_and_truncates_large_eslint_error_output_in_last_error_context(self) -> None:
        (self.root / "task-plan.md").write_text("# Plan", encoding="utf-8")
        src_file = self.root / "lib" / "foo.ts"
        src_file.parent.mkdir(parents=True, exist_ok=True)
        src_file.write_text("export const foo = () => true;", encoding="utf-8")
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

        # 6,000 characters of clean eslint errors with ANSI escape sequences
        head_clean = "HEAD_ESLINT_ERROR_" + ("A" * 1982)  # 2,000 chars
        middle_clean = "MIDDLE_ESLINT_ERROR_" + ("M" * 1980)  # 2,000 chars
        tail_clean = ("Z" * 1982) + "TAIL_ESLINT_ERROR_"  # 2,000 chars
        ansi_error_output = f"\x1b[31;1m{head_clean}\x1b[0m\x1b[33m{middle_clean}\x1b[0m\x1b[34m{tail_clean}\x1b[0m"

        attempt_count = 0
        def fake_run_isolated_test(cmd: list) -> tuple:
            nonlocal attempt_count
            if len(cmd) >= 3 and cmd[:3] == ["npx", "eslint", "--no-warn-ignored"]:
                attempt_count += 1
                if attempt_count == 1:
                    return (1, ansi_error_output, "")
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

        self.assertGreaterEqual(
            len(mock_gemini.call_args_list),
            2,
            "ESLint failure must trigger a retry attempt with error context",
        )
        prompt_2 = mock_gemini.call_args_list[1][0][1]
        self.assertNotIn("\x1b[", prompt_2)
        expected_marker = "\n\n... [TRUNCATED 2000 CHARS OF VERIFICATION OUTPUT] ...\n\n"
        self.assertIn(expected_marker, prompt_2)
        self.assertIn("HEAD_ESLINT_ERROR_", prompt_2)
        self.assertIn("TAIL_ESLINT_ERROR_", prompt_2)
        self.assertNotIn("MIDDLE_ESLINT_ERROR_", prompt_2)

    def test_stage_3_combines_stdout_and_stderr_on_eslint_failure(self) -> None:
        (self.root / "task-plan.md").write_text("# Plan", encoding="utf-8")
        src_file = self.root / "lib" / "foo.ts"
        src_file.parent.mkdir(parents=True, exist_ok=True)
        src_file.write_text("export const foo = () => true;", encoding="utf-8")
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

        attempt_count = 0
        def fake_run_isolated_test(cmd: list) -> tuple:
            nonlocal attempt_count
            if len(cmd) >= 3 and cmd[:3] == ["npx", "eslint", "--no-warn-ignored"]:
                attempt_count += 1
                if attempt_count == 1:
                    return (1, "LINT_STDOUT_ERROR_MSG", "LINT_STDERR_WARN_NOTICE")
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

        self.assertGreaterEqual(
            len(mock_gemini.call_args_list),
            2,
            "ESLint failure must trigger a retry attempt with error context",
        )
        prompt_2 = mock_gemini.call_args_list[1][0][1]
        self.assertIn("LINT_STDOUT_ERROR_MSG", prompt_2)
        self.assertIn("LINT_STDERR_WARN_NOTICE", prompt_2)

    def test_stage_3_prompt_contains_code_hygiene_and_nested_ternary_directive(self) -> None:
        (self.root / "task-plan.md").write_text("# Plan", encoding="utf-8")
        src_file = self.root / "lib" / "foo.ts"
        src_file.parent.mkdir(parents=True, exist_ok=True)
        src_file.write_text("export const foo = () => true;", encoding="utf-8")
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

        with patch.object(
            agent_resolve, "get_project_context", return_value="CONTEXT"
        ), patch.object(
            agent_resolve, "reset_target_sources"
        ), patch.object(
            agent_resolve, "call_gemini_with_fallback", return_value=manifest
        ) as mock_gemini, patch.object(
            agent_resolve, "apply_patch_manifest", return_value=(True, [])
        ), patch.object(
            agent_resolve, "run_isolated_test", return_value=(0, "", "")
        ), patch.object(
            agent_resolve, "run_cmd", return_value=(0, "", "")
        ):
            stage_3_green(self.client, 42, "Satisfy tests", bp, self.tracker)

        prompt = mock_gemini.call_args[0][1]
        self.assertIn(
            "Avoid nested ternary operators (>1 level). When resolving conditional state with multiple fallbacks, extract the logic into a pure, well-named helper function.",
            prompt,
        )

    def test_eslint_config_enforces_no_nested_ternary(self) -> None:
        eslint_config_path = self.orig_root / "eslint.config.mjs"
        self.assertTrue(eslint_config_path.exists(), f"{eslint_config_path} must exist")
        config_content = eslint_config_path.read_text(encoding="utf-8")
        self.assertIn('"no-nested-ternary": "error"', config_content)

    def test_stage_3_prompt_omits_repository_tree(self) -> None:
        (self.root / "task-plan.md").write_text("# Plan", encoding="utf-8")
        test_file = self.root / "lib" / "__tests__" / "sample.test.ts"
        test_file.parent.mkdir(parents=True, exist_ok=True)
        test_file.write_text("describe('sample', () => {});", encoding="utf-8")
        src_file = self.root / "lib" / "sample.ts"
        src_file.parent.mkdir(parents=True, exist_ok=True)
        src_file.write_text("export const sample = () => false;", encoding="utf-8")

        bp = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/__tests__/sample.test.ts"],
            target_src_files=["lib/sample.ts"],
            plan_markdown="# Plan",
        )
        manifest = PatchManifest(
            patches=[
                PatchChunk(
                    file_path="lib/sample.ts",
                    search_block="export const sample = () => false;",
                    replace_block="export const sample = () => true;",
                )
            ]
        )
        with patch(
            "agent_resolve.context.get_repository_tree",
            return_value="### EXISTING REPOSITORY SOURCE FILES:\n- lib/unrelated.ts",
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
                (0, "", ""),  # targeted eslint
                (0, "", ""),  # targeted jest
                (0, "", ""),  # full regression type-check
                (0, "", ""),  # full regression jest
            ],
        ), patch.object(
            agent_resolve, "run_cmd", return_value=(0, "", "")
        ):
            stage_3_green(self.client, 42, "Context tree omission", bp, self.tracker)

        prompt = mock_gemini.call_args[0][1]
        self.assertNotIn("### EXISTING REPOSITORY SOURCE FILES:", prompt)

    def test_stage_3_prompt_places_static_guidelines_and_role_header_at_prefix(self) -> None:
        (self.root / "task-plan.md").write_text("# Plan", encoding="utf-8")
        (self.root / "CONTEXT.md").write_text("# Domain Context\nFinger Lakes Winery Planner", encoding="utf-8")
        (self.root / "AGENTS.md").write_text("# Agent Rules\nRule 1: Always test", encoding="utf-8")
        test_file = self.root / "lib" / "__tests__" / "sample.test.ts"
        test_file.parent.mkdir(parents=True, exist_ok=True)
        test_file.write_text("describe('sample', () => {});", encoding="utf-8")
        src_file = self.root / "lib" / "sample.ts"
        src_file.parent.mkdir(parents=True, exist_ok=True)
        src_file.write_text("export const sample = () => false;", encoding="utf-8")

        bp = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/__tests__/sample.test.ts"],
            target_src_files=["lib/sample.ts"],
            plan_markdown="# Plan",
        )
        manifest = PatchManifest(
            patches=[
                PatchChunk(
                    file_path="lib/sample.ts",
                    search_block="export const sample = () => false;",
                    replace_block="export const sample = () => true;",
                )
            ]
        )
        with patch.object(
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
                (0, "", ""),  # targeted eslint
                (0, "", ""),  # targeted jest
                (0, "", ""),  # full regression type-check
                (0, "", ""),  # full regression jest
            ],
        ), patch.object(
            agent_resolve, "run_cmd", return_value=(0, "", "")
        ):
            stage_3_green(self.client, 42, "Prompt caching prefix", bp, self.tracker)

        prompt = mock_gemini.call_args[0][1]
        first_line = prompt.splitlines()[0] if prompt.splitlines() else ""

        self.assertTrue(
            prompt.startswith("You are the Green Phase Executor Agent implementing code to satisfy the requirements.")
        )
        self.assertNotIn("42", first_line)
        self.assertNotIn("Prompt caching prefix", first_line)

        pos_context = prompt.find("### REPOSITORY DOMAIN MODEL (CONTEXT.md):")
        pos_agents = prompt.find("### ARCHITECTURAL RULES & STANDARDS (AGENTS.md):")
        pos_issue = prompt.find("Issue #42")
        pos_blueprint = prompt.find("ARCHITECTURAL BLUEPRINT")

        self.assertNotEqual(pos_context, -1)
        self.assertNotEqual(pos_agents, -1)
        self.assertNotEqual(pos_issue, -1)
        self.assertNotEqual(pos_blueprint, -1)

        self.assertLess(pos_context, pos_issue)
        self.assertLess(pos_context, pos_blueprint)
        self.assertLess(pos_agents, pos_issue)
        self.assertLess(pos_agents, pos_blueprint)


if __name__ == "__main__":
    unittest.main()
