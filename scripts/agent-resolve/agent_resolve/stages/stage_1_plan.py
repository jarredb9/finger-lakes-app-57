"""
Stage 1 Planner (`agent_resolve.stages.stage_1_plan`).
"""

from __future__ import annotations

import json
from typing import Any, Optional

from agent_resolve import config
from agent_resolve.config import DEFAULT_PLANNER_MODELS
from agent_resolve.context import find_related_test_files, get_project_context
from agent_resolve.environment import log
from agent_resolve.llm import call_gemini_with_fallback
from agent_resolve.models import BlueprintPlan, DiagnosticResult
from agent_resolve.patch_engine import safe_resolve_repo_path
from agent_resolve.tracker import TokenTracker


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

    feedback_section = ""
    if negative_feedback:
        feedback_section = f"""### PREVIOUS ARCHITECTURAL ATTEMPT FAILED WITH COMPILER/RED-PHASE ERRORS:
{negative_feedback}
Revise your architectural blueprint to resolve these failures. Do not re-attempt an incompatible design.
"""

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

Respond strictly in valid JSON matching the BlueprintPlan schema.
"""

    blueprint: BlueprintPlan = call_gemini_with_fallback(
        client,
        prompt,
        DEFAULT_PLANNER_MODELS,
        schema_cls=BlueprintPlan,
        temperature=0.2,
        token_tracker=token_tracker,
    )

    for tf in blueprint.target_test_files:
        safe_resolve_repo_path(tf)
    for sf in blueprint.target_src_files:
        safe_resolve_repo_path(sf)

    # Blast radius discovery: automatically detect dependent test files to prevent regression collisions
    related_tests = find_related_test_files(blueprint.target_src_files)
    for rt in related_tests:
        if rt not in blueprint.target_test_files:
            log(f"Discovered dependent test file for blast radius: {rt}")
            blueprint.target_test_files.append(rt)

    plan_path = config.get_project_root() / "task-plan.md"
    plan_path.write_text(blueprint.plan_markdown, encoding="utf-8")

    log("Authoritative blueprint written to task-plan.md (uncommitted).")
    log(f"Commit Scope: {blueprint.scope}")
    log(f"Target test files: {blueprint.target_test_files}")
    log(f"Target source files: {blueprint.target_src_files}")
    return blueprint
