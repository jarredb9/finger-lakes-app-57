"""
Stage 0 Diagnostic Exploration (`agent_resolve.stages.stage_0_diagnose`).
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

from agent_resolve import config
from agent_resolve.config import DEFAULT_PLANNER_MODELS
from agent_resolve.diagnostics import (
    find_files,
    grep_search,
    parse_issue_diagnostics,
    read_file_snippet,
)
from agent_resolve.environment import log
from agent_resolve.llm import call_gemini_with_fallback
from agent_resolve.models import DiagnosticAction, DiagnosticResult
from agent_resolve.patch_engine import safe_resolve_repo_path
from agent_resolve.tracker import TokenTracker


def stage_0_diagnose(
    client: Any,
    issue_title: str,
    issue_body: str,
    token_tracker: TokenTracker,
) -> DiagnosticResult:
    """
    Stage 0 Diagnostic Loop:
    1. Extracts explicit 'Target Files & Suspected Components' and 'Root Cause' from issue body.
    2. If explicit files are provided, inspects and verifies them using exploration tools.
    3. If not provided or incomplete, runs an iterative diagnostic loop (up to 4-6 tool calls)
       searching for keywords, UI strings, or handlers to discover actual source files and offending functions.
    4. Returns DiagnosticResult with verified target files and code snippets.
    """
    log(f"\n--- [Stage 0] Diagnostic Exploration for: {issue_title} ---")
    suspected_files, parsed_root_cause = parse_issue_diagnostics(issue_body)

    verified_files: List[str] = []
    code_snippets: Dict[str, str] = {}
    investigation_log: List[str] = []

    # Step 1: Inspect explicit files if provided in issue body
    if suspected_files:
        log(f"Parsed {len(suspected_files)} candidate target file(s) from issue body: {suspected_files}")
        for sf in suspected_files:
            try:
                target_p = safe_resolve_repo_path(sf)
                if target_p.exists() and target_p.is_file():
                    verified_files.append(sf)
                    snippet = read_file_snippet(sf, 1, 100)
                    code_snippets[sf] = snippet
                    investigation_log.append(f"Verified explicit file '{sf}' on disk ({len(snippet.splitlines())} lines read).")
                else:
                    search_res = find_files(Path(sf).name)
                    investigation_log.append(f"Explicit file '{sf}' not found on disk. find_files result:\n{search_res}")
                    for line in search_res.splitlines():
                        line_f = line.strip()
                        if line_f and (config.get_project_root() / line_f).is_file() and line_f not in verified_files:
                            verified_files.append(line_f)
                            code_snippets[line_f] = read_file_snippet(line_f, 1, 100)
            except Exception as e:
                investigation_log.append(f"Could not resolve explicit file '{sf}': {e}")

    # Step 2: If no verified files were found or exploration is needed, run iterative diagnostic loop
    if not verified_files:
        log("No explicit target files verified on disk. Starting iterative tool-equipped diagnostic loop...")
        max_tool_calls = 5
        history: List[str] = []

        for step in range(1, max_tool_calls + 1):
            log(f"Diagnostic loop step {step}/{max_tool_calls}...")
            history_text = "\n".join(history) if history else "No previous tool calls."
            discovered_text = ", ".join(verified_files) if verified_files else "None"

            prompt = f"""You are the Stage 0 Diagnostic Exploration Agent diagnosing an issue in this repository.
Your mission is to find the exact source files and offending functions or components causing the problem.

ISSUE TITLE: {issue_title}

ISSUE BODY:
{issue_body}

PREVIOUS TOOL ACTIONS & OBSERVATIONS:
{history_text}

VERIFIED RELEVANT FILES SO FAR:
{discovered_text}

AVAILABLE TOOLS:
1. `grep_search`: Query strings, function names, error text, or keywords across the codebase.
2. `find_files`: Find files by glob or pattern (e.g. '*navigation*', '*winery*').
3. `read_file_snippet`: Inspect 1-indexed line range of a file.
4. `conclude`: Conclude investigation once the root cause and target files are identified.

Choose your next action to locate the relevant files and offending logic.
Respond strictly in valid JSON matching the DiagnosticAction schema.
"""
            action: DiagnosticAction = call_gemini_with_fallback(
                client,
                prompt,
                DEFAULT_PLANNER_MODELS,
                schema_cls=DiagnosticAction,
                temperature=0.1,
                token_tracker=token_tracker,
            )

            log(f"Diagnostic Action [{step}]: {action.action} (Reason: {action.reasoning})")

            # Collect any files declared by the agent
            for tf in action.discovered_target_files:
                try:
                    p = safe_resolve_repo_path(tf)
                    if p.exists() and p.is_file() and tf not in verified_files:
                        verified_files.append(tf)
                        if tf not in code_snippets:
                            code_snippets[tf] = read_file_snippet(tf, 1, 100)
                except Exception:
                    pass

            if action.action == "conclude":
                investigation_log.append(f"Concluded diagnosis at step {step}: {action.reasoning}")
                if action.discovered_target_files:
                    investigation_log.append(f"Identified target files: {action.discovered_target_files}")
                break

            tool_output = ""
            if action.action == "grep_search":
                tool_output = grep_search(action.query, action.path_prefix)
            elif action.action == "find_files":
                tool_output = find_files(action.pattern)
            elif action.action == "read_file_snippet":
                tool_output = read_file_snippet(action.file_path, action.start_line, action.end_line)
                if "=== File:" in tool_output and action.file_path not in verified_files:
                    try:
                        p = safe_resolve_repo_path(action.file_path)
                        if p.exists() and p.is_file():
                            verified_files.append(action.file_path)
                            code_snippets[action.file_path] = tool_output
                    except Exception:
                        pass
            else:
                tool_output = f"Unknown action: {action.action}"

            history.append(f"Step {step}: Action={action.action}, Args={action.model_dump(exclude={'action', 'reasoning', 'discovered_target_files'})}\nResult:\n{tool_output[:1500]}")
            investigation_log.append(f"Step {step} {action.action}: {action.reasoning}")

    summary_str = "\n".join(investigation_log)
    log(f"Stage 0 complete: {len(verified_files)} verified file(s) identified.")
    return DiagnosticResult(
        target_files=verified_files,
        root_cause=parsed_root_cause or "Diagnosed via repository exploration.",
        code_snippets=code_snippets,
        investigation_summary=summary_str,
    )
