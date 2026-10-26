"""
Autonomous Issue Resolver VCS and GitHub CLI helpers (`agent_resolve.vcs`).
"""

from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
from typing import Optional, Sequence, Tuple

from agent_resolve import config
from agent_resolve.config import DEFAULT_EXECUTOR_MODELS, DEFAULT_PLANNER_MODELS
from agent_resolve.environment import log, run_cmd, sanitize_secrets
from agent_resolve.models import BlueprintPlan
from agent_resolve.tracker import TokenTracker


def gh_cli(args: Sequence[str], timeout: int = 180) -> Tuple[int, str, str]:
    """Executes a GitHub CLI command with secret sanitization on all arguments."""
    sanitized_args = [sanitize_secrets(arg) if isinstance(arg, str) else arg for arg in args]
    return run_cmd(["gh"] + list(sanitized_args), timeout=timeout)


def reset_working_tree_to_main() -> None:
    """Discards uncommitted changes, untracked files, and checks out main cleanly (preserving diagnostic-artifacts/)."""
    project_root = config.get_project_root()
    tp = project_root / "task-plan.md"
    if tp.exists():
        tp.unlink()
    run_cmd(["git", "reset", "--hard", "HEAD"])
    run_cmd(["git", "clean", "-fd", "-e", "diagnostic-artifacts"])
    run_cmd(["git", "checkout", "main"])
    code, _, _ = run_cmd(["git", "rev-parse", "--verify", "origin/main"])
    if code == 0:
        run_cmd(["git", "reset", "--hard", "origin/main"])


def cleanup_feature_branch(branch_name: str) -> None:
    """Cleans up local feature branch, scrubs untracked files, and reverts working tree to main."""
    reset_working_tree_to_main()
    run_cmd(["git", "branch", "-D", branch_name])


def fetch_maintainer_hints(issue_number: int, last_failure_timestamp: str) -> str:
    """Fetches comments authored strictly by jarredb9 created after last_failure_timestamp."""
    code, out, _ = gh_cli([
        "issue", "view", str(issue_number),
        "--json", "comments",
    ])
    if code != 0 or not out or not out.strip():
        return ""
    try:
        data = json.loads(out)
        comments = data.get("comments", [])
        hints = []
        for c in comments:
            author = c.get("author", {}).get("login", "")
            body = c.get("body", "").strip()
            created_at = c.get("createdAt", "")
            if author == "jarredb9":
                if not last_failure_timestamp or created_at > last_failure_timestamp:
                    hints.append(f"Comment from @jarredb9 ({created_at}):\n{body}")
        if hints:
            log(f"Ingested {len(hints)} guidance comment(s) from maintainer @jarredb9.")
        return "\n\n".join(hints)
    except Exception as e:
        log(f"Warning: Failed to parse maintainer comments: {e}")
        return ""


def update_or_create_pr(
    issue_number: int,
    issue_title: str,
    blueprint: BlueprintPlan,
    branch_name: str,
    token_tracker: TokenTracker,
    elapsed_sec: int,
    is_resumption: bool = False,
) -> None:
    """Creates a new Draft PR or mutates an existing Draft PR in-place."""
    blast_radius_line = ""
    blast_radius_files = getattr(blueprint, "blast_radius_test_files", []) if blueprint else []
    if blast_radius_files:
        blast_radius_line = f"\n- **Blast Radius Tests:** {', '.join(f'`{f}`' for f in blast_radius_files)}"

    resumption_tag = " [Resumed from previous checkpoint]" if is_resumption else ""
    pr_body = f"""## Summary
Autonomous multi-agent resolution for Issue #{issue_number}: {issue_title}

Closes #{issue_number}

### Pipeline Execution Details
1. **Architectural Blueprint:** Authored `task-plan.md` using `{DEFAULT_PLANNER_MODELS[0]}`.
2. **Red Phase Executor:** Authored failing tests (`test({blueprint.scope}): ...`) with 2-attempt compiler self-correction loop using `{DEFAULT_EXECUTOR_MODELS[0]}`.
3. **Green Phase Executor:** Implemented minimal code satisfying tests via search/replace patches (`feat({blueprint.scope}): ...`).{resumption_tag}

### Observability & Verification
- **Verification:** Targeted suite and full regression gate (`npm test` and `npm run type-check`) passed cleanly inside network-isolated sandbox.
- **Duration:** {elapsed_sec} seconds.
- **Token Consumption:** {token_tracker.summary()}.
- **Target Files:**
  - Tests: {", ".join(f"`{f}`" for f in blueprint.target_test_files)}
  - Source: {", ".join(f"`{f}`" for f in blueprint.target_src_files)}{blast_radius_line}
"""
    pr_body = sanitize_secrets(pr_body)
    pr_code, pr_list_out, _ = gh_cli(["pr", "list", "--head", branch_name, "--state", "open", "--json", "number"])
    existing_pr_num = None
    if pr_code == 0 and pr_list_out.strip():
        try:
            prs = json.loads(pr_list_out)
            if prs:
                existing_pr_num = prs[0]["number"]
        except Exception:
            pass

    if existing_pr_num:
        log(f"Updating existing Draft PR #{existing_pr_num} in-place...")
        gh_cli([
            "pr", "edit", str(existing_pr_num),
            "--title", f"fix({blueprint.scope}): {issue_title}",
            "--body", pr_body,
            "--remove-label", "ready-for-human",
            "--add-label", "agent:in-review",
        ])
        gh_cli(["issue", "edit", str(issue_number), "--remove-label", "agent:in-progress", "--remove-label", "ready-for-human", "--remove-label", "agent:resolve", "--add-label", "agent:in-review"])
        gh_cli(["issue", "comment", str(issue_number), "--body", f"✅ Autonomous multi-agent Draft PR #{existing_pr_num} updated with passing implementation.\n\n{token_tracker.summary()}."])
    else:
        log("Creating new Draft Pull Request...")
        pr_res, pr_out, pr_err = gh_cli([
            "pr", "create",
            "--draft",
            "--title", f"fix({blueprint.scope}): {issue_title}",
            "--body", pr_body,
            "--head", branch_name,
            "--base", "main",
            "--reviewer", "jarredb9",
            "--label", "agent:in-review",
        ])
        if pr_res != 0:
            raise RuntimeError(f"Failed to create Draft PR via gh CLI (exit code {pr_res}):\n{pr_err}\n{pr_out}")
        gh_cli(["issue", "edit", str(issue_number), "--remove-label", "agent:in-progress", "--remove-label", "ready-for-agent", "--remove-label", "agent:resolve", "--add-label", "agent:in-review"])
        gh_cli(["issue", "comment", str(issue_number), "--body", f"✅ Autonomous multi-agent Draft PR submitted for review: {pr_out.strip()}\n\n{token_tracker.summary()}."])


def preserve_failed_work(
    issue_number: int,
    issue_title: str,
    blueprint: Optional[BlueprintPlan],
    branch_name: str,
    error_summary: str,
    token_tracker: TokenTracker,
    elapsed_sec: int,
    dry_run: bool = False,
) -> None:
    """Preserves failed agent state, commits WIP code and diagnostics, and pushes to origin."""
    project_root = config.get_project_root()
    error_summary = sanitize_secrets(error_summary)
    if blueprint is None:
        log(f"No architectural blueprint produced for Issue #{issue_number}; cleaning up branch.")
        cleanup_feature_branch(branch_name)
        if not dry_run:
            gh_cli(["issue", "edit", str(issue_number), "--remove-label", "agent:in-progress", "--remove-label", "agent:resolve", "--add-label", "ready-for-human"])
            gh_cli(["issue", "comment", str(issue_number), "--body", f"⚠️ Autonomous agent resolution halted during Stage 1 planning ({elapsed_sec}s):\n\n```\n{error_summary}\n```\n\nIssue downgraded to `ready-for-human` for morning maintainer review."])
        return

    scope = blueprint.scope
    target_tests = blueprint.target_test_files
    target_src = blueprint.target_src_files

    # Check if a Red Phase commit exists
    _, red_sha_out, _ = run_cmd(["git", "log", "--grep=^test(", "-n", "1", "--format=%H"])
    red_phase_commit_sha = red_sha_out.strip()

    # Commit any uncommitted source or test changes (excluding task-plan.md)
    _, status_out, _ = run_cmd(["git", "status", "--porcelain"])
    if status_out.strip():
        staged_targets = [f for f in target_tests + target_src if (project_root / f).exists()]
        if staged_targets:
            run_cmd(["git", "add", "--"] + staged_targets)
            run_cmd(["git", "commit", "--no-verify", "-m", f"wip({scope}): Incomplete implementation for Issue #{issue_number} [skip ci]"])

    run_cmd(["git", "checkout", "--", "."])
    run_cmd(["git", "clean", "-fd"])

    # Prepare checkpoint state
    now_iso = datetime.now(timezone.utc).isoformat()
    prev_attempts = 0
    state_path = project_root / ".agent-state.json"
    if state_path.exists():
        try:
            prev_attempts = int(json.loads(state_path.read_text(encoding="utf-8")).get("attempt_count", 0))
        except Exception:
            pass

    current_attempt = prev_attempts + 1

    state_data = {
        "version": "1.0",
        "issue_number": issue_number,
        "issue_title": issue_title,
        "scope": scope,
        "plan_markdown": blueprint.plan_markdown if blueprint else "",
        "target_test_files": target_tests,
        "target_src_files": target_src,
        "blast_radius_test_files": getattr(blueprint, "blast_radius_test_files", []) if blueprint else [],
        "red_phase_commit_sha": red_phase_commit_sha,
        "failed_phase": "stage_3_green" if red_phase_commit_sha else "stage_2_red",
        "attempt_count": current_attempt,
        "last_failure_timestamp": now_iso,
        "error_summary": error_summary,
    }

    state_path.write_text(json.dumps(state_data, indent=2), encoding="utf-8")

    handoff_md = f"""# Autonomous Agent Handoff: Issue #{issue_number}

- **Issue**: #{issue_number} - {issue_title}
- **Scope**: {scope}
- **Timestamp**: {datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")}
- **Failed Phase**: {state_data["failed_phase"]}
- **Tokens Used**: {token_tracker.summary()}
- **Duration**: {elapsed_sec}s

## Diagnostics & Error Context
```
{error_summary}
```

## Target Files
- **Tests**: {", ".join(f"`{f}`" for f in target_tests)}
- **Source**: {", ".join(f"`{f}`" for f in target_src)}

## How to Resume Locally
```bash
git checkout {branch_name}
npm run type-check
npx jest {" ".join(target_tests)}
```

## How to Queue for Next Overnight Run
1. Inspect the diagnostics above and add guidance comments on Issue #{issue_number}.
2. Re-apply label `agent:resolve` to Issue #{issue_number}.
"""
    handoff_path = project_root / "AGENT_HANDOFF.md"
    handoff_path.write_text(handoff_md, encoding="utf-8")

    run_cmd(["git", "add", "--", ".agent-state.json", "AGENT_HANDOFF.md"])
    run_cmd(["git", "commit", "--no-verify", "-m", f"docs(agent): Checkpoint state for Issue #{issue_number} [skip ci]"])

    if dry_run:
        log(f"[Dry Run] Checkpoint state written for Issue #{issue_number}.")
        reset_working_tree_to_main()
        run_cmd(["git", "branch", "-D", branch_name])
        return

    # Push WIP branch
    log(f"Pushing WIP branch {branch_name} to origin...")
    gh_token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    push_env = os.environ.copy()
    if gh_token:
        push_env["GH_TOKEN"] = gh_token
    run_cmd(["git", "push", "--force", "origin", branch_name], env=push_env, check=True)

    # Check for existing PR
    pr_code, pr_list_out, _ = gh_cli(["pr", "list", "--head", branch_name, "--state", "open", "--json", "number"])
    existing_pr_num = None
    if pr_code == 0 and pr_list_out.strip():
        try:
            prs = json.loads(pr_list_out)
            if prs:
                existing_pr_num = prs[0]["number"]
        except Exception:
            pass

    wip_title = f"WIP: fix({scope}): {issue_title} [FAILED CHECKS]"
    wip_body = f"""## WIP Autonomous Agent Run

Issue #{issue_number} failed implementation verification checks after {elapsed_sec}s.
See `AGENT_HANDOFF.md` and `.agent-state.json` on branch `{branch_name}` for full diagnostics.

Closes #{issue_number}

### Metrics
- **Tokens Used:** {token_tracker.summary()}
- **Duration:** {elapsed_sec}s
- **Status:** Handed off to human maintainer for review or guidance comment.
"""

    if existing_pr_num:
        log(f"Updating Draft PR #{existing_pr_num} to WIP state...")
        gh_cli([
            "pr", "edit", str(existing_pr_num),
            "--title", wip_title,
            "--body", wip_body,
            "--remove-label", "agent:in-review",
            "--add-label", "ready-for-human",
        ])
    else:
        log("Creating WIP Draft PR...")
        gh_cli([
            "pr", "create",
            "--draft",
            "--title", wip_title,
            "--body", wip_body,
            "--head", branch_name,
            "--base", "main",
            "--reviewer", "jarredb9",
            "--label", "ready-for-human",
        ])

    gh_cli(["issue", "edit", str(issue_number), "--remove-label", "agent:in-progress", "--remove-label", "agent:resolve", "--add-label", "ready-for-human"])
    if current_attempt >= 2:
        failure_comment = (
            f"🛑 Autonomous agent resolution permanently halted after {current_attempt} consecutive overnight attempts ({elapsed_sec}s):\n\n"
            f"```\n{error_summary}\n```\n\n"
            f"**Metrics:** {token_tracker.summary()}\n\n"
            f"WIP branch `{branch_name}` pushed to origin with `AGENT_HANDOFF.md`. "
            f"Circuit breaker triggered. Issue permanently downgraded to `ready-for-human` for maintainer review."
        )
    else:
        failure_comment = (
            f"⚠️ Autonomous agent resolution halted during overnight execution ({elapsed_sec}s):\n\n"
            f"```\n{error_summary}\n```\n\n"
            f"**Metrics:** {token_tracker.summary()}\n\n"
            f"WIP branch `{branch_name}` pushed to origin with `AGENT_HANDOFF.md`. "
            f"Issue downgraded to `ready-for-human` for morning maintainer review. "
            f"To re-queue for the next overnight run, reply with guidance and re-apply `agent:resolve`."
        )
    gh_cli(["issue", "comment", str(issue_number), "--body", failure_comment])

    # Preserve diagnostic artifacts in a dedicated directory before wiping working tree
    artifacts_dir = project_root / "diagnostic-artifacts"
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    for f_name in [".agent-state.json", "AGENT_HANDOFF.md", "task-plan.md"]:
        src_file = project_root / f_name
        if src_file.exists():
            shutil.copy2(src_file, artifacts_dir / f_name)
    for log_file in project_root.glob("*.log"):
        if log_file.is_file():
            shutil.copy2(log_file, artifacts_dir / log_file.name)

    reset_working_tree_to_main()


__all__: list[str] = [
    "gh_cli",
    "reset_working_tree_to_main",
    "cleanup_feature_branch",
    "fetch_maintainer_hints",
    "update_or_create_pr",
    "preserve_failed_work",
]
