"""
Issue resolution orchestrator pipeline (`agent_resolve.pipeline`).
"""

from __future__ import annotations

import json
import os
import sys
import time
from typing import Any, Dict, List, Optional, Tuple

from agent_resolve import config
from agent_resolve.context import extract_agent_brief, is_issue_suitable_for_headless_agent
from agent_resolve.environment import log, run_cmd, run_isolated_test
from agent_resolve.exceptions import Stage2CompilationError
from agent_resolve.models import BlueprintPlan
from agent_resolve.patch_engine import reset_target_sources, safe_resolve_repo_path
from agent_resolve.stages import (
    stage_0_diagnose,
    stage_1_plan,
    stage_2_red,
    stage_3_green,
)
from agent_resolve.stages.stage_1_plan import is_valid_target_test_file
from agent_resolve.tracker import TokenTracker
from agent_resolve.vcs import (
    cleanup_feature_branch,
    fetch_maintainer_hints,
    gh_cli,
    preserve_failed_work,
    reset_working_tree_to_main,
    update_or_create_pr,
)
from agent_resolve.verification import validate_jest_red_phase

__all__ = [
    "resolve_issue",
    "sanitize_resumption_test_targets",
]


def sanitize_resumption_test_targets(
    red_sha: str,
    raw_target_test_files: List[str],
    raw_blast_radius_test_files: Optional[List[str]] = None,
) -> Tuple[List[str], List[str]]:
    """
    Sanitizes target_test_files and blast_radius_test_files during stateful iterative resumption.

    1. Filters raw_target_test_files using is_valid_target_test_file:
       - Rejects paths under supabase/** and e2e/**.
       - Rejects paths not ending with .test.ts, .test.tsx, .spec.ts, .spec.tsx.
    2. Queries files modified in red_phase_commit_sha via:
       git diff-tree --no-commit-id --name-only -r <red_sha>
    3. Filters target_test_files to valid Jest test files modified in <red_sha>.
       Falls back to the first 3 valid Jest test files if diff is empty, command fails,
       or matches none of the target test files.
    4. Demotes remaining valid Jest test files from target_test_files into blast_radius_test_files.
    5. Merges demoted files with raw_blast_radius_test_files, deduplicates preserving order,
       strips non-Jest paths, excludes any file present in healed target_test_files,
       and caps blast radius at 8 suites.

    Returns:
        Tuple[List[str], List[str]]: (healed_target_test_files, healed_blast_radius_test_files)
    """
    valid_raw_targets = [f for f in raw_target_test_files if is_valid_target_test_file(f)]

    code, stdout, _ = run_cmd(["git", "diff-tree", "--no-commit-id", "--name-only", "-r", red_sha])
    healed_targets: List[str] = []
    if code == 0 and stdout.strip():
        diff_files = {line.strip() for line in stdout.splitlines() if line.strip()}
        healed_targets = [f for f in valid_raw_targets if f in diff_files]

    if code != 0 or not stdout.strip() or len(healed_targets) == 0:
        healed_targets = valid_raw_targets[:3]

    demoted_targets = [f for f in valid_raw_targets if f not in healed_targets]

    candidate_blast = demoted_targets + (raw_blast_radius_test_files or [])
    healed_blast_radius: List[str] = []
    seen = set(healed_targets)

    for f in candidate_blast:
        if is_valid_target_test_file(f) and f not in seen:
            seen.add(f)
            healed_blast_radius.append(f)
            if len(healed_blast_radius) == 8:
                break

    return healed_targets, healed_blast_radius


def resolve_issue(client: Any, issue_data: Dict[str, Any], dry_run: bool = False) -> bool:
    """Processes a single issue through the 3-stage TDD pipeline with git isolation and stateful resumption."""
    issue_number = issue_data["number"]
    issue_title = issue_data.get("title", "")
    issue_body = issue_data.get("body", "")
    author_login = issue_data.get("author", {}).get("login", "")

    brief = extract_agent_brief(issue_data)
    if brief:
        log(f"Ingested authoritative Agent Brief from @jarredb9 for Issue #{issue_number}.")
        issue_body = f"{issue_body}\n\n---\n\n### AUTHORITATIVE TRIAGE SPECIFICATION:\n{brief}"

    start_time = time.time()
    token_tracker = TokenTracker()
    blueprint: Optional[BlueprintPlan] = None

    log(f"\n=======================================================")
    log(f"Processing Issue #{issue_number}: {issue_title}")
    log(f"Author: {author_login}")
    log(f"=======================================================")

    # Security & Provenance Gate
    if author_login != "jarredb9":
        log(f"Security Gate Rejected: Issue #{issue_number} authored by '{author_login}', not 'jarredb9'.")
        if not dry_run:
            gh_cli(["issue", "edit", str(issue_number), "--remove-label", "agent:resolve", "--add-label", "ready-for-human"])
            gh_cli(["issue", "comment", str(issue_number), "--body", "⚠️ Autonomous agent resolution rejected: Issue author is not verified repository maintainer."])
        return False

    # Complexity & Scope Triage Advisory
    is_suitable, reason = is_issue_suitable_for_headless_agent(issue_title, issue_body)
    if not is_suitable:
        log(f"⚠️ Complexity Advisory for Issue #{issue_number}: Contains interactive or platform-specific elements: {reason}.")
        log("Advisory: If resolution involves complex DOM gestures or deep-links, human-in-the-loop Antigravity CLI review is recommended.")

    branch_name = f"agent/issue-{issue_number}"

    # Idempotency guard: skip if open PR is already in review and issue is not explicitly re-queued
    pr_code, pr_list_out, _ = gh_cli(["pr", "list", "--head", branch_name, "--state", "open", "--json", "number,labels"])
    if pr_code == 0 and pr_list_out.strip():
        try:
            existing_prs = json.loads(pr_list_out)
            if existing_prs:
                pr_labels = [l.get("name") for l in existing_prs[0].get("labels", [])]
                issue_labels = [l.get("name") for l in issue_data.get("labels", [])]
                if "agent:in-review" in pr_labels and "agent:resolve" not in issue_labels:
                    log(f"Skipping Issue #{issue_number}: Open PR #{existing_prs[0]['number']} on {branch_name} is already in review.")
                    return True
        except Exception:
            pass

    reset_working_tree_to_main()

    if not dry_run:
        gh_cli(["issue", "edit", str(issue_number), "--remove-label", "agent:resolve", "--add-label", "agent:in-progress"])

    is_resumption = False

    try:
        # Check if remote branch exists for Stateful Iterative Resumption
        code_ls, _, _ = run_cmd(["git", "ls-remote", "--exit-code", "--heads", "origin", branch_name])
        if code_ls == 0:
            log(f"Existing remote branch {branch_name} detected. Fetching for resumption...")
            run_cmd(["git", "fetch", "origin", f"{branch_name}:{branch_name}"])
            run_cmd(["git", "checkout", branch_name])
            run_cmd(["git", "reset", "--hard", f"origin/{branch_name}"])

            # Attempt rebase onto origin/main
            reb_code, _, _ = run_cmd(["git", "rebase", "origin/main"])
            if reb_code != 0:
                log(f"Rebase conflict on {branch_name} against origin/main. Aborting rebase and starting fresh.")
                run_cmd(["git", "rebase", "--abort"])
                if not dry_run:
                    gh_cli(["issue", "comment", str(issue_number), "--body", "⚡ Upstream `main` diverged with merge conflicts; resetting checkpoint and starting fresh resolution from `origin/main`."])
                reset_working_tree_to_main()
                run_cmd(["git", "checkout", "-B", branch_name, "origin/main"])
            else:
                log(f"Rebase onto origin/main applied cleanly.")
                state_path = config.get_project_root() / ".agent-state.json"
                plan_path = config.get_project_root() / "task-plan.md"
                checkpoint_loaded = False
                state_data = {}
                if state_path.exists():
                    try:
                        state_data = json.loads(state_path.read_text(encoding="utf-8"))
                        plan_md = state_data.get("plan_markdown", "")
                        if not plan_md and plan_path.exists():
                            plan_md = plan_path.read_text(encoding="utf-8")
                        if plan_md:
                            plan_path.write_text(plan_md, encoding="utf-8")
                            checkpoint_loaded = True
                    except Exception as e_load:
                        log(f"Warning: Failed to parse checkpoint state: {e_load}. Starting fresh from origin/main.")
                        reset_working_tree_to_main()
                        run_cmd(["git", "checkout", "-B", branch_name, "origin/main"])

                if checkpoint_loaded:
                    attempt_count = int(state_data.get("attempt_count", 1))
                    if attempt_count >= 2:
                        log(f"🛑 Circuit breaker triggered: Issue #{issue_number} has reached max overnight attempts ({attempt_count}). Halting automated execution.")
                        cleanup_feature_branch(branch_name)
                        if not dry_run:
                            gh_cli(["issue", "edit", str(issue_number), "--remove-label", "agent:in-progress", "--remove-label", "agent:resolve", "--add-label", "ready-for-human"])
                            gh_cli(["issue", "comment", str(issue_number), "--body", f"🛑 Autonomous agent resolution permanently halted: Issue #{issue_number} reached {attempt_count} consecutive overnight attempts without resolution. Escalated to maintainer."])
                        return False

                    red_sha = state_data.get("red_phase_commit_sha")
                    if not red_sha:
                        _, out_sha, _ = run_cmd(["git", "log", "--grep=^test(", "-n", "1", "--format=%H"])
                        red_sha = out_sha.strip()

                    raw_t_tests = state_data.get("target_test_files", [])
                    raw_b_tests = state_data.get("blast_radius_test_files", [])
                    t_src = state_data.get("target_src_files", [])
                    t_scope = state_data.get("scope", "agent")
                    last_fail_ts = state_data.get("last_failure_timestamp", "")

                    if red_sha and raw_t_tests and t_src:
                        t_tests, b_tests = sanitize_resumption_test_targets(red_sha, raw_t_tests, raw_b_tests)
                        log(f"Running deterministic Red Gate verification for checkpoint {red_sha[:8]}...")
                        reset_target_sources(t_src, baseline_ref=red_sha)
                        tc_code, tc_out, tc_err = run_isolated_test(["npm", "run", "type-check"])
                        t_code, t_out, t_err = run_isolated_test(["npx", "jest", "--json"] + t_tests)

                        is_valid_red, red_diagnostics = validate_jest_red_phase(t_code, t_out, t_err)

                        if tc_code == 0 and is_valid_red:
                            log(f"⚡ Checkpoint verified! (type-check passed, clean assertion failures). Fast-forwarding directly to Stage 3 Green Phase!")
                            is_resumption = True
                            blueprint = BlueprintPlan(
                                scope=t_scope,
                                target_test_files=t_tests,
                                target_src_files=t_src,
                                plan_markdown=state_data.get("plan_markdown") or (plan_path.read_text(encoding="utf-8") if plan_path.exists() else ""),
                                blast_radius_test_files=b_tests,
                            )
                            new_src_files = [sf for sf in blueprint.target_src_files if not safe_resolve_repo_path(sf).exists()]

                            maintainer_hints = fetch_maintainer_hints(issue_number, last_fail_ts)
                            _, wip_diff, _ = run_cmd(["git", "diff", red_sha, "HEAD", "--"] + t_src)

                            resumption_context = f"PREVIOUS ATTEMPT FAILED WITH:\n{state_data.get('error_summary', '')}\n"
                            if wip_diff:
                                resumption_context += f"\nPREVIOUS WIP CODE DIFF (FAILED ATTEMPT):\n```diff\n{wip_diff[:4000]}\n```\n"
                            if maintainer_hints:
                                resumption_context += f"\nMAINTAINER GUIDANCE FROM @jarredb9:\n{maintainer_hints}\n"

                            stage_3_green(
                                client,
                                issue_number,
                                issue_title,
                                blueprint,
                                token_tracker,
                                new_src_files=new_src_files,
                                baseline_ref=red_sha,
                                resumption_context=resumption_context,
                            )
                        else:
                            if tc_code != 0:
                                fail_reason = f"TypeScript check exit code {tc_code} ({tc_err or tc_out})"
                            else:
                                fail_reason = f"Invalid test failure in checkpoint ({red_diagnostics})"
                            log(f"Checkpoint verification failed: {fail_reason}.")

                            # Autonomous Checkpoint Invalidation:
                            # Roll back to the blueprint plan commit (red_sha~1) and re-author clean Red Phase tests.
                            log("⚡ Autonomous Checkpoint Invalidation: Rolling back to blueprint commit to re-author clean Red Phase tests...")
                            parent_check, _, _ = run_cmd(["git", "rev-parse", "--verify", f"{red_sha}~1"])
                            if parent_check == 0:
                                run_cmd(["git", "reset", "--hard", f"{red_sha}~1"])
                                blueprint = BlueprintPlan(
                                    scope=t_scope,
                                    target_test_files=t_tests,
                                    target_src_files=t_src,
                                    plan_markdown=state_data.get("plan_markdown") or (plan_path.read_text(encoding="utf-8") if plan_path.exists() else ""),
                                    blast_radius_test_files=b_tests,
                                )
                                new_src_files = [sf for sf in blueprint.target_src_files if not safe_resolve_repo_path(sf).exists()]

                                initial_err = f"PREVIOUS CHECKPOINT TESTS CRASHED AT RUNTIME:\n{red_diagnostics}\nFix mocks and test hooks so tests fail purely on assertion expectations."
                                try:
                                    stage_2_red(
                                        client,
                                        issue_number,
                                        issue_title,
                                        blueprint,
                                        token_tracker,
                                        new_src_files=new_src_files,
                                        initial_error_context=initial_err,
                                    )
                                except Stage2CompilationError as s2_err:
                                    log(f"⚡ Tier 3 Blueprint Invalidation: Stage 2 test authoring hit an architectural dead end: {s2_err}")
                                    log("Resetting to origin/main and re-planning Stage 1 with negative feedback...")
                                    reset_working_tree_to_main()
                                    run_cmd(["git", "checkout", "-B", branch_name, "origin/main"])
                                    blueprint = stage_1_plan(
                                        client,
                                        issue_number,
                                        issue_title,
                                        issue_body,
                                        token_tracker,
                                        negative_feedback=f"""PREVIOUS ARCHITECTURAL BLUEPRINT FAILED COMPILATION IN RED PHASE:
Failed Blueprint:
{blueprint.plan_markdown}

Target Source Files:
{blueprint.target_src_files}

Compiler Errors:
{s2_err}

Do not attempt to modify incompatible existing components; design clean, isolated modules and interfaces with correct prop signatures and exports."""
                                    )
                                    new_src_files = [sf for sf in blueprint.target_src_files if not safe_resolve_repo_path(sf).exists()]
                                    stage_2_red(
                                        client,
                                        issue_number,
                                        issue_title,
                                        blueprint,
                                        token_tracker,
                                        new_src_files=new_src_files,
                                    )

                                stage_3_green(
                                    client,
                                    issue_number,
                                    issue_title,
                                    blueprint,
                                    token_tracker,
                                    new_src_files=new_src_files,
                                    baseline_ref="HEAD",
                                )
                                is_resumption = True
                            else:
                                log(f"Warning: Could not verify parent of {red_sha[:8]}, starting fresh from origin/main.")
                                reset_working_tree_to_main()
                                run_cmd(["git", "checkout", "-B", branch_name, "origin/main"])
        else:
            run_cmd(["git", "checkout", "-B", branch_name, "origin/main"])

        # If not resuming, run full pipeline starting with Stage 0 Diagnostic Exploration
        if not is_resumption:
            # Stage 0: Diagnostic Exploration
            diagnostic_result = stage_0_diagnose(client, issue_title, issue_body, token_tracker)

            # Stage 1: Blueprint Plan
            blueprint = stage_1_plan(
                client,
                issue_number,
                issue_title,
                issue_body,
                token_tracker,
                diagnostic_result=diagnostic_result,
            )

            # Track any brand new source files designated in the blueprint
            new_src_files = [sf for sf in blueprint.target_src_files if not safe_resolve_repo_path(sf).exists()]

            # Stage 2: Red Phase Tests with Tier 3 Blueprint Invalidation fallback
            try:
                stage_2_red(client, issue_number, issue_title, blueprint, token_tracker, new_src_files=new_src_files)
            except Stage2CompilationError as s2_err:
                log(f"⚡ Tier 3 Blueprint Invalidation: Stage 2 test authoring hit an architectural dead end: {s2_err}")
                log("Resetting to origin/main and re-planning Stage 1 with negative feedback...")
                reset_working_tree_to_main()
                run_cmd(["git", "checkout", "-B", branch_name, "origin/main"])
                blueprint = stage_1_plan(
                    client,
                    issue_number,
                    issue_title,
                    issue_body,
                    token_tracker,
                    negative_feedback=f"""PREVIOUS ARCHITECTURAL BLUEPRINT FAILED COMPILATION IN RED PHASE:
Failed Blueprint:
{blueprint.plan_markdown}

Target Source Files:
{blueprint.target_src_files}

Compiler Errors:
{s2_err}

Do not attempt to modify incompatible existing components; design clean, isolated modules and interfaces with correct prop signatures and exports.""",
                    diagnostic_result=diagnostic_result,
                )
                new_src_files = [sf for sf in blueprint.target_src_files if not safe_resolve_repo_path(sf).exists()]
                stage_2_red(client, issue_number, issue_title, blueprint, token_tracker, new_src_files=new_src_files)

            # Stage 3: Green Phase Implementation
            stage_3_green(client, issue_number, issue_title, blueprint, token_tracker, new_src_files=new_src_files)

        elapsed_sec = int(time.time() - start_time)

        if dry_run:
            log(f"[Dry Run] Issue #{issue_number} successfully resolved locally in {elapsed_sec}s.")
            log(f"[Dry Run] Token usage: {token_tracker.summary()}")
            reset_working_tree_to_main()
            run_cmd(["git", "branch", "-D", branch_name])
            return True

        # Git hygiene: Ensure task-plan.md is NOT committed or included in PR diff
        code_tp, _, _ = run_cmd(["git", "ls-files", "--error-unmatch", "task-plan.md"])
        if code_tp == 0:
            run_cmd(["git", "rm", "-f", "task-plan.md"])
            run_cmd(["git", "commit", "-m", "chore: remove task-plan.md from branch"])
        plan_p = config.get_project_root() / "task-plan.md"
        if plan_p.exists():
            plan_p.unlink()

        # Push branch & submit or update Draft Pull Request
        log(f"Pushing branch {branch_name} to origin...")
        gh_token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
        push_env = os.environ.copy()
        if gh_token:
            push_env["GH_TOKEN"] = gh_token
        run_cmd(["git", "push", "--force", "origin", branch_name], env=push_env, check=True)

        update_or_create_pr(
            issue_number,
            issue_title,
            blueprint,
            branch_name,
            token_tracker,
            elapsed_sec,
            is_resumption=is_resumption,
        )
        log(f"Issue #{issue_number} resolved and submitted for review.")

        reset_working_tree_to_main()
        return True

    except Exception as e:
        elapsed_sec = int(time.time() - start_time)
        log(f"\n❌ Error resolving Issue #{issue_number} after {elapsed_sec}s: {e}", file=sys.stderr)
        preserve_failed_work(
            issue_number=issue_number,
            issue_title=issue_title,
            blueprint=blueprint,
            branch_name=branch_name,
            error_summary=str(e),
            token_tracker=token_tracker,
            elapsed_sec=elapsed_sec,
            dry_run=dry_run,
        )
        return False
