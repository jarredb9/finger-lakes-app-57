"""
Stage 3 Green Phase Executor (`agent_resolve.stages.stage_3_green`).
"""

from __future__ import annotations

from typing import Any, List, Optional

from agent_resolve import config
from agent_resolve.config import DEFAULT_EXECUTOR_MODELS
from agent_resolve.context import get_project_context
from agent_resolve.environment import log, run_cmd, run_isolated_test
from agent_resolve.llm import call_gemini_with_fallback
from agent_resolve.models import BlueprintPlan, PatchManifest
from agent_resolve.patch_engine import (
    apply_patch_manifest,
    reset_target_sources,
    safe_resolve_repo_path,
)
from agent_resolve.tracker import TokenTracker


def stage_3_green(
    client: Any,
    issue_number: int,
    issue_title: str,
    blueprint: BlueprintPlan,
    token_tracker: TokenTracker,
    new_src_files: Optional[List[str]] = None,
    baseline_ref: str = "HEAD",
    resumption_context: Optional[str] = None,
) -> None:
    """Implements production code with search/replace patching, targeted testing, and mandatory full regression gate."""
    log(f"\n--- [Stage 3] Green Phase Executor for Issue #{issue_number} ---")
    scope = blueprint.scope
    target_tests = blueprint.target_test_files
    target_src = blueprint.target_src_files

    if not target_src:
        raise RuntimeError("No target source files specified in architectural blueprint.")

    plan_md = (config.get_project_root() / "task-plan.md").read_text(encoding="utf-8")
    project_context = get_project_context()

    tests_content = ""
    for tf in target_tests:
        p = safe_resolve_repo_path(tf)
        if p.exists():
            tests_content += f"\nTEST FILE ({tf}):\n```typescript\n{p.read_text(encoding='utf-8')}\n```\n"

    last_error_context = ""
    max_retries = 3

    resumption_section = ""
    if resumption_context:
        resumption_section = f"\n### RESUMPTION CONTEXT & MAINTAINER GUIDANCE:\n{resumption_context}\n"

    for attempt in range(1, max_retries + 1):
        log(f"Implementation attempt {attempt}/{max_retries}...")

        # Reset target source files to clean baseline before each attempt to prevent compounding patch errors
        reset_target_sources(target_src, baseline_ref=baseline_ref)

        src_content = ""
        for sf in target_src:
            p = safe_resolve_repo_path(sf)
            if new_src_files and sf in new_src_files:
                stub_text = p.read_text(encoding="utf-8") if p.exists() else ""
                src_content += f"\nSOURCE FILE ({sf}): (brand new file created for this issue - set search_block='' to replace complete content or patch stub)\n```typescript\n{stub_text}\n```\n"
            elif p.exists():
                src_content += f"\nSOURCE FILE ({sf}):\n```typescript\n{p.read_text(encoding='utf-8')}\n```\n"
            else:
                src_content += f"\nSOURCE FILE ({sf}): (new file to create - set search_block='')\n"

        prompt = f"""You are the Green Phase Executor Agent implementing code to satisfy Issue #{issue_number}: {issue_title}.

{project_context}

ARCHITECTURAL BLUEPRINT:
{plan_md}

TESTS TO PASS:
{tests_content}

CURRENT SOURCE FILES:
{src_content}
{resumption_section}
{last_error_context}

DIRECTIVES (STRICT TDD GREEN PHASE - TARGETED SEARCH/REPLACE PATCHING):
1. Implement the minimal necessary production code in TARGET SOURCE FILES to satisfy the tests and TypeScript types.
2. Adhere strictly to domain standards, coordinate rules, and TypeScript signatures from task-plan.md.
3. CONCISE SEARCH BLOCKS: Keep search_block concise (between 3 and 10 lines of unique anchor context). Do NOT include large 30+ line blocks of surrounding code, imports, or boilerplate.
4. For existing files, specify exact search_block character sequences to replace, including sufficient surrounding context lines to ensure unique matching.
5. For new files, set search_block to an empty string and provide complete file content in replace_block.
6. TYPE HYGIENE: Ensure custom types, interfaces, and function signatures do not clash with global browser DOM or Node.js built-ins. Use explicit type imports and clean naming.
7. DOMAIN INVARIANTS & UI HYGIENE: Adhere strictly to CONTEXT.md naming conventions and AGENTS.md guidelines. When refactoring UI components or adding dropdown menus, NEVER attach click or navigation handlers to trigger elements (such as `DropdownMenuTrigger asChild`), and avoid hacking trigger labels to satisfy obsolete tests.

Respond strictly in valid JSON matching the PatchManifest schema.
"""

        manifest: PatchManifest = call_gemini_with_fallback(
            client,
            prompt,
            DEFAULT_EXECUTOR_MODELS,
            schema_cls=PatchManifest,
            temperature=0.2,
            token_tracker=token_tracker,
        )

        patch_success, patch_errors = apply_patch_manifest(manifest, new_src_files=new_src_files)
        if not patch_success:
            last_error_context = "PREVIOUS ATTEMPT FAILED TO APPLY PATCHES:\n" + "\n".join(patch_errors) + "\nEnsure exact match of search_block against clean baseline source files."
            log(f"Attempt {attempt} patch application failed:\n" + "\n".join(patch_errors))
            continue

        # Targeted Verification Loop
        log("Running targeted verification checks...")
        tc_code, tc_out, tc_err = run_isolated_test(["npm", "run", "type-check"])
        test_cmd = ["npx", "jest"] + target_tests
        t_code, t_out, t_err = run_isolated_test(test_cmd)

        if tc_code == 0 and t_code == 0:
            log("Targeted checks passed! Running MANDATORY FULL REGRESSION GATE (full test suite + type-check)...")
            reg_code, reg_out, reg_err = run_isolated_test(["npm", "test"])
            reg_tc_code, reg_tc_out, reg_tc_err = run_isolated_test(["npm", "run", "type-check"])

            if reg_code == 0 and reg_tc_code == 0:
                log("Mandatory full regression suite passed cleanly!")
                if baseline_ref != "HEAD":
                    log(f"Resumption mode: soft-resetting branch to {baseline_ref[:8]} to squash WIP commits...")
                    run_cmd(["git", "reset", "--soft", baseline_ref], check=True)
                    for f in [".agent-state.json", "AGENT_HANDOFF.md"]:
                        p = config.get_project_root() / f
                        if p.exists():
                            p.unlink()
                run_cmd(["git", "add"] + target_src, check=True)
                commit_msg = f"feat({scope}): Implement changes to satisfy Issue #{issue_number}"
                run_cmd(["git", "commit", "-m", commit_msg], check=True)
                log(f"Committed: {commit_msg}")
                return

            last_error_context = f"""TARGETED TESTS PASSED BUT MANDATORY FULL REGRESSION GATE FAILED:
Full Jest Suite Exit Code: {reg_code}
Full Jest Suite Errors:
{reg_err or reg_out}

Full TypeScript Check Exit Code: {reg_tc_code}
Full TypeScript Errors:
{reg_tc_err or reg_tc_out}

The working tree has been reverted to clean baseline. Ensure your implementation satisfies new tests without breaking existing application features or types.
"""
            log(f"Attempt {attempt} regression gate failed:")
            if reg_code != 0:
                log(f"Regression Jest Suite Errors:\n{reg_err or reg_out}")
            if reg_tc_code != 0:
                log(f"Regression TypeScript Errors:\n{reg_tc_err or reg_tc_out}")
            continue

        last_error_context = f"""PREVIOUS ATTEMPT FAILED TARGETED VERIFICATION:
TypeScript Check Exit Code: {tc_code}
TypeScript Errors:
{tc_err or tc_out}

Jest Test Exit Code: {t_code}
Jest Errors:
{t_err or t_out}

The working tree has been reverted to clean baseline. Generate a corrected patch against baseline that resolves these errors.
"""
        log(f"Attempt {attempt} verification failed:")
        if tc_code != 0:
            log(f"TypeScript Errors:\n{tc_err or tc_out}")
        if t_code != 0:
            log(f"Jest Errors:\n{t_err or t_out}")

    raise RuntimeError(f"Green phase implementation failed to pass tests after {max_retries} attempts.\n{last_error_context}")
