"""
CLI entrypoint and argument parser for autonomous issue resolver.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from typing import List, Optional, Tuple

from agent_resolve import config
from agent_resolve.config import BATCH_PACING_SECONDS
from agent_resolve.environment import log
from agent_resolve.llm import get_genai_client
from agent_resolve.pipeline import resolve_issue
from agent_resolve.vcs import gh_cli


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    """Parses command-line arguments for the autonomous issue resolver harness."""
    parser = argparse.ArgumentParser(description="Autonomous GitHub Issue Resolver Harness")
    parser.add_argument("--issue", "-i", type=int, help="Specific GitHub issue number to resolve")
    parser.add_argument("--max-issues", "-m", type=int, default=3, help="Maximum number of issues to process (default: 3)")
    parser.add_argument("--dry-run", action="store_true", help="Run without pushing branches or updating GitHub issues")
    return parser.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> None:
    """Main CLI entrypoint orchestrating single-issue and batch issue resolution flows."""
    args = parse_args(argv)
    client = get_genai_client()

    if args.issue:
        code, out, err = gh_cli(["issue", "view", str(args.issue), "--json", "number,title,body,author,labels"])
        if code != 0:
            log(f"Error viewing issue #{args.issue}: {err}", file=sys.stderr)
            sys.exit(1)
        issue_data = json.loads(out)
        success = resolve_issue(client, issue_data, dry_run=args.dry_run)
        sys.exit(0 if success else 1)

    log(f"Querying up to {args.max_issues} open issues labeled 'agent:resolve'...")
    code, out, err = gh_cli([
        "issue", "list",
        "--state", "open",
        "--label", "agent:resolve",
        "--limit", str(args.max_issues),
        "--json", "number,title,body,author,labels",
    ])
    if code != 0:
        log(f"Error querying issues: {err}", file=sys.stderr)
        sys.exit(1)

    issues = json.loads(out)
    if not issues:
        log("No open issues labeled 'agent:resolve' found.")
        sys.exit(0)

    log(f"Found {len(issues)} issue(s) to process.")
    results: List[Tuple[int, bool]] = []
    for idx, issue in enumerate(issues):
        delay = getattr(config, "BATCH_PACING_SECONDS", BATCH_PACING_SECONDS)
        if idx > 0 and delay > 0:
            log(f"Pacing delay: sleeping {delay}s before next issue...")
            time.sleep(delay)

        success = resolve_issue(client, issue, dry_run=args.dry_run)
        results.append((issue["number"], success))

    log("\n================ BATCH EXECUTION SUMMARY ================")
    all_success = True
    for num, success in results:
        status_icon = "✅ SUCCESS" if success else "❌ FAILED"
        log(f"Issue #{num}: {status_icon}")
        if not success:
            all_success = False
    log("=========================================================\n")

    if not all_success:
        log("Batch execution finished with one or more failed issues.", file=sys.stderr)
        sys.exit(1)
    sys.exit(0)


__all__ = ["parse_args", "main"]


if __name__ == "__main__":
    main()
