"""Unit tests for `agent_resolve.models` Pydantic schemas and dataclasses."""

from dataclasses import is_dataclass
import json
import unittest

from pydantic import BaseModel, ValidationError

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
    TestPatchManifest = None  # type: ignore[assignment,misc]


class TestModels(unittest.TestCase):
    def test_diagnostic_action_defaults_and_validation(self) -> None:
        action = DiagnosticAction(action="conclude", reasoning="Found root cause")
        self.assertEqual(action.action, "conclude")
        self.assertEqual(action.reasoning, "Found root cause")
        self.assertEqual(action.query, "")
        self.assertEqual(action.path_prefix, "")
        self.assertEqual(action.pattern, "")
        self.assertEqual(action.file_path, "")
        self.assertEqual(action.start_line, 1)
        self.assertEqual(action.end_line, 80)
        self.assertEqual(action.discovered_target_files, [])

        # Verify default_factory=list prevents cross-instance mutation
        action.discovered_target_files.append("lib/utils/winery.ts")
        second_action = DiagnosticAction(action="grep_search", reasoning="Searching")
        self.assertEqual(second_action.discovered_target_files, [])

        with self.assertRaises(ValidationError):
            DiagnosticAction(action="conclude")  # type: ignore[call-arg]

        with self.assertRaises(ValidationError):
            DiagnosticAction(reasoning="Missing action")  # type: ignore[call-arg]

    def test_blueprint_plan_validation_and_roundtrip(self) -> None:
        plan = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/utils/__tests__/winery.test.ts"],
            target_src_files=["lib/utils/winery.ts"],
            plan_markdown="# Task Plan\n- Update standardizeWineryData",
        )
        json_payload = plan.model_dump_json()
        restored = BlueprintPlan.model_validate_json(json_payload)
        self.assertEqual(restored, plan)

        with self.assertRaises(ValidationError):
            BlueprintPlan(scope="winery", target_test_files=[])  # type: ignore[call-arg]

    def test_blueprint_plan_blast_radius_test_files_default_and_serialization(self) -> None:
        plan1 = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/utils/__tests__/winery.test.ts"],
            target_src_files=["lib/utils/winery.ts"],
            plan_markdown="# Plan",
        )
        plan2 = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/utils/__tests__/winery.test.ts"],
            target_src_files=["lib/utils/winery.ts"],
            plan_markdown="# Plan",
        )
        self.assertEqual(plan1.blast_radius_test_files, [])
        plan1.blast_radius_test_files.append("lib/utils/__tests__/dependent.test.ts")
        self.assertEqual(plan2.blast_radius_test_files, [])

        plan_with_blast = BlueprintPlan(
            scope="winery",
            target_test_files=["lib/utils/__tests__/winery.test.ts"],
            target_src_files=["lib/utils/winery.ts"],
            plan_markdown="# Plan",
            blast_radius_test_files=["lib/utils/__tests__/dependent.test.ts"],
        )
        json_payload = plan_with_blast.model_dump_json()
        restored = BlueprintPlan.model_validate_json(json_payload)
        self.assertEqual(restored.blast_radius_test_files, ["lib/utils/__tests__/dependent.test.ts"])

        legacy_json = json.dumps({
            "scope": "winery",
            "target_test_files": ["lib/utils/__tests__/winery.test.ts"],
            "target_src_files": ["lib/utils/winery.ts"],
            "plan_markdown": "# Plan",
        })
        restored_legacy = BlueprintPlan.model_validate_json(legacy_json)
        self.assertEqual(restored_legacy.blast_radius_test_files, [])

    def test_test_file_manifest_with_optional_source_stubs(self) -> None:
        entry = TestFileEntry(
            file_path="lib/utils/__tests__/winery.test.ts",
            content="describe('winery', () => {});",
        )
        manifest_default = TestFileManifest(files=[entry])
        self.assertEqual(len(manifest_default.files), 1)
        self.assertEqual(manifest_default.files[0].file_path, "lib/utils/__tests__/winery.test.ts")
        self.assertEqual(manifest_default.source_stubs, [])

        stub = SourceStubEntry(file_path="lib/utils/new-helper.ts", content="export {};")
        manifest_with_stubs = TestFileManifest(files=[entry], source_stubs=[stub])
        self.assertEqual(len(manifest_with_stubs.source_stubs), 1)
        self.assertEqual(manifest_with_stubs.source_stubs[0].file_path, "lib/utils/new-helper.ts")

    def test_test_patch_manifest_validation_and_defaults(self) -> None:
        self.assertIsNotNone(TestPatchManifest, "TestPatchManifest must be defined in agent_resolve.models")
        assert TestPatchManifest is not None

        chunk = PatchChunk(
            file_path="lib/utils/__tests__/winery.test.ts",
            search_block="",
            replace_block="describe('winery', () => {});",
        )
        manifest_default = TestPatchManifest(patches=[chunk])
        self.assertEqual(len(manifest_default.patches), 1)
        self.assertEqual(manifest_default.patches[0].file_path, "lib/utils/__tests__/winery.test.ts")
        self.assertEqual(manifest_default.source_stubs, [])

        # Verify instance list isolation (default_factory=list)
        manifest_default.source_stubs.append(
            SourceStubEntry(file_path="lib/utils/stub.ts", content="export {};")
        )
        manifest_clean = TestPatchManifest(patches=[chunk])
        self.assertEqual(manifest_clean.source_stubs, [])

        stub = SourceStubEntry(file_path="lib/utils/new-helper.ts", content="export {};")
        manifest_with_stubs = TestPatchManifest(patches=[chunk], source_stubs=[stub])
        self.assertEqual(len(manifest_with_stubs.source_stubs), 1)
        self.assertEqual(manifest_with_stubs.source_stubs[0].file_path, "lib/utils/new-helper.ts")

        with self.assertRaises(ValidationError):
            TestPatchManifest()  # type: ignore[call-arg]

        # Bidirectional JSON serialization
        json_str = manifest_with_stubs.model_dump_json()
        deserialized = TestPatchManifest.model_validate_json(json_str)
        self.assertEqual(deserialized.patches[0].file_path, manifest_with_stubs.patches[0].file_path)
        self.assertEqual(deserialized.source_stubs[0].file_path, manifest_with_stubs.source_stubs[0].file_path)

    def test_patch_manifest_and_patch_chunk_validation(self) -> None:
        new_file_chunk = PatchChunk(
            file_path="lib/a.ts",
            search_block="",
            replace_block="export const x = 1;",
        )
        edit_chunk = PatchChunk(
            file_path="lib/b.ts",
            search_block="const oldVal = 1;",
            replace_block="const oldVal = 2;",
        )
        manifest = PatchManifest(patches=[new_file_chunk, edit_chunk])
        self.assertEqual(len(manifest.patches), 2)
        self.assertEqual(manifest.patches[0].search_block, "")
        self.assertEqual(manifest.patches[1].file_path, "lib/b.ts")

        with self.assertRaises(ValidationError):
            PatchChunk(file_path="lib/a.ts", search_block="")  # type: ignore[call-arg]

    def test_diagnostic_result_is_dataclass_with_expected_fields(self) -> None:
        self.assertTrue(is_dataclass(DiagnosticResult))
        self.assertFalse(issubclass(DiagnosticResult, BaseModel))

        result = DiagnosticResult(
            target_files=["lib/utils/winery.ts"],
            root_cause="Missing coordinate normalization",
            code_snippets={"lib/utils/winery.ts": "1: export function standardizeWineryData() {}"},
            investigation_summary="Verified explicit file on disk.",
        )
        self.assertEqual(result.target_files, ["lib/utils/winery.ts"])
        self.assertEqual(result.root_cause, "Missing coordinate normalization")
        self.assertIn("lib/utils/winery.ts", result.code_snippets)
        self.assertEqual(result.investigation_summary, "Verified explicit file on disk.")


if __name__ == "__main__":
    unittest.main()
