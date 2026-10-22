"""Pydantic structured output schemas and diagnostic dataclasses for `agent_resolve`."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T", bound=BaseModel)


class DiagnosticAction(BaseModel):
    action: str = Field(
        description="Action to execute: 'grep_search', 'find_files', 'read_file_snippet', or 'conclude'"
    )
    query: str = Field(
        default="",
        description="Search query string for grep_search (function name, UI text, error string)",
    )
    path_prefix: str = Field(
        default="",
        description="Optional directory path prefix for grep_search (e.g. 'lib/', 'components/')",
    )
    pattern: str = Field(
        default="",
        description="File name glob or keyword for find_files (e.g. '*nav*', '*card*')",
    )
    file_path: str = Field(
        default="",
        description="Repository-relative file path for read_file_snippet",
    )
    start_line: int = Field(
        default=1,
        description="1-indexed starting line number for read_file_snippet",
    )
    end_line: int = Field(
        default=80,
        description="1-indexed ending line number for read_file_snippet",
    )
    discovered_target_files: List[str] = Field(
        default_factory=list,
        description="Target source files verified or strongly suspected",
    )
    reasoning: str = Field(
        description="Architectural rationale explaining why this tool is called or concluding findings"
    )


class BlueprintPlan(BaseModel):
    scope: str = Field(description="Conventional commit scope, e.g. winery, trip, geo, ui")
    target_test_files: List[str] = Field(
        description="Explicit list of unit or component test file paths to create or modify"
    )
    target_src_files: List[str] = Field(
        description="Explicit list of application source file paths to create or modify"
    )
    plan_markdown: str = Field(description="Full markdown content for task-plan.md")
    blast_radius_test_files: List[str] = Field(
        default_factory=list,
        description="Downstream test suites executed during Stage 3 verification but excluded from LLM prompts and Stage 2 authoring",
    )


class TestFileEntry(BaseModel):
    file_path: str = Field(
        description="Repository-relative test file path, e.g. lib/utils/__tests__/map-utils.test.ts"
    )
    content: str = Field(description="Complete test file content")


class SourceStubEntry(BaseModel):
    file_path: str = Field(description="Repository-relative new source file path to stub")
    content: str = Field(
        description="Minimal TypeScript type declarations and function stubs throwing 'Not implemented'"
    )


class TestFileManifest(BaseModel):
    files: List[TestFileEntry] = Field(
        description="List of test files to create or overwrite"
    )
    source_stubs: List[SourceStubEntry] = Field(
        default_factory=list,
        description="Minimal stubs for brand new source files that do not yet exist on disk",
    )


class PatchChunk(BaseModel):
    file_path: str = Field(description="Repository-relative path of the target source file")
    search_block: str = Field(
        description="Exact character sequence in the existing file to find and replace. Leave empty ONLY if creating a brand new source file."
    )
    replace_block: str = Field(
        description="Exact replacement code to insert in place of search_block."
    )


class PatchManifest(BaseModel):
    patches: List[PatchChunk] = Field(
        description="Ordered list of search/replace patch chunks to apply"
    )


class TestPatchManifest(BaseModel):
    patches: List[PatchChunk] = Field(
        description="Ordered list of search/replace patch chunks to apply to target test files"
    )
    source_stubs: List[SourceStubEntry] = Field(
        default_factory=list,
        description="Minimal stubs for brand new source files that do not yet exist on disk",
    )


@dataclass
class DiagnosticResult:
    target_files: List[str]
    root_cause: str
    code_snippets: Dict[str, str]
    investigation_summary: str


__all__ = [
    "T",
    "DiagnosticAction",
    "BlueprintPlan",
    "TestFileEntry",
    "SourceStubEntry",
    "TestFileManifest",
    "PatchChunk",
    "PatchManifest",
    "TestPatchManifest",
    "DiagnosticResult",
]
