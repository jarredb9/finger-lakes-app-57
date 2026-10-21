"""
Stage 1 Planner (`agent_resolve.stages.stage_1_plan`).
"""

from __future__ import annotations

import json
from typing import Any, List, Optional, Tuple

from agent_resolve import config
from agent_resolve.config import DEFAULT_PLANNER_MODELS
from agent_resolve.context import find_related_test_files, get_project_context
from agent_resolve.environment import log
from agent_resolve.llm import call_gemini_with_fallback
from agent_resolve.models import BlueprintPlan, DiagnosticResult
from agent_resolve.patch_engine import safe_resolve_repo_path
from agent_resolve.tracker import TokenTracker


def is_valid_target_test_file(path: str) -> bool:
    """
    Validates whether a path is an acceptable Jest target test file.
    Rejects paths in supabase/**, e2e/**, or non-Jest extensions.
    """
    norm_path = path.replace("\\", "/").lstrip("./")
    if norm_path.startswith(("supabase/", "e2e/")):
        return False
    if "/supabase/" in norm_path or "/e2e/" in norm_path:
        return False
    if not norm_path.endswith((".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx")):
        return False
    return True


def sanitize_target_test_files(target_test_files: List[str]) -> Tuple[List[str], List[str]]:
    """
    Splits target test files into (valid_tests, invalid_tests).
    Valid paths must:
    1. Not reside under supabase/ or e2e/ (checked via normalized prefix and segment containment).
    2. End with valid Jest test extensions: (.test.ts, .test.tsx, .spec.ts, .spec.tsx).
    """
    valid: List[str] = []
    invalid: List[str] = []
    for tf in target_test_files:
        if is_valid_target_test_file(tf):
            valid.append(tf)
        else:
            invalid.append(tf)
            log(f"Warning: Removed invalid target test file: {tf}")
    return valid, invalid


def stage_1_plan(
    client: Any,
    issue_number: int,
    issue_title: str,
    issue_body: str,
    token_tracker: TokenTracker,
    negative_feedback: str = "",
    diagnostic_result: Optional[DiagnosticResult] = None,
) -> BlueprintPlan:
    """Generates task-plan.md and structured file manifest using Planner model."""
    log(f"\n--- [Stage 1] Architectural Planning for Issue #{issue_number} ---")
    project_context = get_project_context()

    diagnostic_section = ""
    if diagnostic_result:
        snippets_formatted = ""
        for fp, snip in diagnostic_result.code_snippets.items():
            snippets_formatted += f"\n```typescript\n// {fp}\n{snip}\n```\n"

        diagnostic_section = f"""### STAGE 0 DIAGNOSTIC INVESTIGATION FINDINGS:
Verified Target Files:
{json.dumps(diagnostic_result.target_files, indent=2)}

Root Cause / Suspected Behavior:
{diagnostic_result.root_cause}

Discovered Code Snippets:
{snippets_formatted or 'No snippets captured.'}

Investigation Summary:
{diagnostic_result.investigation_summary}
"""

    max_planner_attempts = 2
    feedback_to_inject = negative_feedback
    blueprint: Optional[BlueprintPlan] = None

    for attempt in range(1, max_planner_attempts + 1):
        feedback_section = ""
        if feedback_to_inject:
            feedback_section = f"""### PREVIOUS ARCHITECTURAL ATTEMPT FAILED WITH COMPILER/RED-PHASE ERRORS:
{feedback_to_inject}
Revise your architectural blueprint to resolve these failures. Do not re-attempt an incompatible design.
"""

        prompt = f"""You are the Staff Principal Architect generating an authoritative implementation blueprint for Issue #{issue_number}: {issue_title}.

{project_context}

ISSUE CONTEXT:
Issue #{issue_number}: {issue_title}

{issue_body}
{feedback_section}
{diagnostic_section}
INSTRUCTIONS & ARCHITECTURAL INVARIANTS:
1. Inspect the requirements and determine the minimal, high-cohesion target files to create or modify. Anchor your plan to verified code from Stage 0 diagnostics.
2. DOMAIN MODEL INVARIANT (CONTEXT.md): Adhere strictly to the canonical domain model and architectural rules documented in CONTEXT.md and AGENTS.md.
3. COMPONENT BOUNDARY ISOLATION: Maintain clean component boundaries with single responsibility. Do not overload existing single-purpose components for multi-entity or unrelated concerns; create dedicated components and utilities when introducing new responsibilities.
4. REACT 19 & NEXT.JS 16 JSX TRANSFORM: React automatic JSX runtime is active. Do not plan or author tests/components with unnecessary `import React from 'react'` unless React namespace methods are directly referenced, to avoid TS6133 (`noUnusedLocals`).
5. TEST HARNESS MOCKING INVARIANT: In Jest/JSDOM, `window.location` is locked and non-configurable. Never plan or author tests that attempt to overwrite locked browser globals; mock helper functions or use dependency injection instead.
6. Formulate full TypeScript interfaces, prop types, and behavioral logic (edge cases, fallbacks).
7. Identify explicit target test files (e.g. `lib/utils/__tests__/foo.test.ts` or `components/__tests__/Bar.test.tsx`).
8. Identify explicit target application source files (e.g. `lib/utils/foo.ts` or `components/Bar.tsx`).
9. Determine a clean conventional commit scope (e.g. `winery`, `trip`, `geo`, `ui`).
10. EDGE FUNCTION SHARED MODULE TESTING INVARIANT: When target source files include pure-TypeScript shared modules under `supabase/functions/_shared/*.ts`, their unit tests MUST be authored as Jest test files under `lib/` (e.g. `lib/utils/__tests__/<name>.test.ts`) importing from `@/supabase/functions/_shared/<module>`. Never plan tests under `supabase/` or `e2e/`.
11. SCHEMA & CONTRACT EVOLUTION INVARIANT: When modifying existing stores, schemas, or APIs with breaking changes (e.g., bumping Zustand persist store version, modifying DB schema, changing API signatures), inspect existing test suites and explicitly include all tests with affected assertions in target_test_files. Never leave contract-invalidated tests in blast radius, as blast radius suites are immutable regression guards.

Respond strictly in valid JSON matching the BlueprintPlan schema.
"""

        blueprint = call_gemini_with_fallback(
            client,
            prompt,
            DEFAULT_PLANNER_MODELS,
            schema_cls=BlueprintPlan,
            temperature=0.2,
            token_tracker=token_tracker,
        )

        valid_tests, _invalid_tests = sanitize_target_test_files(blueprint.target_test_files)
        blueprint.target_test_files = valid_tests

        if blueprint.target_test_files:
            break

        if attempt < max_planner_attempts:
            correction_msg = "Target test files must be Jest test files under lib/ or components/ and outside supabase/ and e2e/."
            feedback_to_inject = f"{feedback_to_inject}\n{correction_msg}".strip() if feedback_to_inject else correction_msg

    if not blueprint or not blueprint.target_test_files:
        raise ValueError(
            "No valid target test files specified in architectural blueprint after self-correction: all target test files were invalid (under supabase/, e2e/, or non-Jest)."
        )

    for tf in blueprint.target_test_files:
        safe_resolve_repo_path(tf)
    for sf in blueprint.target_src_files:
        safe_resolve_repo_path(sf)

    # Blast radius discovery: merge model-planned suites with automatically discovered dependent test files,
    # sanitize, deduplicate, exclude target test files, and cap at a maximum of 8 suites.
    raw_blast_candidates = list(blueprint.blast_radius_test_files or []) + find_related_test_files(
        blueprint.target_src_files
    )
    target_tests_set = set(blueprint.target_test_files)
    sanitized_blast: list[str] = []
    seen_blast: set[str] = set()

    for candidate in raw_blast_candidates:
        if (
            is_valid_target_test_file(candidate)
            and candidate not in target_tests_set
            and candidate not in seen_blast
        ):
            seen_blast.add(candidate)
            sanitized_blast.append(candidate)
            log(f"Discovered dependent test file for blast radius: {candidate}")
            if len(sanitized_blast) >= 8:
                break

    blueprint.blast_radius_test_files = sanitized_blast

    plan_path = config.get_project_root() / "task-plan.md"
    plan_path.write_text(blueprint.plan_markdown, encoding="utf-8")

    log("Authoritative blueprint written to task-plan.md (uncommitted).")
    log(f"Commit Scope: {blueprint.scope}")
    log(f"Target test files: {blueprint.target_test_files}")
    log(f"Target source files: {blueprint.target_src_files}")
    if blueprint.blast_radius_test_files:
        log(f"Blast radius test files: {blueprint.blast_radius_test_files}")
    return blueprint
