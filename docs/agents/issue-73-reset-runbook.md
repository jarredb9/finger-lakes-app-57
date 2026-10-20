# Operational Runbook: Issue #73 Post-Merge Manual Reset

## Overview
Issue #73 (`fix(api): places-edge-sync retry backoff and jitter`) previously encountered prompt token blowout and unbounded Jest output during overnight autonomous runs due to unchecked blast radius discovery and stateful resumption target pollution.

Following the merge of the `agent-resolve-token-limits` track (`fix/77-agent-resolve-token-limits`), maintainers must manually execute this runbook to clean up stale remote branches, close abandoned draft PRs, and re-queue Issue #73 for clean autonomous resolution.

## Pre-Conditions
- The `agent-resolve-token-limits` PR is merged into `main`.
- Maintainer has local git write access and GitHub CLI (`gh`) authenticated with repository write permissions.

## Execution Procedure

### 1. Delete Stale Remote Feature Branch
Delete the remote branch where the previous corrupted state checkpoint resided:
```bash
git push origin --delete agent/issue-73
```

### 2. Close Abandoned Draft Pull Request
Close Draft PR #76 with an explanatory comment referencing this track:
```bash
gh pr close 76 --comment "Superseded by agent-resolve-token-limits track. Resetting Issue #73 for clean resolution."
```

### 3. Reset Issue Labels
Remove human-escalation and in-progress labels, then re-apply the autonomous resolve label to queue Issue #73:
```bash
gh issue edit 73 --remove-label ready-for-human --remove-label agent:in-progress --add-label agent:resolve
```

### 4. Trigger Workflow or Await Scheduled Run
- Trigger manually via GitHub Actions UI (`Agent Resolve` workflow), or
- Await the next scheduled nightly execution.

### 5. Verification Post-Run
Verify that Issue #73 executes with:
- Bounded blast radius discovery ($\le 8$ suites, proximity sorted).
- 25% discounted cached token budget accounting.
- Fail-fast compilation and silent `--no-color` Jest output.
- Clean state serialization and self-healing resumption.
