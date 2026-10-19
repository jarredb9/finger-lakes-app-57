"""
Stage 2 Red Phase Executor (`agent_resolve.stages.stage_2_red`).
"""

from __future__ import annotations

import json
from typing import Any, List, Optional

from agent_resolve import config
from agent_resolve.config import DEFAULT_EXECUTOR_MODELS
from agent_resolve.context import extract_test_suite_names, get_project_context
from agent_resolve.environment import log, run_cmd, run_isolated_test
from agent_resolve.exceptions import Stage2CompilationError
from agent_resolve.llm import call_gemini_with_fallback
from agent_resolve.models import BlueprintPlan, TestFileManifest
from agent_resolve.patch_engine import safe_resolve_repo_path
from agent_resolve.tracker import TokenTracker
from agent_resolve.verification import validate_jest_red_phase


def stage_2_red(
    client: Any,
    issue_number: int,
    issue_title: str,
    blueprint: BlueprintPlan,
    token_tracker: TokenTracker,
    new_src_files: Optional[List[str]] = None,
    initial_error_context: str = "",
) -> None:
    """Authors failing unit/component tests in target_test_files with a 2-attempt compiler self-correction loop."""
    log(f"\n--- [Stage 2] Red Phase Executor for Issue #{issue_number} ---")
    scope = blueprint.scope
    target_tests = blueprint.target_test_files

    if not target_tests:
        raise RuntimeError("No target test files specified in architectural blueprint.")

    if new_src_files is None:
        new_src_files = [sf for sf in blueprint.target_src_files if not safe_resolve_repo_path(sf).exists()]

    project_context = get_project_context()
    plan_md = (config.get_project_root() / "task-plan.md").read_text(encoding="utf-8")
    last_compiler_error = initial_error_context
    max_red_retries = 2

    for attempt in range(1, max_red_retries + 1):
        log(f"Authoring tests (attempt {attempt}/{max_red_retries})...")

        existing_tests_context = ""
        for tf in target_tests:
            p = safe_resolve_repo_path(tf)
            if p.exists():
                existing_tests_context += f"\nFILE: {tf}\n```typescript\n{p.read_text(encoding='utf-8')}\n```\n"

        new_src_prompt_section = ""
        if new_src_files:
            new_src_prompt_section = f"""
BRAND NEW TARGET SOURCE FILES (NOT YET CREATED ON DISK):
{json.dumps(new_src_files, indent=2)}

NOTE ON BRAND NEW SOURCE FILES:
The files above do not exist in the repository yet. To ensure TypeScript compilation passes (`npm run type-check`), you MUST provide minimal type definitions and function stubs (throwing `new Error("Not implemented")`) in `source_stubs` for each of these files. This allows test imports to compile cleanly (exit 0) and fail at runtime in Jest.
Existing source files must remain untouched.
"""

        prompt = f"""You are the Red Phase Executor Agent authoring failing tests for Issue #{issue_number}: {issue_title}.

{project_context}

ARCHITECTURAL BLUEPRINT (task-plan.md):
{plan_md}

EXISTING TEST CONTEXT:
{existing_tests_context or 'Target test files do not yet exist.'}

TARGET TEST FILES:
{json.dumps(target_tests, indent=2)}
{new_src_prompt_section}
{last_compiler_error}

DIRECTIVES (STRICT TDD RED PHASE):
1. Author comprehensive unit or component tests in the TARGET TEST FILES that assert the behavior requested in task-plan.md.
2. For existing source files, DO NOT modify any production or source code files. Existing code must remain untouched.
3. For brand new source files listed above, provide minimal TypeScript function/type stubs (throwing new Error("Not implemented")) in `source_stubs` so that test imports compile cleanly (exit 0) and fail at runtime in Jest.
4. COMPILER STRICTNESS INVARIANT (TS6133): In tsconfig.json, 'noUnusedParameters' and 'noUnusedLocals' are active. In your source_stubs, any unused function parameters MUST be prefixed with an underscore '_' (e.g. `_options: any`). In test files, DO NOT include unused imports (such as `import React from 'react'`) to prevent TS6133 compiler failures.
5. TYPE HYGIENE: Ensure custom types, interfaces, and function signatures do not clash with global browser DOM or Node.js built-ins. Use explicit type imports and clean naming.
6. Tests must be valid TypeScript: correct imports, mock setups (Jest/Testing Library), and type annotations.
7. Output complete file contents for each target test file.
8. JSDOM & BROWSER MOCKING INVARIANT: In Jest/JSDOM, `window.location` is locked and non-configurable. DO NOT attempt to redefine or overwrite it via `Object.defineProperty(window, 'location', ...)`. Instead, test navigation by mocking helper functions, using dependency injection, or utilizing jest.spyOn. Ensure test setup hooks (`beforeEach`/`afterEach`) execute cleanly without throwing unhandled exceptions.
9. PRESERVATION OF EXISTING TESTS: For any target test file that already exists on disk, you MUST retain all pre-existing test suites and describe blocks (such as saveTripMembers). You may add new tests or update obsolete tests within the targeted feature suite, but you MUST NEVER silently drop or truncate unrelated test suites in the file.

Respond strictly in valid JSON matching the TestFileManifest schema.
"""

        manifest: TestFileManifest = call_gemini_with_fallback(
            client,
            prompt,
            DEFAULT_EXECUTOR_MODELS,
            schema_cls=TestFileManifest,
            temperature=0.2,
            token_tracker=token_tracker,
        )

        # Pre-flight check: ensure no pre-existing describe suites were unintentionally dropped
        dropped_suites: List[str] = []
        for entry in manifest.files:
            p = safe_resolve_repo_path(entry.file_path)
            if p.exists():
                orig_text = p.read_text(encoding="utf-8")
                orig_suites = extract_test_suite_names(orig_text)
                new_suites = extract_test_suite_names(entry.content)
                missing = [s for s in orig_suites if s not in new_suites]
                if missing:
                    dropped_suites.append(f"{entry.file_path}: dropped suites {missing}")

        if dropped_suites and attempt < max_red_retries:
            last_compiler_error = f"""PREVIOUS ATTEMPT DROPPED PRE-EXISTING TEST SUITES:
{chr(10).join(dropped_suites)}
You MUST retain all pre-existing test suites in existing test files! Do not truncate or drop unrelated describe blocks.
"""
            log(f"Red phase attempt {attempt} dropped pre-existing test suites:\n{last_compiler_error}")
            continue

        staged_stubs: List[str] = []
        for stub in getattr(manifest, "source_stubs", []):
            if stub.file_path in new_src_files or (stub.file_path in blueprint.target_src_files and not safe_resolve_repo_path(stub.file_path).exists()):
                p = safe_resolve_repo_path(stub.file_path)
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text(stub.content, encoding="utf-8")
                log(f"Wrote initial source stub: {stub.file_path}")
                staged_stubs.append(stub.file_path)
                if stub.file_path not in new_src_files:
                    new_src_files.append(stub.file_path)

        # Fallback scaffolding: ensure any un-stubbed new source file at least exists on disk
        for nsf in new_src_files:
            p = safe_resolve_repo_path(nsf)
            if not p.exists():
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text("export {};\n", encoding="utf-8")
                log(f"Scaffolded empty fallback stub: {nsf}")
                staged_stubs.append(nsf)

        for entry in manifest.files:
            p = safe_resolve_repo_path(entry.file_path)
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(entry.content, encoding="utf-8")
            log(f"Wrote test file: {entry.file_path}")

        # Compiler Gate: npm run type-check must exit 0
        log("Verifying TypeScript compilation (npm run type-check)...")
        tc_code, tc_out, tc_err = run_isolated_test(["npm", "run", "type-check"])
        if tc_code != 0:
            last_compiler_error = f"""PREVIOUS COMPILATION FAILED:
Exit Code: {tc_code}
TypeScript Errors:
{tc_err or tc_out}
Fix the imports, type annotations, and mock declarations in the target test files.
Ensure all new source files listed above have appropriate function/type stubs in source_stubs.
Prefix any unused stub parameters with '_' to avoid TS6133 errors.
"""
            log(f"TypeScript compilation failed on attempt {attempt}:\n{tc_err or tc_out}")
            if attempt < max_red_retries:
                continue
            raise Stage2CompilationError(f"Red phase test authoring failed TypeScript compilation after {max_red_retries} attempts:\n{tc_err or tc_out}")

        # Red Verification Gate: jest test must fail with clean assertion failures, NOT runtime harness crashes
        log("Verifying test failure against current production code...")
        test_cmd = ["npx", "jest", "--json"] + target_tests
        t_code, t_out, t_err = run_isolated_test(test_cmd)

        is_valid_red, red_diagnostics = validate_jest_red_phase(t_code, t_out, t_err)
        if not is_valid_red:
            last_compiler_error = f"""PREVIOUS TESTS FAILED RED PHASE VERIFICATION:
{red_diagnostics}

Your tests crashed at runtime instead of failing assertions on unimplemented features.
Ensure test setup hooks (beforeEach/afterEach) and mocks are completely valid in JSDOM:
- DO NOT use Object.defineProperty to overwrite window.location (it is locked and non-configurable in JSDOM).
- Use Jest spies on utility functions or mock interfaces instead of mutating browser globals.
- Ensure all imports, mocks, and fixtures exist and execute cleanly.
"""
            log(f"Red phase verification failed on attempt {attempt}: {red_diagnostics}")
            if attempt < max_red_retries:
                continue
            raise RuntimeError(f"Red phase failed verification after {max_red_retries} attempts: {red_diagnostics}")

        log(f"Red phase verified successfully: tests failed with valid assertions (exit code {t_code}).")

        # Commit Red phase tests and initial source stubs
        run_cmd(["git", "add"] + target_tests + staged_stubs, check=True)
        commit_msg = f"test({scope}): Add failing tests for Issue #{issue_number}"
        run_cmd(["git", "commit", "-m", commit_msg], check=True)
        log(f"Committed: {commit_msg}")
        return
